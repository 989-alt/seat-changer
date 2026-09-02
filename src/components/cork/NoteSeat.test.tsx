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
    expect(screen.getByRole('button', { name: '15번 자리 (빈 자리)' })).toHaveTextContent('빈 자리');
  });
  it('삭제된 자리는 되살리기', async () => {
    const onRestore = vi.fn();
    render(<NoteSeat index={9} state="disabled" onRestore={onRestore} />);
    const b = screen.getByRole('button', { name: '10번 자리 되살리기' });
    expect(b).toHaveTextContent('되살리기');
    await userEvent.click(b);
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  // R38: onRestore가 없으면 되살릴 수 없으므로 "되살리기"를 약속하는 문구를 쓰지 않는다.
  it('R38: onRestore가 있는 삭제된 자리는 되살리기 문구를 쓰고 활성 상태다', () => {
    render(<NoteSeat index={9} state="disabled" onRestore={() => {}} />);
    const b = screen.getByRole('button', { name: '10번 자리 되살리기' });
    expect(b).toHaveTextContent('되살리기');
    expect(b).toBeEnabled();
  });

  it('R38: onRestore가 없는 삭제된 자리는 (삭제됨) 문구를 쓰고 disabled 상태다', () => {
    render(<NoteSeat index={9} state="disabled" />);
    const b = screen.getByRole('button', { name: '10번 자리 (삭제됨)' });
    expect(b).toHaveTextContent('삭제된 자리');
    expect(b).toBeDisabled();
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

  // R30: 빈 자리 라벨은 opacity 합성(~3.0:1) 대신 ink 색 + normal weight로 대비를 확보한다.
  it('R30: 빈 자리 라벨은 opacity 없이 ink 색이다', () => {
    render(<NoteSeat index={0} state="empty" onClick={() => {}} />);
    const label = screen.getByText('빈 자리');
    expect(label.className).toContain('text-ink');
    expect(label.className).not.toMatch(/opacity-/);
  });

  // R31: 삭제(disabled) 룩 회귀 가드 — cork 위 paper 텍스트(2.57:1) 금지.
  it('R31: 삭제된 자리 룩은 cork-dark 점선 테두리 + paper 배경 + ink 텍스트이고 paper 텍스트를 쓰지 않는다', () => {
    render(<NoteSeat index={9} state="disabled" onRestore={() => {}} />);
    const b = screen.getByRole('button');
    expect(b.className).toContain('border-dashed');
    expect(b.className).toContain('border-cork-dark');
    expect(b.className).toContain('bg-paper');
    expect(b.className).toContain('text-ink');
    expect(b.className).not.toMatch(/\btext-paper\b/);
  });

  // R31: 좌석 번호 색 회귀 가드 — mute는 paper-2/paper-3에서 4.5:1 미달.
  it('R31: 좌석 번호는 ink를 쓰고 mute를 쓰지 않는다', () => {
    render(<NoteSeat index={0} name="김하람" state="assigned" onClick={() => {}} />);
    const num = screen.getByText('1');
    expect(num.className).toContain('text-ink');
    expect(num.className).not.toMatch(/\btext-mute\b/);
  });

  // R32: 핸들러가 없는 좌석은 네이티브 disabled로 탭 순서에서 제외한다.
  it('R32: 핸들러가 없으면 버튼이 disabled 된다', () => {
    render(<NoteSeat index={0} state="empty" />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('R32: 핸들러가 있으면 버튼이 활성 상태다', () => {
    render(<NoteSeat index={0} state="empty" onClick={() => {}} />);
    expect(screen.getByRole('button')).toBeEnabled();
  });

  it('R32: onRestore 없는 disabled 상태 좌석은 버튼이 disabled 된다', () => {
    render(<NoteSeat index={9} state="disabled" />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  // R33: highlight는 gold 대신 ink 링을 쓰고 data-highlight로 마킹한다.
  it('R33: highlight 시 data-highlight="true"와 ring-ink 클래스', () => {
    render(<NoteSeat index={0} state="assigned" name="김하람" onClick={() => {}} highlight />);
    const b = screen.getByRole('button');
    expect(b).toHaveAttribute('data-highlight', 'true');
    expect(b.className).toContain('ring-ink');
  });

  it('R33: highlight 아니면 data-highlight 속성이 없다', () => {
    render(<NoteSeat index={0} state="assigned" name="김하람" onClick={() => {}} />);
    expect(screen.getByRole('button')).not.toHaveAttribute('data-highlight');
  });

  // R37: state=empty면 name이 있어도 빈 자리로 표시해 라벨-화면 내용을 일치시킨다.
  it('R37: state=empty면 name이 있어도 빈 자리로 표시한다', () => {
    render(<NoteSeat index={0} state="empty" name="김하람" onClick={() => {}} />);
    expect(screen.getByText('빈 자리')).not.toBeNull();
    expect(screen.queryByText('김하람')).toBeNull();
  });
});
