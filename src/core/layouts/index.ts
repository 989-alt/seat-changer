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
 * 총 좌석 수 = 배치의 좌석 수 - 실제로 존재하는 비활성 좌석 수.
 * 자유배치는 책상 자체가 배열에서 빠지므로 별도 차감이 없다.
 *
 * 스키마(ClassDataSchema)는 disabledSeats에 좌석 범위를 벗어난 인덱스(`[999]`)와
 * 중복(`[0, 0]`)을 허용한다. 레거시 models.js처럼 배열 길이를 그대로 빼면
 * 좌석 수가 실제보다 작아지므로, 유효한 인덱스만 중복 없이 센다.
 */
export function getTotalSeats(data: ClassData): number {
  const raw = getLayout(data.layoutType).getSeatCount(data.layoutSettings);
  if (data.layoutType === 'custom') return raw;
  const disabled = data.layoutSettings.disabledSeats ?? [];
  const valid = new Set(disabled.filter((i) => Number.isInteger(i) && i >= 0 && i < raw));
  return Math.max(0, raw - valid.size);
}

export type { SeatLayout, SeatPosition } from './types';
