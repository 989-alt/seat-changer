import type { StorageAdapter } from './adapter';

export function createMemoryAdapter(initial: Record<string, string> = {}): StorageAdapter {
  const m = new Map(Object.entries(initial));
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => {
      m.set(k, v);
    },
    remove: (k) => {
      m.delete(k);
    },
  };
}
