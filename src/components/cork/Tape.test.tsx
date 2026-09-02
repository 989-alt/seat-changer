import { render } from '@testing-library/react';
import { Tape } from './Tape';

describe('Tape', () => {
  it('기본은 위쪽 테이프', () => {
    const { container } = render(<Tape />);
    const el = container.querySelector('[data-cork="tape"]')!;
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el).toHaveAttribute('data-side', 'top');
  });
  it('클릭을 가로채지 않는다', () => {
    const { container } = render(<Tape />);
    expect(container.querySelector('[data-cork="tape"]')!.className).toContain('pointer-events-none');
  });
  it('절대 배치와 클릭 통과 클래스를 공유 상수로 갖는다', () => {
    const { container } = render(<Tape />);
    const className = container.querySelector('[data-cork="tape"]')!.className;
    expect(className).toContain('absolute');
    expect(className).toContain('pointer-events-none');
  });
});
