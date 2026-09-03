// U대형 레이아웃 (legacy/js/layouts/ushape-layout.js:4-42 이식)
import type { SeatLayout, SeatPosition } from './types';
import { chebyshevDistance } from './distance';

export const ushapeLayout: SeatLayout = {
  type: 'ushape',

  getSeatPositions(settings) {
    const { columns, rows } = settings;
    const positions: SeatPosition[] = [];
    let idx = 0;

    // 윗줄 (칠판쪽) - row 0
    // arcPos: U자 경로 위치 — 왼쪽 줄 가장 아래(rows)부터 시작해서 위로 올라가
    // 윗줄 좌→우, 다시 오른쪽 줄 위→아래까지 1차원 좌표.
    for (let c = 0; c < columns; c++) {
      positions.push({ index: idx++, row: 0, col: c, arcPos: rows + c });
    }

    // 왼쪽 줄 - col 0, row 1~rows (위→아래 순으로 idx 증가, arcPos는 아래일수록 작음)
    for (let r = 1; r <= rows; r++) {
      positions.push({ index: idx++, row: r, col: 0, arcPos: rows - r });
    }

    // 오른쪽 줄 - col columns-1, row 1~rows
    for (let r = 1; r <= rows; r++) {
      positions.push({ index: idx++, row: r, col: columns - 1, arcPos: rows + columns - 1 + r });
    }

    return positions;
  },

  getSeatCount(settings) {
    const { columns, rows } = settings;
    return columns + rows * 2;
  },

  // U자 경로상의 호 거리. 양쪽 끝 좌석은 호 길이만큼 떨어진 것으로 계산하여
  // 시각적으로 멀리 있는 학생을 가깝다고 오판하지 않음.
  distance(pos1: SeatPosition, pos2: SeatPosition): number {
    if (pos1.arcPos != null && pos2.arcPos != null) {
      return Math.abs(pos1.arcPos - pos2.arcPos);
    }
    return chebyshevDistance(pos1, pos2);
  },
};
