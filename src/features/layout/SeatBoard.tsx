// 배치도 렌더러 (계약서 3-2). 교사 화면 미리보기와 발표 화면이 공유하는 유일한 배치도.
// 좌표는 반드시 getLayout(...).getSeatPositions(...)에서만 얻는다(직접 계산 금지).
// 좌석 순서 규칙은 legacy/js/layouts/*.js의 render()를 따른다:
//   exam    : teacherView -> 행 역순, 열 역순 (exam-layout.js:31-34)
//   pair    : teacherView -> 행 역순, 짝 그룹 역순, 짝 내부 역순 (pair-layout.js:44-52)
//   group   : 모둠 블록 위치(layoutSettings.groupPositions)를 코어가 px/py에 반영해 주므로
//             custom과 같은 절대 배치로 그린다. teacherView -> 좌표 180도 반전
//             (레거시 group-layout.js:229-232의 역순 렌더와 같은 효과).
//   custom  : teacherView -> 좌표 180도 반전 (custom-layout.js:285-289)
//   ushape  : 레거시는 flex 줄(위/좌/우)로 렌더하며 teacherView에서 순서를 뒤집었다.
//             계약서 3-2는 arcPos 기반 절대 배치를 요구하므로, 같은 효과를 좌표
//             180도 반전으로 낸다(custom과 동일한 방식).
import { ChalkBoard } from '@/components/cork/ChalkBoard';
import { NoteSeat, type NoteSeatState } from '@/components/cork/NoteSeat';
import { getLayout } from '@/core/layouts';
import type { SeatPosition } from '@/core/layouts/types';
import type { Assignment, ClassData } from '@/core/model/types';

export interface SeatBoardProps {
  data: ClassData;
  mapping?: Assignment;
  size?: 'sm' | 'lg';
  perspective?: 'student' | 'teacher';
  highlightSeats?: number[];
  fixedMode?: boolean;
  editable?: boolean;
  onSeatClick?: (seatIndex: number) => void;
  onSeatRestore?: (seatIndex: number) => void;
  groupNames?: Record<number, string>;
  roles?: Record<number, string>;
  revealedSeats?: 'all' | number[];
  flipping?: boolean;
  className?: string;
}

type Size = 'sm' | 'lg';

// NoteSeat의 SIZE와 같은 높이를 써서 빈 공간이 격자 흐름을 그대로 유지하게 한다.
const SLOT_H: Record<Size, string> = { sm: 'h-14', lg: 'h-24' };
const SLOT_W: Record<Size, string> = { sm: 'w-[84px]', lg: 'w-[140px]' };
const GAP: Record<Size, string> = { sm: 'gap-2', lg: 'gap-4' };
const PAIR_GAP: Record<Size, string> = { sm: 'gap-[2px]', lg: 'gap-[4px]' };
// 절대 배치(ushape/custom) 캔버스 높이. lg는 1920x1080 발표 화면에서
// 칠판(약 60px)과 함께 세로로 들어가는 크기다.
const CANVAS_H: Record<Size, string> = { sm: 'h-[320px]', lg: 'h-[620px]' };
const ROLE_TEXT: Record<Size, string> = { sm: 'text-[11px]', lg: 'text-[18px]' };
const GROUP_TEXT: Record<Size, string> = { sm: 'text-[14px]', lg: 'text-[24px]' };
// 모둠 팻말은 좌상단 좌석의 중심에서 위로 이 만큼 띄운다(좌석 높이 절반 + 글자 높이).
const GROUP_LABEL_OFFSET: Record<Size, number> = { sm: 46, lg: 74 };
// 이름표 아래 역할 글씨가 차지하는 높이(캔버스 여유용).
const ROLE_PAD: Record<Size, number> = { sm: 24, lg: 36 };
// 모둠 팻말과 이름표 윗변 사이 간격.
const LABEL_GAP = 14;

interface SeatSlotProps {
  index: number;
  size: Size;
  removed: boolean;
  editable: boolean;
  name?: string;
  fixed: boolean;
  highlight: boolean;
  role?: string;
  onSeatClick?: (seatIndex: number) => void;
  onSeatRestore?: (seatIndex: number) => void;
}

function SeatSlot({
  index,
  size,
  removed,
  editable,
  name,
  fixed,
  highlight,
  role,
  onSeatClick,
  onSeatRestore,
}: SeatSlotProps) {
  // 비활성 좌석 + 편집 불가: 격자 흐름은 유지하되 아무것도 보이지 않는 빈 공간.
  // 장식/자리표시 요소이므로 aria-hidden과 pointer-events-none을 함께 준다(계약서 1절).
  if (removed && !editable) {
    return (
      <div
        data-seat={index}
        data-state="disabled"
        aria-hidden="true"
        className={`pointer-events-none ${SLOT_H[size]}`}
      />
    );
  }

  const state: NoteSeatState = removed ? 'disabled' : fixed ? 'fixed' : name ? 'assigned' : 'empty';
  return (
    <div className="flex flex-col items-stretch">
      <NoteSeat
        index={index}
        name={name}
        state={state}
        size={size}
        variant={(index % 3) as 0 | 1 | 2}
        highlight={highlight}
        onClick={onSeatClick ? () => onSeatClick(index) : undefined}
        onRestore={onSeatRestore ? () => onSeatRestore(index) : undefined}
      />
      {role ? (
        // cork 배경 위 글자이므로 text-ink (5.93:1). opacity로 위계를 만들지 않는다.
        <span className={`mt-[2px] text-center font-body font-bold text-ink ${ROLE_TEXT[size]}`}>{role}</span>
      ) : null}
    </div>
  );
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function extent(values: number[]): { min: number; max: number; span: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return { min, max, span: max - min || 1 };
}

/** 이름표 한 칸의 실제 크기(px). SLOT_W/SLOT_H와 같은 값이어야 한다. */
const SLOT_PX: Record<Size, { w: number; h: number }> = {
  sm: { w: 84, h: 56 },
  lg: { w: 140, h: 96 },
};

/**
 * 원본 px/py 좌표계에서 책상 한 개가 차지하는 크기.
 * custom: `core/layouts/custom.ts`의 DESK_W/DESK_H (60x40)
 * group : `core/layouts/group.ts`의 seatW/seatH (64x48)
 * 편집기(CustomDeskEditor·GroupPositionEditor)도 같은 값을 쓰므로,
 * 편집기에서 본 배치와 배치도의 비례가 어긋나지 않는다.
 */
const SOURCE_CELL: Record<'custom' | 'group', { w: number; h: number }> = {
  custom: { w: 60, h: 40 },
  group: { w: 64, h: 48 },
};

/**
 * px/py 픽셀 좌표를 캔버스 안 픽셀 좌표로 옮긴다(custom과 group 공용).
 *
 * 백분율로 정규화하면 캔버스가 좁을 때 이웃한 좌석의 간격이 이름표 폭보다
 * 작아져 이름표가 서로 겹친다(모둠 배치에서 실제로 겹쳤다). 그래서 원본 좌표계의
 * 책상 한 개(SOURCE_CELL)가 이름표 한 칸이 되도록 일정하게 축척하고, 캔버스 크기도
 * 그 결과에 맞춘다. 화면에 맞추는 일은 바깥(발표 화면·미리보기의 확대·축소)이 맡는다.
 *
 * 좌석 간 최소 간격을 기준으로 삼지 않는 이유: 책상 두 개가 유난히 가까우면
 * 그 한 쌍 때문에 배치도 전체가 몇 배로 부풀어 다른 자리가 다 작아진다.
 */
function pixelScale(
  positions: SeatPosition[],
  size: Size,
  cell: { w: number; h: number },
  pad: { top: number; bottom: number } = { top: 0, bottom: 0 },
): {
  toLeft: (px: number) => number;
  toTop: (py: number) => number;
  width: number;
  height: number;
} {
  const x = extent(positions.map((p) => p.px ?? 0));
  const y = extent(positions.map((p) => p.py ?? 0));
  const slot = SLOT_PX[size];
  const kx = slot.w / cell.w;
  const ky = slot.h / cell.h;
  return {
    toLeft: (px: number) => (px - x.min) * kx + slot.w / 2,
    toTop: (py: number) => (py - y.min) * ky + slot.h / 2 + pad.top,
    width: (x.max - x.min) * kx + slot.w,
    height: (y.max - y.min) * ky + slot.h + pad.top + pad.bottom,
  };
}

export function SeatBoard({
  data,
  mapping,
  size = 'sm',
  perspective = 'student',
  highlightSeats,
  fixedMode = false,
  editable = false,
  onSeatClick,
  onSeatRestore,
  groupNames,
  roles,
  revealedSeats = 'all',
  flipping = false,
  className = '',
}: SeatBoardProps) {
  const positions = getLayout(data.layoutType).getSeatPositions(data.layoutSettings);
  const teacher = perspective === 'teacher';
  const removedSet = new Set(data.layoutSettings.disabledSeats ?? []);
  const fixedSet = new Set(data.fixedSeats.map((f) => f.seatIndex));
  const highlightSet = new Set(highlightSeats ?? []);
  const revealedSet = revealedSeats === 'all' ? null : new Set(revealedSeats);

  // 미공개 좌석은 뒷면(빈 종이)이다. 이름·역할은 물론 고정 압정도 붙이지 않아
  // 공개 전에 어떤 정보도 DOM에 남지 않게 한다.
  const slot = (pos: SeatPosition) => {
    const i = pos.index;
    const revealed = revealedSet === null || revealedSet.has(i);
    return (
      <SeatSlot
        key={i}
        index={i}
        size={size}
        removed={removedSet.has(i)}
        editable={editable}
        name={revealed ? mapping?.[i] : undefined}
        fixed={revealed && fixedSet.has(i)}
        highlight={highlightSet.has(i) || (fixedMode && fixedSet.has(i))}
        role={revealed ? roles?.[i] : undefined}
        onSeatClick={onSeatClick}
        onSeatRestore={onSeatRestore}
      />
    );
  };

  // 절대 배치 공통: 0~100% 좌표를 계산하고, 교사 시선이면 180도 반전한다.
  const absSlot = (pos: SeatPosition, leftPct: number, topPct: number) => {
    const left = teacher ? 100 - leftPct : leftPct;
    const top = teacher ? 100 - topPct : topPct;
    return (
      <div
        key={pos.index}
        data-abs-slot={pos.index}
        className={`absolute -translate-x-1/2 -translate-y-1/2 ${SLOT_W[size]}`}
        style={{ left: `${left}%`, top: `${top}%` }}
      >
        {slot(pos)}
      </div>
    );
  };

  // 절대 배치(px 좌표) 공통. 교사 시선이면 캔버스 안에서 180도 반전한다.
  const absSlotPx = (pos: SeatPosition, leftPx: number, topPx: number, w: number, h: number) => {
    const left = teacher ? w - leftPx : leftPx;
    const top = teacher ? h - topPx : topPx;
    return (
      <div
        key={pos.index}
        data-abs-slot={pos.index}
        className={`absolute -translate-x-1/2 -translate-y-1/2 ${SLOT_W[size]}`}
        style={{ left: `${left}px`, top: `${top}px` }}
      >
        {slot(pos)}
      </div>
    );
  };

  let body: React.ReactNode;

  if (positions.length === 0) {
    body = <p className="py-8 text-center font-body text-ink">배치할 자리가 없습니다.</p>;
  } else if (data.layoutType === 'pair') {
    const rowOrder = uniqueSorted(positions.map((p) => p.row));
    const pairColOrder = uniqueSorted(positions.map((p) => p.pairCol ?? 0));
    const rows = teacher ? [...rowOrder].reverse() : rowOrder;
    const pairCols = teacher ? [...pairColOrder].reverse() : pairColOrder;
    body = (
      <div
        data-arrangement="pair"
        className={`grid justify-center ${GAP[size]}`}
        style={{ gridTemplateColumns: `repeat(${pairColOrder.length}, auto)` }}
      >
        {rows.flatMap((r) =>
          pairCols.map((pc) => {
            const pair = positions
              .filter((p) => p.row === r && (p.pairCol ?? 0) === pc)
              .sort((a, b) => a.col - b.col);
            const inner = teacher ? [...pair].reverse() : pair;
            return (
              <div key={`${r}-${pc}`} data-pair-group={`${r}-${pc}`} className={`flex ${PAIR_GAP[size]}`}>
                {inner.map(slot)}
              </div>
            );
          }),
        )}
      </div>
    );
  } else if (data.layoutType === 'ushape') {
    // arcPos(U자 경로 위치)를 0~1로 정규화한 뒤 반원 각도로 매핑한다.
    // t=0 -> 왼쪽 아래, t=0.5 -> 칠판 쪽 가운데 위, t=1 -> 오른쪽 아래.
    const arc = extent(positions.map((p) => p.arcPos ?? 0));
    body = (
      <div data-arrangement="ushape" className={`relative w-full ${CANVAS_H[size]}`}>
        {positions.map((pos) => {
          const t = ((pos.arcPos ?? 0) - arc.min) / arc.span;
          const angle = Math.PI * (1 - t);
          return absSlot(pos, 50 + Math.cos(angle) * 42, 78 - Math.sin(angle) * 62);
        })}
      </div>
    );
  } else if (data.layoutType === 'custom') {
    // 이름표 아래 역할 글씨가 캔버스 밖으로 잘리지 않도록 위아래로 같은 여유를 준다
    // (교사 시선은 좌표를 180도 뒤집으므로 여유가 위아래 같아야 어긋나지 않는다).
    const scale = pixelScale(positions, size, SOURCE_CELL.custom, { top: ROLE_PAD[size], bottom: ROLE_PAD[size] });
    body = (
      <div
        data-arrangement="custom"
        className="relative"
        style={{ width: scale.width, height: scale.height }}
      >
        {positions.map((pos) =>
          absSlotPx(pos, scale.toLeft(pos.px ?? 0), scale.toTop(pos.py ?? 0), scale.width, scale.height),
        )}
      </div>
    );
  } else if (data.layoutType === 'group') {
    // 모둠 블록 위치는 코어가 px/py에 반영해 둔다. 여기서 격자를 다시 계산하면
    // 교사가 드래그해 저장한 위치(groupPositions)가 배치도에서 사라진다.
    // 모둠 이름 팻말(위)과 역할 글씨(아래)가 잘리지 않게 위아래로 같은 여유를 둔다.
    const gPad = GROUP_LABEL_OFFSET[size];
    const scale = pixelScale(positions, size, SOURCE_CELL.group, { top: gPad, bottom: gPad });
    const groupOrder = uniqueSorted(positions.map((p) => p.groupIndex ?? 0));
    body = (
      <div
        data-arrangement="group"
        className="relative"
        style={{ width: scale.width, height: scale.height }}
      >
        {groupOrder.map((g) => {
          const seats = positions.filter((p) => (p.groupIndex ?? 0) === g);
          const xs = seats.map((p) => p.px ?? 0);
          const ys = seats.map((p) => p.py ?? 0);
          // 교사 시선은 좌표가 180도 뒤집히므로, 블록의 반대쪽 모서리가 화면 좌상단이 된다.
          const anchorX = teacher ? Math.max(...xs) : Math.min(...xs);
          const anchorY = teacher ? Math.max(...ys) : Math.min(...ys);
          const rawLeft = scale.toLeft(anchorX);
          const rawTop = scale.toTop(anchorY);
          const left = teacher ? scale.width - rawLeft : rawLeft;
          const top = teacher ? scale.height - rawTop : rawTop;
          return (
            // 모둠 이름 팻말: cork 배경 위이므로 text-ink
            <span
              key={g}
              data-group-index={g}
              // top은 블록에서 화면상 가장 위에 오는 좌석의 "중심"이다. 팻말 높이는
              // 글꼴에 따라 달라지므로 -translate-y-full로 팻말의 아래쪽을 좌석 윗변
              // 바로 위에 붙인다(고정 오프셋으로 빼면 이름표에 가려진다).
              style={{ left: `${left}px`, top: `${top - SLOT_PX[size].h / 2 - LABEL_GAP}px` }}
              className={`absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap font-hand font-bold leading-none text-ink ${GROUP_TEXT[size]}`}
            >
              {groupNames?.[g] ?? `${g + 1}모둠`}
            </span>
          );
        })}
        {positions.map((pos) =>
          absSlotPx(pos, scale.toLeft(pos.px ?? 0), scale.toTop(pos.py ?? 0), scale.width, scale.height),
        )}
      </div>
    );
  } else {
    // exam (기본값). getLayout 폴백도 exam이므로 알 수 없는 배치는 여기로 온다.
    const ordered = teacher
      ? [...positions].sort((a, b) => (a.row !== b.row ? b.row - a.row : b.col - a.col))
      : positions;
    body = (
      <div
        data-arrangement="exam"
        className={`grid justify-center ${GAP[size]}`}
        style={{ gridTemplateColumns: `repeat(${data.layoutSettings.columns}, auto)` }}
      >
        {ordered.map(slot)}
      </div>
    );
  }

  return (
    <div
      data-testid="seat-board"
      data-layout={data.layoutType}
      data-perspective={perspective}
      data-size={size}
      data-flipping={flipping ? 'true' : undefined}
      className={`flex flex-col ${GAP[size]} ${flipping ? 'seat-board-flipping' : ''} ${className}`}
    >
      {!teacher && <ChalkBoard kind="board" />}
      {body}
      {teacher && <ChalkBoard kind="podium" />}
    </div>
  );
}
