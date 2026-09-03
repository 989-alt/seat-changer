// 배치 결과 검증 (legacy/js/screens/teacher-screen.js:14-49 이식)
// 레거시는 화면 코드 안에서 문자열 배열을 돌려줬다. v2는 DOM·토스트와 무관한
// 순수 함수로 옮기고, 문자열 대신 `{ kind, message }`를 돌려준다.
//
// 레거시와 다른 점:
//   1. 레거시 verifyAssignment는 고정 자리·분리 거리 두 가지만 검사했다.
//      브리프가 요구한 성별 규칙 검사와 kind 'capacity'를 추가했다. 성별 검사는
//      랜덤 배치가 실제로 강제하는 `checkGenderConstraintFast`와 같은 기준이다
//      (none·mixedFirst는 검사 없음).
//   2. 고정 자리 판정 기준을 배치기와 맞췄다 (R68). 레거시는 `tryAssignment`가
//      조용히 건너뛰는 고정 자리(비활성 좌석·좌석 범위 밖)까지 위반으로 잡아,
//      "배치는 성공했는데 검증은 위반"인 상태를 만들었다. 이제 두 곳이 같은
//      `isFixedSeatUsable`을 쓰므로 randomizeSeats가 성공시킨 배치는 항상 []다.
//   3. 분리 위반 메시지에서 두 이름 사이의 좌우 화살표 기호(U+2194)를 '-'로 바꿨다.
//      그 문자는 Extended_Pictographic이라 G4 이모지 스캐너(scripts/scan-emoji.mjs)가
//      위반으로 잡는다(실제로 이 주석에 넣었다가 걸렸다). 그 밖의 문구·
//      숫자(자리 번호 +1, 거리·최소 거리)는 레거시 그대로다.
import type { Assignment, ClassData, Gender } from '../model/types';
import { getLayout, getTotalSeats } from '../layouts';
import { buildAdjacencyMap, type PosMap } from './lookup';
import { isFixedSeatUsable } from './assign';

export interface Violation {
  kind: 'fixed' | 'separation' | 'gender' | 'capacity';
  message: string;
}

/** 이름 키를 프로토타입 체인 없이 읽는다 (R63) */
function own<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

/** 위반이 없으면 빈 배열 */
export function verifyAssignment(mapping: Assignment, data: ClassData): Violation[] {
  const layout = getLayout(data.layoutType);
  const positions = layout.getSeatPositions(data.layoutSettings);
  const posMap: PosMap = {};
  positions.forEach((p) => (posMap[p.index] = p));

  const violations: Violation[] = [];

  // 고정 자리 검증 (레거시 22-27행)
  // 배치기가 건너뛰는 고정 자리는 검사 대상이 아니다 (R68).
  // 레거시의 `students.includes` 검사도 이 판정 안에 들어 있다.
  const disabledSet = new Set(data.layoutSettings.disabledSeats ?? []);
  for (const fs of data.fixedSeats) {
    if (!isFixedSeatUsable(fs, data.students, positions.length, disabledSet)) continue;
    if (mapping[fs.seatIndex] !== fs.studentName) {
      violations.push({
        kind: 'fixed',
        message: `고정 자리 위반: ${fs.studentName} → ${fs.seatIndex + 1}번 자리`,
      });
    }
  }

  // 분리 규칙 검증 (레거시 29-46행)
  for (const rule of data.separationRules) {
    let seatA: number | null = null,
      seatB: number | null = null;
    for (const [seat, name] of Object.entries(mapping)) {
      if (name === rule.studentA) seatA = Number(seat);
      if (name === rule.studentB) seatB = Number(seat);
    }
    if (seatA !== null && seatB !== null) {
      const posA = posMap[seatA];
      const posB = posMap[seatB];
      if (posA && posB) {
        const dist = layout.distance(posA, posB);
        if (dist <= rule.minDistance) {
          violations.push({
            kind: 'separation',
            message: `분리 위반: ${rule.studentA} - ${rule.studentB} (거리 ${dist}, 최소 ${rule.minDistance})`,
          });
        }
      }
    }
  }

  // 성별 규칙 검증 (v2 추가 — checkGenderConstraintFast와 같은 기준)
  const genderRule = data.genderRule;
  if (genderRule === 'same' || genderRule === 'mixed') {
    const adjacency = buildAdjacencyMap(positions, posMap, data);
    for (const [seatKey, name] of Object.entries(mapping)) {
      const seat = Number(seatKey);
      const myGender: Gender | undefined = own(data.studentGenders, name);
      if (!myGender) continue;
      for (const neighborSeat of adjacency[seat] ?? []) {
        // 인접 관계는 대칭이므로 한 쌍을 한 번만 센다
        if (neighborSeat <= seat) continue;
        const neighborName = mapping[neighborSeat];
        if (!neighborName) continue;
        const neighborGender = own(data.studentGenders, neighborName);
        if (!neighborGender) continue;
        const bad = genderRule === 'same' ? myGender !== neighborGender : myGender === neighborGender;
        if (bad) {
          violations.push({
            kind: 'gender',
            message: `성별 규칙 위반: ${name} - ${neighborName} (${seat + 1}번, ${neighborSeat + 1}번 인접)`,
          });
        }
      }
    }
  }

  // 좌석 수 검증 (v2 추가 — randomizeSeats의 capacity 판정과 같은 기준)
  const usable = getTotalSeats(data);
  if (data.students.length > usable) {
    violations.push({
      kind: 'capacity',
      message: `좌석 부족: 학생 ${data.students.length}명, 좌석 ${usable}석`,
    });
  }

  return violations;
}
