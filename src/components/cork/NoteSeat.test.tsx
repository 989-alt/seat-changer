import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoteSeat } from './NoteSeat';

describe('NoteSeat', () => {
  it('배정된 자리', () => {
    render(<NoteSeat index={2} name="김하람" state="assigned" />);
    const b = screen.getByRole('button', { name: '3번 자리: 김하람' });
    expect(b).toHaveAttribute('data-state', 'assigned');
    expect(b.querySelector('[data-cork="tape"]')).not.toBeNull();
  });
  it('고정 자리는 압정과 (고정) 라벨', () => {
    render(<NoteSeat index={0} name="이도윤" state="fixed" />);
    const b = screen.getByRole('button', { name: '1번 자리: 이도윤 (고정)' });
    expect(b.querySelector('[data-cork="pushpin"]')).not.toBeNull();
  });
  it('빈 자리', () => {
    render(<NoteSeat index={14} state="empty" />);
    expect(screen.getByRole('button', { name: '15번 자리 (비어있음)' })).toHaveTextContent('빈 자리');
  });
  it('삭제된 자리는 되살리기', async () => {
    const onRestore = vi.fn();
    render(<NoteSeat index={9} state="disabled" onRestore={onRestore} />);
    const b = screen.getByRole('button', { name: '10번 자리 되살리기' });
    expect(b).toHaveTextContent('되살리기');
    await userEvent.click(b);
    expect(onRestore).toHaveBeenCalledTimes(1);
  });
  it('일반 클릭', async () => {
    const onClick = vi.fn();
    render(<NoteSeat index={1} state="empty" onClick={onClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it('발표 크기는 28px 이상', () => {
    render(<NoteSeat index={0} name="김하람" state="assigned" size="lg" />);
    expect(screen.getByRole('button').className).toContain('text-[28px]');
  });
});
