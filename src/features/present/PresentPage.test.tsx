import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createDefaultData } from '@/core/model/defaults';
import type { ClassData } from '@/core/model/types';
import { useAppStore } from '@/store/useAppStore';
import { PresentPage } from '@/pages/PresentPage';

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

/** 좌석에 적힌 이름(좌석 번호를 뺀 마지막 span) */
function nameAt(index: number): string {
  return seatAt(index).querySelector('span:last-child')?.textContent ?? '';
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
});
