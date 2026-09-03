// 룩업 맵 (legacy/js/algorithm/seat-randomizer.js:45-67, 127-157 이식)
import type { Assignment, ClassData, SeparationRule } from '../model/types';
import type { SeatPosition } from '../layouts/types';

/** 학생 이름 -> 관련 분리 규칙 배열 */
export type RuleLookup = Record<string, { other: string; minDistance: number }[]>;

/** 좌석 인덱스 -> 좌석 위치 */
export type PosMap = Record<number, SeatPosition>;

/** 좌석 인덱스 -> 인접 좌석 인덱스 배열 */
export type AdjacencyMap = Record<number, number[]>;

/**
 * 분리 규칙 역방향 룩업 맵 생성 (레거시 49-57행)
 * 학생 이름 -> 관련 규칙 배열 (O(1) 조회)
 */
export function buildRuleLookup(rules: SeparationRule[]): RuleLookup {
  const map: RuleLookup = {};
  for (const rule of rules) {
    if (!map[rule.studentA]) map[rule.studentA] = [];
    if (!map[rule.studentB]) map[rule.studentB] = [];
    map[rule.studentA]!.push({ other: rule.studentB, minDistance: rule.minDistance });
    map[rule.studentB]!.push({ other: rule.studentA, minDistance: rule.minDistance });
  }
  return map;
}

/**
 * 학생 이름 -> 좌석 인덱스 역방향 맵 생성 (레거시 62-68행)
 */
export function buildNameToSeatMap(assignment: Assignment): Record<string, number> {
  const map: Record<string, number> = {};
  for (const [seat, name] of Object.entries(assignment)) {
    map[name] = Number(seat);
  }
  return map;
}

/**
 * 인접 좌석 맵 생성 (레거시 132-165행)
 * 각 좌석에 대해 성별 제약 검사에 사용되는 인접 좌석 인덱스를 미리 계산한다.
 *
 * 짝 대형은 같은 행의 짝 파트너만, 나머지 대형은 Manhattan 거리 1(상하좌우)만
 * 인접으로 본다. 대각선은 인접이 아니다(분리 규칙의 chebyshev 거리와 별개).
 *
 * 비활성 좌석도 그대로 남는다: 이 맵은 순수 기하 정보이고, 비활성 좌석은
 * 애초에 배정 후보(availableSeats)에서 빠지므로 인접 검사에서 무해하다.
 *
 * `posMap`은 레거시 시그니처(그리고 호출부의 인자 순서)를 유지하기 위해 받는다.
 * 레거시 본문도 `positions`만 순회하므로 사용하지 않는다.
 */
export function buildAdjacencyMap(
  positions: SeatPosition[],
  posMap: PosMap,
  data: ClassData,
): AdjacencyMap {
  void posMap;
  const map: AdjacencyMap = {};

  for (const pos of positions) {
    const neighbors: number[] = [];

    if (data.layoutType === 'pair') {
      // 짝대형: 같은 행의 짝 파트너만
      const partnerCol = pos.col % 2 === 0 ? pos.col + 1 : pos.col - 1;
      for (const other of positions) {
        if (other.row === pos.row && other.col === partnerCol) {
          neighbors.push(other.index);
        }
      }
    } else {
      // 기타: 상하좌우 (Manhattan 거리 1)
      for (const other of positions) {
        const dist = Math.abs(pos.row - other.row) + Math.abs(pos.col - other.col);
        if (dist === 1) neighbors.push(other.index);
      }
    }

    map[pos.index] = neighbors;
  }

  return map;
}
