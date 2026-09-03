import { examLayout } from './exam';
import { pairLayout } from './pair';
import { ushapeLayout } from './ushape';
import { chebyshevDistance, manhattanDistance } from './distance';
import { createDefaultData } from '../model/defaults';
// 레거시 비교 기준
import { examLayout as legacyExam } from '../../../legacy/js/layouts/exam-layout.js';
import { pairLayout as legacyPair } from '../../../legacy/js/layouts/pair-layout.js';
import { ushapeLayout as legacyUshape } from '../../../legacy/js/layouts/ushape-layout.js';

const settings = { ...createDefaultData().layoutSettings, columns: 6, rows: 5 };
// 기본값 외 설정 (짝수 열)
const smallSettings = { ...createDefaultData().layoutSettings, columns: 4, rows: 3 };
// 기본값 외 설정 (홀수 열 — pair의 마지막 짝 그룹이 1명)
const oddSettings = { ...createDefaultData().layoutSettings, columns: 5, rows: 4 };

describe('distance', () => {
  it('manhattan/chebyshev', () => {
    const a = { index: 0, row: 0, col: 0 },
      b = { index: 0, row: 2, col: 3 };
    expect(manhattanDistance(a, b)).toBe(5);
    expect(chebyshevDistance(a, b)).toBe(3);
  });
});

describe.each([
  ['exam', examLayout, legacyExam],
  ['pair', pairLayout, legacyPair],
  ['ushape', ushapeLayout, legacyUshape],
] as const)('%s 배치 = 레거시', (_name, mine, legacy) => {
  describe.each([
    ['기본 6x5', settings],
    ['4x3', smallSettings],
    ['홀수 열 5x4', oddSettings],
  ] as const)('%s', (_label, s) => {
    it('좌석 수', () => expect(mine.getSeatCount(s)).toBe(legacy.getSeatCount(s)));
    it('좌표', () => expect(mine.getSeatPositions(s)).toEqual(legacy.getSeatPositions(s)));
    it('모든 쌍의 거리', () => {
      const ps = mine.getSeatPositions(s);
      for (const a of ps) for (const b of ps) expect(mine.distance(a, b)).toBe(legacy.distance(a, b));
    });
  });
});

describe('pair 거리 규칙', () => {
  it('짝꿍은 1, 옆 짝 그룹은 2', () => {
    const ps = pairLayout.getSeatPositions(settings);
    expect(pairLayout.distance(ps[0]!, ps[1]!)).toBe(1);
    expect(pairLayout.distance(ps[0]!, ps[2]!)).toBe(2);
  });
});

describe('ushape', () => {
  it('좌석 수 = columns + rows*2', () => expect(ushapeLayout.getSeatCount(settings)).toBe(16));
});
