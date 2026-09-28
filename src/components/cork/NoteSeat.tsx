import { Tape } from './Tape';
import { PushPin } from './PushPin';

export type NoteSeatState = 'empty' | 'assigned' | 'fixed' | 'disabled';

const VARIANT = ['bg-paper tilt-note-a', 'bg-paper-2 tilt-note-b', 'bg-paper-3 tilt-note-c'] as const;
// lg는 발표·인쇄용 가로형 이름표다(개선 스펙 3-1). 폭은 부모 슬롯(SeatBoard의 200px)이 정한다.
// 번호를 왼쪽 위 모서리로 빼고(pt-3로 이름을 살짝 내림) 이름 글자를 키운다.
const SIZE = { sm: 'h-14 text-[14px]', lg: 'h-[100px] px-3 pt-3 text-[26px]' } as const;
const NUMBER = {
  sm: 'font-body text-[10px] font-normal text-ink',
  lg: 'absolute left-2 top-1 font-body text-[14px] font-normal leading-none text-ink',
} as const;
const ROLE_TEXT = { sm: 'text-[11px]', lg: 'text-[18px]' } as const;

/**
 * lg 이름 글자 크기. 글자 수(공백 포함)가 늘면 200px 이름표 안에 한 줄로 들어가도록 줄인다
 * (Gaegu 한글 한 글자 폭은 글자 크기의 약 0.8~0.85배).
 * Tailwind 임의값 클래스는 문자열 보간으로 만들 수 없어 단계별 리터럴로 둔다.
 */
const LG_NAME_STEPS = [
  { maxChars: 4, cls: 'text-[48px]' },
  { maxChars: 5, cls: 'text-[38px]' },
  { maxChars: 6, cls: 'text-[32px]' },
  { maxChars: 8, cls: 'text-[24px]' },
] as const;
const LG_NAME_MIN = 'text-[20px]';

export function lgNameClass(name: string): string {
  const chars = [...name].length;
  return LG_NAME_STEPS.find((step) => chars <= step.maxChars)?.cls ?? LG_NAME_MIN;
}

type Props = {
  index: number;
  name?: string;
  state: NoteSeatState;
  size?: keyof typeof SIZE;
  variant?: 0 | 1 | 2;
  /** 모둠 역할. 이름표 안 아랫줄에 작게 쓴다(밖에 두면 아래 줄 이름표에 가려진다). */
  role?: string;
  onClick?: () => void;
  onRestore?: () => void;
  highlight?: boolean;
};

export function seatLabel(index: number, state: NoteSeatState, name?: string, canRestore = true): string {
  const n = index + 1;
  // R38: onRestore가 없으면 되살릴 수 없는데 "다시 쓰기"라고 약속하는 문구를 쓰지 않는다.
  if (state === 'disabled') return canRestore ? `${n}번 자리 다시 쓰기` : `${n}번 자리 (빈 자리로 둠)`;
  if (state === 'empty' || !name) return `${n}번 자리 (빈 자리)`;
  return `${n}번 자리: ${name}${state === 'fixed' ? ' (고정)' : ''}`;
}

export function NoteSeat({
  index,
  name,
  state,
  size = 'sm',
  variant = 0,
  role,
  onClick,
  onRestore,
  highlight = false,
}: Props) {
  // R35: 이 상태가 "빈 자리로 둬서 다시 써야 하는 좌석"임을 나타낸다. 네이티브
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
  // 누를 수 있는 좌석은 그렇게 보여야 한다(예전에는 커서도 안 바뀌어 아무도 누를
  // 생각을 못 했다). 색이 아니라 커서와 테두리로만 알린다.
  const interactive = handler
    ? 'cursor-pointer hover:ring-2 hover:ring-ink focus-visible:ring-2 focus-visible:ring-ink'
    : '';
  // lg 이름은 한 줄 유지(truncate). 단계별 글자 크기로 대부분 잘리지 않고, 아주 긴 이름만 말줄임된다.
  const nameClass = size === 'lg' ? `block max-w-full truncate ${lgNameClass(name ?? '')}` : undefined;
  return (
    <button
      type="button"
      data-cork="note-seat"
      data-seat={index}
      data-state={state}
      data-size={size}
      data-highlight={highlight ? 'true' : undefined}
      aria-label={seatLabel(index, state, name, Boolean(onRestore))}
      onClick={handler}
      disabled={!handler}
      className={`${base} ${look} ${ring} ${interactive} ${SIZE[size]}`}
    >
      {!isRemoved && <Tape />}
      {state === 'fixed' && <PushPin color="gold" />}
      {/* 좌석 번호: mute는 paper-2·paper-3 배경에서 4.5:1 미달(각 4.25/4.46)이라
          ink를 사용한다 (src/styles/contrast.test.ts 참고). */}
      <span className={NUMBER[size]}>{index + 1}</span>
      {isRemoved ? (
        // R38: onRestore가 없으면 되살릴 수 없으므로 "다시 쓰기"를 약속하는 문구를 쓰지 않는다.
        <span>{onRestore ? '다시 쓰기' : '빈 자리로 둠'}</span>
      ) : showEmpty ? (
        // R30: opacity 합성(~3.0:1)이 아니라 ink 색 + normal weight로 "비어있음"을 표현한다.
        <span className="text-ink font-normal">빈 자리</span>
      ) : (
        <span data-seat-name className={nameClass}>
          {name}
        </span>
      )}
      {role && !isRemoved && !showEmpty ? (
        <span data-seat-role className={`mt-1 font-body font-bold leading-none text-ink ${ROLE_TEXT[size]}`}>
          {role}
        </span>
      ) : null}
    </button>
  );
}
