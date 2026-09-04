// 교사 화면 진행 표시(명단 -> 배치 -> 규칙 -> 규칙 검사)의 완료 판정.
// ClassData만 보는 순수 함수다. React·브라우저 API·세션 저장소를 쓰지 않는다.
import { getTotalSeats } from '@/core/layouts';
import { createDefaultData } from '@/core/model/defaults';
import type { ClassData } from '@/core/model/types';

export type StepKey = 'roster' | 'layout' | 'rules' | 'check';

/** 화면에 보이는 순서와 라벨. 판정과 표시가 어긋나지 않도록 한곳에 둔다. */
export const STEPS: readonly { key: StepKey; label: string }[] = [
  { key: 'roster', label: '명단' },
  { key: 'layout', label: '배치' },
  { key: 'rules', label: '규칙' },
  { key: 'check', label: '규칙 검사' },
] as const;

const DEFAULTS = createDefaultData();

/**
 * rules 단계는 "규칙을 한 번이라도 손댔는가"로 본다. 고정 자리·분리 규칙·성별 규칙 중
 * 하나라도 있거나, 이력 배제 설정이 기본값과 다르면 완료로 본다. 이력 배제를 일부러
 * 끈 것도 "규칙 없음을 확인한" 행동이므로 완료로 센다.
 */
function rulesTouched(data: ClassData): boolean {
  return (
    data.fixedSeats.length > 0 ||
    data.separationRules.length > 0 ||
    data.genderRule !== DEFAULTS.genderRule ||
    data.useHistoryExclusion !== DEFAULTS.useHistoryExclusion ||
    data.historyExcludeCount !== DEFAULTS.historyExcludeCount
  );
}

export function stepDone(data: ClassData): Record<StepKey, boolean> {
  return {
    roster: data.students.length > 0,
    layout: getTotalSeats(data) >= data.students.length,
    rules: rulesTouched(data),
    check: data.lastAssignment !== null,
  };
}
