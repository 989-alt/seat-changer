import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RulesCard } from './RulesCard';
import { useAppStore } from '@/store/useAppStore';

const students = ['가람', '나린', '다솜'];

beforeEach(() => {
  const s = useAppStore.getState();
  s.setStudents(students);
  s.update({
    layoutType: 'exam',
    fixedSeats: [],
    separationRules: [],
    genderRule: 'none',
    studentGenders: {},
  });
});

describe('RulesCard', () => {
  it('고정 자리를 추가하고 삭제한다', async () => {
    const user = userEvent.setup();
    render(<RulesCard />);
    await user.selectOptions(screen.getByLabelText('고정할 학생'), '가람');
    await user.clear(screen.getByLabelText('자리 번호'));
    await user.type(screen.getByLabelText('자리 번호'), '3');
    await user.click(screen.getByRole('button', { name: '고정 자리 추가' }));

    expect(useAppStore.getState().data.fixedSeats).toEqual([{ studentName: '가람', seatIndex: 2 }]);
    expect(screen.getByText('가람 - 3번 자리')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '가람 - 3번 자리 삭제' }));
    expect(useAppStore.getState().data.fixedSeats).toEqual([]);
  });

  it('분리 규칙과 충돌하면 추가 전에 경고한다', async () => {
    const user = userEvent.setup();
    useAppStore.getState().update({
      fixedSeats: [{ studentName: '나린', seatIndex: 0 }],
      separationRules: [{ studentA: '가람', studentB: '나린', minDistance: 2 }],
    });
    render(<RulesCard />);
    await user.selectOptions(screen.getByLabelText('고정할 학생'), '가람');
    await user.clear(screen.getByLabelText('자리 번호'));
    await user.type(screen.getByLabelText('자리 번호'), '2');

    const warn = screen.getByTestId('fixed-conflict');
    expect(warn).toHaveTextContent('나린');
    expect(warn).toHaveTextContent('최소 2');
    // 경고일 뿐 막지는 않는다
    expect(screen.getByRole('button', { name: '고정 자리 추가' })).toBeEnabled();
  });

  it('분리 규칙을 추가하고 같은 쌍은 다시 추가하지 못한다', async () => {
    const user = userEvent.setup();
    render(<RulesCard />);
    await user.selectOptions(screen.getByLabelText('분리할 학생 1'), '가람');
    await user.selectOptions(screen.getByLabelText('분리할 학생 2'), '나린');
    await user.click(screen.getByRole('button', { name: '분리 규칙 추가' }));
    expect(useAppStore.getState().data.separationRules).toHaveLength(1);
    expect(screen.getByRole('button', { name: '분리 규칙 추가' })).toBeDisabled();
  });

  it('성별 규칙 라디오를 고르면 저장된다', async () => {
    const user = userEvent.setup();
    render(<RulesCard />);
    await user.click(screen.getByRole('radio', { name: /남녀 섞어/ }));
    expect(useAppStore.getState().data.genderRule).toBe('mixed');
  });
});
