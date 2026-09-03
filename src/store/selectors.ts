import type { AppState } from './useAppStore';
import { getTotalSeats } from '@/core/layouts';

export const selectTotalSeats = (s: AppState) => getTotalSeats(s.data);

export const selectDisabledCount = (s: AppState) => s.data.layoutSettings.disabledSeats.length;

export const selectSeatWarning = (s: AppState): string | null => {
  const total = getTotalSeats(s.data);
  const n = s.data.students.length;
  if (n === 0 || total === 0) return null;
  if (n > total) return `학생 수(${n}명)가 좌석 수(${total}석)보다 많습니다. 좌석을 추가하거나 명단을 조정하세요.`;
  if (total - n > total * 0.5) return `좌석(${total}석)이 학생 수(${n}명)보다 많이 남습니다. 행·열 수를 조정해 보세요.`;
  return null;
};
