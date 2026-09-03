// 좌석 배치 공통 타입 (legacy/js/layouts/layout-engine.js의 SeatPosition·레이아웃 인터페이스 대응)
import type { LayoutSettings, LayoutType } from '../model/types';

export interface SeatPosition {
  index: number;
  row: number;
  col: number;
  pairCol?: number;
  arcPos?: number;
  px?: number;
  py?: number;
  groupIndex?: number;
}

export interface SeatLayout {
  type: LayoutType;
  getSeatPositions(settings: LayoutSettings): SeatPosition[];
  getSeatCount(settings: LayoutSettings): number;
  distance(a: SeatPosition, b: SeatPosition): number;
}
