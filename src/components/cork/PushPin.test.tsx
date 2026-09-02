import { render } from '@testing-library/react';
import { PushPin } from './PushPin';

describe('PushPin', () => {
  it('장식 요소로 렌더된다', () => {
    const { container } = render(<PushPin />);
    const el = container.querySelector('[data-cork="pushpin"]')!;
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el.className).toContain('pin-apple');
  });
  it('색을 바꿀 수 있다', () => {
    const { container } = render(<PushPin color="gold" />);
    expect(container.querySelector('[data-cork="pushpin"]')!.className).toContain('pin-gold');
  });
});
