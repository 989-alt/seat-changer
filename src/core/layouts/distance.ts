// legacy/js/layouts/layout-engine.js:15-25 이식
import type { SeatPosition } from './types';

/**
 * Manhattan distance (가로·세로 칸 수 합)
 * 대각선은 2칸으로 계산 — 가로/세로 분리만 강제할 때 사용
 */
export const manhattanDistance = (a: SeatPosition, b: SeatPosition): number =>
  Math.abs(a.row - b.row) + Math.abs(a.col - b.col);

/**
 * Chebyshev distance (king's move, 가로·세로·대각선 동일)
 * 인접 8방향 모두 거리 1 — 분리 규칙 기본 거리
 */
export const chebyshevDistance = (a: SeatPosition, b: SeatPosition): number =>
  Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
