import { describe, it, expect } from 'vitest';
import type { StorageAdapter } from './adapter';
import { createMemoryAdapter } from './memoryAdapter';
import { createLocalStorageAdapter } from './localStorageAdapter';
import { createClassRegistry, KEYS, dataKey } from './classes';
import { createDefaultData } from '../model/defaults';

function createFailingAdapter(
  base: StorageAdapter,
  shouldFail: (op: 'set' | 'remove', key: string) => boolean
): StorageAdapter {
  return {
    get: (k) => base.get(k),
    set: (k, v) => (shouldFail('set', k) ? false : base.set(k, v)),
    remove: (k) => (shouldFail('remove', k) ? false : base.remove(k)),
  };
}

describe('createClassRegistry', () => {
  it('첫 실행: 1반 생성, 옛 단일 키를 1반으로 이전', () => {
    const a = createMemoryAdapter({ [KEYS.DATA_PREFIX]: '{"students":["A"]}' });
    const r = createClassRegistry(a);
    r.migrateIfNeeded();
    expect(a.get(KEYS.CLASSES)).toBe('["1반"]');
    expect(a.get(KEYS.ACTIVE)).toBe('1반');
    expect(r.list()).toEqual(['1반']);
    expect(r.active()).toBe('1반');
    expect(a.get(dataKey('1반'))).toBe('{"students":["A"]}');
  });
  it('첫 실행: 옛 단일 키 데이터가 없으면 1반 데이터 키를 새로 만들지 않는다 (store.js:33-46)', () => {
    const a = createMemoryAdapter();
    const r = createClassRegistry(a);
    r.migrateIfNeeded();
    expect(a.get(KEYS.CLASSES)).toBe('["1반"]');
    expect(a.get(KEYS.ACTIVE)).toBe('1반');
    expect(a.get(dataKey('1반'))).toBeNull();
  });
  it('추가·중복·상한 15', () => {
    const r = createClassRegistry(createMemoryAdapter()); r.migrateIfNeeded();
    expect(r.add('2반')).toBe(true);
    expect(r.add('2반')).toBe(false);
    expect(r.add('  ')).toBe(false);
    for (let i = 3; i <= 15; i++) r.add(`${i}반`);
    expect(r.add('16반')).toBe(false);
    expect(r.list()).toHaveLength(15);
  });
  it('이름 변경은 데이터 키를 옮기고 활성 반도 따라간다', () => {
    const a = createMemoryAdapter(); const r = createClassRegistry(a); r.migrateIfNeeded();
    a.set(dataKey('1반'), '{"x":1}');
    expect(r.rename('1반', '6학년 7반')).toBe(true);
    expect(a.get(dataKey('1반'))).toBeNull();
    expect(a.get(dataKey('6학년 7반'))).toBe('{"x":1}');
    expect(r.active()).toBe('6학년 7반');
  });
  it('rename: 원본 데이터가 빈 문자열이면(레거시 || 연산, store.js:87) 기본 데이터로 채운다', () => {
    const a = createMemoryAdapter(); const r = createClassRegistry(a); r.migrateIfNeeded();
    a.set(dataKey('1반'), '');
    expect(r.rename('1반', '2반')).toBe(true);
    expect(a.get(dataKey('2반'))).toBe(JSON.stringify(createDefaultData()));
  });
  it('rename: 이미 존재하는 이름으로 변경 시 false', () => {
    const r = createClassRegistry(createMemoryAdapter()); r.migrateIfNeeded();
    r.add('2반');
    expect(r.rename('1반', '2반')).toBe(false);
  });
  it('rename: 공백만 있는 새 이름은 거부한다', () => {
    const r = createClassRegistry(createMemoryAdapter()); r.migrateIfNeeded();
    expect(r.rename('1반', '   ')).toBe(false);
  });
  it('rename: 51자 이름으로 변경은 성공하지만 목록 필터(50자 상한)에서 사라진다', () => {
    const r = createClassRegistry(createMemoryAdapter()); r.migrateIfNeeded();
    const longName = 'b'.repeat(51);
    expect(r.rename('1반', longName)).toBe(true);
    expect(r.list()).toEqual([]);
  });
  it('마지막 반은 삭제 불가, 삭제 시 활성 반 이동', () => {
    const r = createClassRegistry(createMemoryAdapter()); r.migrateIfNeeded();
    expect(r.remove('1반')).toBe(false);
    r.add('2반'); r.switchTo('2반');
    expect(r.remove('2반')).toBe(true);
    expect(r.active()).toBe('1반');
  });
  it('복제', () => {
    const a = createMemoryAdapter(); const r = createClassRegistry(a); r.migrateIfNeeded();
    a.set(dataKey('1반'), '{"students":["A"]}');
    expect(r.duplicate('1반', '복사본')).toBe(true);
    expect(a.get(dataKey('복사본'))).toBe('{"students":["A"]}');
  });
  it('복제: 공백이 포함된 새 이름은 트림된 데이터 키에 저장된다 (레거시 store.js:130의 미트림 키 버그를 의도적으로 고침)', () => {
    const a = createMemoryAdapter(); const r = createClassRegistry(a); r.migrateIfNeeded();
    a.set(dataKey('1반'), '{"students":["A"]}');
    expect(r.duplicate('1반', '  사본  ')).toBe(true);
    expect(a.get(dataKey('사본'))).toBe('{"students":["A"]}');
    expect(r.list()).toContain('사본');
  });
  it('복제: 공백만 있는 새 이름은 거부한다', () => {
    const r = createClassRegistry(createMemoryAdapter()); r.migrateIfNeeded();
    expect(r.duplicate('1반', '   ')).toBe(false);
  });
  it('복제: 존재하지 않는 원본은 실패한다 (의도적 동작 변경: 레거시는 성공 처리했으나 이번엔 방지)', () => {
    const r = createClassRegistry(createMemoryAdapter()); r.migrateIfNeeded();
    expect(r.duplicate('없는반', '새이름')).toBe(false);
    expect(r.list()).toEqual(['1반']);
  });
  it('복제: 51자 새 이름은 성공하지만 목록 필터에서 사라진다', () => {
    const r = createClassRegistry(createMemoryAdapter()); r.migrateIfNeeded();
    const longName = 'c'.repeat(51);
    expect(r.duplicate('1반', longName)).toBe(true);
    expect(r.list()).toEqual(['1반']);
  });
  it('마이그레이션 후 재호출은 아무것도 바꾸지 않는다 (이미 마이그레이션됨)', () => {
    const a = createMemoryAdapter();
    const r = createClassRegistry(a);
    r.migrateIfNeeded();
    r.add('2반');
    r.migrateIfNeeded();
    expect(r.list()).toEqual(['1반', '2반']);
  });
  it('반 목록 JSON이 손상되면 1반 기본값으로 복구한다', () => {
    const a = createMemoryAdapter({ [KEYS.CLASSES]: '{not-json' });
    const r = createClassRegistry(a);
    expect(r.list()).toEqual(['1반']);
  });
  it('active(): ACTIVE 키가 없고 CLASSES만 있으면 목록의 첫 반을 반환한다', () => {
    const a = createMemoryAdapter({ [KEYS.CLASSES]: JSON.stringify(['3반', '4반']) });
    const r = createClassRegistry(a);
    expect(r.active()).toBe('3반');
  });

  describe('쓰기 실패 시 원자성 (R79)', () => {
    it('add: 반 목록 쓰기 실패 시 새로 만든 데이터 키를 롤백하고 false를 반환한다', () => {
      const base = createMemoryAdapter();
      const setup = createClassRegistry(base); setup.migrateIfNeeded();
      const failing = createFailingAdapter(base, (op, k) => op === 'set' && k === KEYS.CLASSES);
      const r = createClassRegistry(failing);
      expect(r.add('2반')).toBe(false);
      expect(base.get(dataKey('2반'))).toBeNull();
    });

    it('rename: 대상 데이터 키 쓰기 실패 시 원본 데이터를 건드리지 않고 false', () => {
      const base = createMemoryAdapter();
      const setup = createClassRegistry(base); setup.migrateIfNeeded();
      base.set(dataKey('1반'), '{"x":1}');
      const failing = createFailingAdapter(base, (op, k) => op === 'set' && k === dataKey('2반'));
      const r = createClassRegistry(failing);
      expect(r.rename('1반', '2반')).toBe(false);
      expect(base.get(dataKey('1반'))).toBe('{"x":1}');
      expect(base.get(dataKey('2반'))).toBeNull();
    });

    it('rename: 메타데이터(반 목록) 쓰기 실패 시 이미 쓴 대상 데이터 키를 롤백하고 false', () => {
      const base = createMemoryAdapter();
      const setup = createClassRegistry(base); setup.migrateIfNeeded();
      base.set(dataKey('1반'), '{"x":1}');
      const failing = createFailingAdapter(base, (op, k) => op === 'set' && k === KEYS.CLASSES);
      const r = createClassRegistry(failing);
      expect(r.rename('1반', '2반')).toBe(false);
      expect(base.get(dataKey('2반'))).toBeNull();
      expect(base.get(dataKey('1반'))).toBe('{"x":1}');
    });

    it('remove: 메타데이터 쓰기 실패 시 데이터 키는 그대로 남고 false', () => {
      const base = createMemoryAdapter();
      const setup = createClassRegistry(base); setup.migrateIfNeeded();
      setup.add('2반');
      base.set(dataKey('2반'), '{"y":2}');
      const failing = createFailingAdapter(base, (op, k) => op === 'set' && k === KEYS.CLASSES);
      const r = createClassRegistry(failing);
      expect(r.remove('2반')).toBe(false);
      expect(base.get(dataKey('2반'))).toBe('{"y":2}');
      expect(base.get(KEYS.CLASSES)).toBe(JSON.stringify(['1반', '2반']));
    });

    it('switchTo: ACTIVE 쓰기 실패 시 false', () => {
      const base = createMemoryAdapter();
      const setup = createClassRegistry(base); setup.migrateIfNeeded();
      setup.add('2반');
      const failing = createFailingAdapter(base, (op, k) => op === 'set' && k === KEYS.ACTIVE);
      const r = createClassRegistry(failing);
      expect(r.switchTo('2반')).toBe(false);
    });
  });

  describe('createLocalStorageAdapter', () => {
    it('get/set/remove가 전달받은 Storage 객체에 위임된다', () => {
      const store = new Map<string, string>();
      const stub = {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => { store.set(k, v); },
        removeItem: (k: string) => { store.delete(k); },
      } as unknown as Storage;

      const adapter = createLocalStorageAdapter(stub);
      expect(adapter.get('missing')).toBeNull();
      expect(adapter.set('a', 'b')).toBe(true);
      expect(adapter.get('a')).toBe('b');
      expect(store.get('a')).toBe('b');
      expect(adapter.remove('a')).toBe(true);
      expect(adapter.get('a')).toBeNull();
    });

    it('getItem/setItem/removeItem이 던지는 예외를 삼키고 set/remove는 false를 반환한다', () => {
      const stub = {
        getItem: () => { throw new Error('quota'); },
        setItem: () => { throw new Error('quota'); },
        removeItem: () => { throw new Error('quota'); },
      } as unknown as Storage;
      const adapter = createLocalStorageAdapter(stub);
      expect(adapter.get('a')).toBeNull();
      expect(() => adapter.set('a', 'b')).not.toThrow();
      expect(adapter.set('a', 'b')).toBe(false);
      expect(() => adapter.remove('a')).not.toThrow();
      expect(adapter.remove('a')).toBe(false);
    });
  });

  describe('createMemoryAdapter', () => {
    it('set/remove는 항상 true를 반환한다', () => {
      const a = createMemoryAdapter();
      expect(a.set('k', 'v')).toBe(true);
      expect(a.remove('k')).toBe(true);
    });
  });
});
