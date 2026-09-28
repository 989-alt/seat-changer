import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoteSeat, lgNameClass } from './NoteSeat';

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
  it('빈 자리로 둔 자리는 다시 쓰기', async () => {
    const onRestore = vi.fn();
    render(<NoteSeat index={9} state="disabled" onRestore={onRestore} />);
    const b = screen.getByRole('button', { name: '10번 자리 다시 쓰기' });
    expect(b).toHaveTextContent('다시 쓰기');
    await userEvent.click(b);
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  // R38: onRestore가 없으면 되살릴 수 없으므로 "다시 쓰기"를 약속하는 문구를 쓰지 않는다.
  it('R38: onRestore가 있는 빈 자리는 다시 쓰기 문구를 쓰고 활성 상태다', () => {
    render(<NoteSeat index={9} state="disabled" onRestore={() => {}} />);
    const b = screen.getByRole('button', { name: '10번 자리 다시 쓰기' });
    expect(b).toHaveTextContent('다시 쓰기');
    expect(b).toBeEnabled();
  });

  it('R38: onRestore가 없는 빈 자리는 (빈 자리로 둠) 문구를 쓰고 disabled 상태다', () => {
    render(<NoteSeat index={9} state="disabled" />);
    const b = screen.getByRole('button', { name: '10번 자리 (빈 자리로 둠)' });
    expect(b).toHaveTextContent('빈 자리로 둠');
    expect(b).toBeDisabled();
  });
  it('일반 클릭', async () => {
    const onClick = vi.fn();
    render(<NoteSeat index={1} state="empty" onClick={onClick} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it('lg 이름은 4글자까지 48px이고 길면 단계적으로 줄인다', () => {
    expect(lgNameClass('김')).toBe('text-[48px]');
    expect(lgNameClass('김하람')).toBe('text-[48px]');
    expect(lgNameClass('남궁민수')).toBe('text-[48px]');
    expect(lgNameClass('황보아리랑')).toBe('text-[38px]');
    expect(lgNameClass('가나다라마바')).toBe('text-[32px]');
    expect(lgNameClass('가나다라마바사아')).toBe('text-[24px]');
    expect(lgNameClass('가나다라마바사아자')).toBe('text-[20px]');
  });

  it('lg 이름표는 이름에 크기 클래스를 붙이고 한 줄로 자르며, 번호는 왼쪽 위에 둔다', () => {
    render(<NoteSeat index={0} name="김하람" state="assigned" size="lg" />);
    const b = screen.getByRole('button');
    expect(b).toHaveAttribute('data-size', 'lg');
    expect(b.className).toContain('h-[100px]');
    const name = b.querySelector('[data-seat-name]')!;
    expect(name.textContent).toBe('김하람');
    expect(name.className).toContain('text-[48px]');
    expect(name.className).toContain('truncate');
    const num = screen.getByText('1');
    expect(num.className).toContain('absolute');
    expect(num.className).toContain('text-ink');
  });

  it('이름 글자에만 data-seat-name을 단다(빈 자리·빈 자리로 둠에는 없다)', () => {
    const { unmount } = render(<NoteSeat index={0} state="empty" size="lg" />);
    expect(document.querySelector('[data-seat-name]')).toBeNull();
    unmount();
    render(<NoteSeat index={0} state="disabled" size="lg" />);
    expect(document.querySelector('[data-seat-name]')).toBeNull();
  });

  it('역할은 이름표 안 아랫줄에 쓴다', () => {
    render(<NoteSeat index={0} name="김하람" state="assigned" size="lg" role="모둠장" />);
    const b = screen.getByRole('button');
    const role = b.querySelector('[data-seat-role]')!;
    expect(role.textContent).toBe('모둠장');
    expect(role.className).toContain('text-ink');
  });

  it('빈 자리에는 역할을 쓰지 않는다', () => {
    render(<NoteSeat index={0} state="empty" size="lg" role="모둠장" />);
    expect(screen.queryByText('모둠장')).toBeNull();
  });

  // R30: 빈 자리 라벨은 opacity 합성(~3.0:1) 대신 ink 색 + normal weight로 대비를 확보한다.
  it('R30: 빈 자리 라벨은 opacity 없이 ink 색이다', () => {
    render(<NoteSeat index={0} state="empty" onClick={() => {}} />);
    const label = screen.getByText('빈 자리');
    expect(label.className).toContain('text-ink');
    expect(label.className).not.toMatch(/opacity-/);
  });

  // R31: 삭제(disabled) 룩 회귀 가드 — cork 위 paper 텍스트(2.57:1) 금지.
  it('R31: 빈 자리로 둔 자리 룩은 cork-dark 점선 테두리 + paper 배경 + ink 텍스트이고 paper 텍스트를 쓰지 않는다', () => {
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
