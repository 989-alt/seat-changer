import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TeacherPage } from './TeacherPage';
import { useAppStore } from '@/store/useAppStore';
import { createDefaultData } from '@/core/model/defaults';

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
});
