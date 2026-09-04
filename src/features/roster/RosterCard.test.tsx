import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createDefaultData } from '@/core/model/defaults';
import { useAppStore } from '@/store/useAppStore';
import { useToasts } from '@/store/useToasts';
import { RosterCard } from './RosterCard';

function reset() {
  useAppStore.setState({ data: createDefaultData() });
  useAppStore.temporal.getState().clear();
  useToasts.setState({ items: [] });
}

function lastToastMessage(): string | undefined {
  const items = useToasts.getState().items;
  return items[items.length - 1]?.message;
}

describe('RosterCard', () => {
  beforeEach(reset);

  it('카드 껍데기와 data-card를 갖는다', () => {
    render(<RosterCard />);
    expect(screen.getByRole('region', { name: /명단/ })).toBeInTheDocument();
    expect(document.querySelector('[data-card="roster"]')).not.toBeNull();
  });

  it('현재 인원 수와 좌석 수를 보여준다(exam 기본 30석)', () => {
    useAppStore.setState({ data: { ...createDefaultData(), students: ['김철수', '이영희'] } });
    render(<RosterCard />);
    expect(screen.getByText('현재 2명 / 좌석 30개')).toBeInTheDocument();
  });

  it('학생 수가 좌석 수보다 많으면 경고를 보여준다', () => {
    const many = Array.from({ length: 31 }, (_, i) => `학생${i + 1}`);
    useAppStore.setState({ data: { ...createDefaultData(), students: many } });
    render(<RosterCard />);
    expect(screen.getByText('학생 수가 좌석 수보다 많습니다.')).toBeInTheDocument();
  });

  it('학생 수가 좌석 수 이하이면 경고가 없다', () => {
    useAppStore.setState({ data: { ...createDefaultData(), students: ['김철수'] } });
    render(<RosterCard />);
    expect(screen.queryByText('학생 수가 좌석 수보다 많습니다.')).toBeNull();
  });

  it('이름을 입력하고 저장하면 setStudents가 불리고 안내 토스트가 뜬다', async () => {
    const user = userEvent.setup();
    render(<RosterCard />);
    const textarea = screen.getByLabelText('학생 이름 (한 줄에 한 명씩)');
    await user.type(textarea, '김철수{enter}이영희');
    await user.click(screen.getByRole('button', { name: '명단 저장' }));

    expect(useAppStore.getState().data.students).toEqual(['김철수', '이영희']);
    expect(lastToastMessage()).toContain('명단을 저장했습니다');
  });

  it('빈 명단을 저장하려 하면 경고 토스트만 뜨고 학생은 그대로다', async () => {
    useAppStore.setState({ data: { ...createDefaultData(), students: ['김철수'] } });
    const user = userEvent.setup();
    render(<RosterCard />);
    const textarea = screen.getByLabelText('학생 이름 (한 줄에 한 명씩)');
    await user.clear(textarea);
    await user.click(screen.getByRole('button', { name: '명단 저장' }));

    expect(useAppStore.getState().data.students).toEqual(['김철수']);
    expect(lastToastMessage()).toBe('학생 이름을 입력해 주세요.');
  });

  it('입력한 이름 개수를 실시간으로 보여준다(저장 전)', async () => {
    const user = userEvent.setup();
    render(<RosterCard />);
    const textarea = screen.getByLabelText('학생 이름 (한 줄에 한 명씩)');
    await user.type(textarea, '김철수{enter}이영희{enter}박민준');
    expect(screen.getByText('입력한 이름 3개')).toBeInTheDocument();
    expect(useAppStore.getState().data.students).toEqual([]);
  });

  it('CSV 파일을 올리면 이름이 입력칸에 채워지고, 저장 전까지는 store가 바뀌지 않는다', async () => {
    const user = userEvent.setup();
    render(<RosterCard />);
    const file = new File(['김철수\n이영희'], 'roster.csv', { type: 'text/csv' });
    const input = screen.getByLabelText('파일 불러오기', { selector: 'input' });

    await user.upload(input, file);

    expect(await screen.findByText('입력한 이름 2개')).toBeInTheDocument();
    expect(screen.getByLabelText('학생 이름 (한 줄에 한 명씩)')).toHaveValue('김철수\n이영희');
    expect(useAppStore.getState().data.students).toEqual([]);
    expect(lastToastMessage()).toContain('roster.csv에서 2명을 불러왔습니다');
  });

  it('지원하지 않는 파일이면 에러 토스트를 보여주고 입력칸은 바뀌지 않는다', async () => {
    // 실제 브라우저라면 accept 필터가 파일 선택 창에서부터 막지만, 드래그앤드롭 등으로
    // accept 밖의 파일이 들어오는 경로도 있으므로 여기서는 필터를 끄고 그 경로를 검증한다.
    const user = userEvent.setup({ applyAccept: false });
    render(<RosterCard />);
    const file = new File(['garbage'], 'roster.pdf', { type: 'application/pdf' });
    const input = screen.getByLabelText('파일 불러오기', { selector: 'input' });

    await user.upload(input, file);

    await waitFor(() => expect(lastToastMessage()).toContain('지원하지 않는 파일 형식입니다'));
    expect(screen.getByLabelText('학생 이름 (한 줄에 한 명씩)')).toHaveValue('');
  });

  it('학생이 있으면 성별 지정 목록이 뜨고, 남/여/미지정 토글이 update를 부른다', async () => {
    useAppStore.setState({ data: { ...createDefaultData(), students: ['김철수'] } });
    const user = userEvent.setup();
    render(<RosterCard />);

    const maleBtn = screen.getByRole('button', { name: '김철수 남' });
    await user.click(maleBtn);
    expect(useAppStore.getState().data.studentGenders).toEqual({ 김철수: 'M' });
    expect(maleBtn).toHaveAttribute('aria-pressed', 'true');

    const unsetBtn = screen.getByRole('button', { name: '김철수 미지정' });
    await user.click(unsetBtn);
    expect(useAppStore.getState().data.studentGenders).toEqual({});
  });

  it('학생이 없으면 성별 지정 목록이 없다', () => {
    render(<RosterCard />);
    expect(screen.queryByText('성별 지정')).toBeNull();
  });
});
