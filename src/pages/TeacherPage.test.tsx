import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TeacherPage } from './TeacherPage';
import { useAppStore } from '@/store/useAppStore';
import { createDefaultData } from '@/core/model/defaults';

/** jsdom은 실제 레이아웃이 없어 offsetWidth/clientWidth가 항상 0이다.
 * 배치도 확대 배율 계산을 재현하려고 특정 엘리먼트에만 값을 심는다. */
function stubSize(el: Element, prop: 'clientWidth' | 'clientHeight' | 'offsetWidth' | 'offsetHeight', value: number) {
  Object.defineProperty(el, prop, { configurable: true, value });
}

/** 각 테스트가 같은 출발선에서 시작하도록 활성 반 데이터를 기본값으로 되돌린다. */
function reset(students: string[] = []) {
  const s = useAppStore.getState();
  s.update(createDefaultData());
  s.setStudents(students);
}

const stepEl = (key: string) => document.querySelector(`[data-step="${key}"]`);

describe('TeacherPage', () => {
  it('학생이 없으면 명단·규칙·검사 단계가 미완료다', () => {
    reset();
    render(<TeacherPage />);
    expect(stepEl('roster')).toHaveAttribute('data-done', 'false');
    expect(stepEl('rules')).toHaveAttribute('data-done', 'false');
    expect(stepEl('check')).toHaveAttribute('data-done', 'false');
  });

  it('명단을 넣으면 명단 단계가 완료된다', () => {
    reset(['가온', '나린', '다올']);
    render(<TeacherPage />);
    expect(stepEl('roster')).toHaveAttribute('data-done', 'true');
    expect(stepEl('layout')).toHaveAttribute('data-done', 'true');
  });

  it('학생이 0명이면 뽑기 버튼이 비활성이다', () => {
    reset();
    render(<TeacherPage />);
    expect(screen.getByRole('button', { name: '학생들 앞에서 뽑기' })).toBeDisabled();
  });

  it('학생이 있으면 뽑기 버튼을 누를 수 있다', () => {
    reset(['가온', '나린']);
    render(<TeacherPage />);
    expect(screen.getByRole('button', { name: '학생들 앞에서 뽑기' })).toBeEnabled();
  });

  it('규칙 검사는 결과를 저장하지 않는다', async () => {
    reset(['가온', '나린', '다올']);
    render(<TeacherPage />);
    await userEvent.click(screen.getByRole('button', { name: '규칙 검사' }));
    await screen.findByText('규칙을 모두 지킬 수 있습니다.');
    const after = useAppStore.getState().data;
    expect(after.lastAssignment).toBeNull();
    expect(after.assignmentHistory).toHaveLength(0);
  });

  it('배치도 미리보기 확대 배율은 카드 여유 공간에 맞추되 1.6배를 넘지 않는다', () => {
    reset(['가온', '나린', '다올']);
    render(<TeacherPage />);
    const area = screen.getByTestId('board-scale-area');
    const board = screen.getByTestId('board-scale-wrap');

    // 카드가 배치도의 원래 크기(300x300)보다 훨씬 넓고 높아, 1배를 넘겨 키울 수 있는 상황.
    stubSize(area, 'clientWidth', 900);
    stubSize(area, 'clientHeight', 900);
    stubSize(board, 'offsetWidth', 300);
    stubSize(board, 'offsetHeight', 300);
    act(() => {
      fireEvent(window, new Event('resize'));
    });

    expect(board.style.transform).toContain('scale(1.6)');
  });

  it('배치도 미리보기 확대 배율은 카드가 좁으면 줄어든다', () => {
    reset(['가온', '나린', '다올']);
    render(<TeacherPage />);
    const area = screen.getByTestId('board-scale-area');
    const board = screen.getByTestId('board-scale-wrap');

    stubSize(area, 'clientWidth', 100);
    stubSize(area, 'clientHeight', 900);
    stubSize(board, 'offsetWidth', 300);
    stubSize(board, 'offsetHeight', 300);
    act(() => {
      fireEvent(window, new Event('resize'));
    });

    expect(board.style.transform).toContain('scale(0.5)');
  });

  it('좌석을 클릭하면 삭제 팝오버가 뜨고 삭제·복구가 동작한다(확대 래퍼 안에서도)', async () => {
    reset(['가온', '나린', '다올']);
    render(<TeacherPage />);
    const firstSeat = document.querySelector('[data-seat="0"]');
    expect(firstSeat).not.toBeNull();
    await userEvent.click(firstSeat as Element);
    expect(screen.getByTestId('seat-popover')).toHaveTextContent('1번 자리');
    await userEvent.click(screen.getByRole('button', { name: '1번 자리 삭제' }));
    expect(screen.queryByTestId('seat-popover')).toBeNull();
    expect(useAppStore.getState().data.layoutSettings.disabledSeats).toContain(0);
  });
});
