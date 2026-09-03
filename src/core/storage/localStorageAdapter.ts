import type { StorageAdapter } from './adapter';

// storage는 호출자(앱 계층)가 window.localStorage 등을 넘겨준다.
// core/는 브라우저 전역을 직접 참조하지 않는다 — Storage 타입만 사용한다.
export function createLocalStorageAdapter(storage: Storage): StorageAdapter {
  return {
    get: (k) => {
      try {
        return storage.getItem(k);
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        storage.setItem(k, v);
      } catch {
        // 용량 초과 등: 호출자가 토스트 등으로 처리
      }
    },
    remove: (k) => {
      try {
        storage.removeItem(k);
      } catch {
        // noop
      }
    },
  };
}
