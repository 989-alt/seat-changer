import { createDefaultData } from '@/core/model/defaults';
import type { ClassData } from '@/core/model/types';
import { loadableLastAssignment } from './lastAssignment';

function makeData(patch: Partial<ClassData> = {}): ClassData {
  const base = createDefaultData();
  return {
    ...base,
    students: ['가람', '나래', '다솜'],
    classSize: 3,
    lastAssignment: { mapping: { 0: '가람', 1: '나래', 2: '다솜' }, timestamp: 1 },
    ...patch,
    layoutSettings: { ...base.layoutSettings, columns: 2, rows: 2, ...(patch.layoutSettings ?? {}) },
  };
}

describe('loadableLastAssignment', () => {
  it('지난 배치가 없으면 조용히 null', () => {
    expect(loadableLastAssignment(makeData({ lastAssignment: null }))).toEqual({ mapping: null, stale: false });
  });

  it('비어 있는 지난 배치도 조용히 null', () => {
    expect(loadableLastAssignment(makeData({ lastAssignment: { mapping: {}, timestamp: 1 } }))).toEqual({
      mapping: null,
      stale: false,
    });
  });

  it('명단과 배치가 그대로면 지난 배치를 돌려준다', () => {
    const data = makeData();
    expect(loadableLastAssignment(data)).toEqual({ mapping: data.lastAssignment!.mapping, stale: false });
  });

  it('학생이 추가되면 쓰지 않는다', () => {
    const data = makeData({ students: ['가람', '나래', '다솜', '라온'], classSize: 4 });
    expect(loadableLastAssignment(data)).toEqual({ mapping: null, stale: true });
  });

  it('학생이 빠지면 쓰지 않는다', () => {
    const data = makeData({ students: ['가람', '나래'], classSize: 2 });
    expect(loadableLastAssignment(data)).toEqual({ mapping: null, stale: true });
  });

  it('좌석이 줄어 없는 자리에 앉은 학생이 있으면 쓰지 않는다', () => {
    const data = makeData({ layoutSettings: { columns: 1, rows: 2 } as never });
    expect(loadableLastAssignment(data)).toEqual({ mapping: null, stale: true });
  });

  it('빈 자리로 둔 좌석에 앉은 학생이 있으면 쓰지 않는다', () => {
    const data = makeData({ layoutSettings: { disabledSeats: [1] } as never });
    expect(loadableLastAssignment(data)).toEqual({ mapping: null, stale: true });
  });

  it('같은 이름이 두 자리에 있으면 쓰지 않는다', () => {
    const data = makeData({ lastAssignment: { mapping: { 0: '가람', 1: '가람', 2: '다솜' }, timestamp: 1 } });
    expect(loadableLastAssignment(data).stale).toBe(true);
  });
});
