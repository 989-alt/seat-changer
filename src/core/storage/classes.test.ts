import { describe, it, expect } from 'vitest';
import { createMemoryAdapter } from './memoryAdapter';
import { createLocalStorageAdapter } from './localStorageAdapter';
import { createClassRegistry, KEYS, dataKey } from './classes';

describe('createClassRegistry', () => {
  it('첫 실행: 1반 생성, 옛 단일 키를 1반으로 이전', () => {
    const a = createMemoryAdapter({ [KEYS.DATA_PREFIX]: '{"students":["A"]}' });
    const r = createClassRegistry(a);
    r.migrateIfNeeded();
    expect(r.list()).toEqual(['1반']);
    expect(r.active()).toBe('1반');
    expect(a.get(dataKey('1반'))).toBe('{"students":["A"]}');
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
      adapter.set('a', 'b');
      expect(adapter.get('a')).toBe('b');
      expect(store.get('a')).toBe('b');
      adapter.remove('a');
      expect(adapter.get('a')).toBeNull();
    });

    it('getItem/setItem/removeItem이 던지는 예외를 삼킨다', () => {
      const stub = {
        getItem: () => { throw new Error('quota'); },
        setItem: () => { throw new Error('quota'); },
        removeItem: () => { throw new Error('quota'); },
      } as unknown as Storage;
      const adapter = createLocalStorageAdapter(stub);
      expect(adapter.get('a')).toBeNull();
      expect(() => adapter.set('a', 'b')).not.toThrow();
      expect(() => adapter.remove('a')).not.toThrow();
    });
  });
});
