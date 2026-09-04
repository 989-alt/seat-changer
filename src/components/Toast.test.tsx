import { act, fireEvent, render, screen } from '@testing-library/react';
import { useAppStore } from '@/store/useAppStore';
import { useToasts } from '@/store/useToasts';
import { ToastHost } from './Toast';

function resetToasts() {
  act(() => {
    useToasts.setState({ items: [] });
  });
}

describe('ToastHost', () => {
  beforeEach(() => {
    resetToasts();
    act(() => {
      useAppStore.setState({ loadNotice: null });
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('push한 메시지가 뜨고 닫기 버튼으로 지울 수 있다', () => {
    render(<ToastHost />);
    act(() => {
      useToasts.getState().push('3번 자리를 삭제했습니다.');
    });
    expect(screen.getByText('3번 자리를 삭제했습니다.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '알림 닫기' }));
    expect(screen.queryByText('3번 자리를 삭제했습니다.')).toBeNull();
  });

  it('액션 없는 토스트는 5초 뒤 자동으로 사라진다', () => {
    render(<ToastHost />);
    act(() => {
      useToasts.getState().push('저장했습니다.');
    });
    expect(screen.getByText('저장했습니다.')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText('저장했습니다.')).toBeNull();
  });

  it('액션 있는 토스트는 5초에는 남아있고 8초 뒤 자동으로 사라진다', () => {
    const onAction = vi.fn();
    render(<ToastHost />);
    act(() => {
      useToasts.getState().push('3번 자리를 삭제했습니다.', { label: '되돌리기', onAction });
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText('3번 자리를 삭제했습니다.')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByText('3번 자리를 삭제했습니다.')).toBeNull();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('액션 버튼을 누르면 onAction이 실행되고 토스트가 사라진다', () => {
    const onAction = vi.fn();
    render(<ToastHost />);
    act(() => {
      useToasts.getState().push('3번 자리를 삭제했습니다.', { label: '되돌리기', onAction });
    });

    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('3번 자리를 삭제했습니다.')).toBeNull();
  });

  it('loadNotice가 생기면 토스트로 띄우고 clearNotice를 호출한다', () => {
    render(<ToastHost />);
    act(() => {
      useAppStore.setState({ loadNotice: '저장하지 못했습니다. 저장 공간을 확인하세요.' });
    });

    expect(screen.getByText('저장하지 못했습니다. 저장 공간을 확인하세요.')).toBeInTheDocument();
    expect(useAppStore.getState().loadNotice).toBeNull();
  });

  it('언마운트하면 타이머가 정리되어 이후 진행에도 에러가 없다', () => {
    const { unmount } = render(<ToastHost />);
    act(() => {
      useToasts.getState().push('저장했습니다.');
    });
    unmount();
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(5000);
      });
    }).not.toThrow();
  });
});
