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
  if (state === 'empty' || !name) return `${n}번 자리 (비어있음)`;
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
  const disabled = state === 'disabled';
  const base = 'relative flex w-full flex-col items-center justify-center rounded-note font-hand font-bold leading-tight';
  // R20: cork(배경) 위에서는 paper 텍스트가 2.57:1로 대비 미달이라 금지된다.
  // disabled 상태는 불투명한 paper 메모지 + 점선 cork-dark 테두리 + ink 텍스트로 표현한다.
  const look = disabled
    ? 'border-2 border-dashed border-cork-dark bg-paper text-ink'
    : `${VARIANT[variant]} text-ink shadow-note`;
  const ring = highlight ? 'ring-4 ring-gold' : '';
  return (
    <button
      type="button"
      data-cork="note-seat"
      data-seat={index}
      data-state={state}
      data-size={size}
      aria-label={seatLabel(index, state, name)}
      onClick={disabled ? onRestore : onClick}
      className={`${base} ${look} ${ring} ${SIZE[size]}`}
    >
      {!disabled && <Tape />}
      {state === 'fixed' && <PushPin color="gold" />}
      {/* 좌석 번호: mute는 paper-2·paper-3 배경에서 4.5:1 미달(각 4.25/4.46)이라
          ink를 사용한다 (src/styles/contrast.test.ts 참고). */}
      <span className="font-body text-[10px] font-normal text-ink">{index + 1}</span>
      {disabled ? <span>되살리기</span> : name ? <span>{name}</span> : <span className="opacity-50">빈 자리</span>}
    </button>
  );
}
