// 레이아웃 추상 인터페이스
// 각 레이아웃은 { getSeatCount(), getSeatPositions(), render(container, assignment, options) } 를 구현

/**
 * @typedef {Object} SeatPosition
 * @property {number} index - 자리 번호 (0-based)
 * @property {number} row - 행 (0-based)
 * @property {number} col - 열 (0-based)
 */

/**
 * Manhattan distance (가로·세로 칸 수 합)
 * 대각선은 2칸으로 계산 — 가로/세로 분리만 강제할 때 사용
 */
export function manhattanDistance(pos1, pos2) {
  return Math.abs(pos1.row - pos2.row) + Math.abs(pos1.col - pos2.col);
}

/**
 * Chebyshev distance (king's move, 가로·세로·대각선 동일)
 * 인접 8방향 모두 거리 1 — 분리 규칙 기본 거리
 */
export function chebyshevDistance(pos1, pos2) {
  return Math.max(Math.abs(pos1.row - pos2.row), Math.abs(pos1.col - pos2.col));
}

export function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
