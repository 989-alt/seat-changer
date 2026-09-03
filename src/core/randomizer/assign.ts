// 한 번의 배치 시도와 백트래킹 (legacy/js/algorithm/seat-randomizer.js:376-492 이식)
// 레거시 본문을 그대로 옮기고 타입만 붙였다. 의도한 변경은 두 가지뿐이다.
//   1. `shuffle(candidates)` -> `shuffle(candidates, rng)` (난수 주입)
//   2. `Date.now()` -> 주입된 `now()` (테스트에서 데드라인을 재현하기 위함)
// 그 밖에 v2 자료구조 때문에 생긴 차이는 아래 두 곳뿐이고, 판정 결과는 같다.
//   - `precomputeGenderSeats`가 genderRule 'none'에서 null을 돌려준다(R60).
//     null은 "모든 학생이 가용 좌석 전체를 쓴다"는 뜻이므로, 사전 계산 시점의
//     availableSeats 스냅샷을 모든 학생의 후보로 쓴다(레거시 allSeats와 동일한
//     내용·순서).
//   - 좌석 집합이 배열이 아니라 Set이므로 `.length` -> `.size`,
//     `for (const s of set)`으로 순회한다. Set은 삽입 순서를 보존하므로
//     후보 순서(=shuffle 입력 순서)는 레거시 배열과 같다.
//     Set은 여러 학생이 공유하므로 절대 변형하지 않는다(R62).
import type { Assignment, ClassData, FixedSeat, SeparationRule } from '../model/types';
import type { SeatLayout, SeatPosition } from '../layouts/types';
import { shuffle, type Rng } from './rng';
import { buildNameToSeatMap, type AdjacencyMap, type PosMap, type RuleLookup } from './lookup';
import { precomputeGenderSeats, type GenderSeatSets } from './gender';
import {
  checkConstraints,
  checkGenderConstraintFast,
  checkHistoryConstraint,
  checkGroupConstraint,
} from './constraints';

/** 현재 시각(ms)을 돌려주는 함수 — 레거시 `Date.now` 자리 */
export type Clock = () => number;

/**
 * 학생의 유효 좌석 집합.
 * 레거시 `genderValidSeats[student] || []`에 대응한다. 성별 규칙이 없으면(map === null)
 * 전체 좌석 스냅샷을, 사전 계산에 없는 학생이면 undefined를 돌려준다(레거시의 `[]`).
 */
function validSeatsOf(
  map: GenderSeatSets,
  allSeats: Set<number>,
  name: string,
): Set<number> | undefined {
  if (map === null) return allSeats;
  return Object.hasOwn(map, name) ? map[name] : undefined;
}

/**
 * 배치기가 실제로 적용하는 고정 자리인지 (레거시 384-387행의 세 조건 그대로)
 * 명단에 없는 학생·좌석 범위 밖·비활성 좌석에 걸린 고정 자리는 조용히 무시된다.
 *
 * `verifyAssignment`가 같은 기준을 써야 "배치는 성공했는데 검증은 위반"이라는
 * 레거시의 불일치가 사라진다(R68). 규칙을 한 곳에만 두려고 export한다.
 */
export function isFixedSeatUsable(
  fs: FixedSeat,
  students: string[],
  totalSeats: number,
  disabledSet: Set<number>,
): boolean {
  if (!students.includes(fs.studentName)) return false;
  if (fs.seatIndex >= totalSeats) return false;
  if (disabledSet.has(fs.seatIndex)) return false;
  return true;
}

/**
 * 한 번의 배치 시도 (레거시 376-437행)
 * 성공하면 좌석->이름 맵을, 실패하면 null을 돌려준다.
 */
export function tryAssignment(
  students: string[],
  positions: SeatPosition[],
  posMap: PosMap,
  totalSeats: number,
  fixedSeats: FixedSeat[],
  separationRules: SeparationRule[],
  layout: SeatLayout,
  data: ClassData,
  adjacencyMap: AdjacencyMap,
  deadline: number,
  ruleLookup: RuleLookup,
  rng: Rng,
  now: Clock,
): Assignment | null {
  const assignment: Assignment = {};
  const assignedStudents = new Set<string>();
  const availableSeats = new Set<number>();

  // 사용자가 X로 삭제한 좌석은 배정 후보에서 제외
  const disabledSet = new Set(data.layoutSettings.disabledSeats ?? []);

  // 1. 고정 자리 먼저 배정 (단, 비활성 좌석으로 고정된 경우 무시)
  for (const fs of fixedSeats) {
    if (!isFixedSeatUsable(fs, students, totalSeats, disabledSet)) continue;
    assignment[fs.seatIndex] = fs.studentName;
    assignedStudents.add(fs.studentName);
  }

  // 사용 가능한 좌석 세트 (고정 좌석 + 비활성 좌석 제외)
  positions.forEach((p) => {
    if (disabledSet.has(p.index)) return;
    if (assignment[p.index] === undefined) availableSeats.add(p.index);
  });

  // 2. 나머지 학생
  const remaining = students.filter((s) => !assignedStudents.has(s));

  // 3. 성별 기반 유효 좌석 사전 계산
  const genderValidSeats = precomputeGenderSeats(remaining, availableSeats, posMap, data);
  // genderRule 'none'일 때 쓰는 전체 좌석 스냅샷 (레거시 allSeats와 동일)
  const allSeats = new Set(availableSeats);

  // 4. 제약 많은 학생 우선 배치 (Most-Constrained-First)
  const genders = data.studentGenders;
  const genderRule = data.genderRule;
  const constraintScore = Object.create(null) as Record<string, number>;

  remaining.forEach((s) => {
    let score = 0;
    // 분리 규칙 수
    separationRules.forEach((rule) => {
      if (rule.studentA === s || rule.studentB === s) score += 2;
    });
    // 유효 좌석이 적을수록 더 제약됨
    const valid = validSeatsOf(genderValidSeats, allSeats, s);
    const validCount = valid ? valid.size : availableSeats.size;
    score += Math.max(0, availableSeats.size - validCount);
    constraintScore[s] = score;
  });

  // 'same' 모드: 같은 성별끼리 연속 배치되도록 성별별 그룹화
  if (genderRule === 'same') {
    remaining.sort((a, b) => {
      const gA = (Object.hasOwn(genders, a) ? genders[a] : undefined) || 'Z';
      const gB = (Object.hasOwn(genders, b) ? genders[b] : undefined) || 'Z';
      if (gA !== gB) return gA < gB ? -1 : 1;
      return constraintScore[b]! - constraintScore[a]!;
    });
  } else {
    remaining.sort((a, b) => constraintScore[b]! - constraintScore[a]!);
  }

  // 5. 이름->좌석 역방향 맵 (분리 규칙 검증 최적화)
  const nameToSeat = buildNameToSeatMap(assignment);

  // 6. 백트래킹 배치
  const success = backtrack(
    0,
    remaining,
    availableSeats,
    assignment,
    posMap,
    separationRules,
    layout,
    data,
    adjacencyMap,
    genderValidSeats,
    allSeats,
    deadline,
    ruleLookup,
    nameToSeat,
    rng,
    now,
  );
  return success ? assignment : null;
}

/**
 * 백트래킹 (레거시 439-492행)
 * `allSeats`는 genderValidSeats가 null일 때 쓰는 전체 좌석 스냅샷 — v2에서만 추가된 인자다.
 */
export function backtrack(
  studentIdx: number,
  students: string[],
  availableSeats: Set<number>,
  assignment: Assignment,
  posMap: PosMap,
  rules: SeparationRule[],
  layout: SeatLayout,
  data: ClassData,
  adjacencyMap: AdjacencyMap,
  genderValidSeats: GenderSeatSets,
  allSeats: Set<number>,
  deadline: number,
  ruleLookup: RuleLookup,
  nameToSeat: Record<string, number>,
  rng: Rng,
  now: Clock,
): boolean {
  if (studentIdx >= students.length) return true;

  // 주기적 타임아웃 체크 (매 호출이 아닌 4명마다)
  if ((studentIdx & 3) === 0 && now() > deadline) return false;

  const student = students[studentIdx]!;

  // 유효 좌석 중 현재 사용 가능한 것만 후보로 선정
  const validSeats = validSeatsOf(genderValidSeats, allSeats, student);
  const candidates: number[] = [];
  if (validSeats) {
    for (const s of validSeats) {
      if (availableSeats.has(s)) candidates.push(s);
    }
  }

  // 후보가 없으면 즉시 실패 (조기 가지치기)
  if (candidates.length === 0) return false;

  shuffle(candidates, rng);

  for (const seatIdx of candidates) {
    // 분리 규칙 검증 (역방향 룩업 맵 사용)
    if (!checkConstraints(student, seatIdx, assignment, posMap, rules, layout, ruleLookup, nameToSeat))
      continue;

    // 성별 제약 검증 (사전 계산된 인접 맵 사용)
    if (!checkGenderConstraintFast(student, seatIdx, assignment, adjacencyMap, data)) continue;

    // 이전 자리 제약 검증
    if (!checkHistoryConstraint(student, seatIdx, data)) continue;

    // 모둠원 중복 방지 검증
    if (!checkGroupConstraint(student, seatIdx, assignment, data)) continue;

    // 배치
    assignment[seatIdx] = student;
    availableSeats.delete(seatIdx);
    nameToSeat[student] = seatIdx;

    if (
      backtrack(
        studentIdx + 1,
        students,
        availableSeats,
        assignment,
        posMap,
        rules,
        layout,
        data,
        adjacencyMap,
        genderValidSeats,
        allSeats,
        deadline,
        ruleLookup,
        nameToSeat,
        rng,
        now,
      )
    ) {
      return true;
    }

    // 되돌리기
    delete assignment[seatIdx];
    availableSeats.add(seatIdx);
    delete nameToSeat[student];
  }

  return false;
}
