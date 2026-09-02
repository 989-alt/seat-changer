/**
 * 칠판 배경색. Tailwind는 임의값 클래스(`bg-[#26443C]`)를 런타임 문자열 보간으로
 * 만들 수 없어 클래스 자체는 리터럴로 유지한다. 이 상수는 값이 어긋나지 않도록
 * ChalkBoard.test.tsx·contrast.test.ts(R34)가 대조하는 용도로만 쓴다.
 */
export const BOARD_BG = '#26443C';

export function ChalkBoard({
  kind = 'board',
  label,
  className = '',
}: {
  kind?: 'board' | 'podium';
  label?: string;
  className?: string;
}) {
  const text = label ?? (kind === 'board' ? '칠 판' : '교 탁');
  return (
    <div
      data-cork="chalkboard"
      data-kind={kind}
      className={`w-full rounded-[4px] border-[6px] border-cork-dark bg-[#26443C] py-2 text-center font-hand text-[32px] tracking-[0.4em] text-chalk-text shadow-card ${className}`}
    >
      {text}
    </div>
  );
}
