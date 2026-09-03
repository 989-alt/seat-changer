// 앱 상태 스토어. 반 레지스트리(Task 14) 위에서 활성 반의 ClassData를 들고 있고,
// 데이터가 바뀔 때마다 v1과 같은 localStorage 키에 다시 쓴다.
// Undo/Redo는 zundo(temporal)로, 좌석·배치 관련 필드만 되돌린다.
import { create, useStore, type StateCreator, type StoreApi, type UseBoundStore } from 'zustand';
import { temporal, type TemporalState } from 'zundo';
import type { Assignment, ClassData, Gender, LayoutSettings } from '@/core/model/types';
import { LIMITS } from '@/core/model/defaults';
import { sanitizeStudents } from '@/core/model/schema';
import { loadClassData } from '@/core/model/migrate';
import type { StorageAdapter } from '@/core/storage/adapter';
import { createClassRegistry, dataKey, KEYS } from '@/core/storage/classes';
import { createLocalStorageAdapter } from '@/core/storage/localStorageAdapter';
import { createMemoryAdapter } from '@/core/storage/memoryAdapter';
import { exportClassJSON, importClassJSON } from '@/core/storage/json';
import { getLayout } from '@/core/layouts';
import { groupLayout } from '@/core/layouts/group';

/**
 * storage 이벤트를 등록/해제할 수 있는 대상. 브라우저의 window가 기본이지만,
 * 테스트에서는 가짜 EventTarget을 넘길 수 있도록 구조적 타입으로 둔다.
 */
export interface StorageSyncTarget {
  addEventListener(type: 'storage', listener: (e: StorageEvent) => void): void;
  removeEventListener(type: 'storage', listener: (e: StorageEvent) => void): void;
}

export interface AppState {
  classes: string[];
  activeClass: string;
  data: ClassData;
  /** 로드 실패·마이그레이션·저장 실패 안내. UI가 토스트 후 clearNotice(). */
  loadNotice: string | null;
  // 반
  addClass(name: string): boolean;
  renameClass(o: string, n: string): boolean;
  removeClass(name: string): boolean;
  switchClass(name: string): void;
  duplicateClass(src: string, n: string): boolean;
  // 데이터
  update(partial: Partial<ClassData>): void;
  updateLayoutSettings(partial: Partial<LayoutSettings>): void;
  setStudents(names: string[]): void;
  deleteSeat(seatIndex: number): void;
  restoreSeat(seatIndex: number): void;
  restoreAllSeats(): void;
  setGridSize(columns: number, rows: number): { clearedDisabled: number };
  recordAssignment(mapping: Assignment, historyFallback: boolean): void;
  exportJSON(): string;
  importJSON(json: string): { ok: boolean; error?: string };
  clearNotice(): void;
  /**
   * 다른 탭이 바꾼 저장 데이터를 다시 읽어 온다(쓰지 않고 읽기만). 부팅/반 전환과
   * 같은 loadFor 경로를 타므로 v1 페이로드는 마이그레이션되고 한 번만 다시 쓰인다(R85).
   * Undo 스택은 비운다. legacy/js/data/store.js:219-234 initSync의 v2 동등물(R88).
   */
  reloadFromStorage(): void;
  /**
   * storage 이벤트를 구독해 반 목록·활성 반·활성 반 데이터 키가 바뀌면
   * reloadFromStorage()를 부른다. 해제 함수를 돌려준다.
   */
  attachStorageSync(target: StorageSyncTarget): () => void;
}

// 사용자 안내 문구
const NOTICE = {
  MIGRATED: '새 버전으로 데이터를 옮겼습니다. 이전과 똑같이 쓰실 수 있습니다.',
  UNREADABLE: '저장 데이터를 읽지 못해 초기화했습니다. 백업 JSON이 있으면 불러오세요.',
  SAVE_FAILED: '저장하지 못했습니다. 저장 공간을 확인하세요.',
  COPY_FAILED: '반은 만들었지만 설정을 복사하지 못했습니다. 저장 공간을 확인하세요.',
  // legacy/js/screens/student-screen.js:614 의 문구를 그대로 옮긴 것.
  HISTORY_FALLBACK: '이전 자리를 완전히 피할 수 없어 일부 중복이 있을 수 있습니다. (기록 자동 저장됨)',
} as const;

/** Undo/Redo가 되돌리는 필드. 명단·배치 결과·이력은 대상이 아니다. */
type UndoSnapshot = Pick<
  ClassData,
  'layoutType' | 'layoutSettings' | 'fixedSeats' | 'separationRules' | 'genderRule' | 'studentGenders'
>;

const pickUndoable = (d: ClassData): UndoSnapshot => ({
  layoutType: d.layoutType,
  layoutSettings: d.layoutSettings,
  fixedSeats: d.fixedSeats,
  separationRules: d.separationRules,
  genderRule: d.genderRule,
  studentGenders: d.studentGenders,
});

const UNDO_KEYS = [
  'layoutType',
  'layoutSettings',
  'fixedSeats',
  'separationRules',
  'genderRule',
  'studentGenders',
] as const satisfies readonly (keyof UndoSnapshot)[];

/**
 * zundo의 undo/redo는 `partialize`가 만든 스냅샷을 zustand의 얕은 병합 set에
 * 그대로 넘긴다. 스냅샷을 `{ data: ... }` 모양으로 만들면 data가 통째로
 * 교체되어 students 등 Undo 대상이 아닌 필드가 사라진다.
 * 그래서 스냅샷은 ClassData의 필드를 최상위로 편 평평한 모양으로 만들고,
 * temporal 바깥에서 set을 가로채 data 안으로 병합해 넣는다.
 *
 * R84: 키 하나만 보는 덕타이핑 대신 Undo 대상 6개가 모두 자기 소유 키로 있는지
 * 구조로 확인한다. AppState의 어떤 액션 페이로드도 이 6개를 동시에 갖지 않는다.
 */
function isUndoSnapshot(partial: unknown): partial is UndoSnapshot {
  if (typeof partial !== 'object' || partial === null) return false;
  return UNDO_KEYS.every((k) => Object.hasOwn(partial, k));
}

type TemporalMutator = [['temporal', StoreApi<TemporalState<UndoSnapshot>>]];
type AppStateCreator = StateCreator<AppState, [], TemporalMutator>;

function withUndoMerge(config: AppStateCreator): AppStateCreator {
  return (set, get, store) => {
    const undoAwareSet = (partial: unknown, replace?: boolean) => {
      if (isUndoSnapshot(partial)) {
        set({ data: { ...get().data, ...partial } });
        return;
      }
      (set as (p: unknown, r?: boolean) => void)(partial, replace);
    };
    return config(undoAwareSet as unknown as typeof set, get, store);
  };
}

/**
 * 저장 데이터를 읽어 ClassData와 안내 문구를 만든다.
 *
 * R85: 부팅·반 전환(loading=true 구간)은 store.subscribe의 저장 리스너를 타지 않는다
 * (로드로 인한 변경은 되돌려 쓰지 않는다는 규칙 때문). 그래서 v1을 v2로 마이그레이션한
 * 결과가 메모리에만 있고 localStorage에는 옛 모양 그대로 남는 경우가 생긴다.
 * migrated:true일 때 여기서 그 자리에서 한 번만 명시적으로 다시 쓴다. ok:false(깨진
 * 데이터)이거나 migrated:false(이미 v2)면 쓰지 않는다 — 전자는 복구 기회가 있는 원본을
 * 건드리지 않기 위해서고, 후자는 애초에 쓸 이유가 없다.
 * R79: 재저장이 실패하면 SAVE_FAILED가 MIGRATED보다 우선한다 — "잘 옮겼다"는 소식보다
 * "지금 위험하다"는 소식이 급하다.
 */
function loadFor(adapter: StorageAdapter, name: string): { data: ClassData; notice: string | null } {
  const raw = adapter.get(dataKey(name));
  const r = loadClassData(raw);
  if (!r.ok) return { data: r.data, notice: raw === null ? null : NOTICE.UNREADABLE };
  if (!r.migrated) return { data: r.data, notice: null };
  const ok = adapter.set(dataKey(name), JSON.stringify(r.data));
  return { data: r.data, notice: ok ? NOTICE.MIGRATED : NOTICE.SAVE_FAILED };
}

/** 배치의 원래 좌석 수(비활성 좌석을 빼기 전). deleteSeat의 범위 검사에 쓴다. */
const rawSeatCount = (d: ClassData): number => getLayout(d.layoutType).getSeatCount(d.layoutSettings);

const todayFrom = (timestamp: number): string => new Date(timestamp).toISOString().slice(0, 10);

/** R84: 행·열은 저장 전에 스키마가 받는 범위(1~12 정수)로 접는다. */
const clampGrid = (n: number): number =>
  Math.max(LIMITS.MIN_GRID, Math.min(LIMITS.MAX_GRID, Math.trunc(n)));

export function createAppStore(adapter: StorageAdapter): UseBoundStore<
  StoreApi<AppState> & { temporal: StoreApi<TemporalState<UndoSnapshot>> }
> {
  const registry = createClassRegistry(adapter);
  registry.migrateIfNeeded();
  const active = registry.active();
  const first = loadFor(adapter, active);

  // 저장 데이터를 스토어로 읽어 들이는 동안에는 되돌려 쓰지 않는다.
  // (깨진 원본을 기본값으로 덮어써서 복구 기회를 없애지 않기 위해서다.)
  let loading = false;
  let temporalApi: StoreApi<TemporalState<UndoSnapshot>> | null = null;

  const init: StateCreator<AppState, [['temporal', unknown]], []> = (set, get) => {
    /** 활성 반을 바꾸고 그 반의 데이터를 읽어 들인다. Undo 스택은 비운다. */
    const applyClass = (name: string) => {
      const { data, notice } = loadFor(adapter, name);
      loading = true;
      set({ classes: registry.list(), activeClass: name, data, loadNotice: notice });
      loading = false;
      temporalApi?.getState().clear();
    };

    /**
     * Undo 대상이 아닌 변경(명단 등)은 스냅샷을 남기지 않는다.
     * R84: 구독자(저장 리스너 등)가 던져도 추적이 멈춘 채로 남지 않도록 finally로 되돌린다.
     */
    const setUntracked = (data: ClassData) => {
      temporalApi?.getState().pause();
      try {
        set({ data });
      } finally {
        temporalApi?.getState().resume();
      }
    };

    return {
      classes: registry.list(),
      activeClass: active,
      data: first.data,
      loadNotice: first.notice,

      addClass: (name) => {
        const ok = registry.add(name);
        set({ classes: registry.list() });
        return ok;
      },

      renameClass: (o, n) => {
        const wasActive = get().activeClass === o;
        const ok = registry.rename(o, n);
        const classes = registry.list();
        set(ok && wasActive ? { classes, activeClass: registry.active() } : { classes });
        return ok;
      },

      removeClass: (name) => {
        const wasActive = get().activeClass === name;
        const ok = registry.remove(name);
        if (ok && wasActive) applyClass(registry.active());
        else set({ classes: registry.list() });
        return ok;
      },

      switchClass: (name) => {
        if (!registry.switchTo(name)) return;
        applyClass(name);
      },

      duplicateClass: (src, n) => {
        const trimmed = n.trim();
        // R84: duplicate()는 이름 중복·상한 초과 같은 정상적 거절에도 false를 준다.
        // "이 호출이 반을 새로 만들어 놓고 복사만 실패했는가"를 앞뒤 목록 비교로 가린다.
        const before = registry.list();
        const ok = registry.duplicate(src, n);
        const classes = registry.list();
        const copyFailed = !ok && !before.includes(trimmed) && classes.includes(trimmed);
        // 이름 중복 등 그 밖의 실패는 안내를 남기지 않는다.
        // 어떤 이름으로 실패했는지는 호출한 UI가 알고 있으므로 boolean으로 충분하다.
        set(copyFailed ? { classes, loadNotice: NOTICE.COPY_FAILED } : { classes });
        return ok;
      },

      update: (partial) => {
        set({ data: { ...get().data, ...partial } });
      },

      updateLayoutSettings: (partial) => {
        const d = get().data;
        set({ data: { ...d, layoutSettings: { ...d.layoutSettings, ...partial } } });
      },

      // R76: 이름이 곧 식별자이므로 중복은 먼저 나온 것만 남긴다.
      // 명단에서 빠진 학생의 고정 좌석·분리 규칙·성별은 함께 정리한다.
      setStudents: (names) => {
        const d = get().data;
        // R84: 정리 → 중복 제거 → 상한 순서로 처리한다. sanitizeStudents가 배열 전체를
        // 받으면 상한(100명)을 중복 제거보다 먼저 적용해 유효한 학생이 밀려난다.
        // 정리 규칙은 그대로 쓰기 위해 이름을 하나씩 넘기고, 상한만 여기서 적용한다.
        const students: string[] = [];
        const roster = new Set<string>();
        for (const raw of Array.isArray(names) ? names : []) {
          const [clean] = sanitizeStudents([raw]);
          if (clean === undefined || roster.has(clean)) continue;
          roster.add(clean);
          students.push(clean);
          if (students.length >= LIMITS.MAX_STUDENTS) break;
        }
        const studentGenders: Record<string, Gender> = {};
        for (const name of students) {
          // R63: 학생 이름으로 객체를 읽는 자리는 Object.hasOwn으로 막는다.
          if (Object.hasOwn(d.studentGenders, name)) {
            const g = d.studentGenders[name];
            if (g) studentGenders[name] = g;
          }
        }
        setUntracked({
          ...d,
          students,
          classSize: students.length,
          fixedSeats: d.fixedSeats.filter((f) => roster.has(f.studentName)),
          separationRules: d.separationRules.filter((r) => roster.has(r.studentA) && roster.has(r.studentB)),
          studentGenders,
        });
        // R84: 쌓여 있던 스냅샷에는 옛 명단 기준의 fixedSeats·studentGenders가 들어 있다.
        // 명단이 바뀐 뒤 그걸 되돌리면 없는 학생이 되살아나므로 스택을 비운다.
        temporalApi?.getState().clear();
      },

      // R59: 비활성 좌석은 중복 없이, 현재 배치의 좌석 범위 안에서만 유지한다.
      deleteSeat: (seatIndex) => {
        const d = get().data;
        if (!Number.isSafeInteger(seatIndex) || seatIndex < 0 || seatIndex >= rawSeatCount(d)) return;
        if (d.layoutSettings.disabledSeats.includes(seatIndex)) return;
        const disabled = [...d.layoutSettings.disabledSeats, seatIndex].sort((a, b) => a - b);
        set({
          data: {
            ...d,
            layoutSettings: { ...d.layoutSettings, disabledSeats: disabled },
            // 삭제한 좌석에 걸린 고정은 해제한다.
            fixedSeats: d.fixedSeats.filter((f) => f.seatIndex !== seatIndex),
          },
        });
      },

      restoreSeat: (seatIndex) => {
        const d = get().data;
        if (!d.layoutSettings.disabledSeats.includes(seatIndex)) return;
        set({
          data: {
            ...d,
            layoutSettings: {
              ...d.layoutSettings,
              disabledSeats: d.layoutSettings.disabledSeats.filter((x) => x !== seatIndex),
            },
          },
        });
      },

      restoreAllSeats: () => {
        const d = get().data;
        if (d.layoutSettings.disabledSeats.length === 0) return;
        set({ data: { ...d, layoutSettings: { ...d.layoutSettings, disabledSeats: [] } } });
      },

      // R84: 접지 않고 저장하면 다음 로드 때 스키마 범위로 조용히 바뀌어
      // 화면에서 본 행·열과 저장된 값이 어긋난다. 쓰기 전에 접는다.
      setGridSize: (columns, rows) => {
        if (!Number.isFinite(columns) || !Number.isFinite(rows)) return { clearedDisabled: 0 };
        const d = get().data;
        const clearedDisabled = d.layoutSettings.disabledSeats.length;
        set({
          data: {
            ...d,
            layoutSettings: {
              ...d.layoutSettings,
              columns: clampGrid(columns),
              rows: clampGrid(rows),
              disabledSeats: [],
            },
          },
        });
        return { clearedDisabled };
      },

      // legacy/js/screens/student-screen.js:526-568 이식.
      // 직전 lastAssignment를 이력으로 밀고, 모둠 배치면 이번 결과의 모둠 구성을 쌓는다.
      recordAssignment: (mapping, historyFallback) => {
        const d = get().data;
        const now = Date.now();
        const next: ClassData = { ...d, lastAssignment: { mapping, timestamp: now } };

        const prev = d.lastAssignment;
        if (prev && prev.mapping) {
          const history = [
            ...d.assignmentHistory,
            { mapping: prev.mapping, timestamp: prev.timestamp, date: todayFrom(prev.timestamp) },
          ];
          while (history.length > LIMITS.MAX_HISTORY) history.shift();
          next.assignmentHistory = history;
        }

        if (d.layoutType === 'group') {
          const sizes = groupLayout.getGroupSizes(d.layoutSettings);
          const groups: string[][] = [];
          let cursor = 0;
          for (const sz of sizes) {
            const members: string[] = [];
            for (let seat = cursor; seat < cursor + sz; seat++) {
              const name = mapping[seat];
              if (name) members.push(name);
            }
            if (members.length > 0) groups.push(members);
            cursor += sz;
          }
          const gh = [...d.groupHistory, { groups, timestamp: now, date: todayFrom(now) }];
          while (gh.length > LIMITS.MAX_HISTORY) gh.shift();
          next.groupHistory = gh;
        }

        // 안내를 먼저 세우고 데이터를 쓴다. 저장이 실패하면 그 안내가 이 문구를 덮는다
        // (저장 실패가 더 급한 소식이다).
        if (historyFallback) set({ loadNotice: NOTICE.HISTORY_FALLBACK });
        // 배치 결과는 Undo 대상이 아니다.
        setUntracked(next);
      },

      exportJSON: () => exportClassJSON(get().data),

      importJSON: (json) => {
        const r = importClassJSON(json);
        if (!r.ok) return { ok: false, error: r.error };
        set({ data: r.data });
        // 가져오기는 명단까지 통째로 바뀌므로 Undo로 반쯤 되돌리면 앞뒤가 맞지 않는다.
        temporalApi?.getState().clear();
        return { ok: true };
      },

      clearNotice: () => set({ loadNotice: null }),

      // 다른 탭 변경 반영. applyClass는 registry.list()/registry.active()를 다시 읽고
      // loadFor로 로드하므로, CLASSES/ACTIVE가 바뀐 경우 그 반으로도 전환된다.
      reloadFromStorage: () => {
        applyClass(registry.active());
      },

      attachStorageSync: (target) => {
        const listener = (e: StorageEvent) => {
          const key = e.key;
          if (
            key === null ||
            key === KEYS.CLASSES ||
            key === KEYS.ACTIVE ||
            key === dataKey(get().activeClass)
          ) {
            get().reloadFromStorage();
          }
        };
        target.addEventListener('storage', listener);
        return () => target.removeEventListener('storage', listener);
      },
    };
  };

  const store = create<AppState>()(
    withUndoMerge(
      temporal<AppState, [], [], UndoSnapshot>(init, {
        limit: 50,
        partialize: (s) => pickUndoable(s.data),
        equality: (a, b) => JSON.stringify(a) === JSON.stringify(b),
      })
    )
  );

  temporalApi = store.temporal;

  // 저장: data가 바뀔 때마다 활성 반 키에 v2 JSON을 쓴다.
  // 로드(반 전환·부팅)로 인한 변경은 되돌려 쓰지 않는다.
  store.subscribe((state, prev) => {
    if (loading || state.data === prev.data) return;
    const ok = adapter.set(dataKey(state.activeClass), JSON.stringify(state.data));
    // R79: 저장 실패는 던지지 않고 안내로만 알린다(작업 중인 내용은 화면에 남는다).
    if (!ok) store.setState({ loadNotice: NOTICE.SAVE_FAILED });
  });

  return store;
}

/** 브라우저가 없거나 저장소 접근이 막힌 환경(SSR·프라이빗 모드)에서는 메모리로 떨어진다. */
function createBrowserAdapter(): StorageAdapter {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return createLocalStorageAdapter(window.localStorage);
    }
  } catch {
    // 접근 자체가 막힌 경우
  }
  return createMemoryAdapter();
}

export const useAppStore = createAppStore(createBrowserAdapter());

// 탭 간 동기화(R88): 다른 탭이 반 목록·활성 반·활성 반 데이터를 바꾸면 반영한다.
if (typeof window !== 'undefined') {
  useAppStore.getState().attachStorageSync(window);
}

/** Undo/Redo 상태. 버튼 활성화가 따라오도록 구독한다. */
export const useTemporal = (): TemporalState<UndoSnapshot> => useStore(useAppStore.temporal);
