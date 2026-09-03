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
    { ...base, groupSizes: [4, 4, 3, 5] },
    { ...base, groupCount: 6, groupSize: 4 },
    { ...base, groupSizes: [], groupCount: 0, groupSize: 5 }, // cols*rows 폴백
    { ...base, groupSizes: [4, 4], groupPositions: [{ groupIndex: 1, x: 300, y: 40 }] },
    // 경계
    { ...base, groupSizes: [1] }, // 단일 모둠
    { ...base, groupSizes: [5, 3, 2] }, // 불균등
    { ...base, groupSizes: [0, 9, 12] }, // 클램프(1~8) + falsy 폴백
    { ...base, groupSizes: [8, 8, 8] }, // 최대 모둠 크기(4열 클러스터)
    { ...base, groupSizes: [], groupCount: 0, groupSize: 4, groupLayoutMode: 'manual' as const },
    { ...base, groupSizes: [], groupCount: 1, groupSize: 8 },
    { ...base, groupSizes: [], groupCount: 25, groupSize: 3 }, // groupCount 클램프(20)
    {
      ...base,
      groupSizes: [3, 3, 3],
      groupPositions: [
        { groupIndex: 0, x: 0, y: 0 },
        { groupIndex: 1, x: 250, y: 0 },
        { groupIndex: 2, x: 0, y: 210 },
      ],
    },
    { ...base, groupSizes: [], groupCount: 0, groupSize: 4, columns: 1, rows: 1 },
  ] satisfies LayoutSettings[];

  it.each(cases.map((c, i) => [i, c] as const))('case %i 좌표·수·거리', (_i, settings) => {
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
      for (const disabledSeats of [[], [0, 7]]) {
        const d = withSettings({ layoutType: 'group' });
        Object.assign(d.layoutSettings, patch, { disabledSeats });
        expect(getTotalSeats(d)).toBe(legacyTotal(d));
      }
    }
  });

  // --- 레거시 models.getTotalSeats와 의도적으로 다른 두 경로 ---
  // v2는 레거시 seat-grid.getTotalSeatsForLayout(= layout.getSeatCount)를 기준으로 삼는다.
  it('ushape: 레거시 models는 columns*rows지만 v2는 배치의 실제 좌석 수를 쓴다', () => {
    const d = withSettings({ layoutType: 'ushape' });
    d.layoutSettings.disabledSeats = [0, 7];
    const s = d.layoutSettings;
    // v2 = 레거시 ushape 배치의 좌석 수 - 비활성 좌석
    expect(getTotalSeats(d)).toBe(Math.max(0, legacyUshape.getSeatCount(s) - s.disabledSeats.length));
    // 레거시 models는 그리드(columns*rows) 기준이라 값이 다르다
    expect(legacyTotal(d)).toBe(Math.max(0, legacyExam.getSeatCount(s) - s.disabledSeats.length));
    expect(getTotalSeats(d)).not.toBe(legacyTotal(d));
    // pair는 두 기준이 같다
    const p = withSettings({ layoutType: 'pair' });
    expect(legacyPair.getSeatCount(p.layoutSettings)).toBe(legacyExam.getSeatCount(p.layoutSettings));
  });

  it('group groupPositions 폴백: 레거시 models만의 분기라 v2는 배치의 좌석 수를 쓴다', () => {
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
    const s = d.layoutSettings;
    expect(getTotalSeats(d)).toBe(legacyGroup.getSeatCount(s));
    expect(legacyTotal(d)).toBe(2 * 4);
    expect(getTotalSeats(d)).not.toBe(legacyTotal(d));
  });
});
