import { Tape } from './Tape';
import { PushPin } from './PushPin';

export type NoteSeatState = 'empty' | 'assigned' | 'fixed' | 'disabled';

const VARIANT = ['bg-paper tilt-note-a', 'bg-paper-2 tilt-note-b', 'bg-paper-3 tilt-note-c'] as const;
const SIZE = { sm: 'h-14 text-[14px]', lg: 'h-24 text-[28px]' } as const;

type Props = {
  index: number;
  name?: string;
  state: NoteSeatState;
  size?: keyof typeof SIZE;
  variant?: 0 | 1 | 2;
  onClick?: () => void;
  onRestore?: () => void;
  highlight?: boolean;
};

export function seatLabel(index: number, state: NoteSeatState, name?: string): string {
  const n = index + 1;
  if (state === 'disabled') return `${n}번 자리 되살리기`;
  if (state === 'empty' || !name) return `${n}번 자리 (빈 자리)`;
  return `${n}번 자리: ${name}${state === 'fixed' ? ' (고정)' : ''}`;
}

export function NoteSeat({
  index,
  name,
  state,
  size = 'sm',
  variant = 0,
  onClick,
  onRestore,
  highlight = false,
}: Props) {
  // R35: 이 상태가 "삭제되어 되살리기가 필요한 좌석"임을 나타낸다. 네이티브
  // disabled 속성(R32)과 이름이 겹치지 않도록 isRemoved로 부른다.
  const isRemoved = state === 'disabled';
  // R37: state가 empty면 name이 있어도 빈 자리로 표시해 라벨과 화면 내용을 일치시킨다.
  const showEmpty = state === 'empty' || !name;
  // R32: 클릭해도 아무 동작이 없는 좌석(핸들러 미전달)은 네이티브 disabled로
  // 탭 순서에서 제외한다. 시각적 dimming은 추가하지 않는다(disabled:opacity 금지).
  const handler = isRemoved ? onRestore : onClick;
  const base = 'relative flex w-full flex-col items-center justify-center rounded-note font-hand font-bold leading-tight';
  // R20: cork(배경) 위에서는 paper 텍스트가 2.57:1로 대비 미달이라 금지된다.
  // disabled 상태는 불투명한 paper 메모지 + 점선 cork-dark 테두리 + ink 텍스트로 표현한다.
  const look = isRemoved
    ? 'border-2 border-dashed border-cork-dark bg-paper text-ink'
    : `${VARIANT[variant]} text-ink shadow-note`;
  // R33: gold 링은 cork(1.34:1)·paper(1.9:1) 모두 대비 미달이라 ink로 교체한다.
  const ring = highlight ? 'ring-4 ring-ink' : '';
  return (
    <button
      type="button"
      data-cork="note-seat"
      data-seat={index}
      data-state={state}
      data-size={size}
      data-highlight={highlight ? 'true' : undefined}
      aria-label={seatLabel(index, state, name)}
      onClick={handler}
      disabled={!handler}
      className={`${base} ${look} ${ring} ${SIZE[size]}`}
    >
      {!isRemoved && <Tape />}
      {state === 'fixed' && <PushPin color="gold" />}
      {/* 좌석 번호: mute는 paper-2·paper-3 배경에서 4.5:1 미달(각 4.25/4.46)이라
          ink를 사용한다 (src/styles/contrast.test.ts 참고). */}
      <span className="font-body text-[10px] font-normal text-ink">{index + 1}</span>
      {isRemoved ? (
        <span>되살리기</span>
      ) : showEmpty ? (
        // R30: opacity 합성(~3.0:1)이 아니라 ink 색 + normal weight로 "비어있음"을 표현한다.
        <span className="text-ink font-normal">빈 자리</span>
      ) : (
        <span>{name}</span>
      )}
    </button>
  );
}
