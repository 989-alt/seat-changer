import { customLayout } from './custom';
import { groupLayout } from './group';
import { getLayout, getTotalSeats } from './index';
import { createDefaultData } from '../model/defaults';
import type { ClassData, LayoutSettings } from '../model/types';
// 레거시 비교 기준
import { customLayout as legacyCustom } from '../../../legacy/js/layouts/custom-layout.js';
import { groupLayout as legacyGroup } from '../../../legacy/js/layouts/group-layout.js';
import { examLayout as legacyExam } from '../../../legacy/js/layouts/exam-layout.js';
import { pairLayout as legacyPair } from '../../../legacy/js/layouts/pair-layout.js';
import { ushapeLayout as legacyUshape } from '../../../legacy/js/layouts/ushape-layout.js';
import { getTotalSeats as legacyTotal } from '../../../legacy/js/data/models.js';

const base = createDefaultData().layoutSettings;

const desks = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ x: (i % 13) * 20, y: Math.floor(i / 13) * 20 }));

describe('custom = 레거시', () => {
  const cases = [
    ['브리핑 4개', { ...base, customDesks: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 200, y: 130 }, { x: 45, y: 300 }] }],
    ['0개', { ...base, customDesks: [] }],
    ['1개', { ...base, customDesks: [{ x: 37, y: 91 }] }],
    ['좌표 중복', { ...base, customDesks: [{ x: 40, y: 40 }, { x: 40, y: 40 }, { x: 40, y: 41 }] }],
    ['음수·소수 좌표', { ...base, customDesks: [{ x: -20, y: -60 }, { x: 39.5, y: 30.5 }, { x: 0, y: 0 }] }],
  ] as const satisfies readonly (readonly [string, LayoutSettings])[];

  describe.each(cases)('%s', (_label, settings) => {
    it('좌석 수', () => expect(customLayout.getSeatCount(settings)).toBe(legacyCustom.getSeatCount(settings)));
    it('좌표(px 보존, row/col 양자화)', () =>
      expect(customLayout.getSeatPositions(settings)).toEqual(legacyCustom.getSeatPositions(settings)));
    it('모든 쌍의 거리', () => {
      const ps = customLayout.getSeatPositions(settings);
      for (const a of ps) for (const b of ps) expect(customLayout.distance(a, b)).toBe(legacyCustom.distance(a, b));
    });
  });

  describe('200개', () => {
    const settings = { ...base, customDesks: desks(200) };
    it('좌석 수·좌표', () => {
      expect(customLayout.getSeatCount(settings)).toBe(legacyCustom.getSeatCount(settings));
      expect(customLayout.getSeatPositions(settings)).toEqual(legacyCustom.getSeatPositions(settings));
    });
    it('거리 행렬', () => {
      const ps = customLayout.getSeatPositions(settings);
      const lps = legacyCustom.getSeatPositions(settings);
      expect(ps.map((a) => ps.map((b) => customLayout.distance(a, b)))).toEqual(
        lps.map((a: unknown) => lps.map((b: unknown) => legacyCustom.distance(a, b))),
      );
    });
  });

  it('px가 없으면 row/col 체비쇼프 폴백', () => {
    const a = { index: 0, row: 0, col: 0 };
    const b = { index: 1, row: 2, col: 3 };
    expect(customLayout.distance(a, b)).toBe(legacyCustom.distance(a, b));
  });

  it('type', () => expect(customLayout.type).toBe('custom'));
});

describe('group = 레거시', () => {
  const cases = [
    ['groupSizes [4,4,3,5]', { ...base, groupSizes: [4, 4, 3, 5] }],
    ['groupCount 6 x groupSize 4', { ...base, groupCount: 6, groupSize: 4 }],
    ['cols*rows 폴백 (groupSizes·groupCount 없음)', { ...base, groupSizes: [], groupCount: 0, groupSize: 5 }],
    ['groupPositions 일부 저장', { ...base, groupSizes: [4, 4], groupPositions: [{ groupIndex: 1, x: 300, y: 40 }] }],
    ['단일 모둠 [1]', { ...base, groupSizes: [1] }],
    ['불균등 [5,3,2]', { ...base, groupSizes: [5, 3, 2] }],
    ['클램프(1~8) + falsy 폴백 [0,9,12]', { ...base, groupSizes: [0, 9, 12] }],
    ['최대 모둠 크기 [8,8,8] (4열 클러스터)', { ...base, groupSizes: [8, 8, 8] }],
    ['manual 모드 + 폴백', { ...base, groupSizes: [], groupCount: 0, groupSize: 4, groupLayoutMode: 'manual' as const }],
    ['groupCount 1 x groupSize 8', { ...base, groupSizes: [], groupCount: 1, groupSize: 8 }],
    ['groupCount 클램프(20)', { ...base, groupSizes: [], groupCount: 25, groupSize: 3 }],
    ['groupSizes 슬라이스(20)', { ...base, groupSizes: Array.from({ length: 21 }, () => 2) }],
    [
      'groupPositions 전 모둠 저장',
      {
        ...base,
        groupSizes: [3, 3, 3],
        groupPositions: [
          { groupIndex: 0, x: 0, y: 0 },
          { groupIndex: 1, x: 250, y: 0 },
          { groupIndex: 2, x: 0, y: 210 },
        ],
      },
    ],
    ['1x1 그리드 폴백', { ...base, groupSizes: [], groupCount: 0, groupSize: 4, columns: 1, rows: 1 }],
  ] as const satisfies readonly (readonly [string, LayoutSettings])[];

  it.each(cases)('%s — 좌표·수·거리', (_label, settings) => {
    expect(groupLayout.getGroupSizes(settings)).toEqual(legacyGroup.getGroupSizes(settings));
    expect(groupLayout.getSeatCount(settings)).toBe(legacyGroup.getSeatCount(settings));
    const mine = groupLayout.getSeatPositions(settings);
    const theirs = legacyGroup.getSeatPositions(settings);
    expect(mine).toEqual(theirs);
    for (const a of mine) for (const b of mine) expect(groupLayout.distance(a, b)).toBe(legacyGroup.distance(a, b));
  });

  it('px가 없으면 체비쇼프 폴백', () => {
    const a = { index: 0, row: 1, col: 1 };
    const b = { index: 1, row: 4, col: 2 };
    expect(groupLayout.distance(a, b)).toBe(legacyGroup.distance(a, b));
  });

  it('getGroupStartIndex = 레거시 누적합', () => {
    const sizes = groupLayout.getGroupSizes({ ...base, groupSizes: [4, 3, 5] });
    // 레거시 getSeatPositions가 만든 각 모둠의 첫 좌석 index와 일치해야 한다
    const ps = legacyGroup.getSeatPositions({ ...base, groupSizes: [4, 3, 5] });
    for (let g = 0; g < sizes.length; g++) {
      const first = ps.find((p: { groupIndex: number }) => p.groupIndex === g);
      expect(groupLayout.getGroupStartIndex(g, sizes)).toBe(first!.index);
    }
    expect(groupLayout.getGroupStartIndex(0, sizes)).toBe(0);
    expect(groupLayout.getGroupStartIndex(sizes.length, sizes)).toBe(12);
  });

  it('calcAutoPositions = 레거시 자동 배치 좌표', () => {
    const settings = { ...base, groupSizes: [4, 4, 3, 5] };
    const sizes = groupLayout.getGroupSizes(settings);
    const auto = groupLayout.calcAutoPositions(sizes);
    // 저장된 위치가 없으면 레거시 좌석의 각 모둠 첫 좌석 px/py = 자동 좌표
    const ps = legacyGroup.getSeatPositions(settings);
    expect(auto).toHaveLength(sizes.length);
    for (const p of auto) {
      const first = ps.find((q: { groupIndex: number }) => q.groupIndex === p.groupIndex);
      expect([p.x, p.y]).toEqual([first!.px, first!.py]);
    }
  });

  it('type', () => expect(groupLayout.type).toBe('group'));
});

describe('registry', () => {
  it('getLayout', () => {
    expect(getLayout('ushape').type).toBe('ushape');
    expect(getLayout('exam').type).toBe('exam');
    expect(getLayout('pair').type).toBe('pair');
    expect(getLayout('custom').type).toBe('custom');
    expect(getLayout('group').type).toBe('group');
  });

  it('getTotalSeats = 레거시 (disabledSeats 차감)', () => {
    const d = createDefaultData();
    d.layoutSettings.disabledSeats = [0, 7];
    expect(getTotalSeats(d)).toBe(legacyTotal(d));
    d.layoutType = 'custom';
    d.layoutSettings.customDesks = [{ x: 0, y: 0 }, { x: 80, y: 0 }];
    expect(getTotalSeats(d)).toBe(legacyTotal(d));
    d.layoutType = 'group';
    d.layoutSettings.groupSizes = [3, 3];
    // 좌석이 6개뿐이라 인덱스 7은 존재하지 않는다. v2는 실재하는 비활성 좌석만 빼므로
    // 레거시와 값을 맞추려면 범위 안의 인덱스를 쓴다(범위 밖 동작은 아래 divergence 4에서 고정).
    d.layoutSettings.disabledSeats = [0, 5];
    expect(getTotalSeats(d)).toBe(legacyTotal(d));
  });

  const withSettings = (patch: Partial<ClassData>): ClassData => ({ ...createDefaultData(), ...patch });

  it('exam·pair는 disabledSeats 유무와 무관하게 레거시와 동일', () => {
    for (const layoutType of ['exam', 'pair'] as const) {
      for (const disabledSeats of [[], [0, 7], [0, 1, 2, 3, 4]]) {
        const d = withSettings({ layoutType });
        d.layoutSettings.disabledSeats = disabledSeats;
        expect(getTotalSeats(d)).toBe(legacyTotal(d));
      }
    }
  });

  it('custom은 disabledSeats를 차감하지 않는다 (레거시와 동일)', () => {
    for (const disabledSeats of [[], [0, 1]]) {
      const d = withSettings({ layoutType: 'custom' });
      d.layoutSettings.customDesks = desks(7);
      d.layoutSettings.disabledSeats = disabledSeats;
      expect(getTotalSeats(d)).toBe(legacyTotal(d));
      expect(getTotalSeats(d)).toBe(7);
    }
  });

  it('group은 groupSizes·groupCount 경로에서 레거시와 동일', () => {
    const patches: Partial<LayoutSettings>[] = [
      { groupSizes: [3, 3] },
      { groupSizes: [4, 4, 3, 5] },
      { groupSizes: [0, 9, 12] },
      { groupSizes: [], groupCount: 6, groupSize: 4 },
      { groupSizes: [], groupCount: 0, groupSize: 5 }, // cols*rows 폴백
    ];
    for (const patch of patches) {
      // 모든 패치의 좌석 수가 6개 이상이라 [0, 1]은 항상 범위 안이다.
      for (const disabledSeats of [[], [0, 1]]) {
        const d = withSettings({ layoutType: 'group' });
        Object.assign(d.layoutSettings, patch, { disabledSeats });
        expect(getTotalSeats(d)).toBe(legacyTotal(d));
      }
    }
  });

  // --- 레거시 models.getTotalSeats와 의도적으로 다른 네 경로 (R57, R58, R59) ---
  // v2는 레거시 seat-grid.getTotalSeatsForLayout(= layout.getSeatCount)를 기준으로 삼는다.

  // divergence 1 — ushape
  it('ushape: 레거시 models는 columns*rows(30)지만 v2는 배치의 실제 좌석 수(16)를 쓴다', () => {
    // 6x5, 비활성 없음: 레거시 30 / v2 = columns + rows*2 = 16
    const none = withSettings({ layoutType: 'ushape' });
    none.layoutSettings.disabledSeats = [];
    expect(legacyTotal(none)).toBe(30);
    expect(getTotalSeats(none)).toBe(16);
    expect(getTotalSeats(none)).not.toBe(legacyTotal(none));

    // 6x5, 비활성 [0, 7](둘 다 범위 안): 레거시 28 / v2 14
    const d = withSettings({ layoutType: 'ushape' });
    d.layoutSettings.disabledSeats = [0, 7];
    expect(legacyTotal(d)).toBe(28);
    expect(getTotalSeats(d)).toBe(14);
    expect(getTotalSeats(d)).not.toBe(legacyTotal(d));

    // 기준 확인: 레거시 배치 모듈의 좌석 수와 일치한다
    expect(legacyUshape.getSeatCount(d.layoutSettings)).toBe(16);
    expect(legacyExam.getSeatCount(d.layoutSettings)).toBe(30);
    // pair는 두 기준이 같아 divergence가 없다
    const p = withSettings({ layoutType: 'pair' });
    expect(legacyPair.getSeatCount(p.layoutSettings)).toBe(legacyExam.getSeatCount(p.layoutSettings));
  });

  // divergence 2 — group의 groupPositions 폴백
  it('group groupPositions 폴백: 레거시 models만의 분기(8)라 v2는 배치의 좌석 수(32)를 쓴다', () => {
    const d = withSettings({ layoutType: 'group' });
    Object.assign(d.layoutSettings, {
      groupSizes: [],
      groupCount: 0,
      groupSize: 4,
      groupPositions: [
        { groupIndex: 0, x: 0, y: 0 },
        { groupIndex: 1, x: 250, y: 0 },
      ],
      disabledSeats: [],
    });
    expect(legacyTotal(d)).toBe(2 * 4); // groupPositions.length * fallbackSize
    expect(getTotalSeats(d)).toBe(32); // ceil(30/4)=8 모둠 x 4명
    expect(getTotalSeats(d)).toBe(legacyGroup.getSeatCount(d.layoutSettings));
    expect(getTotalSeats(d)).not.toBe(legacyTotal(d));
  });

  // divergence 3 — 모둠 수 상한(20)
  // 레거시 models(models.js:73-74)는 groupCount * fallback을 상한 없이 곱하고,
  // groupSizes도 자르지 않고 전부 더한다. 이식한 group-layout은 groupCount를 20으로 클램프하고
  // groupSizes를 slice(0, 20)한다.
  // ClassDataSchema가 groupCount .max(20), groupSizes .max(20)로 막으므로
  // 검증을 통과한 데이터는 이 경로에 도달하지 않는다(스키마상 도달 불가).
  it('모둠 수 20 상한: groupCount 25 — 레거시 75 vs v2 60', () => {
    const d = withSettings({ layoutType: 'group' });
    Object.assign(d.layoutSettings, { groupSizes: [], groupCount: 25, groupSize: 3, disabledSeats: [] });
    expect(legacyTotal(d)).toBe(75); // 25 * 3, 상한 없음
    expect(getTotalSeats(d)).toBe(60); // min(20, 25) * 3
    expect(getTotalSeats(d)).not.toBe(legacyTotal(d));
  });

  it('모둠 수 20 상한: groupSizes 21개 — 레거시 42 vs v2 40', () => {
    const d = withSettings({ layoutType: 'group' });
    Object.assign(d.layoutSettings, {
      groupSizes: Array.from({ length: 21 }, () => 2),
      groupCount: 0,
      disabledSeats: [],
    });
    expect(legacyTotal(d)).toBe(42); // 21 * 2, slice 없음
    expect(getTotalSeats(d)).toBe(40); // slice(0, 20) * 2
    expect(getTotalSeats(d)).not.toBe(legacyTotal(d));
  });

  // divergence 4 — 비활성 좌석의 범위 밖·중복 인덱스
  // 스키마는 disabledSeats에 0~999를 허용할 뿐 좌석 수와 대조하지도, 중복을 막지도 않는다.
  // 레거시 models는 배열 길이를 그대로 빼서 좌석 수가 실제보다 작아진다.
  it('비활성 좌석: 범위 밖 인덱스는 빼지 않는다 (레거시는 뺀다)', () => {
    const d = withSettings({ layoutType: 'exam' });
    Object.assign(d.layoutSettings, { columns: 1, rows: 1, disabledSeats: [999] });
    expect(getTotalSeats(d)).toBe(1); // 좌석 0번만 존재 — 999는 무시
    expect(legacyTotal(d)).toBe(0); // 길이 1을 그대로 차감
    expect(getTotalSeats(d)).not.toBe(legacyTotal(d));
  });

  it('비활성 좌석: 중복 인덱스는 한 번만 뺀다 (레거시는 두 번 뺀다)', () => {
    const d = withSettings({ layoutType: 'exam' });
    Object.assign(d.layoutSettings, { columns: 3, rows: 1, disabledSeats: [0, 0] });
    expect(getTotalSeats(d)).toBe(2); // 좌석 3개 - 비활성 {0} 1개
    expect(legacyTotal(d)).toBe(1); // 3 - 2
    expect(getTotalSeats(d)).not.toBe(legacyTotal(d));
  });

  it('비활성 좌석: 정상 입력은 레거시와 동일', () => {
    const d = withSettings({ layoutType: 'exam' });
    d.layoutSettings.disabledSeats = [0, 7];
    expect(getTotalSeats(d)).toBe(28);
    expect(getTotalSeats(d)).toBe(legacyTotal(d));
  });
});
