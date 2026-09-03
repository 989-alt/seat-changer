// 레거시 골든 테스트 (Phase 1 게이트)
// v2 randomizer(src/core/randomizer)가 레거시 v1(legacy/js/algorithm/seat-randomizer.js)과
// **같은 난수열에서 같은 좌석 배치**를 만드는지 확인한다.
//
// 동일성을 만들기 위한 장치는 세 가지다.
//   1. 난수 - v1은 `Math.random`을 직접 부른다. 전역 `Math.random`에 mulberry32(seed)를
//      꽂아 v1을 돌리고, v2에는 같은 시드로 새로 만든 rng를 주입한다.
//   2. 시간 - v1은 `Date.now()`로 데드라인을 잡는다. 가짜 타이머로 `Date`까지 고정하면
//      `setTimeout(0)`이 시계를 전혀 진행시키지 않으므로 데드라인에 걸리지 않는다.
//      v2에는 같은 뜻으로 `clock: () => 0`(2000ms 데드라인에 절대 도달하지 않음)을 준다.
//   3. UI 양보 - v1은 `setTimeout(0)`, v2는 즉시 resolve. 둘 다 난수를 쓰지 않는다.
//
// 실패하면 v2 이식이 레거시와 다른 것이다. 레거시는 고치지 않는다.
import { randomizeSeats } from './index';
import type { RandomizeResult } from './index';
import { mulberry32 } from './rng';
import type { Rng } from './rng';
import { createDefaultData } from '../model/defaults';
import { getTotalSeats, layouts } from '../layouts';
import type { ClassData, LayoutType } from '../model/types';
import { randomizeSeats as legacyRandomizeUntyped } from '../../../legacy/js/algorithm/seat-randomizer.js';

/** 레거시 반환값: 좌석->이름 맵(폴백이면 `_historyFallback`이 얹혀 온다) 또는 실패 시 null */
type LegacyResult = (Record<string, unknown> & { _historyFallback?: boolean }) | null;
const legacyRandomize = legacyRandomizeUntyped as unknown as (data: unknown) => Promise<LegacyResult>;

const SEEDS = [1, 2, 3];

/**
 * 같은 시드로 v1과 v2를 한 번씩 돌린다.
 * `Math.random`과 가짜 타이머는 반드시 finally에서 되돌린다(다른 테스트 오염 방지).
 */
async function both(data: ClassData, seed: number): Promise<{ v1: LegacyResult; v2: RandomizeResult }> {
  const origRandom = Math.random;
  let v1: LegacyResult;
  try {
    Math.random = mulberry32(seed);
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    try {
      const pending = legacyRandomize(structuredClone(data));
      await vi.runAllTimersAsync();
      v1 = await pending;
    } finally {
      vi.useRealTimers();
    }
  } finally {
    Math.random = origRandom;
  }

  const v2 = await randomizeSeats(structuredClone(data), {
    rng: mulberry32(seed),
    yieldToUI: async () => {},
    // 가짜 Date로 얼어붙은 레거시 시계와 같은 뜻 (데드라인 2000ms에 도달하지 않는다)
    clock: () => 0,
  });
  return { v1, v2 };
}

/** v1 맵과 v2 결과가 완전히 같은지 (폴백 여부까지) */
function expectSame(v1: LegacyResult, v2: RandomizeResult, where: string): void {
  if (v1 === null) {
    expect(v2.ok, `${where}: v1은 실패했는데 v2는 성공했다`).toBe(false);
    return;
  }
  const { _historyFallback, ...v1map } = v1;
  expect(v2.ok, `${where}: v1은 성공했는데 v2는 실패했다`).toBe(true);
  if (!v2.ok) return;
  expect(v2.mapping, `${where}: 좌석 배치가 다르다`).toEqual(v1map);
  expect(v2.historyFallback, `${where}: 이력 폴백 여부가 다르다`).toBe(Boolean(_historyFallback));
}

function scenario(layoutType: LayoutType, n: number, extra: (d: ClassData) => void = () => {}): ClassData {
  const d = createDefaultData();
  d.layoutType = layoutType;
  d.students = Array.from({ length: n }, (_, i) => `학생${i + 1}`);
  d.classSize = n;
  if (layoutType === 'custom')
    d.layoutSettings.customDesks = Array.from({ length: n + 2 }, (_, i) => ({
      x: (i % 6) * 80,
      y: Math.floor(i / 6) * 60,
    }));
  if (layoutType === 'group') d.layoutSettings.groupSizes = [4, 4, 4, 4, 4, 4];
  if (layoutType === 'ushape') {
    d.layoutSettings.columns = 8;
    d.layoutSettings.rows = 8;
  }
  extra(d);
  return d;
}

/** i번 학생을 i번 자리에 앉힌 이력 레코드 (앞에서 `shift`칸 밀어서 만들 수도 있다) */
function historyRecord(students: string[], shift = 0, timestamp = 1) {
  const mapping: Record<number, string> = {};
  students.forEach((s, i) => {
    mapping[i + shift] = s;
  });
  return { mapping, timestamp };
}

function alternateGenders(d: ClassData): void {
  d.students.forEach((s, i) => {
    d.studentGenders[s] = i % 2 ? 'F' : 'M';
  });
}

const scenarios: [string, ClassData][] = [
  // --- 브리프 6종 ---
  ['exam 기본', scenario('exam', 24)],
  [
    'pair 성별 mixed',
    scenario('pair', 24, (d) => {
      d.genderRule = 'mixed';
      alternateGenders(d);
    }),
  ],
  [
    'ushape 분리규칙',
    scenario('ushape', 20, (d) => {
      d.separationRules = [{ studentA: '학생1', studentB: '학생2', minDistance: 3 }];
    }),
  ],
  [
    'custom 고정',
    scenario('custom', 18, (d) => {
      d.fixedSeats = [{ studentName: '학생3', seatIndex: 0 }];
    }),
  ],
  [
    'group 이력 배제',
    scenario('group', 22, (d) => {
      d.assignmentHistory = [historyRecord(d.students)];
    }),
  ],
  [
    'exam 삭제 좌석',
    scenario('exam', 25, (d) => {
      d.layoutSettings.disabledSeats = [3, 4];
    }),
  ],

  // --- 확장 7종 ---
  [
    'exam 고정+분리 동시',
    scenario('exam', 24, (d) => {
      d.fixedSeats = [
        { studentName: '학생1', seatIndex: 0 },
        { studentName: '학생2', seatIndex: 29 },
      ];
      d.separationRules = [
        { studentA: '학생3', studentB: '학생4', minDistance: 2 },
        { studentA: '학생5', studentB: '학생6', minDistance: 3 },
        // 고정 자리 학생이 낀 규칙 (nameToSeat 초기값 경로)
        { studentA: '학생1', studentB: '학생7', minDistance: 2 },
      ];
    }),
  ],
  [
    'pair 성별 same 홀수',
    scenario('pair', 21, (d) => {
      d.genderRule = 'same';
      // 남 11 / 여 10 (홀수 인원, 성별 수도 불균형)
      d.students.forEach((s, i) => {
        d.studentGenders[s] = i < 11 ? 'M' : 'F';
      });
    }),
  ],
  [
    'exam 성별 mixedFirst 불균형',
    scenario('exam', 20, (d) => {
      d.genderRule = 'mixedFirst';
      d.students.forEach((s, i) => {
        d.studentGenders[s] = i < 13 ? 'M' : 'F';
      });
    }),
  ],
  [
    'group 수동 크기+모둠 좌표',
    scenario('group', 16, (d) => {
      d.layoutSettings.groupLayoutMode = 'manual';
      d.layoutSettings.groupSizes = [3, 5, 4, 6];
      d.layoutSettings.groupPositions = [
        { groupIndex: 0, x: 0, y: 0 },
        { groupIndex: 1, x: 300, y: 0 },
        { groupIndex: 2, x: 0, y: 250 },
        { groupIndex: 3, x: 300, y: 250 },
      ];
    }),
  ],
  [
    'exam 이력 2개 배제',
    scenario('exam', 20, (d) => {
      d.historyExcludeCount = 2;
      d.assignmentHistory = [historyRecord(d.students, 0, 1), historyRecord(d.students, 1, 2)];
    }),
  ],
  [
    'exam 소규모 3명 4석',
    scenario('exam', 3, (d) => {
      d.layoutSettings.columns = 2;
      d.layoutSettings.rows = 2;
    }),
  ],
  ['exam 좌석 정원 가득', scenario('exam', 30)],
];

describe('골든: v2 = v1 (시드 고정)', () => {
  it.each(scenarios)('%s', async (name, data) => {
    for (const seed of SEEDS) {
      const { v1, v2 } = await both(data, seed);
      // 시나리오가 양쪽 모두 실패해 비교가 무의미해지는 것을 막는다.
      expect(v1, `${name} seed ${seed}: 레거시가 배치에 실패했다 (픽스처가 불가능한 조건)`).not.toBeNull();
      expectSame(v1, v2, `${name} seed ${seed}`);

      // 배치가 실제로 전원을 서로 다른 자리에 앉혔는지 (빈 객체 비교로 통과하는 것 방지)
      if (v2.ok) {
        const seated = Object.values(v2.mapping);
        expect(seated, `${name} seed ${seed}: 학생 수와 배정 수가 다르다`).toHaveLength(data.students.length);
        expect(new Set(seated).size, `${name} seed ${seed}: 같은 학생이 두 자리에 앉았다`).toBe(
          data.students.length,
        );
      }
    }
  });

  it('비교가 무의미하지 않다: 다른 시드면 배치가 달라진다', async () => {
    const data = scenarios[0]![1];
    const a = await both(data, 1);
    const b = await both(data, 2);
    expect(a.v1).not.toBeNull();
    expect(b.v1).not.toBeNull();
    expect(a.v1).not.toEqual(b.v1);
    if (a.v2.ok && b.v2.ok) expect(a.v2.mapping).not.toEqual(b.v2.mapping);
  });
});

// -----------------------------------------------------------------------------
// 의도된 불일치 — Task 12에서 근거를 남기고 레거시와 다르게 만든 지점.
// 골든 테스트가 이것들을 "버그"로 잡지 않도록, 양쪽 동작을 모두 명시적으로 고정한다.
// -----------------------------------------------------------------------------
describe('의도된 불일치 (레거시와 다름을 고정)', () => {
  it('R59/R57: 정원 판정 기준이 다르다 (v1=좌석 배열 길이, v2=비활성 제외 좌석 수)', async () => {
    const d = scenario('exam', 4, (x) => {
      x.layoutSettings.columns = 2;
      x.layoutSettings.rows = 2;
      // 중복(1)과 범위 밖(99)이 섞인 비활성 좌석: v2는 유효한 1번만 뺀다
      x.layoutSettings.disabledSeats = [1, 1, 99];
    });

    // 기준값: 레거시 randomizeSeats는 positions.length(4)로, v2는 getTotalSeats(3)로 본다
    expect(layouts.exam.getSeatPositions(d.layoutSettings)).toHaveLength(4);
    expect(getTotalSeats(d)).toBe(3);

    const { v1, v2 } = await both(d, 1);
    // v1: 정원 검사를 통과한 뒤 3자리에 4명을 앉히려다 탐색에 실패해 null
    expect(v1).toBeNull();
    // v2: 정원 단계에서 즉시 거절 (탐색 자체를 하지 않는다)
    expect(v2.ok).toBe(false);
    if (!v2.ok) {
      expect(v2.reason).toBe('capacity');
      expect(v2.detail).toContain('좌석 3석');
    }
  });

  it('R70: 이력이 lastAssignment뿐이면 v1은 실패하고 v2는 폴백해 성공한다', async () => {
    const d = scenario('exam', 1, (x) => {
      x.layoutSettings.columns = 1;
      x.layoutSettings.rows = 1;
      x.lastAssignment = { mapping: { 0: '학생1' }, timestamp: 1 };
      x.assignmentHistory = [];
    });

    const { v1, v2 } = await both(d, 1);
    // v1: 폴백 조건이 assignmentHistory.length > 0뿐이라 이력 때문에 실패하고도 재시도하지 않는다
    expect(v1).toBeNull();
    // v2: lastAssignment도 이력으로 보고 폴백한다
    expect(v2.ok).toBe(true);
    if (v2.ok) {
      expect(v2.mapping).toEqual({ 0: '학생1' });
      expect(v2.historyFallback).toBe(true);
    }
  });

  it('R72: 빈 lastAssignment.mapping은 폴백을 켜지 않는다 (v1과 같은 결론)', async () => {
    // 좌석 2개가 서로 거리 1 - minDistance 1이면 어떤 배치도 불가능하다(이력과 무관).
    const base = (): ClassData =>
      scenario('exam', 2, (x) => {
        x.layoutSettings.columns = 2;
        x.layoutSettings.rows = 1;
        x.separationRules = [{ studentA: '학생1', studentB: '학생2', minDistance: 1 }];
      });

    /** v2를 한 번 돌리고 소비한 난수 개수를 센다 (폴백 2차 시도 여부를 관측하는 수단) */
    const rngCalls = async (d: ClassData): Promise<number> => {
      let calls = 0;
      const inner = mulberry32(1);
      const counting: Rng = () => {
        calls++;
        return inner();
      };
      const r = await randomizeSeats(structuredClone(d), {
        rng: counting,
        yieldToUI: async () => {},
        clock: () => 0,
      });
      expect(r.ok).toBe(false);
      return calls;
    };

    const noHistory = base();
    const emptyMapping = base();
    emptyMapping.lastAssignment = { mapping: {}, timestamp: 1 };
    const harmlessMapping = base();
    // 이 반과 무관한 좌석/학생이라 1차 탐색 경로는 이력 없는 경우와 완전히 같다.
    harmlessMapping.lastAssignment = { mapping: { 5: '학생9' }, timestamp: 1 };

    for (const d of [noHistory, emptyMapping, harmlessMapping]) {
      const { v1, v2 } = await both(d, 1);
      expect(v1).toBeNull();
      expect(v2.ok).toBe(false);
    }

    const cNone = await rngCalls(noHistory);
    const cEmpty = await rngCalls(emptyMapping);
    const cHarmless = await rngCalls(harmlessMapping);
    // 빈 매핑은 이력이 아니다: 이력이 아예 없을 때와 난수 소비가 같다(2차 시도 없음)
    expect(cEmpty).toBe(cNone);
    // 비어 있지 않은 매핑은 폴백을 켠다: 2차 시도만큼 난수를 더 쓴다
    expect(cHarmless).toBeGreaterThan(cNone);
  });

  it('실패 표현이 다르다: v1은 null, v2는 {ok:false, reason, detail}', async () => {
    const d = scenario('exam', 2, (x) => {
      x.layoutSettings.columns = 2;
      x.layoutSettings.rows = 1;
      x.separationRules = [{ studentA: '학생1', studentB: '학생2', minDistance: 1 }];
    });
    const { v1, v2 } = await both(d, 1);
    expect(v1).toBeNull();
    expect(v2.ok).toBe(false);
    if (!v2.ok) {
      expect(v2.reason).toBe('constraints');
      expect(v2.detail).not.toBe('');
    }
  });
});
