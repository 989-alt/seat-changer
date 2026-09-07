// 자유배치 책상 편집기. 좌표 규약은 src/core/layouts/custom.ts 및
// legacy/js/layouts/custom-layout.js 와 동일하다: 책상은 좌상단 픽셀 좌표 {x, y},
// 크기 60x40, 놓을 때 20px 격자에 스냅. 레거시는 canvas 2D로 그렸지만 여기서는
// DOM 요소로 그린다(키보드 조작을 위해).
//
// 계산(캔버스 크기·가운데 정렬 오프셋·선택·이동)은 deskEditorModel.ts에 있다.
// 이 파일은 화면과 입력만 다룬다.
//
// 편집 방식은 셋 중 하나다.
//   선택: 클릭·Ctrl+클릭·Shift+클릭·빈 곳 드래그(밴드)로 고르고, 끌거나 방향키로 옮긴다.
//   추가: 클릭한 자리에 책상을 하나씩 만든다.
//   지우기: 클릭한 책상을 바로 지운다.
// 모드를 두지 않으면 "빈 곳을 눌렀을 뿐인데 책상이 생긴다"가 된다(v1의 동작).
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { Ban, Eraser, Plus, RotateCcw, Trash, Trash2 } from 'lucide-react';
import type { Desk } from '@/core/model/types';
import {
  DESK_H,
  DESK_W,
  GRID_SIZE,
  clampDelta,
  clampDesk,
  computeViewport,
  deskLimits,
  desksInRect,
  indexRange,
  moveSelection,
  snap,
  toggleIndex,
  type Rect,
  type Viewport,
} from './deskEditorModel';

// 축소 하한. 이보다 작아지면 번호가 안 읽히므로 그 아래로는 줄이지 않고 스크롤한다.
const MIN_SCALE = 0.5;
const MAX_DESKS = 200; // 스키마 상한(schema.ts customDesks max 200)
// 클릭과 드래그를 가르는 거리.
const DRAG_SLOP = 3;

type Mode = 'select' | 'add' | 'erase';

const HINT: Record<Mode, string> = {
  select:
    '책상을 눌러 고르고 끌어서 옮깁니다. Ctrl+클릭은 하나씩 더, Shift+클릭은 사이를 모두, 빈 곳을 끌면 사각형 안을 모두 고릅니다. 고른 책상은 아래에서 삭제하거나 빈 자리로 둘 수 있습니다.',
  add: '빈 곳을 누르면 책상이 하나씩 생깁니다. 끝내려면 ESC를 누르거나 [책상 추가]를 다시 누르세요.',
  erase: '지울 책상을 누르세요. 끝내려면 ESC를 누르거나 [책상 지우기]를 다시 누르세요.',
};

/** 격자 점. 이미지 파일 없이 CSS 그라디언트로만 그린다. */
const boardStyle = (vp: Viewport): CSSProperties => ({
  width: vp.w,
  height: vp.h,
  backgroundImage: 'radial-gradient(circle, rgba(42,33,27,0.28) 1px, transparent 1px)',
  backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
});

/**
 * 감싼 요소의 폭을 잰다. 편집기를 패널 폭에 맞춰 축소하는 데만 쓴다.
 * ResizeObserver가 없는 환경(jsdom 등)에서는 0을 돌려주고, 호출부는 축소하지 않는다.
 */
function useElementWidth<T extends HTMLElement>(ref: RefObject<T | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (ref.current) setWidth(ref.current.clientWidth);
  }, [ref]);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/**
 * 숫자 입력 필드. 값은 스토어가 갖고 있지만, 지웠다가 다시 치는 동안에는
 * 빈 문자열을 그대로 보여줘야 한다(제어 입력에 스토어 값을 바로 물리면
 * 지우는 순간 옛 값이 되돌아와 "64" 같은 값이 만들어진다).
 * 파싱되는 값만 onCommit으로 올리고, 포커스가 빠지면 초안을 버린다.
 * LayoutCard도 이 필드를 함께 쓴다.
 */
export function NumberField({
  label, value, min, max, step, width = 'w-20', onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  width?: string;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex items-center gap-1">
      {label}
      <input
        type="number"
        value={draft ?? String(value)}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          const v = Number(raw);
          if (raw !== '' && Number.isFinite(v)) onCommit(v);
        }}
        onBlur={() => setDraft(null)}
        className={`${width} rounded-note border-2 border-cork-dark bg-paper px-2 py-1 font-body text-sm text-ink`}
      />
    </label>
  );
}

const MODE_BTN =
  'inline-flex items-center gap-1 rounded-[6px] border-2 px-3 py-1 font-hand text-[15px] font-bold';
const OFF = 'border-cork-dark bg-paper-2 text-ink';
const ON = 'border-ink bg-ink text-paper';
const DISABLED = 'disabled:cursor-not-allowed disabled:border-mute disabled:text-mute';

export interface CustomDeskEditorProps {
  desks: Desk[];
  /** 빈 자리로 둔 좌석 번호(= 책상 번호). */
  disabledSeats: number[];
  /** 옮기거나 더한 결과. 좌석 번호는 그대로다. */
  onChange: (desks: Desk[]) => void;
  /** 지운 책상 번호. 뒤 번호가 당겨지므로 스토어가 빈 자리·고정 자리도 함께 옮긴다. */
  onRemove: (indexes: number[]) => void;
  onDisable: (indexes: number[]) => void;
  onRestore: (indexes: number[]) => void;
}

export function CustomDeskEditor({
  desks, disabledSeats, onChange, onRemove, onDisable, onRestore,
}: CustomDeskEditorProps) {
  const [mode, setMode] = useState<Mode>('select');
  const [selected, setSelected] = useState<number[]>([]);
  // Shift+클릭 범위의 기준점.
  const anchorRef = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);

  // 뷰포트(캔버스 크기 + 가운데 정렬 오프셋)가 편집 중에 바뀌면 화면이 출렁인다.
  // 그래서 편집기를 열 때, 그리고 밖에서 책상이 통째로 바뀔 때(반 전환·가져오기·
  // 실행취소)만 다시 잡는다. 편집기가 스스로 만든 변화는 commit이 표시해 둔다.
  const committedRef = useRef<Desk[] | null>(null);
  // 지우기는 스토어가 새 배열을 만들어 돌려주므로 "밖에서 바뀐 것"과 구분이 안 된다.
  // 편집기가 지운 것이면 화면이 다시 가운데로 튀지 않게 뷰포트를 그대로 둔다.
  const selfEditRef = useRef(false);
  const [viewport, setViewport] = useState<Viewport>(() => computeViewport(desks));
  useLayoutEffect(() => {
    if (committedRef.current === desks) return;
    const self = selfEditRef.current;
    selfEditRef.current = false;
    committedRef.current = desks;
    if (!self) setViewport(computeViewport(desks));
    setSelected([]);
    anchorRef.current = null;
  }, [desks]);

  // 패널보다 넓으면 축소해서 전부 보이게 한다(확대는 하지 않는다).
  const wrapW = useElementWidth(wrapRef);
  const scale = wrapW > 0 ? Math.max(MIN_SCALE, Math.min(1, wrapW / viewport.w)) : 1;

  // 드래그 상태. 끌고 있는 동안에는 화면에만 반영하고, 놓을 때 한 번 저장한다.
  const dragRef = useRef<
    { index: number; indices: number[]; x: number; y: number; moved: boolean; plain: boolean } | null
  >(null);
  const [live, setLive] = useState<{ dx: number; dy: number } | null>(null);
  const bandRef = useRef<{ x: number; y: number; additive: boolean; moved: boolean } | null>(null);
  const [band, setBand] = useState<Rect | null>(null);

  const commit = (next: Desk[]) => {
    committedRef.current = next;
    onChange(next);
  };

  /** 화면 좌표 → 저장 좌표. 축소와 가운데 정렬 오프셋을 되돌린다. */
  const toDeskSpace = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const board = boardRef.current;
    if (!board) return null;
    const rect = board.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / scale - viewport.dx,
      y: (clientY - rect.top) / scale - viewport.dy,
    };
  };

  const selectOnly = (i: number | null) => {
    setSelected(i === null ? [] : [i]);
    anchorRef.current = i;
  };

  const addDeskAt = (x: number, y: number) => {
    if (desks.length >= MAX_DESKS) return;
    const next = [...desks, clampDesk(viewport, snap(x), snap(y))];
    commit(next);
    selectOnly(next.length - 1);
  };

  const deleteDesks = (indices: number[]) => {
    if (indices.length === 0) return;
    selfEditRef.current = true;
    onRemove(indices);
    selectOnly(null);
  };

  const toggleMode = (m: Mode) => {
    setMode((cur) => (cur === m ? 'select' : m));
    selectOnly(null);
  };

  // ESC로 추가·지우기 모드에서 빠져나온다.
  useEffect(() => {
    if (mode === 'select') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMode('select');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  // 사각형으로 여러 개를 고르면 포커스가 책상에 있지 않다. 그 상태에서도 Delete와
  // 방향키가 듣도록 창에서 받는다. 글자를 치는 중이거나(입력칸) 책상이 직접
  // 처리하는 경우(포커스가 책상에 있음)는 건드리지 않는다.
  useEffect(() => {
    if (mode !== 'select' || selected.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('input, textarea, select, [contenteditable="true"], [data-desk]')) return;
      if (e.key === 'Escape') {
        selectOnly(null);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteDesks(selected);
        return;
      }
      const step = e.shiftKey ? GRID_SIZE * 5 : GRID_SIZE;
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const d = delta[e.key];
      if (d) {
        e.preventDefault();
        commit(moveSelection(desks, selected, d[0], d[1], viewport));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onBoardPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // 책상 위 클릭은 책상이 처리한다
    const p = toDeskSpace(e.clientX, e.clientY);
    if (!p) return;
    if (mode === 'add') {
      addDeskAt(p.x - DESK_W / 2, p.y - DESK_H / 2);
      return;
    }
    if (mode === 'erase') return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    bandRef.current = { x: p.x, y: p.y, additive: e.ctrlKey || e.metaKey, moved: false };
    setBand({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };

  const onBoardPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const start = bandRef.current;
    if (!start) return;
    const p = toDeskSpace(e.clientX, e.clientY);
    if (!p) return;
    if (Math.abs(p.x - start.x) > DRAG_SLOP || Math.abs(p.y - start.y) > DRAG_SLOP) start.moved = true;
    setBand({ x0: start.x, y0: start.y, x1: p.x, y1: p.y });
  };

  const onBoardPointerUp = () => {
    const start = bandRef.current;
    bandRef.current = null;
    const rect = band;
    setBand(null);
    if (!start) return;
    if (!start.moved || !rect) {
      // 빈 곳을 그냥 눌렀다 → 선택만 해제한다. 책상은 생기지 않는다.
      if (!start.additive) selectOnly(null);
      return;
    }
    const hit = desksInRect(desks, rect);
    setSelected(start.additive ? [...new Set([...selected, ...hit])] : hit);
    anchorRef.current = hit.length > 0 ? hit[hit.length - 1]! : null;
  };

  const onDeskPointerDown = (index: number) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (mode === 'add') return;
    if (mode === 'erase') {
      deleteDesks([index]);
      return;
    }
    const desk = desks[index];
    const p = toDeskSpace(e.clientX, e.clientY);
    if (!desk || !p) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);

    const plain = !e.shiftKey && !e.ctrlKey && !e.metaKey;
    let next: number[];
    if (e.shiftKey && anchorRef.current !== null) {
      next = indexRange(anchorRef.current, index);
    } else if (e.ctrlKey || e.metaKey) {
      next = toggleIndex(selected, index);
      anchorRef.current = index;
    } else if (selected.includes(index)) {
      // 이미 고른 책상 → 선택을 유지해야 여러 개를 한꺼번에 끌 수 있다.
      next = selected;
      anchorRef.current = index;
    } else {
      next = [index];
      anchorRef.current = index;
    }
    setSelected(next);
    dragRef.current = { index, indices: next, x: p.x, y: p.y, moved: false, plain };
  };

  const onDeskPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const p = toDeskSpace(e.clientX, e.clientY);
    if (!drag || !p) return;
    const dx = p.x - drag.x;
    const dy = p.y - drag.y;
    if (Math.abs(dx) > DRAG_SLOP || Math.abs(dy) > DRAG_SLOP) drag.moved = true;
    if (!drag.moved) return;
    setLive(clampDelta(desks, drag.indices, viewport, dx, dy));
  };

  const onDeskPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    const delta = live;
    setLive(null);
    if (!drag) return;
    if (drag.moved && delta) {
      commit(moveSelection(desks, drag.indices, delta.dx, delta.dy, viewport));
      return;
    }
    // 끌지 않고 눌렀다 뗀 것이면, 여러 개 골라 둔 상태에서 그 하나만 남긴다(파일 탐색기와 같다).
    if (drag.plain && drag.indices.length > 1) selectOnly(drag.index);
  };

  const onDeskKeyDown = (index: number) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (mode !== 'select') return;
    const targets = selected.includes(index) ? selected : [index];
    const step = e.shiftKey ? GRID_SIZE * 5 : GRID_SIZE;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = delta[e.key];
    if (d) {
      e.preventDefault();
      if (!selected.includes(index)) selectOnly(index);
      commit(moveSelection(desks, targets, d[0], d[1], viewport));
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteDesks(targets);
    }
  };

  const selectedSet = new Set(selected);
  const disabledSet = new Set(disabledSeats);
  const sel = selected.length === 1 ? desks[selected[0]!] : undefined;
  const limits = deskLimits(viewport);

  return (
    <div data-testid="custom-desk-editor" className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => toggleMode('add')}
          aria-pressed={mode === 'add'}
          className={`${MODE_BTN} ${mode === 'add' ? ON : OFF}`}
        >
          <Plus size={16} aria-hidden="true" className="pointer-events-none" />
          책상 추가
        </button>
        <button
          type="button"
          onClick={() => toggleMode('erase')}
          aria-pressed={mode === 'erase'}
          disabled={desks.length === 0}
          className={`${MODE_BTN} ${mode === 'erase' ? ON : OFF} ${DISABLED}`}
        >
          <Eraser size={16} aria-hidden="true" className="pointer-events-none" />
          책상 지우기
        </button>
        <button
          type="button"
          onClick={() => {
            deleteDesks(desks.map((_, i) => i));
            setMode('select');
          }}
          disabled={desks.length === 0}
          className={`${MODE_BTN} ${OFF} ${DISABLED}`}
        >
          <Trash size={16} aria-hidden="true" className="pointer-events-none" />
          모두 지우기
        </button>
        <span className="font-body text-xs font-bold text-mute">책상 {desks.length}개</span>
      </div>

      {/* 모드마다 문구 길이가 달라 자리를 고정해 둔다. 안 그러면 모드를 바꿀 때마다
          아래 보드가 위아래로 튄다. */}
      <p className="mt-2 min-h-12 font-body text-xs text-mute">{HINT[mode]}</p>

      {/* 축소는 transform이라 자리를 줄여주지 않는다(1366/1024에서 헛스크롤이 생긴다).
          바깥에 축소된 크기의 자리틀을 두고 보드를 그 위에 얹는다. */}
      <div ref={wrapRef} className="mt-2 max-w-full overflow-auto">
        <div className="relative" style={{ width: viewport.w * scale, height: viewport.h * scale }}>
          <div
            ref={boardRef}
            data-testid="desk-board"
            data-mode={mode}
            onPointerDown={onBoardPointerDown}
            onPointerMove={onBoardPointerMove}
            onPointerUp={onBoardPointerUp}
            style={{
              ...boardStyle(viewport),
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
            className={`absolute left-0 top-0 rounded-note border-2 border-cork-dark bg-paper ${
              mode === 'add' ? 'cursor-crosshair' : 'cursor-default'
            }`}
          >
            {band && (
              <div
                data-testid="select-band"
                aria-hidden="true"
                className="pointer-events-none absolute border-2 border-dashed border-ink"
                style={{
                  left: Math.min(band.x0, band.x1) + viewport.dx,
                  top: Math.min(band.y0, band.y1) + viewport.dy,
                  width: Math.abs(band.x1 - band.x0),
                  height: Math.abs(band.y1 - band.y0),
                }}
              />
            )}
            {desks.map((d, i) => {
              const on = selectedSet.has(i);
              const off = disabledSet.has(i);
              const shift = live && on ? live : { dx: 0, dy: 0 };
              return (
                <button
                  key={i}
                  type="button"
                  data-desk={i}
                  aria-label={`책상 ${i + 1}`}
                  aria-pressed={on}
                  onPointerDown={onDeskPointerDown(i)}
                  onPointerMove={onDeskPointerMove}
                  onPointerUp={onDeskPointerUp}
                  onKeyDown={onDeskKeyDown(i)}
                  style={{
                    left: d.x + viewport.dx + shift.dx,
                    top: d.y + viewport.dy + shift.dy,
                    width: DESK_W,
                    height: DESK_H,
                  }}
                  className={`absolute rounded-note font-hand text-[15px] font-bold text-ink ${
                    off ? 'border-2 border-dashed bg-paper-2' : 'border-2 shadow-note'
                  } ${on ? 'border-apple' : 'border-cork-dark'} ${off ? '' : 'bg-paper'}`}
                >
                  {off ? (
                    <span className="flex h-full flex-col items-center justify-center leading-tight">
                      <span>{i + 1}</span>
                      <span className="text-[11px] font-normal">빈 자리</span>
                    </span>
                  ) : (
                    i + 1
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {selected.length > 0 && (
        <div
          data-testid="desk-selection-actions"
          className="mt-2 flex flex-wrap items-center gap-2 font-body text-sm text-ink"
        >
          <span className="font-bold">고른 책상 {selected.length}개</span>
          <button
            type="button"
            onClick={() => deleteDesks(selected)}
            className={`${MODE_BTN} ${OFF} ${DISABLED}`}
          >
            <Trash2 size={16} aria-hidden="true" className="pointer-events-none" />
            고른 책상 삭제 ({selected.length}개)
          </button>
          <button
            type="button"
            onClick={() => onDisable(selected.filter((i) => !disabledSet.has(i)))}
            disabled={selected.every((i) => disabledSet.has(i))}
            className={`${MODE_BTN} ${OFF} ${DISABLED}`}
          >
            <Ban size={16} aria-hidden="true" className="pointer-events-none" />
            고른 자리 빈 자리로
          </button>
          <button
            type="button"
            onClick={() => onRestore(selected.filter((i) => disabledSet.has(i)))}
            disabled={!selected.some((i) => disabledSet.has(i))}
            className={`${MODE_BTN} ${OFF} ${DISABLED}`}
          >
            <RotateCcw size={16} aria-hidden="true" className="pointer-events-none" />
            다시 쓰기
          </button>
        </div>
      )}

      {sel && selected.length === 1 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 font-body text-sm text-ink">
          <span className="font-bold">책상 {selected[0]! + 1} 위치</span>
          <NumberField
            label="가로"
            value={sel.x}
            min={limits.minX}
            max={limits.maxX}
            step={GRID_SIZE}
            onCommit={(v) => commit(moveSelection(desks, selected, v - sel.x, 0, viewport))}
          />
          <NumberField
            label="세로"
            value={sel.y}
            min={limits.minY}
            max={limits.maxY}
            step={GRID_SIZE}
            onCommit={(v) => commit(moveSelection(desks, selected, 0, v - sel.y, viewport))}
          />
        </div>
      )}
    </div>
  );
}
