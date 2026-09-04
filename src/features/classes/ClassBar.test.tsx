import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAppStore } from '@/store/useAppStore';
import { useToasts } from '@/store/useToasts';
import { ClassBar } from './ClassBar';

/** 다른 테스트가 추가한 반을 정리하고 '1반' 하나만 남긴다. */
function resetClasses() {
  act(() => {
    let classes = useAppStore.getState().classes;
    while (classes.length > 1) {
      const target = classes[classes.length - 1] as string;
      useAppStore.getState().removeClass(target);
      classes = useAppStore.getState().classes;
    }
    const only = classes[0];
    if (only && only !== '1반') {
      useAppStore.getState().renameClass(only, '1반');
    }
    useAppStore.getState().switchClass('1반');
  });
  act(() => {
    useToasts.setState({ items: [] });
  });
}

describe('ClassBar', () => {
  beforeEach(resetClasses);
  afterEach(resetClasses);

  it('루트에 data-card="classes"를 갖고 현재 반이 bg-gold로 표시된다', () => {
    const { container } = render(<ClassBar />);
    expect(container.querySelector('[data-card="classes"]')).not.toBeNull();
    const tab = screen.getByRole('tab', { name: '1반' });
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(tab.className).toContain('bg-gold');
  });

  it('반 이름 입력 앞뒤 공백을 trim해서 addClass를 부른다', async () => {
    const user = userEvent.setup();
    const real = useAppStore.getState().addClass;
    const spy = vi.fn(real);
    useAppStore.setState({ addClass: spy });
    try {
      render(<ClassBar />);
      await user.type(screen.getByLabelText('새 반 이름'), '  2반  ');
      await user.click(screen.getByRole('button', { name: '반 추가' }));
      expect(spy).toHaveBeenCalledWith('2반');
      expect(useAppStore.getState().classes).toContain('2반');
    } finally {
      act(() => {
        useAppStore.setState({ addClass: real });
      });
    }
  });

  it('같은 이름의 반을 추가하려 하면 실패 토스트가 뜬다', async () => {
    const user = userEvent.setup();
    render(<ClassBar />);
    await user.type(screen.getByLabelText('새 반 이름'), '1반');
    await user.click(screen.getByRole('button', { name: '반 추가' }));
    expect(useToasts.getState().items.some((t) => t.message.includes('같은 이름'))).toBe(true);
  });

  it('마지막 하나 남은 반은 삭제할 수 없고 안내 토스트가 뜬다', async () => {
    const user = userEvent.setup();
    render(<ClassBar />);
    await user.click(screen.getByRole('button', { name: '1반 삭제' }));
    expect(useAppStore.getState().classes).toEqual(['1반']);
    expect(useToasts.getState().items.some((t) => t.message.includes('삭제할 수 없습니다'))).toBe(true);
  });

  it('탭을 클릭하면 switchClass가 호출된다', async () => {
    const user = userEvent.setup();
    act(() => {
      useAppStore.getState().addClass('2반');
    });
    render(<ClassBar />);
    await user.click(screen.getByRole('tab', { name: '2반' }));
    expect(useAppStore.getState().activeClass).toBe('2반');
  });
});
