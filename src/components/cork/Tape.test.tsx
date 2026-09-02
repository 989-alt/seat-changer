import { render } from '@testing-library/react';
import { Tape } from './Tape';

describe('Tape', () => {
  it('기본은 위쪽 테이프', () => {
    const { container } = render(<Tape />);
    const el = container.querySelector('[data-cork="tape"]')!;
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el).toHaveAttribute('data-side', 'top');
  });
});
