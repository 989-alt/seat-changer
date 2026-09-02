const COLORS = {
  apple: 'pin-apple bg-[radial-gradient(circle_at_35%_35%,#ff8f7a,#c9372b_60%,#8e2318)]',
  chalk: 'pin-chalk bg-[radial-gradient(circle_at_35%_35%,#7fb8a5,#2e5a4e_60%,#1c3a32)]',
  gold: 'pin-gold bg-[radial-gradient(circle_at_35%_35%,#ffe08a,#e4b04a_60%,#9c7422)]',
} as const;

/** 코르크판에 꽂힌 장식용 압정. */
export function PushPin({ color = 'apple', className = '' }: { color?: keyof typeof COLORS; className?: string }) {
  return (
    <span
      data-cork="pushpin"
      aria-hidden="true"
      className={`absolute -top-2 left-1/2 h-[18px] w-[18px] -translate-x-1/2 rounded-full shadow-[0_3px_4px_rgba(0,0,0,0.4)] ${COLORS[color]} ${className}`}
    />
  );
}
