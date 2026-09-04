import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createDefaultData } from '@/core/model/defaults';
import { groupLayout } from '@/core/layouts/group';
import { useAppStore } from '@/store/useAppStore';
import { LayoutCard } from './LayoutCard';

// 액션을 스파이로 갈아 끼우는 테스트가 있어 원본을 미리 붙잡아 둔다.
const REAL = {
  setGridSize: useAppStore.getState().setGridSize,
  updateLayoutSettings: useAppStore.getState().updateLayoutSettings,
};

function reset() {
  useAppStore.setState({ ...REAL, data: createDefaultData() });
  useAppStore.temporal.getState().clear();
}

describe('LayoutCard', () => {
  beforeEach(reset);

  it('배치 종류를 고르면 layoutType이 바뀐다', async () => {
    const user = userEvent.setup();
    render(<LayoutCard />);
    await user.click(screen.getByRole('radio', { name: /짝꿍/ }));
    expect(useAppStore.getState().data.layoutType).toBe('pair');
  });

  it('자유배치를 고르면 책상 편집기가 나타난다', async () => {
    const user = userEvent.setup();
    render(<LayoutCard />);
    expect(screen.queryByTestId('custom-desk-editor')).toBeNull();
    await user.click(screen.getByRole('radio', { name: /자유배치/ }));
    expect(screen.getByTestId('custom-desk-editor')).toBeInTheDocument();
  });

  it('열 입력은 updateLayoutSettings가 아니라 setGridSize를 부른다 (R83)', async () => {
    const grid = vi.fn(REAL.setGridSize);
    const settings = vi.fn(REAL.updateLayoutSettings);
    useAppStore.setState({ setGridSize: grid, updateLayoutSettings: settings });
    const user = userEvent.setup();
    render(<LayoutCard />);
    const cols = screen.getByLabelText('열');
    await user.clear(cols);
    await user.type(cols, '4');
    expect(grid).toHaveBeenCalledWith(4, 5);
    expect(settings).not.toHaveBeenCalled();
    expect(useAppStore.getState().data.layoutSettings.columns).toBe(4);
  });

  it('삭제한 자리가 없으면 복구 버튼이 disabled', async () => {
    render(<LayoutCard />);
    expect(screen.getByRole('button', { name: /삭제한 자리 모두 복구/ })).toBeDisabled();
  });

  it('삭제한 자리가 있으면 복구 버튼이 눌리고 개수를 보여준다', async () => {
    const user = userEvent.setup();
    useAppStore.getState().deleteSeat(2);
    useAppStore.getState().deleteSeat(3);
    render(<LayoutCard />);
    const btn = screen.getByRole('button', { name: /삭제한 자리 모두 복구/ });
    expect(btn).toHaveTextContent('2개');
    await user.click(btn);
    expect(useAppStore.getState().data.layoutSettings.disabledSeats).toEqual([]);
  });

  it('되돌릴 것이 없으면 되돌리기/다시하기가 disabled, 변경 후에는 되돌리기가 풀린다', async () => {
    const user = userEvent.setup();
    render(<LayoutCard />);
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다시하기' })).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: /ㄷ자/ }));
    const undoBtn = screen.getByRole('button', { name: '되돌리기' });
    expect(undoBtn).toBeEnabled();
    await user.click(undoBtn);
    expect(useAppStore.getState().data.layoutType).toBe('exam');
    expect(screen.getByRole('button', { name: '다시하기' })).toBeEnabled();
  });

  it('모둠을 고르면 모둠 설정이 나오고 모둠 수를 바꿀 수 있다', async () => {
    const user = userEvent.setup();
    render(<LayoutCard />);
    await user.click(screen.getByRole('radio', { name: /모둠/ }));
    const count = screen.getByLabelText('모둠 수');
    await user.clear(count);
    await user.type(count, '3');
    expect(useAppStore.getState().data.layoutSettings.groupCount).toBe(3);
    const sizes = within(screen.getByTestId('group-sizes')).getAllByRole('spinbutton');
    expect(sizes).toHaveLength(3);
  });
});

describe('LayoutCard 모둠 위치 편집기', () => {
  beforeEach(reset);

  const openGroup = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('radio', { name: /모둠/ }));
  };

  it('auto면 편집기를 감춘다', async () => {
    const user = userEvent.setup();
    render(<LayoutCard />);
    await openGroup(user);
    expect(screen.queryByTestId('group-position-editor')).toBeNull();
  });

  it('manual로 바꾸면 편집기가 나오고 자동 위치가 초기값으로 채워진다', async () => {
    const user = userEvent.setup();
    render(<LayoutCard />);
    await openGroup(user);
    await user.click(screen.getByRole('checkbox', { name: /모둠 위치를 직접 정하기/ }));

    const ls = useAppStore.getState().data.layoutSettings;
    expect(ls.groupLayoutMode).toBe('manual');
    expect(ls.groupPositions).toEqual(groupLayout.calcAutoPositions(groupLayout.getGroupSizes(ls)));
    expect(screen.getByTestId('group-position-editor')).toBeInTheDocument();
  });

  it('이미 저장된 위치가 있으면 덮어쓰지 않는다', async () => {
    const user = userEvent.setup();
    const kept = [{ groupIndex: 0, x: 120, y: 40 }];
    useAppStore.getState().updateLayoutSettings({ groupPositions: kept });
    render(<LayoutCard />);
    await openGroup(user);
    await user.click(screen.getByRole('checkbox', { name: /모둠 위치를 직접 정하기/ }));
    expect(useAppStore.getState().data.layoutSettings.groupPositions).toEqual(kept);
  });

  it('자동 배치로 되돌리기를 누르면 저장된 위치를 비운다', async () => {
    const user = userEvent.setup();
    render(<LayoutCard />);
    await openGroup(user);
    await user.click(screen.getByRole('checkbox', { name: /모둠 위치를 직접 정하기/ }));
    expect(useAppStore.getState().data.layoutSettings.groupPositions?.length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /자동 배치로 되돌리기/ }));
    expect(useAppStore.getState().data.layoutSettings.groupPositions).toEqual([]);
  });

  it('방향키로 모둠 블록을 옮기면 groupPositions가 바뀐다', async () => {
    const user = userEvent.setup();
    render(<LayoutCard />);
    await openGroup(user);
    await user.click(screen.getByRole('checkbox', { name: /모둠 위치를 직접 정하기/ }));
    const before = useAppStore.getState().data.layoutSettings.groupPositions![0]!;

    const block = screen.getByRole('button', { name: '1모둠 블록' });
    block.focus();
    await user.keyboard('{ArrowRight}');
    const after = useAppStore.getState().data.layoutSettings.groupPositions![0]!;
    expect(after.x).toBeGreaterThan(before.x);
    // CustomDeskEditor와 같은 규약: 옮길 때 두 축 모두 20px 격자에 스냅된다.
    expect(after.x % 20).toBe(0);
    expect(after.y % 20).toBe(0);
  });
});
