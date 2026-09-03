import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAppStore } from './useAppStore';
import { createMemoryAdapter } from '@/core/storage/memoryAdapter';
import type { StorageAdapter } from '@/core/storage/adapter';
import { dataKey, KEYS } from '@/core/storage/classes';

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
    adapter,
    store,
    s: () => store.getState(),
    startFailing: () => {
      failData = true;
    },
  };
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
    expect(store.temporal.getState().pastStates.length).toBe(before);
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
