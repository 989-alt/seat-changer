// 모둠대형: N명씩 클러스터 배치 (legacy/js/layouts/group-layout.js:1-130 이식)
// render·enableGroupDrag(DOM)은 계획 2에서 React 컴포넌트로 다시 만든다.
import type { GroupPosition, LayoutSettings } from '../model/types';
import type { SeatLayout, SeatPosition } from './types';
import { chebyshevDistance } from './distance';

// 분리 규칙 거리 환산용 (좌석 1개 = 64x48 + 4 갭)
const SEAT_PX_W = 68;
const SEAT_PX_H = 52;

function getClusterDims(groupSize: number): { cols: number; rows: number } {
  if (groupSize <= 4) return { cols: 2, rows: Math.ceil(groupSize / 2) };
  if (groupSize <= 6) return { cols: 3, rows: Math.ceil(groupSize / 3) };
  return { cols: 4, rows: Math.ceil(groupSize / 4) };
}

// settings.groupSizes (배열)가 있으면 사용, 없으면 groupCount/groupSize에서 만든다.
function getGroupSizes(settings: LayoutSettings): number[] {
  const fallbackSize = Math.max(2, Math.min(8, settings.groupSize || 4));
  if (Array.isArray(settings.groupSizes) && settings.groupSizes.length > 0) {
    return settings.groupSizes
      .map((n) => Math.max(1, Math.min(8, parseInt(String(n)) || fallbackSize)))
      .slice(0, 20);
  }
  // groupCount가 명시되었으면 해당 수만큼 균등
  if (settings.groupCount && settings.groupCount > 0) {
    const c = Math.max(1, Math.min(20, parseInt(String(settings.groupCount))));
    return Array.from({ length: c }, () => fallbackSize);
  }
  // 마지막 폴백: 기존처럼 cols*rows ÷ groupSize
  const cols = settings.columns || 6;
  const rows = settings.rows || 5;
  const total = cols * rows;
  const count = Math.ceil(total / fallbackSize);
  return Array.from({ length: count }, () => fallbackSize);
}

// 모둠 시작 좌석 인덱스 (가변 크기 모둠 배열 누적합)
function getGroupStartIndex(groupIndex: number, sizes: number[]): number {
  let s = 0;
  for (let i = 0; i < groupIndex; i++) s += sizes[i] || 0;
  return s;
}

// 자동 배치 좌표 계산 (가장 큰 모둠 크기 기준 블록 폭/높이로 균일 그리드)
function calcAutoPositions(sizes: number[]): GroupPosition[] {
  const maxSize = sizes.reduce((a, b) => Math.max(a, b), 1);
  const { cols: cCols, rows: cRows } = getClusterDims(maxSize);
  const seatW = 64,
    seatH = 48,
    seatGap = 4;
  const blockW = cCols * (seatW + seatGap) + 12;
  const blockH = cRows * (seatH + seatGap) + 24;
  const gap = 24;

  const groupCount = sizes.length;
  const gridCols = Math.ceil(Math.sqrt(groupCount));
  const positions: GroupPosition[] = [];
  for (let g = 0; g < groupCount; g++) {
    positions.push({
      groupIndex: g,
      x: 10 + (g % gridCols) * (blockW + gap),
      y: 10 + Math.floor(g / gridCols) * (blockH + gap),
    });
  }
  return positions;
}

export const groupLayout: SeatLayout & {
  getGroupSizes(settings: LayoutSettings): number[];
  getGroupStartIndex(groupIndex: number, sizes: number[]): number;
  calcAutoPositions(sizes: number[]): GroupPosition[];
} = {
  type: 'group',

  getSeatPositions(settings): SeatPosition[] {
    const sizes = getGroupSizes(settings);
    const totalSeats = sizes.reduce((a, b) => a + b, 0);
    const maxSize = sizes.reduce((a, b) => Math.max(a, b), 1);
    const { cols: cCols, rows: cRows } = getClusterDims(maxSize);

    const saved = settings.groupPositions || [];
    const auto = calcAutoPositions(sizes);
    const positions: SeatPosition[] = [];

    // 모둠 간 충분한 간격을 둔 그리드 좌표 + 실제 픽셀 좌표 보존
    for (let g = 0; g < sizes.length; g++) {
      const gp: { x: number; y: number } = saved.find((p) => p.groupIndex === g) || auto[g] || { x: 0, y: 0 };
      const seatW = 64,
        seatH = 48,
        seatGap = 4;
      const blockW = cCols * (seatW + seatGap) + 36;
      const blockH = cRows * (seatH + seatGap) + 36;
      // 격자 행/열 (성별 알고리즘 등 격자 기반 로직용)
      const baseRow = Math.round(gp.y / blockH) * (cRows + 1);
      const baseCol = Math.round(gp.x / blockW) * (cCols + 1);
      const groupStart = getGroupStartIndex(g, sizes);
      const gSize = sizes[g]!;
      for (let s = 0; s < gSize; s++) {
        const idx = groupStart + s;
        if (idx >= totalSeats) break;
        const r = Math.floor(s / cCols);
        const c = s % cCols;
        // 픽셀 좌표: 모둠 픽셀 위치 + 클러스터 내부 좌석 오프셋
        const px = gp.x + c * (seatW + seatGap);
        const py = gp.y + r * (seatH + seatGap);
        positions.push({
          index: idx,
          row: baseRow + r,
          col: baseCol + c,
          px,
          py,
          groupIndex: g,
        });
      }
    }
    return positions;
  },

  // 좌석의 실제 픽셀 좌표로 chebyshev 거리 계산.
  // 모둠 간 시각적 분리(드래그된 위치)도 정확히 반영.
  distance(pos1, pos2): number {
    if (pos1.px != null && pos2.px != null) {
      const dx = Math.abs(pos1.px - pos2.px) / SEAT_PX_W;
      const dy = Math.abs(pos1.py! - pos2.py!) / SEAT_PX_H;
      return Math.round(Math.max(dx, dy));
    }
    return chebyshevDistance(pos1, pos2);
  },

  getSeatCount(settings): number {
    const sizes = getGroupSizes(settings);
    return sizes.reduce((a, b) => a + b, 0);
  },

  getGroupSizes(settings): number[] {
    return getGroupSizes(settings);
  },

  getGroupStartIndex(groupIndex, sizes): number {
    return getGroupStartIndex(groupIndex, sizes);
  },

  calcAutoPositions(sizes): GroupPosition[] {
    return calcAutoPositions(sizes);
  },
};
