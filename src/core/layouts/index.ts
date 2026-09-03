// 배치 레지스트리 (legacy/js/components/seat-grid.js의 getLayout·getTotalSeatsForLayout 대응)
import type { ClassData, LayoutType } from '../model/types';
import type { SeatLayout } from './types';
import { examLayout } from './exam';
import { pairLayout } from './pair';
import { ushapeLayout } from './ushape';
import { customLayout } from './custom';
import { groupLayout } from './group';

export const layouts: Record<LayoutType, SeatLayout> = {
  exam: examLayout,
  pair: pairLayout,
  ushape: ushapeLayout,
  custom: customLayout,
  group: groupLayout,
};

export const getLayout = (type: LayoutType): SeatLayout => layouts[type] ?? examLayout;

/**
 * 총 좌석 수 = 배치의 좌석 수 - 비활성 좌석 수.
 * 자유배치는 책상 자체가 배열에서 빠지므로 별도 차감이 없다.
 */
export function getTotalSeats(data: ClassData): number {
  const raw = getLayout(data.layoutType).getSeatCount(data.layoutSettings);
  if (data.layoutType === 'custom') return raw;
  return Math.max(0, raw - (data.layoutSettings.disabledSeats ?? []).length);
}

export type { SeatLayout, SeatPosition } from './types';
