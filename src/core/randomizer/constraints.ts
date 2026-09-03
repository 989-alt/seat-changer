// 제약 검사 (legacy/js/algorithm/seat-randomizer.js:493-616 이식)
// 네 함수 모두 레거시 본문을 그대로 옮기고 타입만 붙였다. 판정 순서·조기 반환·
// 폴백 기본값(`|| 1`, `|| []`)까지 동일하다. 바뀐 곳은 두 가지뿐이다.
//   1. 학생 이름으로 객체를 읽는 자리는 `Object.hasOwn`으로 막는다(R63).
//      레거시는 'toString' 같은 이름에서 상속된 함수를 집어 갔다. 그 값은 어차피
//      성별/좌석으로 쓰이지 않아 판정 결과는 같지만, 읽기 자체가 안전해진다.
//   2. `groupLayout.getGroupIndex`가 v2 layouts에 없어 레거시 group-layout.js:131-139를
//      이 파일 안에 그대로 옮겼다(누적합 + 마지막 모둠 폴백).
import type { Assignment, ClassData, Gender, SeparationRule } from '../model/types';
import type { SeatLayout } from '../layouts/types';
import { groupLayout } from '../layouts/group';
import type { AdjacencyMap, PosMap, RuleLookup } from './lookup';

/** 이름 키를 프로토타입 체인 없이 읽는다 (R63) */
function own<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

/**
 * 분리 규칙 검증 (레거시 493-515행)
 * 역방향 룩업 맵으로 이 학생과 관련된 규칙만 조회한다.
 *
 * `assignment`·`rules`는 레거시 시그니처를 유지하려고 받는다. 레거시 본문도
 * ruleLookup·nameToSeat만 쓰고 두 인자는 읽지 않는다.
 */
export function checkConstraints(
  student: string,
  seatIdx: number,
  assignment: Assignment,
  posMap: PosMap,
  rules: SeparationRule[],
  layout: SeatLayout,
  ruleLookup: RuleLookup,
  nameToSeat: Record<string, number>,
): boolean {
  void assignment;
  void rules;
  const pos = posMap[seatIdx];
  if (!pos) return false;

  // 역방향 룩업: 이 학생과 관련된 규칙만 O(1)로 조회
  const studentRules = own(ruleLookup, student);
  if (!studentRules || studentRules.length === 0) return true;

  for (const { other, minDistance } of studentRules) {
    // 상대 학생이 배정되었는지 역방향 맵으로 O(1) 조회
    const otherSeat = own(nameToSeat, other);
    if (otherSeat === undefined) continue;

    const otherPos = posMap[otherSeat];
    if (otherPos && layout.distance(pos, otherPos) <= minDistance) {
      return false;
    }
  }

  return true;
}

/**
 * 최적화된 성별 제약 검증 (레거시 522-544행)
 * 사전 계산된 인접 맵으로 최대 4개 이웃만 확인한다.
 */
export function checkGenderConstraintFast(
  student: string,
  seatIdx: number,
  assignment: Assignment,
  adjacencyMap: AdjacencyMap,
  data: ClassData,
): boolean {
  const genderRule = data.genderRule;
  if (genderRule === 'none' || genderRule === 'mixedFirst') return true;

  const genders = data.studentGenders;
  const myGender: Gender | undefined = own(genders, student);
  if (!myGender) return true;

  const neighbors = adjacencyMap[seatIdx] ?? [];
  for (const neighborSeat of neighbors) {
    const neighborName = assignment[neighborSeat];
    if (!neighborName) continue;

    const neighborGender = own(genders, neighborName);
    if (!neighborGender) continue;

    if (genderRule === 'same' && myGender !== neighborGender) return false;
    if (genderRule === 'mixed' && myGender === neighborGender) return false;
  }

  return true;
}

/**
 * 이전 자리 재배치 방지 검증 (레거시 549-577행)
 */
export function checkHistoryConstraint(student: string, seatIdx: number, data: ClassData): boolean {
  if (data.useHistoryExclusion === false) return true;

  // 고정 자리 학생은 history 체크 건너뜀
  const fixedSeats = data.fixedSeats ?? [];
  if (fixedSeats.some((fs) => fs.studentName === student && fs.seatIndex === seatIdx)) return true;

  const history = data.assignmentHistory ?? [];
  const excludeCount = data.historyExcludeCount || 1;

  // 최근 N개의 기록 + 현재 lastAssignment 확인
  const recordsToCheck: Assignment[] = [];
  if (data.lastAssignment && data.lastAssignment.mapping) {
    recordsToCheck.push(data.lastAssignment.mapping);
  }
  const recentHistory = history.slice(-excludeCount);
  for (const record of recentHistory) {
    if (record.mapping) recordsToCheck.push(record.mapping);
  }

  for (const mapping of recordsToCheck) {
    if (mapping[seatIdx] === student) return false;
  }

  return true;
}

/**
 * 모둠원 중복 방지 제약 검증 (레거시 583-616행)
 * 같은 모둠 클러스터에 배정된 학생들이 이전 모둠에서 함께했는지 확인한다.
 */
export function checkGroupConstraint(
  student: string,
  seatIdx: number,
  assignment: Assignment,
  data: ClassData,
): boolean {
  if (data.layoutType !== 'group') return true;
  if (data.useGroupExclusion === false) return true;

  const groupHistory = data.groupHistory ?? [];
  if (groupHistory.length === 0) return true;

  // 가변 크기 모둠 지원: 모둠 크기 배열로 그룹 인덱스 계산
  const sizes = groupLayout.getGroupSizes(data.layoutSettings);
  const myGroupIdx = getGroupIndex(seatIdx, sizes);
  const excludeCount = data.groupExcludeCount || 1;
  const recentHistory = groupHistory.slice(-excludeCount);

  // 현재 같은 모둠에 이미 배정된 학생 찾기 (가변 크기)
  let groupStart = 0;
  for (let i = 0; i < myGroupIdx; i++) groupStart += sizes[i] ?? 0;
  const groupEnd = groupStart + (sizes[myGroupIdx] ?? 0);
  const currentGroupmates: string[] = [];
  for (let i = groupStart; i < groupEnd; i++) {
    const name = assignment[i];
    if (name && name !== student) {
      currentGroupmates.push(name);
    }
  }

  if (currentGroupmates.length === 0) return true;

  // 이전 기록에서 student와 currentGroupmates가 같은 모둠이었는지 확인
  for (const record of recentHistory) {
    const groups = record.groups ?? [];
    for (const group of groups) {
      if (group.includes(student)) {
        for (const mate of currentGroupmates) {
          if (group.includes(mate)) return false;
        }
      }
    }
  }

  return true;
}

/**
 * 좌석 인덱스 -> 모둠 인덱스 (레거시 group-layout.js:131-139)
 * v2 `groupLayout`에는 이 헬퍼가 없어 같은 본문을 여기에 둔다.
 */
function getGroupIndex(seatIdx: number, sizes: number[]): number {
  let acc = 0;
  for (let g = 0; g < sizes.length; g++) {
    acc += sizes[g]!;
    if (seatIdx < acc) return g;
  }
  return sizes.length - 1;
}
