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
    classes.push(trimmed);
    adapter.set(KEYS.CLASSES, JSON.stringify(classes));
    adapter.set(dataKey(trimmed), JSON.stringify(createDefaultData()));
    return true;
  }

  function rename(oldName: string, newName: string): boolean {
    if (!newName || newName.trim().length === 0) return false;
    const trimmedNew = newName.trim();
    const classes = list();
    const idx = classes.indexOf(oldName);
    if (idx === -1) return false;
    if (oldName !== trimmedNew && classes.includes(trimmedNew)) return false;

    const data = adapter.get(dataKey(oldName));
    adapter.set(dataKey(trimmedNew), data ?? JSON.stringify(createDefaultData()));
    if (oldName !== trimmedNew) {
      adapter.remove(dataKey(oldName));
    }

    classes[idx] = trimmedNew;
    adapter.set(KEYS.CLASSES, JSON.stringify(classes));

    if (active() === oldName) {
      adapter.set(KEYS.ACTIVE, trimmedNew);
    }
    return true;
  }

  function remove(name: string): boolean {
    const classes = list();
    if (classes.length <= 1) return false; // 최소 1개 반 유지
    const idx = classes.indexOf(name);
    if (idx === -1) return false;

    classes.splice(idx, 1);
    adapter.set(KEYS.CLASSES, JSON.stringify(classes));
    adapter.remove(dataKey(name));

    if (active() === name) {
      adapter.set(KEYS.ACTIVE, classes[0] ?? '1반');
    }
    return true;
  }

  function switchTo(name: string): boolean {
    const classes = list();
    if (!classes.includes(name)) return false;
    adapter.set(KEYS.ACTIVE, name);
    return true;
  }

  function duplicate(src: string, newName: string): boolean {
    if (!add(newName)) return false;
    const srcData = adapter.get(dataKey(src));
    if (srcData) {
      adapter.set(dataKey(newName.trim()), srcData);
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
