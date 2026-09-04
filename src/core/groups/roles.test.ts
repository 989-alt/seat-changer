import { assignRoles, pickGroupNames, DEFAULT_ROLES, GROUP_NAME_PRESETS } from './roles';
import { mulberry32 } from '@/core/randomizer/rng';

describe('DEFAULT_ROLES / GROUP_NAME_PRESETS', () => {
  it('기본 역할 네 가지', () => {
    expect(DEFAULT_ROLES).toEqual(['모둠장', '기록이', '발표자', '시간지기']);
  });
  it('이름 프리셋은 종류마다 12개 이상이고 중복이 없다', () => {
    for (const key of ['animal', 'color', 'planet', 'fruit'] as const) {
      const pool = GROUP_NAME_PRESETS[key];
      expect(pool.length).toBeGreaterThanOrEqual(12);
      expect(new Set(pool).size).toBe(pool.length);
    }
  });
});

describe('assignRoles', () => {
  const groups = [
    ['가람', '나린', '다솜', '라온'],
    ['마루', '바다', '사랑', '아라'],
  ];

  it('같은 시드면 결과가 같고, 다른 시드면 달라질 수 있다', () => {
    const a = assignRoles({ groups, roles: DEFAULT_ROLES, roleHistory: {}, rng: mulberry32(7) });
    const b = assignRoles({ groups, roles: DEFAULT_ROLES, roleHistory: {}, rng: mulberry32(7) });
    expect(a).toEqual(b);
    expect(Object.keys(a.byStudent).sort()).toEqual(groups.flat().sort());
    expect(a.relaxed).toBe(false);
  });

  it('모둠 안에서 역할이 겹치지 않는다', () => {
    const r = assignRoles({ groups, roles: DEFAULT_ROLES, roleHistory: {}, rng: mulberry32(3) });
    for (const g of groups) {
      const got = g.map((s) => r.byStudent[s]);
      expect(new Set(got).size).toBe(g.length);
    }
  });

  it('직전 역할과 같은 역할은 피한다', () => {
    const history: Record<string, string[]> = {
      가람: ['모둠장'],
      나린: ['기록이'],
      다솜: ['발표자'],
      라온: ['시간지기'],
    };
    for (let seed = 1; seed <= 20; seed++) {
      const r = assignRoles({
        groups: [groups[0]!],
        roles: DEFAULT_ROLES,
        roleHistory: history,
        rng: mulberry32(seed),
      });
      expect(r.relaxed).toBe(false);
      for (const [student, prev] of Object.entries(history)) {
        expect(r.byStudent[student]).not.toBe(prev[0]);
      }
    }
  });

  it('회피가 불가능하면 relaxed로 알리고 배정은 계속한다', () => {
    // 역할이 하나뿐이고 그 역할이 직전 역할이면 피할 방법이 없다.
    const r = assignRoles({
      groups: [['가람']],
      roles: ['모둠장'],
      roleHistory: { 가람: ['모둠장'] },
      rng: mulberry32(1),
    });
    expect(r.relaxed).toBe(true);
    expect(r.byStudent['가람']).toBe('모둠장');
  });

  it('모둠 인원이 역할 수보다 적으면 앞 역할부터 배정한다', () => {
    const r = assignRoles({
      groups: [['가람', '나린']],
      roles: DEFAULT_ROLES,
      roleHistory: {},
      rng: mulberry32(5),
    });
    expect(new Set(Object.values(r.byStudent))).toEqual(new Set(['모둠장', '기록이']));
  });

  it('인원이 역할보다 많으면 남는 학생은 역할이 없다', () => {
    const r = assignRoles({
      groups: [['가람', '나린', '다솜']],
      roles: ['모둠장', '기록이'],
      roleHistory: {},
      rng: mulberry32(9),
    });
    expect(Object.keys(r.byStudent).length).toBe(2);
  });

  it('역할이 없거나 모둠이 비면 빈 결과', () => {
    expect(assignRoles({ groups: [], roles: DEFAULT_ROLES, roleHistory: {} })).toEqual({
      byStudent: {},
      relaxed: false,
    });
    expect(assignRoles({ groups: [['가람']], roles: [], roleHistory: {} }).byStudent).toEqual({});
  });
});

describe('pickGroupNames', () => {
  it('같은 시드면 같은 결과, 중복 없이 뽑는다', () => {
    const pool = GROUP_NAME_PRESETS.animal;
    const a = pickGroupNames(5, pool, mulberry32(11));
    const b = pickGroupNames(5, pool, mulberry32(11));
    expect(a).toEqual(b);
    expect(a.length).toBe(5);
    expect(new Set(a).size).toBe(5);
    a.forEach((n) => expect(pool).toContain(n));
  });

  it('pool이 모자라면 순환한다', () => {
    const names = pickGroupNames(5, ['해', '달'], mulberry32(2));
    expect(names.length).toBe(5);
    expect(new Set(names.slice(0, 2)).size).toBe(2);
  });

  it('pool이 비었거나 count가 0 이하면 빈 배열', () => {
    expect(pickGroupNames(3, [])).toEqual([]);
    expect(pickGroupNames(0, ['해'])).toEqual([]);
  });
});
