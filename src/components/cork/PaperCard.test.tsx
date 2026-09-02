import { render, screen } from '@testing-library/react';
import { PaperCard } from './PaperCard';

describe('PaperCard', () => {
  it('제목이 section의 접근 가능한 이름이 된다', () => {
    render(<PaperCard title="학생 명단" badge="22명"><p>본문</p></PaperCard>);
    const sec = screen.getByRole('region', { name: /학생 명단/ });
    expect(sec).toHaveAttribute('data-cork', 'paper-card');
    expect(screen.getByText('22명')).toBeInTheDocument();
    expect(sec.querySelector('[data-cork="pushpin"]')).not.toBeNull();
  });
  it('pin=false면 압정이 없다', () => {
    render(<PaperCard title="자리 배치" pin={false}><p /></PaperCard>);
    expect(screen.getByRole('region').querySelector('[data-cork="pushpin"]')).toBeNull();
  });
  it('tilt 클래스', () => {
    render(<PaperCard title="규칙" tilt="r"><p /></PaperCard>);
    expect(screen.getByRole('region').className).toContain('tilt-r');
  });
});
