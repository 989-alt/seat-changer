import { createAppStore, type AppState } from './useAppStore';
import { createMemoryAdapter } from '@/core/storage/memoryAdapter';
import { selectDisabledCount, selectSeatWarning, selectTotalSeats } from './selectors';

const boot = () => {
  const store = createAppStore(createMemoryAdapter());
  return () => store.getState() as AppState;
};

describe('selectors', () => {
  it('selectTotalSeats는 비활성 좌석을 뺀 수를 준다', () => {
    const s = boot();
    expect(selectTotalSeats(s())).toBe(30); // 기본 6x5
    s().deleteSeat(0);
    expect(selectTotalSeats(s())).toBe(29);
    expect(selectDisabledCount(s())).toBe(1);
  });

  it('명단이 비었거나 좌석이 없으면 경고하지 않는다', () => {
    const s = boot();
    expect(selectSeatWarning(s())).toBeNull();
    s().update({ layoutType: 'custom' });
    s().setStudents(['A']);
    expect(selectTotalSeats(s())).toBe(0);
    expect(selectSeatWarning(s())).toBeNull();
  });

  it('학생이 좌석보다 많으면 경고한다', () => {
    const s = boot();
    s().setGridSize(1, 2); // 좌석 2
    s().setStudents(['A', 'B', 'C']);
    expect(selectSeatWarning(s())).toMatch(/좌석 수\(2석\)보다 많습니다/);
  });

  it('좌석이 절반 넘게 남으면 안내한다', () => {
    const s = boot();
    s().setStudents(['A', 'B']); // 30석 중 2명
    expect(selectSeatWarning(s())).toMatch(/많이 남습니다/);
  });

  it('적당히 차 있으면 경고하지 않는다', () => {
    const s = boot();
    s().setStudents(Array.from({ length: 20 }, (_, i) => `학생${i}`)); // 30석 중 20명
    expect(selectSeatWarning(s())).toBeNull();
  });
});
