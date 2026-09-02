import { DECOR_BASE } from './decor';

const SIDE = {
  top: 'top-[-6px] left-1/2 -translate-x-1/2 -rotate-3 w-[34px] h-[11px]',
  left: 'top-1/2 left-[-8px] -translate-y-1/2 rotate-90 w-[34px] h-[11px]',
  right: 'top-1/2 right-[-8px] -translate-y-1/2 -rotate-90 w-[34px] h-[11px]',
} as const;

/**
 * 코르크판 메모를 고정하는 장식용 테이프 조각.
 * 부모 요소는 `position: relative`(Tailwind `relative`)여야 하며, 그렇지 않으면 다른 조상이나 뷰포트 기준으로 배치된다.
 */
export function Tape({ side = 'top', className = '' }: { side?: keyof typeof SIDE; className?: string }) {
  return (
    <span
      data-cork="tape"
      data-side={side}
      aria-hidden="true"
      className={`${DECOR_BASE} border border-black/10 bg-white/55 ${SIDE[side]} ${className}`}
    />
  );
}
