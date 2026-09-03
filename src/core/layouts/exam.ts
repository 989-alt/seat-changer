// 시험대형: 개별 책상 그리드 (legacy/js/layouts/exam-layout.js:4-23 이식)
import type { SeatLayout, SeatPosition } from './types';
import { chebyshevDistance } from './distance';

export function gridPositions(columns: number, rows: number): SeatPosition[] {
  const out: SeatPosition[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < columns; c++) out.push({ index: r * columns + c, row: r, col: c });
  return out;
}

export const examLayout: SeatLayout = {
  type: 'exam',
  getSeatPositions: (s) => gridPositions(s.columns, s.rows),
  getSeatCount: (s) => s.columns * s.rows,
  // 가로·세로·대각선 모두 동일하게 1칸 (king's move)
  distance: chebyshevDistance,
};
