// 발표 화면을 열 때 지난 배치를 그대로 보여 줘도 되는지 가린다(개선 스펙 3-4).
// 뽑은 뒤 명단이나 배치가 바뀌었으면 자리 번호가 어긋난 배치를 보여 주게 되므로 쓰지 않는다.
import { getLayout } from '@/core/layouts';
import type { Assignment, ClassData } from '@/core/model/types';

export interface LastAssignmentCheck {
  /** 보여 줘도 되는 지난 배치. 없거나 쓸 수 없으면 null. */
  mapping: Assignment | null;
  /** 지난 배치는 있었지만 명단·배치가 바뀌어 쓰지 못했다(안내 토스트용). */
  stale: boolean;
}

const NONE: LastAssignmentCheck = { mapping: null, stale: false };
const STALE: LastAssignmentCheck = { mapping: null, stale: true };

export function loadableLastAssignment(data: ClassData): LastAssignmentCheck {
  const mapping = data.lastAssignment?.mapping;
  if (!mapping) return NONE;
  const entries = Object.entries(mapping);
  if (entries.length === 0) return NONE;

  const seats = new Set(getLayout(data.layoutType).getSeatPositions(data.layoutSettings).map((p) => p.index));
  const disabled = new Set(data.layoutSettings.disabledSeats ?? []);
  const names = new Set<string>();
  for (const [key, name] of entries) {
    const seat = Number(key);
    if (!Number.isInteger(seat) || !seats.has(seat) || disabled.has(seat)) return STALE;
    if (names.has(name)) return STALE;
    names.add(name);
  }

  const roster = new Set(data.students);
  if (roster.size !== names.size) return STALE;
  for (const name of names) if (!roster.has(name)) return STALE;
  return { mapping, stale: false };
}
