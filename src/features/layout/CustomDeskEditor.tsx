// 자유배치 책상 편집기. 좌표 규약은 src/core/layouts/custom.ts 및
// legacy/js/layouts/custom-layout.js 와 동일하다:
//   - 책상은 좌상단 픽셀 좌표 {x, y}, 크기 60x40
//   - 놓을 때 20px 격자에 스냅
//   - 좌표는 편집 캔버스 안(0 ~ CANVAS-DESK)으로 접는다
// 레거시는 canvas 2D로 그렸지만 여기서는 DOM 요소로 그린다(키보드 조작을 위해).
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Desk } from '@/core/model/types';

const DESK_W = 60;
const DESK_H = 40;
const GRID_SIZE = 20;
// 레거시 _canvasW/_canvasH 기본값과 같은 논리 좌표 공간.
const CANVAS_W = 600;
const CANVAS_H = 400;
const MAX_DESKS = 200; // 스키마 상한(schema.ts customDesks max 200)

const snap = (v: number): number => Math.round(v / GRID_SIZE) * GRID_SIZE;
const clampX = (v: number): number => Math.max(0, Math.min(CANVAS_W - DESK_W, v));
const clampY = (v: number): number => Math.max(0, Math.min(CANVAS_H - DESK_H, v));

/** 격자 점. 이미지 파일 없이 CSS 그라디언트로만 그린다. */
const BOARD_STYLE: CSSProperties = {
  width: CANVAS_W,
  height: CANVAS_H,
  backgroundImage: 'radial-gradient(circle, rgba(42,33,27,0.28) 1px, transparent 1px)',
  backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
};

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

export interface CustomDeskEditorProps {
  desks: Desk[];
  onChange: (desks: Desk[]) => void;
}

export function CustomDeskEditor({ desks, onChange }: CustomDeskEditorProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  // 드래그 중인 책상. 끌고 있는 동안에는 화면에만 반영하고, 놓을 때 스냅해서 저장한다.
  const dragRef = useRef<{ index: number; dx: number; dy: number; moved: boolean } | null>(null);
  const [live, setLive] = useState<{ index: number; x: number; y: number } | null>(null);

  const commit = (next: Desk[]) => {
    onChange(next);
  };

  const moveTo = (index: number, x: number, y: number) => {
    const next = desks.map((d, i) => (i === index ? { x: clampX(snap(x)), y: clampY(snap(y)) } : d));
    commit(next);
  };

  const addDesk = (x?: number, y?: number) => {
    if (desks.length >= MAX_DESKS) return;
    // 좌표를 주지 않으면 레거시 addDesk와 같은 자리에 놓는다.
    const id = desks.length;
    const nx = x ?? 50 + (id % 8) * 70;
    const ny = y ?? 50 + Math.floor(id / 8) * 55;
    commit([...desks, { x: clampX(snap(nx)), y: clampY(snap(ny)) }]);
    setSelected(id);
  };

  const deleteDesk = (index: number) => {
    commit(desks.filter((_, i) => i !== index));
    setSelected(null);
  };

  const onBoardPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // 책상 위 클릭은 책상이 처리한다
    const rect = e.currentTarget.getBoundingClientRect();
    addDesk(e.clientX - rect.left - DESK_W / 2, e.clientY - rect.top - DESK_H / 2);
  };

  const onDeskPointerDown = (index: number) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const desk = desks[index];
    if (!desk) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = {
      index,
      dx: e.clientX - rect.left - desk.x,
      dy: e.clientY - rect.top - desk.y,
      moved: false,
    };
    setSelected(index);
  };

  const onDeskPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const board = boardRef.current;
    if (!drag || !board) return;
    const rect = board.getBoundingClientRect();
    drag.moved = true;
    setLive({
      index: drag.index,
      x: clampX(e.clientX - rect.left - drag.dx),
      y: clampY(e.clientY - rect.top - drag.dy),
    });
  };

  const onDeskPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    const pos = live;
    setLive(null);
    if (drag && drag.moved && pos) moveTo(pos.index, pos.x, pos.y);
  };

  const onDeskKeyDown = (index: number) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const desk = desks[index];
    if (!desk) return;
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
      setSelected(index);
      moveTo(index, desk.x + d[0], desk.y + d[1]);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteDesk(index);
    }
  };

  const sel = selected !== null ? desks[selected] : undefined;

  return (
    <div data-testid="custom-desk-editor" className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => addDesk()}
          className="inline-flex items-center gap-1 rounded-[6px] border-2 border-cork-dark bg-paper-2 px-3 py-1 font-hand text-[15px] font-bold text-ink"
        >
          <Plus size={16} aria-hidden="true" className="pointer-events-none" />
          책상 추가
        </button>
        <button
          type="button"
          onClick={() => selected !== null && deleteDesk(selected)}
          disabled={selected === null}
          className="inline-flex items-center gap-1 rounded-[6px] border-2 border-cork-dark bg-paper-2 px-3 py-1 font-hand text-[15px] font-bold text-ink disabled:cursor-not-allowed disabled:border-mute disabled:text-mute"
        >
          <Trash2 size={16} aria-hidden="true" className="pointer-events-none" />
          선택한 책상 삭제
        </button>
        <span className="font-body text-xs font-bold text-mute">책상 {desks.length}개</span>
      </div>

      <p className="mt-2 font-body text-xs text-mute">
        빈 곳을 누르면 책상이 생기고, 책상을 끌면 옮겨집니다. 책상을 고른 뒤 방향키로도 옮길 수 있습니다.
      </p>

      <div className="mt-2 max-w-full overflow-auto">
        <div
          ref={boardRef}
          data-testid="desk-board"
          onPointerDown={onBoardPointerDown}
          style={BOARD_STYLE}
          className="relative rounded-note border-2 border-cork-dark bg-paper"
        >
          {desks.map((d, i) => {
            const pos = live && live.index === i ? live : d;
            return (
              <button
                key={i}
                type="button"
                data-desk={i}
                aria-label={`책상 ${i + 1}`}
                aria-pressed={selected === i}
                onPointerDown={onDeskPointerDown(i)}
                onPointerMove={onDeskPointerMove}
                onPointerUp={onDeskPointerUp}
                onKeyDown={onDeskKeyDown(i)}
                style={{ left: pos.x, top: pos.y, width: DESK_W, height: DESK_H }}
                className={`absolute rounded-note border-2 font-hand text-[15px] font-bold text-ink shadow-note ${
                  selected === i ? 'border-apple bg-paper-2' : 'border-cork-dark bg-paper'
                }`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      {sel && selected !== null && (
        <div className="mt-2 flex flex-wrap items-center gap-2 font-body text-sm text-ink">
          <span className="font-bold">책상 {selected + 1} 위치</span>
          <NumberField
            label="가로"
            value={sel.x}
            min={0}
            max={CANVAS_W - DESK_W}
            step={GRID_SIZE}
            onCommit={(v) => moveTo(selected, v, sel.y)}
          />
          <NumberField
            label="세로"
            value={sel.y}
            min={0}
            max={CANVAS_H - DESK_H}
            step={GRID_SIZE}
            onCommit={(v) => moveTo(selected, sel.x, v)}
          />
        </div>
      )}
    </div>
  );
}
