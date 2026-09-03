import type { StorageAdapter } from './adapter';
import { createDefaultData } from '../model/defaults';
import { LIMITS } from '../model/defaults';

const { MAX_CLASSES } = LIMITS;

export const KEYS = {
  CLASSES: 'seat-changer-classes',
  ACTIVE: 'seat-changer-active',
  DATA_PREFIX: 'seat-changer-data',
} as const;

export const dataKey = (className: string) => `${KEYS.DATA_PREFIX}-${className}`;

export interface ClassRegistry {
  migrateIfNeeded(): void;
  list(): string[];
  active(): string;
  add(name: string): boolean;
  rename(oldName: string, newName: string): boolean;
  remove(name: string): boolean;
  switchTo(name: string): boolean;
  duplicate(src: string, newName: string): boolean;
  readRaw(name: string): string | null;
  writeRaw(name: string, json: string): void;
}

// legacy/js/data/store.js:1-131 의 반 관리(getClassList/getActiveClass/addClass/
// renameClass/removeClass/switchClass/duplicateClass/migrateIfNeeded)를
// StorageAdapter 위에서 동작하도록 이식한 것. _cache 무효화는 여기서 하지 않는다
// (스토어 계층인 Task 16의 책임).
export function createClassRegistry(adapter: StorageAdapter): ClassRegistry {
  function list(): string[] {
    try {
      const raw = adapter.get(KEYS.CLASSES);
      const parsed: unknown = raw === null ? null : JSON.parse(raw);
      if (!Array.isArray(parsed)) return ['1반'];
      const filtered = parsed.filter(
        (x): x is string => typeof x === 'string' && x.length > 0 && x.length <= LIMITS.MAX_NAME
      );
      return filtered.slice(0, MAX_CLASSES);
    } catch {
      return ['1반'];
    }
  }

  function active(): string {
    return adapter.get(KEYS.ACTIVE) || list()[0] || '1반';
  }

  function migrateIfNeeded(): void {
    const classes = adapter.get(KEYS.CLASSES);
    if (classes) return; // 이미 마이그레이션됨

    const existingData = adapter.get(KEYS.DATA_PREFIX);
    const defaultClasses = ['1반'];
    adapter.set(KEYS.CLASSES, JSON.stringify(defaultClasses));
    adapter.set(KEYS.ACTIVE, '1반');
    if (existingData) {
      adapter.set(dataKey('1반'), existingData);
    }
  }

  function add(name: string): boolean {
    const classes = list();
    if (classes.length >= MAX_CLASSES) return false;
    if (classes.includes(name)) return false;
    if (!name || name.trim().length === 0) return false;
    const trimmed = name.trim();

    // 데이터 키를 먼저 쓰고, 목록(메타데이터) 쓰기가 실패하면 되돌린다.
    const dataOk = adapter.set(dataKey(trimmed), JSON.stringify(createDefaultData()));
    if (!dataOk) return false;

    const newClasses = [...classes, trimmed];
    const listOk = adapter.set(KEYS.CLASSES, JSON.stringify(newClasses));
    if (!listOk) {
      adapter.remove(dataKey(trimmed)); // best-effort 롤백
      return false;
    }
    return true;
  }

  function rename(oldName: string, newName: string): boolean {
    if (!newName || newName.trim().length === 0) return false;
    const trimmedNew = newName.trim();
    const classes = list();
    const idx = classes.indexOf(oldName);
    if (idx === -1) return false;
    if (oldName !== trimmedNew && classes.includes(trimmedNew)) return false;

    // 순서: 1) 대상 데이터 키 쓰기 2) 반 목록 메타데이터 쓰기 3) 활성 반 메타데이터 쓰기
    // 4) 원본 데이터 키 삭제(마지막). 2)/3)이 실패하면 1)에서 쓴 대상 키를 best-effort로 되돌린다.
    const data = adapter.get(dataKey(oldName));
    const targetOk = adapter.set(dataKey(trimmedNew), data || JSON.stringify(createDefaultData()));
    if (!targetOk) return false;

    const rollbackTarget = () => {
      if (oldName !== trimmedNew) adapter.remove(dataKey(trimmedNew));
    };

    const newClasses = [...classes];
    newClasses[idx] = trimmedNew;
    const listOk = adapter.set(KEYS.CLASSES, JSON.stringify(newClasses));
    if (!listOk) {
      rollbackTarget();
      return false;
    }

    if (active() === oldName) {
      const activeOk = adapter.set(KEYS.ACTIVE, trimmedNew);
      if (!activeOk) {
        rollbackTarget();
        return false;
      }
    }

    if (oldName !== trimmedNew) {
      adapter.remove(dataKey(oldName));
    }
    return true;
  }

  function remove(name: string): boolean {
    const classes = list();
    if (classes.length <= 1) return false; // 최소 1개 반 유지
    const idx = classes.indexOf(name);
    if (idx === -1) return false;

    // 순서: 1) 메타데이터(반 목록·활성 반) 쓰기 2) 데이터 키 삭제(마지막).
    // 메타데이터 쓰기가 실패하면 데이터 키는 건드리지 않고 false를 반환한다.
    const newClasses = [...classes];
    newClasses.splice(idx, 1);
    const wasActive = active() === name;

    const listOk = adapter.set(KEYS.CLASSES, JSON.stringify(newClasses));
    if (!listOk) return false;

    if (wasActive) {
      const activeOk = adapter.set(KEYS.ACTIVE, newClasses[0] ?? '1반');
      if (!activeOk) return false; // 데이터 키는 그대로 둔다
    }

    adapter.remove(dataKey(name));
    return true;
  }

  function switchTo(name: string): boolean {
    const classes = list();
    if (!classes.includes(name)) return false;
    return adapter.set(KEYS.ACTIVE, name);
  }

  function duplicate(src: string, newName: string): boolean {
    // 의도적 편차(레거시 store.js:126-133과 다름): 존재하지 않는 원본은 실패 처리한다.
    const classes = list();
    if (!classes.includes(src)) return false;
    if (!add(newName)) return false;
    const srcData = adapter.get(dataKey(src));
    if (srcData) {
      // 의도적 편차(레거시 store.js:130과 다름): 복사본 데이터 키는 트림된 이름을 쓴다
      // (레거시는 트림하지 않은 newName으로 써서 목록 항목과 데이터 키가 어긋나는 버그가 있었다).
      const ok = adapter.set(dataKey(newName.trim()), srcData);
      if (!ok) return false;
    }
    return true;
  }

  function readRaw(name: string): string | null {
    return adapter.get(dataKey(name));
  }

  function writeRaw(name: string, json: string): void {
    adapter.set(dataKey(name), json);
  }

  return { migrateIfNeeded, list, active, add, rename, remove, switchTo, duplicate, readRaw, writeRaw };
}
