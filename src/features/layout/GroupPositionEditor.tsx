// 모둠 블록 위치 편집기. 편집 단위는 개별 책상이 아니라 모둠 블록 하나다.
// 상호작용 언어(포인터 드래그 + 놓을 때 1회 커밋, 방향키 이동, Shift 5칸,
// 숫자 입력, 스냅·클램프)는 같은 폴더의 CustomDeskEditor와 동일하게 맞춘다.
//
// 블록 크기 상수는 src/core/layouts/group.ts가 좌석 픽셀 좌표를 만들 때 쓰는 값과
// 같아야 화면과 실제 좌석이 어긋나지 않는다. 그 값들이 core에서 export 되어 있지
// 않아(getClusterDims·seatW·seatH·seatGap는 모듈 안 지역 값) 여기에 같은 값을 둔다.
// 출처: src/core/layouts/group.ts:11-15(getClusterDims), :89-93(seatW/seatH/seatGap, blockW/blockH).
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { RotateCcw } from 'lucide-react';
import { groupLayout } from '@/core/layouts/group';
import type { GroupPosition } from '@/core/model/types';
import { NumberField } from './CustomDeskEditor';

const SEAT_W = 64;
const SEAT_H = 48;
const SEAT_GAP = 4;
const BLOCK_MARGIN = 36;
// CustomDeskEditor와 같은 스냅 간격.
const GRID_SIZE = 20;
const MIN_CANVAS_W = 600;
const MIN_CANVAS_H = 400;

/** src/core/layouts/group.ts:11-15과 같은 규칙. */
function getClusterDims(groupSize: number): { cols: number; rows: number } {
  if (groupSize <= 4) return { cols: 2, rows: Math.ceil(groupSize / 2) };
  if (groupSize <= 6) return { cols: 3, rows: Math.ceil(groupSize / 3) };
  return { cols: 4, rows: Math.ceil(groupSize / 4) };
}

const snap = (v: number): number => Math.round(v / GRID_SIZE) * GRID_SIZE;

/** 격자 점. 이미지 파일 없이 CSS 그라디언트로만 그린다. */
const boardStyle = (w: number, h: number): CSSProperties => ({
  width: w,
  height: h,
  backgroundImage: 'radial-gradient(circle, rgba(42,33,27,0.28) 1px, transparent 1px)',
  backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
});

export interface GroupPositionEditorProps {
  /** groupLayout.getGroupSizes(layoutSettings) 결과 */
  sizes: number[];
  /** layoutSettings.groupPositions (비어 있으면 자동 위치를 초기값으로 보여준다) */
  positions: GroupPosition[];
  /** 새 위치 배열. 빈 배열이면 자동 배치로 되돌린다. */
  onChange: (positions: GroupPosition[]) => void;
}

export function GroupPositionEditor({ sizes, positions, onChange }: GroupPositionEditorProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  // 드래그 중에는 화면에만 반영하고, 놓을 때 스냅해서 한 번만 저장한다.
  const dragRef = useRef<{ groupIndex: number; dx: number; dy: number; moved: boolean } | null>(null);
  const [live, setLive] = useState<{ groupIndex: number; x: number; y: number } | null>(null);

  // 모든 모둠이 같은 블록 크기를 쓴다(코어도 가장 큰 모둠 기준으로 클러스터를 잡는다).
  const maxSize = sizes.reduce((a, b) => Math.max(a, b), 1);
  const { cols: cCols, rows: cRows } = getClusterDims(maxSize);
  const blockW = cCols * (SEAT_W + SEAT_GAP) + BLOCK_MARGIN;
  const blockH = cRows * (SEAT_H + SEAT_GAP) + BLOCK_MARGIN;

  const auto = groupLayout.calcAutoPositions(sizes);
  // 캔버스는 자동 배치가 모두 들어갈 만큼 잡는다(사용자 드래그에 따라 변하지 않아야
  // 클램프 한계가 흔들리지 않는다).
  const canvasW = Math.max(MIN_CANVAS_W, auto.reduce((m, p) => Math.max(m, p.x), 0) + blockW + 40);
  const canvasH = Math.max(MIN_CANVAS_H, auto.reduce((m, p) => Math.max(m, p.y), 0) + blockH + 40);
  const maxX = Math.max(0, canvasW - blockW);
  const maxY = Math.max(0, canvasH - blockH);
  const clampX = (v: number): number => Math.max(0, Math.min(maxX, v));
  const clampY = (v: number): number => Math.max(0, Math.min(maxY, v));

  // 저장된 위치가 없는 모둠은 자동 위치를 보여준다.
  const current: GroupPosition[] = sizes.map((_, g) => {
    const saved = positions.find((p) => p.groupIndex === g);
    const base = saved ?? auto[g] ?? { x: 0, y: 0 };
    return { groupIndex: g, x: base.x, y: base.y };
  });

  const moveTo = (groupIndex: number, x: number, y: number) => {
    onChange(
      current.map((p) =>
        p.groupIndex === groupIndex
          ? { groupIndex, x: clampX(snap(x)), y: clampY(snap(y)) }
          : p,
      ),
    );
  };

  const onBlockPointerDown = (groupIndex: number) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    const board = boardRef.current;
    const block = current[groupIndex];
    if (!board || !block) return;
    const rect = board.getBoundingClientRect();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = {
      groupIndex,
      dx: e.clientX - rect.left - block.x,
      dy: e.clientY - rect.top - block.y,
      moved: false,
    };
    setSelected(groupIndex);
  };

  const onBlockPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const board = boardRef.current;
    if (!drag || !board) return;
    const rect = board.getBoundingClientRect();
    drag.moved = true;
    setLive({
      groupIndex: drag.groupIndex,
      x: clampX(e.clientX - rect.left - drag.dx),
      y: clampY(e.clientY - rect.top - drag.dy),
    });
  };

  const onBlockPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    const pos = live;
    setLive(null);
    if (drag && drag.moved && pos) moveTo(pos.groupIndex, pos.x, pos.y);
  };

  const onBlockKeyDown = (groupIndex: number) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const block = current[groupIndex];
    if (!block) return;
    const step = e.shiftKey ? GRID_SIZE * 5 : GRID_SIZE;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    setSelected(groupIndex);
    moveTo(groupIndex, block.x + d[0], block.y + d[1]);
  };

  const sel = selected !== null ? current[selected] : undefined;

  return (
    <div data-testid="group-position-editor" className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setSelected(null);
            onChange([]);
          }}
          aria-label="자동 배치로 되돌리기"
          className="inline-flex items-center gap-1 rounded-[6px] border-2 border-cork-dark bg-paper-2 px-3 py-1 font-hand text-[15px] font-bold text-ink"
        >
          <RotateCcw size={16} aria-hidden="true" className="pointer-events-none" />
          자동 배치로 되돌리기
        </button>
        <span className="font-body text-xs font-bold text-mute">모둠 {sizes.length}개</span>
      </div>

      <p className="mt-2 font-body text-xs text-mute">
        모둠 블록을 끌어서 옮깁니다. 블록을 고른 뒤 방향키로도 옮길 수 있고, Shift를 함께 누르면 5칸씩
        움직입니다.
      </p>

      <div className="mt-2 max-w-full overflow-auto">
        <div
          ref={boardRef}
          data-testid="group-board"
          style={boardStyle(canvasW, canvasH)}
          className="relative rounded-note border-2 border-cork-dark bg-paper"
        >
          {current.map((p) => {
            const pos = live && live.groupIndex === p.groupIndex ? live : p;
            return (
              <button
                key={p.groupIndex}
                type="button"
                data-group-block={p.groupIndex}
                aria-label={`${p.groupIndex + 1}모둠 블록`}
                aria-pressed={selected === p.groupIndex}
                onPointerDown={onBlockPointerDown(p.groupIndex)}
                onPointerMove={onBlockPointerMove}
                onPointerUp={onBlockPointerUp}
                onKeyDown={onBlockKeyDown(p.groupIndex)}
                style={{ left: pos.x, top: pos.y, width: blockW, height: blockH }}
                className={`absolute flex flex-col items-center justify-center rounded-note border-2 font-hand text-[15px] font-bold text-ink shadow-note ${
                  selected === p.groupIndex ? 'border-apple bg-paper-2' : 'border-cork-dark bg-paper'
                }`}
              >
                <span>{p.groupIndex + 1}모둠</span>
                <span className="font-body text-xs font-bold text-mute">{sizes[p.groupIndex]}명</span>
              </button>
            );
          })}
        </div>
      </div>

      {sel && selected !== null && (
        <div className="mt-2 flex flex-wrap items-center gap-2 font-body text-sm text-ink">
          <span className="font-bold">{selected + 1}모둠 위치</span>
          <NumberField
            label="가로"
            value={sel.x}
            min={0}
            max={maxX}
            step={GRID_SIZE}
            onCommit={(v) => moveTo(selected, v, sel.y)}
          />
          <NumberField
            label="세로"
            value={sel.y}
            min={0}
            max={maxY}
            step={GRID_SIZE}
            onCommit={(v) => moveTo(selected, sel.x, v)}
          />
        </div>
      )}
    </div>
  );
}
