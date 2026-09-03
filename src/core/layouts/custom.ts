// 자유배치: 책상 픽셀 좌표 기반 (legacy/js/layouts/custom-layout.js:1-12, 201-228 이식)
// DOM 편집기(_desks, 드래그, undo, render)는 계획 2에서 React 컴포넌트로 다시 만든다.
import type { SeatLayout, SeatPosition } from './types';

const DESK_W = 60;
const DESK_H = 40;
const GRID_SIZE = 20;
// 분리 규칙 거리 환산: 책상 폭 + 그리드 = 책상 1개 간격(픽셀)을 "1칸"으로 계산
const CELL_PX_W = DESK_W + GRID_SIZE; // 80
const CELL_PX_H = DESK_H + GRID_SIZE; // 60

export const customLayout: SeatLayout = {
  type: 'custom',

  getSeatPositions(settings): SeatPosition[] {
    const desks = settings.customDesks || [];
    // 픽셀 좌표를 그대로 보존하면서, 격자가 필요한 알고리즘(성별 체커보드 등)을 위해
    // 양자화된 row/col도 함께 제공
    return desks.map((d, i) => ({
      index: i,
      row: Math.round(d.y / CELL_PX_H),
      col: Math.round(d.x / CELL_PX_W),
      px: d.x,
      py: d.y,
    }));
  },

  getSeatCount(settings): number {
    return (settings.customDesks || []).length;
  },

  // 책상의 실제 픽셀 좌표로 chebyshev 거리 계산.
  // 1칸 = "책상 한 개 + 그리드 갭" 만큼 떨어진 거리.
  // 사선·자유 배치에서도 시각적 거리에 정확히 비례.
  distance(pos1, pos2): number {
    if (pos1.px != null && pos2.px != null) {
      const dx = Math.abs(pos1.px - pos2.px) / CELL_PX_W;
      const dy = Math.abs(pos1.py! - pos2.py!) / CELL_PX_H;
      return Math.round(Math.max(dx, dy));
    }
    return Math.max(Math.abs(pos1.row - pos2.row), Math.abs(pos1.col - pos2.col));
  },
};
