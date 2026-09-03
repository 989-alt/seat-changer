// 짝대형: 2인 1조 그리드 (legacy/js/layouts/pair-layout.js:4-29 이식)
import type { SeatLayout, SeatPosition } from './types';

export const pairLayout: SeatLayout = {
  type: 'pair',

  getSeatPositions(settings) {
    const { columns, rows } = settings;
    const positions: SeatPosition[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        // pairCol: 짝꿍 묶음 단위 가로 인덱스 (책상 그룹 시각화 반영)
        positions.push({ index: r * columns + c, row: r, col: c, pairCol: Math.floor(c / 2) });
      }
    }
    return positions;
  },

  getSeatCount(settings) {
    return settings.columns * settings.rows;
  },

  // 짝꿍 두 좌석은 시각적으로 한 책상에 붙어 앉음 → 거리 1.
  // 다른 짝 그룹과는 그룹 단위 chebyshev에 +1 (그룹 사이의 시각적 갭 반영).
  distance(pos1: SeatPosition, pos2: SeatPosition): number {
    const samePair = pos1.row === pos2.row && pos1.pairCol === pos2.pairCol;
    if (samePair) return 1;
    const dr = Math.abs(pos1.row - pos2.row);
    const dpc = Math.abs((pos1.pairCol ?? Math.floor(pos1.col / 2)) - (pos2.pairCol ?? Math.floor(pos2.col / 2)));
    return Math.max(dr, dpc) + 1;
  },
};
