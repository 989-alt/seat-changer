import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAppStore } from './useAppStore';
import { createMemoryAdapter } from '@/core/storage/memoryAdapter';
import type { StorageAdapter } from '@/core/storage/adapter';
import { dataKey, KEYS } from '@/core/storage/classes';
import { loadClassData } from '@/core/model/migrate';
import { LIMITS } from '@/core/model/defaults';

const v1 = readFileSync(resolve(__dirname, '../test/fixtures/v1-basic.json'), 'utf8');

function boot(initial: Record<string, string> = {}) {
  const adapter = createMemoryAdapter(initial);
  const store = createAppStore(adapter);
  return { adapter, store, s: () => store.getState() };
}

/** 데이터 키 쓰기만 실패시키는 어댑터(R79: 용량 초과 재현). */
function bootWithFailingDataWrites() {
  const inner = createMemoryAdapter();
  let failData = false;
  const adapter: StorageAdapter = {
    get: (k) => inner.get(k),
    set: (k, v) => (failData && k.startsWith(KEYS.DATA_PREFIX) ? false : inner.set(k, v)),
    remove: (k) => inner.remove(k),
  };
  const store = createAppStore(adapter);
  return {
    store,
    s: () => store.getState(),
    startFailing: () => {
      failData = true;
    },
  };
}

/** 데이터 키 쓰기가 부팅 시점(생성자 안)부터 실패하는 어댑터. R85 재저장의 실패 경로용. */
function bootWithFailingDataWritesFromStart(initial: Record<string, string> = {}) {
  const inner = createMemoryAdapter(initial);
  const adapter: StorageAdapter = {
    get: (k) => inner.get(k),
    set: (k, v) => (k.startsWith(KEYS.DATA_PREFIX) ? false : inner.set(k, v)),
    remove: (k) => inner.remove(k),
  };
  const store = createAppStore(adapter);
  return { store, s: () => store.getState() };
}

/** 데이터 키 쓰기 횟수를 세는 어댑터. "변경 1회 = 저장 1회"를 확인한다. */
function bootCounting(initial: Record<string, string> = {}) {
  const inner = createMemoryAdapter(initial);
  let writes = 0;
  const adapter: StorageAdapter = {
    get: (k) => inner.get(k),
    set: (k, v) => {
      if (k.startsWith(KEYS.DATA_PREFIX)) writes += 1;
      return inner.set(k, v);
    },
    remove: (k) => inner.remove(k),
  };
  const store = createAppStore(adapter);
  return {
    adapter,
    store,
    s: () => store.getState(),
    writes: () => writes,
    resetWrites: () => {
      writes = 0;
    },
  };
}

/**
 * 지정한 반의 데이터 키에 두 번째로 쓰는 순간 실패시킨다.
 * registry.duplicate는 add()로 기본값을 한 번 쓴 뒤 원본 복사를 한 번 더 쓰므로,
 * 이 어댑터에서는 "반은 등록됐는데 설정 복사만 실패한" 상태가 재현된다.
 */
function bootWithFailingCopy(target: string) {
  const inner = createMemoryAdapter();
  let hits = 0;
  const adapter: StorageAdapter = {
    get: (k) => inner.get(k),
    set: (k, v) => {
      if (k === dataKey(target)) {
        hits += 1;
        if (hits >= 2) return false;
      }
      return inner.set(k, v);
    },
    remove: (k) => inner.remove(k),
  };
  const store = createAppStore(adapter);
  return { store, s: () => store.getState() };
}

describe('부팅', () => {
  it('빈 저장소 → 1반 기본값', () => {
    const { s } = boot();
    expect(s().classes).toEqual(['1반']);
    expect(s().data.students).toEqual([]);
    expect(s().loadNotice).toBeNull();
  });
  it('v1 데이터를 읽고 마이그레이션 안내를 남긴다', () => {
    const { s } = boot({ [KEYS.CLASSES]: '["1반"]', [KEYS.ACTIVE]: '1반', [dataKey('1반')]: v1 });
    expect(s().data.students.length).toBeGreaterThan(0);
    expect(s().data.schemaVersion).toBe(2);
    expect(s().loadNotice).toMatch(/새 버전/);
  });
  it('깨진 데이터 → 기본값 + 안내', () => {
    const { s } = boot({ [KEYS.CLASSES]: '["1반"]', [KEYS.ACTIVE]: '1반', [dataKey('1반')]: '{broken' });
    expect(s().loadNotice).toMatch(/읽지 못해/);
  });
  it('부팅은 저장 데이터를 덮어쓰지 않는다', () => {
    const { adapter } = boot({ [KEYS.CLASSES]: '["1반"]', [KEYS.ACTIVE]: '1반', [dataKey('1반')]: '{broken' });
    expect(adapter.get(dataKey('1반'))).toBe('{broken');
  });
});

describe('부팅 재저장 (R85)', () => {
  it('v1 데이터로 부팅하면 그 자리에서 한 번만 v2로 다시 쓴다', () => {
    const { adapter, writes } = bootCounting({
      [KEYS.CLASSES]: '["1반"]',
      [KEYS.ACTIVE]: '1반',
      [dataKey('1반')]: v1,
    });
    expect(writes()).toBe(1);
    const saved = JSON.parse(adapter.get(dataKey('1반'))!);
    expect(saved.schemaVersion).toBe(2);
    expect(saved.students).toHaveLength(22);
  });

  it('이미 v2인 데이터는 부팅해도 다시 쓰지 않는다', () => {
    const v2 = JSON.stringify(loadClassData(v1).data);
    const { writes } = bootCounting({ [KEYS.CLASSES]: '["1반"]', [KEYS.ACTIVE]: '1반', [dataKey('1반')]: v2 });
    expect(writes()).toBe(0);
  });

  it('깨진 데이터는 부팅해도 다시 쓰지 않는다(원본을 건드리지 않는다)', () => {
    const { adapter, writes } = bootCounting({
      [KEYS.CLASSES]: '["1반"]',
      [KEYS.ACTIVE]: '1반',
      [dataKey('1반')]: '{broken',
    });
    expect(writes()).toBe(0);
    expect(adapter.get(dataKey('1반'))).toBe('{broken');
  });

  it('switchClass로 옮겨간 v1 반도 로드 시점에 한 번만 다시 쓴다', () => {
    const { adapter, s, writes, resetWrites } = bootCounting({
      [KEYS.CLASSES]: '["1반","6-7"]',
      [KEYS.ACTIVE]: '1반',
      [dataKey('6-7')]: v1,
    });
    resetWrites();
    s().switchClass('6-7');
    expect(writes()).toBe(1);
    const saved = JSON.parse(adapter.get(dataKey('6-7'))!);
    expect(saved.schemaVersion).toBe(2);
    expect(saved.students).toHaveLength(22);
  });

  it('재저장이 실패하면 SAVE_FAILED 안내가 MIGRATED보다 우선한다 (R79)', () => {
    const { s } = bootWithFailingDataWritesFromStart({
      [KEYS.CLASSES]: '["1반"]',
      [KEYS.ACTIVE]: '1반',
      [dataKey('1반')]: v1,
    });
    // 메모리 상의 데이터 자체는 정상적으로 마이그레이션되어 있다(쓰기만 실패했다).
    expect(s().data.schemaVersion).toBe(2);
    expect(s().data.students).toHaveLength(22);
    expect(s().loadNotice).toMatch(/저장하지 못했습니다/);
  });
});

describe('저장', () => {
  it('update는 같은 키에 v2 JSON을 쓴다', () => {
    const { adapter, s } = boot();
    s().update({ genderRule: 'same' });
    const saved = JSON.parse(adapter.get(dataKey('1반'))!);
    expect(saved.genderRule).toBe('same');
    expect(saved.schemaVersion).toBe(2);
  });
  it('반 전환은 그 반의 데이터를 로드한다', () => {
    const { s } = boot();
    s().addClass('2반');
    s().switchClass('2반');
    s().setStudents(['A', 'B']);
    s().switchClass('1반');
    expect(s().data.students).toEqual([]);
    s().switchClass('2반');
    expect(s().data.students).toEqual(['A', 'B']);
  });
  it('저장 실패는 안내를 남기고 던지지 않는다 (R79)', () => {
    const { s, startFailing } = bootWithFailingDataWrites();
    startFailing();
    expect(() => s().update({ genderRule: 'same' })).not.toThrow();
    expect(s().data.genderRule).toBe('same');
    expect(s().loadNotice).toMatch(/저장하지 못했습니다/);
    s().clearNotice();
    expect(s().loadNotice).toBeNull();
  });
});

describe('반 관리', () => {
  it('중복 이름 추가는 false', () => {
    const { s } = boot();
    expect(s().addClass('2반')).toBe(true);
    expect(s().addClass('2반')).toBe(false);
    expect(s().classes).toEqual(['1반', '2반']);
  });
  it('활성 반 이름 변경은 activeClass도 따라간다', () => {
    const { s } = boot();
    s().setStudents(['A']);
    expect(s().renameClass('1반', '우리반')).toBe(true);
    expect(s().activeClass).toBe('우리반');
    expect(s().classes).toEqual(['우리반']);
  });
  it('활성 반 삭제는 남은 반으로 옮겨간다', () => {
    const { s } = boot();
    s().addClass('2반');
    s().switchClass('2반');
    s().setStudents(['A']);
    expect(s().removeClass('2반')).toBe(true);
    expect(s().activeClass).toBe('1반');
    expect(s().data.students).toEqual([]);
  });
  it('마지막 한 반은 삭제되지 않는다', () => {
    const { s } = boot();
    expect(s().removeClass('1반')).toBe(false);
    expect(s().classes).toEqual(['1반']);
  });
  it('복제는 원본 데이터를 그대로 가져온다', () => {
    const { s } = boot();
    s().setStudents(['A', 'B']);
    expect(s().duplicateClass('1반', '2반')).toBe(true);
    s().switchClass('2반');
    expect(s().data.students).toEqual(['A', 'B']);
  });
  it('이름이 겹쳐 실패한 복제는 저장 실패로 오진단하지 않는다 (R84)', () => {
    const { s } = boot();
    s().addClass('2반');
    s().clearNotice();
    expect(s().duplicateClass('1반', '2반')).toBe(false);
    expect(s().loadNotice).toBeNull();
    expect(s().classes).toEqual(['1반', '2반']);
  });
  it('설정 복사만 실패하면 안내를 남긴다 (R84)', () => {
    const { s } = bootWithFailingCopy('2반');
    s().setStudents(['A']);
    expect(s().duplicateClass('1반', '2반')).toBe(false);
    expect(s().classes).toContain('2반'); // 반은 등록됐다
    expect(s().loadNotice).toMatch(/복사하지 못했습니다/);
  });
});

describe('좌석 삭제·복구·Undo', () => {
  it('deleteSeat → restoreSeat → restoreAllSeats', () => {
    const { s } = boot();
    s().update({ fixedSeats: [{ studentName: 'A', seatIndex: 4 }], students: ['A'], classSize: 1 });
    s().deleteSeat(4);
    s().deleteSeat(7);
    expect(s().data.layoutSettings.disabledSeats).toEqual([4, 7]);
    expect(s().data.fixedSeats).toEqual([]);
    s().restoreSeat(4);
    expect(s().data.layoutSettings.disabledSeats).toEqual([7]);
    s().restoreAllSeats();
    expect(s().data.layoutSettings.disabledSeats).toEqual([]);
  });
  it('중복 삭제·범위 밖 좌석은 무시한다 (R59)', () => {
    const { s } = boot();
    s().deleteSeat(3);
    s().deleteSeat(3);
    s().deleteSeat(999);
    s().deleteSeat(-1);
    expect(s().data.layoutSettings.disabledSeats).toEqual([3]);
  });
  it('setGridSize는 삭제 목록을 비우고 개수를 돌려준다', () => {
    const { s } = boot();
    s().deleteSeat(1);
    s().deleteSeat(2);
    expect(s().setGridSize(5, 5)).toEqual({ clearedDisabled: 2 });
    expect(s().data.layoutSettings).toMatchObject({ columns: 5, rows: 5, disabledSeats: [] });
  });
  it('setGridSize는 범위를 벗어난 행·열을 접어서 저장한다 (R84)', () => {
    const { adapter, s } = boot();
    s().setGridSize(0, 100);
    expect(s().data.layoutSettings).toMatchObject({ columns: 1, rows: 12 });
    const reloaded = loadClassData(adapter.get(dataKey('1반')));
    expect(reloaded.ok).toBe(true);
    expect(reloaded.data.layoutSettings).toMatchObject({ columns: 1, rows: 12 });
    expect(reloaded.data.students).toEqual(s().data.students);
  });
  it('setGridSize는 소수를 정수로 접는다 (R84)', () => {
    const { s } = boot();
    s().setGridSize(3.7, 4.2);
    expect(s().data.layoutSettings).toMatchObject({ columns: 3, rows: 4 });
  });
  it('setGridSize에 수가 아닌 값이 오면 아무것도 하지 않는다 (R84)', () => {
    const { s, writes, resetWrites } = bootCounting();
    s().update({ genderRule: 'same' });
    const before = s().data;
    resetWrites();
    expect(s().setGridSize(Number.NaN, 5)).toEqual({ clearedDisabled: 0 });
    expect(s().data).toBe(before);
    expect(writes()).toBe(0);
  });
  it('Undo가 좌석 삭제를 되돌린다', () => {
    const { store, s } = boot();
    s().deleteSeat(3);
    store.temporal.getState().undo();
    expect(s().data.layoutSettings.disabledSeats).toEqual([]);
    store.temporal.getState().redo();
    expect(s().data.layoutSettings.disabledSeats).toEqual([3]);
  });
  it('Undo는 명단을 잃지 않는다', () => {
    const { store, s } = boot();
    s().setStudents(['A', 'B']);
    s().deleteSeat(3);
    store.temporal.getState().undo();
    expect(s().data.layoutSettings.disabledSeats).toEqual([]);
    expect(s().data.students).toEqual(['A', 'B']);
    expect(s().data.classSize).toBe(2);
    expect(s().data.schemaVersion).toBe(2);
  });
  it('Undo 결과도 저장된다', () => {
    const { adapter, store, s } = boot();
    s().deleteSeat(3);
    store.temporal.getState().undo();
    const saved = JSON.parse(adapter.get(dataKey('1반'))!);
    expect(saved.layoutSettings.disabledSeats).toEqual([]);
    expect(saved.students).toEqual([]);
  });
  it('명단 변경은 Undo 대상이 아니다', () => {
    const { store, s } = boot();
    const before = store.temporal.getState().pastStates.length;
    s().setStudents(['A']);
    expect(store.temporal.getState().pastStates.length).toBe(before);
  });
  it('명단에서 빠진 고정 좌석이 정리돼도 Undo 스택은 늘지 않는다', () => {
    const { store, s } = boot();
    s().update({ students: ['A'], classSize: 1, fixedSeats: [{ studentName: 'A', seatIndex: 0 }] });
    const before = store.temporal.getState().pastStates.length;
    s().setStudents(['B']);
    expect(s().data.fixedSeats).toEqual([]);
    // 정리로 Undo 항목이 생기지 않는다. R84 이후로는 명단 변경이 스택을 아예 비운다.
    expect(store.temporal.getState().pastStates.length).toBeLessThanOrEqual(before);
    expect(store.temporal.getState().pastStates).toEqual([]);
  });
  it('Undo 스택은 50개로 제한된다', () => {
    const { store, s } = boot();
    for (let i = 0; i < 55; i++) s().update({ genderRule: i % 2 === 0 ? 'same' : 'mixed' });
    expect(store.temporal.getState().pastStates.length).toBe(50);
  });
  it('반 전환은 Undo 스택을 비운다', () => {
    const { store, s } = boot();
    s().deleteSeat(3);
    expect(store.temporal.getState().pastStates.length).toBe(1);
    s().addClass('2반');
    s().switchClass('2반');
    expect(store.temporal.getState().pastStates).toEqual([]);
    expect(store.temporal.getState().futureStates).toEqual([]);
  });
});

describe('setStudents', () => {
  it('중복 이름은 먼저 나온 것만 남기고 classSize를 맞춘다 (R76)', () => {
    const { s } = boot();
    s().setStudents(['A', 'A', ' B ', '', 'C']);
    expect(s().data.students).toEqual(['A', 'B', 'C']);
    expect(s().data.classSize).toBe(3);
  });
  it('명단에 없는 고정·분리·성별을 정리한다', () => {
    const { s } = boot();
    s().update({
      students: ['A', 'B'],
      classSize: 2,
      fixedSeats: [
        { studentName: 'A', seatIndex: 0 },
        { studentName: 'B', seatIndex: 1 },
      ],
      separationRules: [{ studentA: 'A', studentB: 'B', minDistance: 2 }],
      studentGenders: { A: 'M', B: 'F' },
    });
    s().setStudents(['A', 'C']);
    expect(s().data.students).toEqual(['A', 'C']);
    expect(s().data.fixedSeats).toEqual([{ studentName: 'A', seatIndex: 0 }]);
    expect(s().data.separationRules).toEqual([]);
    expect(s().data.studentGenders).toEqual({ A: 'M' });
  });
  it('중복은 100명 상한보다 먼저 걸러진다 (R84)', () => {
    const { s } = boot();
    // 중복 5개 + 서로 다른 이름 100개. 상한을 먼저 적용하면 95명만 남는다.
    const names = ['중복', '중복', '중복', '중복', '중복'];
    for (let i = 0; i < 100; i++) names.push(`학생${i}`);
    s().setStudents(names);
    expect(s().data.students).toHaveLength(LIMITS.MAX_STUDENTS);
    expect(s().data.students[0]).toBe('중복');
    expect(s().data.students[99]).toBe('학생98');
    expect(new Set(s().data.students).size).toBe(LIMITS.MAX_STUDENTS);
  });
  it('공백만 다른 이름도 같은 학생으로 본다 (R84)', () => {
    const { s } = boot();
    s().setStudents(['가람', ' 가람 ', '가람\t']);
    expect(s().data.students).toEqual(['가람']);
  });
  it('명단이 바뀌면 Undo 스택을 비운다 (R84)', () => {
    const { store, s } = boot();
    s().deleteSeat(3);
    expect(store.temporal.getState().pastStates.length).toBe(1);
    s().setStudents(['A']);
    expect(store.temporal.getState().pastStates).toEqual([]);
    expect(store.temporal.getState().futureStates).toEqual([]);
    // 스택을 비운 뒤에도 추적은 계속돼야 한다(pause가 남아 있으면 안 된다).
    s().deleteSeat(4);
    expect(store.temporal.getState().pastStates.length).toBe(1);
  });
});

describe('저장 횟수', () => {
  it('데이터 변경 한 번에 저장도 한 번', () => {
    const { s, writes, resetWrites } = bootCounting();
    const once = (fn: () => void) => {
      resetWrites();
      fn();
      expect(writes()).toBe(1);
    };
    once(() => s().update({ genderRule: 'same' }));
    once(() => s().updateLayoutSettings({ columns: 4 }));
    once(() => s().deleteSeat(0));
    once(() => s().restoreSeat(0));
    once(() => s().setGridSize(3, 3));
    once(() => s().setStudents(['A']));
    once(() => s().recordAssignment({ 0: 'A' }, true));
    once(() => s().importJSON(JSON.stringify({ students: ['B'] })));
  });
  it('안내만 바뀌는 변경은 저장하지 않는다', () => {
    const { s, writes, resetWrites } = bootCounting();
    s().recordAssignment({ 0: 'A' }, true);
    expect(s().loadNotice).not.toBeNull();
    resetWrites();
    s().clearNotice();
    expect(s().loadNotice).toBeNull();
    expect(writes()).toBe(0);
  });
  it('변화가 없는 좌석 조작은 저장하지 않는다', () => {
    const { s, writes, resetWrites } = bootCounting();
    resetWrites();
    s().deleteSeat(999);
    s().restoreSeat(999);
    s().restoreAllSeats();
    expect(writes()).toBe(0);
  });
});

describe('recordAssignment', () => {
  it('이전 결과를 이력으로 밀고 최대 5개', () => {
    const { s } = boot();
    for (let i = 0; i < 7; i++) s().recordAssignment({ 0: `학생${i}` }, false);
    expect(s().data.lastAssignment?.mapping).toEqual({ 0: '학생6' });
    expect(s().data.assignmentHistory).toHaveLength(5);
    expect(s().data.assignmentHistory[4]?.mapping).toEqual({ 0: '학생5' });
  });
  it('모둠 배치면 groupHistory도 쌓는다', () => {
    const { s } = boot();
    s().update({ layoutType: 'group', students: ['A', 'B', 'C', 'D'], classSize: 4 });
    s().updateLayoutSettings({ groupSizes: [2, 2] });
    s().recordAssignment({ 0: 'A', 1: 'B', 2: 'C', 3: 'D' }, false);
    expect(s().data.groupHistory[0]?.groups).toEqual([
      ['A', 'B'],
      ['C', 'D'],
    ]);
  });
  it('groupHistory도 최대 5개', () => {
    const { s } = boot();
    s().update({ layoutType: 'group', students: ['A', 'B'], classSize: 2 });
    s().updateLayoutSettings({ groupSizes: [2] });
    for (let i = 0; i < 7; i++) s().recordAssignment({ 0: 'A', 1: 'B' }, false);
    expect(s().data.groupHistory).toHaveLength(5);
  });
  it('이력 폴백이면 안내를 남긴다', () => {
    const { s } = boot();
    s().recordAssignment({ 0: 'A' }, false);
    expect(s().loadNotice).toBeNull();
    s().recordAssignment({ 0: 'B' }, true);
    expect(s().loadNotice).toMatch(/이전 자리를 완전히 피할 수 없어/);
  });
  it('배치 기록은 저장된다', () => {
    const { adapter, s } = boot();
    s().recordAssignment({ 0: 'A' }, false);
    const saved = JSON.parse(adapter.get(dataKey('1반'))!);
    expect(saved.lastAssignment.mapping).toEqual({ 0: 'A' });
  });
});

describe('JSON', () => {
  it('내보내기·가져오기', () => {
    const { s } = boot();
    s().setStudents(['A', 'B']);
    const json = s().exportJSON();
    s().setStudents([]);
    expect(s().importJSON(json).ok).toBe(true);
    expect(s().data.students).toEqual(['A', 'B']);
  });
  it('가져오기 실패는 상태를 바꾸지 않는다', () => {
    const { s } = boot();
    s().setStudents(['A']);
    const before = s().data;
    const result = s().importJSON('{broken');
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(s().data).toBe(before);
  });
});

/** storage 이벤트를 흉내 내는 가짜 EventTarget. 등록된 리스너를 직접 붙잡아 dispatch로 호출한다. */
function fakeEventTarget() {
  const listeners: Array<(e: StorageEvent) => void> = [];
  return {
    addEventListener: (_type: 'storage', l: (e: StorageEvent) => void) => {
      listeners.push(l);
    },
    removeEventListener: (_type: 'storage', l: (e: StorageEvent) => void) => {
      const i = listeners.indexOf(l);
      if (i !== -1) listeners.splice(i, 1);
    },
    dispatch: (key: string | null) => {
      const event = { key } as StorageEvent;
      for (const l of [...listeners]) l(event);
    },
  };
}

describe('탭 간 storage 동기화 (R88, 레거시 initSync 동등)', () => {
  it('다른 탭이 활성 반 데이터를 바꾼 뒤 reloadFromStorage: 반영되고, Undo 스택은 비워지고, 이미 v2면 다시 쓰지 않는다', () => {
    const { adapter, store, s, writes, resetWrites } = bootCounting({
      [KEYS.CLASSES]: '["1반"]',
      [KEYS.ACTIVE]: '1반',
    });
    s().update({ layoutType: 'group' });
    expect(store.temporal.getState().pastStates.length).toBeGreaterThan(0);

    // 다른 "탭"이 같은 어댑터에 직접 씀 (이미 v2 모양).
    const external = { ...s().data, students: ['외부탭학생'], classSize: 1 };
    adapter.set(dataKey('1반'), JSON.stringify(external));
    resetWrites(); // 지금부터는 reloadFromStorage 자신이 일으키는 쓰기만 센다.

    s().reloadFromStorage();

    expect(s().data.students).toEqual(['외부탭학생']);
    expect(store.temporal.getState().pastStates).toEqual([]);
    expect(writes()).toBe(0);
  });

  it('다른 탭이 v1 페이로드를 쓴 뒤 reloadFromStorage: 마이그레이션되고 정확히 한 번만 다시 쓴다 (R85)', () => {
    const { adapter, s, writes, resetWrites } = bootCounting({
      [KEYS.CLASSES]: '["1반"]',
      [KEYS.ACTIVE]: '1반',
    });
    adapter.set(dataKey('1반'), v1);
    resetWrites(); // 지금부터는 reloadFromStorage 자신이 일으키는 쓰기만 센다.

    s().reloadFromStorage();

    expect(s().data.schemaVersion).toBe(2);
    expect(s().data.students).toHaveLength(22);
    expect(writes()).toBe(1);
  });

  it('다른 탭이 활성 반을 바꾸면(ACTIVE 키) reloadFromStorage가 레지스트리의 현재 활성 반으로 전환한다', () => {
    const { adapter, s } = boot({ [KEYS.CLASSES]: '["1반","6-7"]', [KEYS.ACTIVE]: '1반' });
    adapter.set(dataKey('6-7'), JSON.stringify({ ...s().data, students: ['6-7학생'], classSize: 1 }));
    adapter.set(KEYS.ACTIVE, '6-7');

    s().reloadFromStorage();

    expect(s().activeClass).toBe('6-7');
    expect(s().data.students).toEqual(['6-7학생']);
  });

  it('attachStorageSync: 활성 반 데이터 키 변경에는 반응하고, 무관한 키는 무시하며, detach 후에는 반응하지 않는다', () => {
    const { adapter, s } = boot({ [KEYS.CLASSES]: '["1반"]', [KEYS.ACTIVE]: '1반' });
    const target = fakeEventTarget();
    const detach = s().attachStorageSync(target);

    adapter.set(dataKey('1반'), JSON.stringify({ ...s().data, students: ['반영됨'], classSize: 1 }));
    target.dispatch(dataKey('1반'));
    expect(s().data.students).toEqual(['반영됨']);

    adapter.set(dataKey('1반'), JSON.stringify({ ...s().data, students: ['무시됨'], classSize: 1 }));
    target.dispatch('무관한-키');
    expect(s().data.students).toEqual(['반영됨']);

    detach();
    adapter.set(dataKey('1반'), JSON.stringify({ ...s().data, students: ['detach후'], classSize: 1 }));
    target.dispatch(dataKey('1반'));
    expect(s().data.students).toEqual(['반영됨']);
  });

  it('attachStorageSync: storage.clear (key === null)에도 반응한다', () => {
    const { adapter, s } = boot({ [KEYS.CLASSES]: '["1반"]', [KEYS.ACTIVE]: '1반' });
    const target = fakeEventTarget();
    s().attachStorageSync(target);

    adapter.set(dataKey('1반'), JSON.stringify({ ...s().data, students: ['클리어반영'], classSize: 1 }));
    target.dispatch(null);

    expect(s().data.students).toEqual(['클리어반영']);
  });
});
