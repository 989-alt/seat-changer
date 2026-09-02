import { useId, type ReactNode } from 'react';
import { PushPin } from './PushPin';

const TILT = { l: 'tilt-l', r: 'tilt-r', none: '' } as const;

export function PaperCard({
  title, badge, tilt = 'none', pin = true, children, className = '',
}: { title: string; badge?: string; tilt?: keyof typeof TILT; pin?: boolean; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <section
      data-cork="paper-card"
      aria-labelledby={id}
      className={`relative rounded-note texture-paper-lines p-4 pt-5 shadow-card ${TILT[tilt]} ${className}`}
    >
      {pin && <PushPin />}
      <h2 id={id} className="font-hand text-[21px] font-bold leading-none text-ink">
        {title}
        {badge && <span className="ml-2 font-body text-xs font-bold text-mute">{badge}</span>}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
