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
