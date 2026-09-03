import { examLayout } from './exam';
import { pairLayout } from './pair';
import { ushapeLayout } from './ushape';
import { chebyshevDistance, manhattanDistance } from './distance';
import type { SeatPosition } from './types';
import { createDefaultData } from '../model/defaults';
// 레거시 비교 기준
import { examLayout as legacyExam } from '../../../legacy/js/layouts/exam-layout.js';
import { pairLayout as legacyPair } from '../../../legacy/js/layouts/pair-layout.js';
import { ushapeLayout as legacyUshape } from '../../../legacy/js/layouts/ushape-layout.js';
import {
  chebyshevDistance as legacyChebyshev,
  manhattanDistance as legacyManhattan,
} from '../../../legacy/js/layouts/layout-engine.js';

const base = createDefaultData().layoutSettings;
const settings = { ...base, columns: 6, rows: 5 };
// 기본값 외 설정 (짝수 열)
const smallSettings = { ...base, columns: 4, rows: 3 };
// 기본값 외 설정 (홀수 열 — pair의 마지막 짝 그룹이 1명)
const oddSettings = { ...base, columns: 5, rows: 4 };
// 경계 설정 (schema의 MIN_GRID 1 ~ MAX_GRID 12)
const minSettings = { ...base, columns: 1, rows: 1 };
const oneColumnSettings = { ...base, columns: 1, rows: 12 };
const oneRowSettings = { ...base, columns: 12, rows: 1 };
const maxSettings = { ...base, columns: 12, rows: 12 };
// 비활성 좌석이 있는 설정
const disabledSettings = { ...base, columns: 6, rows: 5, disabledSeats: [0, 7, 29] };

describe('distance', () => {
  it('manhattan/chebyshev', () => {
    const a = { index: 0, row: 0, col: 0 },
      b = { index: 0, row: 2, col: 3 };
    expect(manhattanDistance(a, b)).toBe(5);
    expect(chebyshevDistance(a, b)).toBe(3);
  });

  it('레거시 layout-engine과 동일 (동일 좌표 포함)', () => {
    const ps: SeatPosition[] = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) ps.push({ index: r * 4 + c, row: r, col: c });
    for (const a of ps) {
      for (const b of ps) {
        expect(manhattanDistance(a, b)).toBe(legacyManhattan(a, b));
        expect(chebyshevDistance(a, b)).toBe(legacyChebyshev(a, b));
      }
    }
    const same = { index: 3, row: 1, col: 2 };
    expect(manhattanDistance(same, same)).toBe(0);
    expect(chebyshevDistance(same, same)).toBe(0);
  });
});

describe('SeatPosition', () => {
  it('레거시 group-layout 좌석 형태(groupIndex)를 그대로 받는다', () => {
    // 컴파일 타임 검사: 필드명이 바뀌면 typecheck가 깨진다.
    const p: SeatPosition = { index: 0, row: 2, col: 3, px: 10, py: 20, groupIndex: 1 };
    expect(p.groupIndex).toBe(1);
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
    ['최소 1x1', minSettings],
    ['1열 1x12', oneColumnSettings],
    ['1행 12x1', oneRowSettings],
    ['최대 12x12', maxSettings],
    ['비활성 좌석 6x5', disabledSettings],
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
