import type { ButtonHTMLAttributes, ReactNode } from 'react';

const VARIANT = {
  primary: 'bg-chalk text-chalk-text border-[#1c3a32]',
  secondary: 'bg-paper-2 text-ink border-cork-dark',
  danger: 'texture-wood text-[#FFF3D6] border-[#5E3A1B] [text-shadow:0_1px_0_rgba(0,0,0,0.4)]',
} as const;
const SIZE = { md: 'px-4 py-2 text-[15px]', lg: 'px-10 py-4 text-[22px] rounded-[10px] border-4' } as const;

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANT; size?: keyof typeof SIZE; icon?: ReactNode;
};

export function WoodButton({ variant = 'primary', size = 'md', icon, className = '', children, ...rest }: Props) {
  return (
    <button
      type="button"
      data-cork="wood-button"
      data-variant={variant}
      data-size={size}
      className={`inline-flex items-center gap-2 rounded-[6px] border-2 font-hand font-bold shadow-note transition-transform active:translate-y-[2px] disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
