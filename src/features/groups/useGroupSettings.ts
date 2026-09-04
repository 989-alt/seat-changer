// 모둠 이름·역할 설정 보관용 독립 스토어.
// ClassData 스키마에는 이 정보를 담을 자리가 없으므로 스키마를 건드리지 않고
// 반마다 별도 localStorage 키에 저장한다. v1 키(seat-changer-data-*, -classes,
// -active)는 건드리지 않는다.
import { create } from 'zustand';
import { DEFAULT_ROLES, GROUP_NAME_PRESETS } from '@/core/groups/roles';

export type PresetKey = keyof typeof GROUP_NAME_PRESETS;
export type NameSource = PresetKey | 'custom';

export interface GroupSettings {
  /** 이름을 어디서 가져왔는지 */
  nameSource: NameSource;
  /** 모둠 순서대로의 이름 */
  names: string[];
  roles: string[];
  /** 학생 -> 최근 역할 (최신이 앞, 최대 5개) */
  roleHistory: Record<string, string[]>;
}

const MAX_ROLE_HISTORY = 5;

export const groupSettingsKey = (className: string) => `seat-changer-groups-${className}`;

export function createDefaultGroupSettings(): GroupSettings {
  return { nameSource: 'custom', names: [], roles: [...DEFAULT_ROLES], roleHistory: {} };
}

/** 저장 값은 사람이 손댈 수 있으므로 모양을 확인하고 아니면 기본값으로 돌린다. */
export function parseGroupSettings(raw: string | null): GroupSettings {
  const base = createDefaultGroupSettings();
  if (!raw) return base;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return base;
    const o = parsed as Partial<GroupSettings>;
    const names = Array.isArray(o.names) ? o.names.filter((n) => typeof n === 'string') : base.names;
    const roles = Array.isArray(o.roles) ? o.roles.filter((n) => typeof n === 'string') : base.roles;
    const source: NameSource =
      o.nameSource === 'custom' || (typeof o.nameSource === 'string' && o.nameSource in GROUP_NAME_PRESETS)
        ? (o.nameSource as NameSource)
        : base.nameSource;
    const history: Record<string, string[]> = {};
    if (o.roleHistory && typeof o.roleHistory === 'object') {
      for (const [student, list] of Object.entries(o.roleHistory)) {
        if (Array.isArray(list)) {
          history[student] = list.filter((r) => typeof r === 'string').slice(0, MAX_ROLE_HISTORY);
        }
      }
    }
    return { nameSource: source, names, roles, roleHistory: history };
  } catch {
    return base;
  }
}

function read(className: string): GroupSettings {
  try {
    return parseGroupSettings(localStorage.getItem(groupSettingsKey(className)));
  } catch {
    return createDefaultGroupSettings();
  }
}

function write(className: string, settings: GroupSettings): void {
  try {
    localStorage.setItem(groupSettingsKey(className), JSON.stringify(settings));
  } catch {
    // 저장 공간이 없으면 이번 세션에서만 유지한다.
  }
}

export interface GroupSettingsState {
  className: string;
  settings: GroupSettings;
  /** 반이 바뀌면 그 반의 저장 값을 읽어 온다 */
  load(className: string): void;
  setNameSource(source: NameSource): void;
  setNames(names: string[]): void;
  setRoles(roles: string[]): void;
  /** 배정 결과를 이력에 쌓는다 (학생마다 최근 5개) */
  recordRoles(byStudent: Record<string, string>): void;
}

export const useGroupSettings = create<GroupSettingsState>((set, get) => {
  const apply = (next: Partial<GroupSettings>) => {
    const merged = { ...get().settings, ...next };
    set({ settings: merged });
    write(get().className, merged);
  };
  return {
    className: '',
    settings: createDefaultGroupSettings(),
    load: (className) => {
      if (get().className === className) return;
      set({ className, settings: read(className) });
    },
    setNameSource: (nameSource) => apply({ nameSource }),
    setNames: (names) => apply({ names }),
    setRoles: (roles) => apply({ roles }),
    recordRoles: (byStudent) => {
      const history = { ...get().settings.roleHistory };
      for (const [student, role] of Object.entries(byStudent)) {
        const prev = Object.hasOwn(history, student) ? (history[student] ?? []) : [];
        history[student] = [role, ...prev].slice(0, MAX_ROLE_HISTORY);
      }
      apply({ roleHistory: history });
    },
  };
});
