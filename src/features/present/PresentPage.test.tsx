import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createDefaultData } from '@/core/model/defaults';
import type { ClassData } from '@/core/model/types';
import { useAppStore } from '@/store/useAppStore';
import { PresentPage } from '@/pages/PresentPage';
import { Confetti } from '@/features/present/Confetti';

function makeData(patch: Partial<ClassData> = {}): ClassData {
  const base = createDefaultData();
  return {
    ...base,
    students: ['가람', '나래'],
    classSize: 2,
    ...patch,
    layoutSettings: { ...base.layoutSettings, columns: 2, rows: 1, ...(patch.layoutSettings ?? {}) },
  };
}

const LAST = { mapping: { 0: '가람', 1: '나래' }, timestamp: 1 };

/** prefers-reduced-motion을 켠 상태로 고정한다. */
function mockReducedMotion(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

function seatAt(index: number): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-cork="note-seat"][data-seat="${index}"]`);
  if (!el) throw new Error(`좌석 ${index}을 찾지 못했습니다.`);
  return el;
}

/** 좌석에 적힌 이름(이름 글자에만 붙는 data-seat-name) */
function nameAt(index: number): string {
  return seatAt(index).querySelector('[data-seat-name]')?.textContent ?? '';
}

function statusText(): string {
  return document.querySelector('[data-present="status"]')?.textContent ?? '';
}

beforeEach(() => {
  mockReducedMotion(true);
  useAppStore.setState({ activeClass: '테스트반', data: makeData() });
});

describe('PresentPage', () => {
  it('prefers-reduced-motion이면 카운트다운 없이 곧바로 전체를 공개한다', async () => {
    const user = userEvent.setup();
    render(<PresentPage />);

    await user.click(screen.getByRole('button', { name: /자리 뽑기/ }));

    expect(await screen.findByText('가람')).toBeInTheDocument();
    expect(screen.getByText('나래')).toBeInTheDocument();
    expect(document.querySelector('[data-present="countdown"]')).toBeNull();
    // 두 번째부터는 같은 버튼의 라벨만 바뀐다.
    expect(screen.getByRole('button', { name: /다시 뽑기/ })).toBeInTheDocument();
  });

  it('배치에 실패하면 사유를 그대로 보여준다', async () => {
    useAppStore.setState({ data: makeData({ students: [], classSize: 0 }) });
    const user = userEvent.setup();
    render(<PresentPage />);

    await user.click(screen.getByRole('button', { name: /자리 뽑기/ }));

    const failure = await screen.findByText('학생 명단이 비어 있습니다.');
    expect(failure).toBeInTheDocument();
    expect(failure).toHaveAttribute('data-reason', 'no-students');
  });

  it('좌석 두 개를 차례로 누르면 두 학생의 자리를 맞바꾼다', async () => {
    const user = userEvent.setup();
    render(<PresentPage />);
    await user.click(screen.getByRole('button', { name: /자리 뽑기/ }));
    await screen.findByText('가람');

    const before = [nameAt(0), nameAt(1)];
    await user.click(seatAt(0));
    expect(screen.getByText(/1번 자리를 골랐습니다/)).toBeInTheDocument();

    await user.click(seatAt(1));
    expect(nameAt(0)).toBe(before[1]);
    expect(nameAt(1)).toBe(before[0]);
  });

  it('시점 토글은 레거시와 같은 라벨로 학생 시선과 선생님 시선을 오간다', async () => {
    const user = userEvent.setup();
    render(<PresentPage />);

    await user.click(screen.getByRole('button', { name: /학생 시선/ }));

    expect(useAppStore.getState().data.viewPerspective).toBe('teacher');
    expect(screen.getByRole('button', { name: /선생님 시선/ })).toBeInTheDocument();
  });

  // 실브라우저 검증에서 찾은 결함: 인쇄용 양면 보기가 인쇄 버튼을 누른 동안에만
  // 존재해, 사용자가 Ctrl+P로 직접 인쇄하면 빈 종이가 나왔다. 이제는 브라우저가
  // 인쇄를 시작할 때 알리는 beforeprint에서 올린다.
  it('브라우저가 인쇄를 시작하면 학생 시선과 선생님 시선 배치도를 함께 올린다', async () => {
    const user = userEvent.setup();
    render(<PresentPage />);
    await user.click(screen.getByRole('button', { name: /자리 뽑기/ }));
    await screen.findByText('가람');

    // 평소 화면에는 배치도가 하나뿐이다.
    expect(screen.getAllByTestId('seat-board')).toHaveLength(1);

    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });

    const boards = screen.getAllByTestId('seat-board');
    expect(boards).toHaveLength(3);
    expect(boards.map((b) => b.getAttribute('data-perspective'))).toEqual(['student', 'student', 'teacher']);

    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(screen.getAllByTestId('seat-board')).toHaveLength(1);
  });

  it('지난 배치가 있으면 공개된 상태로 열리고 바로 인쇄·이미지 저장을 쓸 수 있다', () => {
    useAppStore.setState({ data: makeData({ lastAssignment: LAST }) });
    render(<PresentPage />);

    expect(nameAt(0)).toBe('가람');
    expect(nameAt(1)).toBe('나래');
    expect(screen.getByRole('button', { name: /다시 뽑기/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /인쇄/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /이미지 저장/ })).toBeEnabled();
    expect(statusText()).toBe('두 자리를 차례로 누르면 서로 바뀝니다');
  });

  it('명단이 바뀌어 지난 배치를 쓸 수 없으면 빈 화면으로 열고 알린다', async () => {
    useAppStore.setState({ data: makeData({ lastAssignment: { mapping: { 0: '가람', 1: '다른학생' }, timestamp: 1 } }) });
    render(<PresentPage />);

    expect(await screen.findByText('명단이나 배치가 바뀌어 지난 배치는 불러오지 않았습니다.')).toBeInTheDocument();
    expect(document.querySelector('[data-seat-name]')).toBeNull();
    expect(screen.getByRole('button', { name: /자리 뽑기/ })).toBeInTheDocument();
  });

  it('지난 배치에서 자리를 바꾸면 이력을 늘리지 않고 지난 배치만 고친다', async () => {
    useAppStore.setState({ data: makeData({ lastAssignment: LAST }) });
    const user = userEvent.setup();
    render(<PresentPage />);

    await user.click(seatAt(0));
    expect(statusText()).toBe('1번 자리를 골랐습니다. 바꿀 자리를 누르세요 (같은 자리를 다시 누르면 취소)');
    await user.click(seatAt(1));

    const saved = useAppStore.getState().data;
    expect(saved.lastAssignment?.mapping).toEqual({ 0: '나래', 1: '가람' });
    expect(saved.lastAssignment?.timestamp).toBe(1);
    expect(saved.assignmentHistory).toHaveLength(0);
    // 교환 완료 알림은 토스트가 아니라 상태 칸에 잠깐 뜬다
    expect(statusText()).toBe('가람 - 나래 자리를 바꿨습니다.');
    expect(screen.queryByText('가람 - 나래 자리를 바꿨습니다.', { selector: '[data-cork="toast"] *' })).toBeNull();
  });

  it('발표 화면은 고정 자리를 드러내지 않는다', () => {
    useAppStore.setState({
      data: makeData({ fixedSeats: [{ studentName: '가람', seatIndex: 0 }], lastAssignment: LAST }),
    });
    render(<PresentPage />);

    expect(seatAt(0)).toHaveAttribute('data-state', 'assigned');
    expect(document.querySelector('[data-cork="pushpin"]')).toBeNull();
  });

  it('제목 칠판 없이 반 이름은 조작 막대에 둔다', () => {
    render(<PresentPage />);
    expect(screen.queryByText('테스트반 자리 배치')).toBeNull();
    expect(document.querySelector('[data-present="class"]')).toHaveTextContent('테스트반');
  });

  it('인쇄하면 반 이름을 넣은 제목과 용지 방향 규칙을 올린다', () => {
    useAppStore.setState({ data: makeData({ lastAssignment: LAST }) });
    render(<PresentPage />);

    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });

    expect(screen.getByText('[ 테스트반 · 학생 시선 ]')).toBeInTheDocument();
    expect(screen.getByText('[ 테스트반 · 선생님 시선 ]')).toBeInTheDocument();
    const css = Array.from(document.querySelectorAll('style'))
      .map((s) => s.textContent ?? '')
      .join('\n');
    // jsdom은 배치도 크기를 0으로 재므로 fitPrintPage의 기본값(가로)이 나온다.
    expect(css).toMatch(/@page\s*\{\s*size:\s*landscape;\s*margin:\s*10mm;\s*\}/);
    // 인쇄용 배치도도 고정 자리를 드러내지 않는다.
    expect(document.querySelector('[data-cork="pushpin"]')).toBeNull();

    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
  });

  it('지난 배치가 규칙을 어기면 이름을 드러내지 않고 막대의 배지로만 알린다', () => {
    useAppStore.setState({
      data: makeData({
        separationRules: [{ studentA: '가람', studentB: '나래', minDistance: 2 }],
        lastAssignment: LAST,
      }),
    });
    render(<PresentPage />);

    expect(screen.getByRole('button', { name: '규칙 위반 1건' })).toBeInTheDocument();
    expect(document.querySelector('[data-present="violations"]')).toBeNull();
    expect(document.body.textContent).not.toContain('분리 위반');
  });
});

describe('Confetti', () => {
  it('active가 아니면 아무것도 그리지 않는다', () => {
    render(<Confetti active={false} />);
    expect(screen.queryByTestId('confetti')).toBeNull();
  });

  // 실브라우저 검증에서 찾은 결함: 연출이 끝나도 캔버스가 화면 전체를 덮은 채
  // 남아 인쇄·캡처에 끼어들었다. 2d 컨텍스트가 없는 환경에서도 스스로 내려가야 한다.
  it('그릴 수 없는 환경에서는 캔버스를 남기지 않는다', () => {
    render(<Confetti active />);
    expect(screen.queryByTestId('confetti')).toBeNull();
  });
});
