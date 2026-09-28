import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PresentControls, type PresentControlsProps } from './PresentControls';

function props(patch: Partial<PresentControlsProps> = {}): PresentControlsProps {
  return {
    classLabel: '6-5',
    status: null,
    hidden: false,
    hasResult: true,
    running: false,
    lottery: false,
    teacherView: false,
    muted: false,
    onStart: vi.fn(),
    onStartLottery: vi.fn(),
    onRevealOne: vi.fn(),
    onRevealAll: vi.fn(),
    onTogglePerspective: vi.fn(),
    onToggleSound: vi.fn(),
    onSaveImage: vi.fn(),
    onPrint: vi.fn(),
    violations: [],
    ...patch,
  };
}

afterEach(() => {
  // useFullscreen이 읽는 전역을 테스트마다 되돌린다(jsdom에는 Fullscreen API가 없다).
  Reflect.deleteProperty(document, 'fullscreenEnabled');
  Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
});

describe('PresentControls', () => {
  it('반 이름과 상태 칸을 보여 준다', () => {
    render(<PresentControls {...props({ status: { text: '두 자리를 차례로 누르면 서로 바뀝니다', tone: 'hint' } })} />);
    expect(document.querySelector('[data-present="class"]')).toHaveTextContent('6-5');
    const status = document.querySelector('[data-present="status"]')!;
    expect(status).toHaveTextContent('두 자리를 차례로 누르면 서로 바뀝니다');
    expect(status).toHaveAttribute('data-tone', 'hint');
  });

  it('상태가 없어도 상태 칸은 같은 높이로 남는다', () => {
    render(<PresentControls {...props()} />);
    const status = document.querySelector('[data-present="status"]')!;
    expect(status.className).toContain('h-9');
    expect(status).toHaveTextContent('');
  });

  it('뽑는 동안에는 언마운트하지 않고 가린다(높이 유지)', () => {
    render(<PresentControls {...props({ hidden: true })} />);
    expect(document.querySelector('[data-present="controls"]')!.className).toContain('invisible');
  });

  it('결과가 없으면 이미지 저장·인쇄를 잠그고 버튼 이름은 자리 뽑기다', () => {
    render(<PresentControls {...props({ hasResult: false })} />);
    expect(screen.getByRole('button', { name: /이미지 저장/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /인쇄/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /자리 뽑기/ })).toBeEnabled();
  });

  it('한 명씩 뽑기 중에는 다음 학생 공개·모두 공개를 보여 준다', () => {
    render(<PresentControls {...props({ lottery: true })} />);
    expect(screen.getByRole('button', { name: '다음 학생 공개' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '모두 공개' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /한 명씩 뽑기/ })).toBeNull();
  });

  it('전체 화면을 쓸 수 없는 환경에서는 버튼을 숨긴다', () => {
    render(<PresentControls {...props()} />);
    expect(screen.queryByRole('button', { name: /전체 화면/ })).toBeNull();
  });

  it('전체 화면 버튼은 문서 전체를 전체 화면으로 요청한다', async () => {
    const request = vi.fn(() => Promise.resolve());
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: request });
    render(<PresentControls {...props()} />);
    await userEvent.click(screen.getByRole('button', { name: '전체 화면' }));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('상태 칸은 가장 긴 안내 문구가 들어가는 폭을 최소로 보장한다(좁으면 버튼이 다음 줄로 간다)', () => {
    render(<PresentControls {...props()} />);
    const status = document.querySelector('[data-present="status"]')!;
    expect(status.className).toContain('min-w-[min(100%,34rem)]');
    expect(status.className).not.toContain('min-w-[12rem]');
  });

  it('규칙 위반이 없으면 위반 배지도 없다', () => {
    render(<PresentControls {...props()} />);
    expect(screen.queryByRole('button', { name: /규칙 위반/ })).toBeNull();
  });

  it('규칙 위반은 이름 없이 건수만 보이고, 누르면 목록을 막대 위에 펼친다', async () => {
    const message = '분리 위반: 가람 - 나래 (거리 1, 최소 2)';
    render(<PresentControls {...props({ violations: [message] })} />);
    const badge = screen.getByRole('button', { name: '규칙 위반 1건' });
    expect(badge).toHaveAttribute('aria-expanded', 'false');
    // 펼치기 전에는 학생 이름이 DOM에 없다
    expect(document.body.textContent).not.toContain('가람');
    expect(document.querySelector('[data-present="violations"]')).toBeNull();

    await userEvent.click(badge);
    expect(badge).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelector('[data-present="violations"]')).toHaveTextContent(message);

    await userEvent.click(badge);
    expect(document.querySelector('[data-present="violations"]')).toBeNull();
  });

  it('위반이 사라지면 펼침 상태도 초기화된다', async () => {
    const message = '분리 위반: 가람 - 나래 (거리 1, 최소 2)';
    const { rerender } = render(<PresentControls {...props({ violations: [message] })} />);
    await userEvent.click(screen.getByRole('button', { name: '규칙 위반 1건' }));
    rerender(<PresentControls {...props({ violations: [] })} />);
    rerender(<PresentControls {...props({ violations: [message] })} />);
    expect(document.querySelector('[data-present="violations"]')).toBeNull();
    expect(document.body.textContent).not.toContain('가람');
  });
});
