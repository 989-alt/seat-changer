// 모둠 역할 배정 순수 로직 (계약서 3-3). 레거시에는 없던 v2 신규 기능이다.
// React·zustand·브라우저 API를 쓰지 않는다.
import { shuffle, type Rng } from '../randomizer/rng';

/** 기본 역할 목록 */
export const DEFAULT_ROLES: string[] = ['모둠장', '기록이', '발표자', '시간지기'];

/** 모둠 이름 프리셋 (종류마다 12개 이상) */
export const GROUP_NAME_PRESETS: Record<'animal' | 'color' | 'planet' | 'fruit', string[]> = {
  animal: ['호랑이', '사자', '토끼', '거북이', '독수리', '돌고래', '판다', '여우', '늑대', '펭귄', '코알라', '기린', '수달', '다람쥐'],
  color: ['빨강', '주황', '노랑', '초록', '파랑', '남색', '보라', '하양', '검정', '분홍', '하늘', '연두', '자주', '갈색'],
  planet: ['수성', '금성', '지구', '화성', '목성', '토성', '천왕성', '해왕성', '태양', '달', '북극성', '혜성', '은하수', '오리온'],
  fruit: ['사과', '배', '포도', '수박', '참외', '딸기', '복숭아', '자두', '감', '귤', '바나나', '망고', '체리', '레몬'],
};

export interface RoleAssignInput {
  /** 모둠별 학생 이름 */
  groups: string[][];
  roles: string[];
  /** 학생 -> 최근 역할 (최신이 앞) */
  roleHistory: Record<string, string[]>;
  rng?: () => number;
}

export interface RoleAssignResult {
  /** 학생 -> 역할 (역할이 모자라면 없음) */
  byStudent: Record<string, string>;
  /** 직전 역할 회피에 실패해 중복을 허용했으면 true */
  relaxed: boolean;
}

/** 프로토타입 체인을 타지 않고 읽는다 */
function own<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

/** 학생의 직전 역할 (없으면 undefined) */
function prevRole(history: Record<string, string[]>, student: string): string | undefined {
  const list = own(history, student);
  return Array.isArray(list) ? list[0] : undefined;
}

/**
 * 역할 -> 학생 완전 매칭을 백트래킹으로 찾는다. 모둠 인원이 최대 여덟 명 남짓이라
 * 탐색 공간이 작다. 찾지 못하면 null.
 */
function matchRoles(
  roles: string[],
  students: string[],
  history: Record<string, string[]>
): Record<string, string> | null {
  const used = new Set<number>();
  const picked: string[] = [];

  const walk = (r: number): boolean => {
    if (r === roles.length) return true;
    const role = roles[r] as string;
    for (let i = 0; i < students.length; i++) {
      if (used.has(i)) continue;
      const student = students[i] as string;
      if (prevRole(history, student) === role) continue;
      used.add(i);
      picked[r] = student;
      if (walk(r + 1)) return true;
      used.delete(i);
    }
    return false;
  };

  if (!walk(0)) return null;
  const out: Record<string, string> = {};
  roles.forEach((role, r) => {
    out[picked[r] as string] = role;
  });
  return out;
}

/**
 * 모둠마다 역할을 하나씩 배정한다.
 * - 인원이 역할보다 적으면 앞 역할부터 쓰고 남는 역할은 비운다.
 * - 인원이 역할보다 많으면 남는 학생은 역할이 없다.
 * - 직전 역할과 같은 역할은 피하되, 불가능하면 중복을 허용하고 relaxed를 켠다.
 */
export function assignRoles(input: RoleAssignInput): RoleAssignResult {
  const rng: Rng = input.rng ?? Math.random;
  const byStudent: Record<string, string> = {};
  let relaxed = false;

  for (const group of input.groups) {
    const members = group.filter((s) => typeof s === 'string' && s.length > 0);
    if (members.length === 0 || input.roles.length === 0) continue;

    const activeRoles = input.roles.slice(0, Math.min(members.length, input.roles.length));
    const shuffled = shuffle([...members], rng);

    const matched = matchRoles(activeRoles, shuffled, input.roleHistory);
    if (matched) {
      Object.assign(byStudent, matched);
      continue;
    }

    // 회피 불가 - 직전 역할 제약을 풀고 순서대로 배정한다.
    relaxed = true;
    activeRoles.forEach((role, i) => {
      byStudent[shuffled[i] as string] = role;
    });
  }

  return { byStudent, relaxed };
}

/**
 * 모둠 이름을 count개 뽑는다. pool 안에서는 중복 없이 뽑고,
 * pool이 모자라면 다시 섞어 순환한다.
 */
export function pickGroupNames(count: number, pool: string[], rng?: () => number): string[] {
  const r: Rng = rng ?? Math.random;
  if (count <= 0 || pool.length === 0) return [];
  const out: string[] = [];
  while (out.length < count) {
    out.push(...shuffle([...pool], r));
  }
  return out.slice(0, count);
}
