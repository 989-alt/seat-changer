// 성별 좌석 사전 계산 (legacy/js/algorithm/seat-randomizer.js:161-370 이식)
import type { ClassData, Gender } from '../model/types';
import type { PosMap } from './lookup';

/**
 * 학생 이름 -> 허용 좌석 집합.
 * `null`은 "모든 학생이 가용 좌석 전체를 쓸 수 있음"(제약 없음)을 뜻한다.
 * 레거시는 이 경우에도 학생마다 전체 좌석 배열을 채운 객체를 돌려줬다.
 */
export type GenderSeatSets = Record<string, Set<number>> | null;

/** 레거시 곳곳에서 반복되던 남/녀 인원 집계 (동작 동일, 중복만 제거) */
function countGenders(
  students: string[],
  genders: Record<string, Gender>,
): { maleCount: number; femaleCount: number } {
  let maleCount = 0,
    femaleCount = 0;
  students.forEach((s) => {
    if (genders[s] === 'M') maleCount++;
    else if (genders[s] === 'F') femaleCount++;
  });
  return { maleCount, femaleCount };
}

/**
 * 체커보드 두 색 분할 (레거시 'mixed'·'mixedFirst' 분기에 같은 코드가 두 번
 * 있던 것을 그대로 하나로 뽑았다 — 순회 순서·판정 모두 동일)
 */
function splitCheckerboard(
  availableSeats: Set<number>,
  posMap: PosMap,
  data: ClassData,
): { evenSeats: number[]; oddSeats: number[] } {
  const evenSeats: number[] = [];
  const oddSeats: number[] = [];

  for (const seatIdx of availableSeats) {
    const pos = posMap[seatIdx];
    if (!pos) continue;

    if (data.layoutType === 'pair') {
      if (pos.col % 2 === 0) evenSeats.push(seatIdx);
      else oddSeats.push(seatIdx);
    } else {
      if ((pos.row + pos.col) % 2 === 0) evenSeats.push(seatIdx);
      else oddSeats.push(seatIdx);
    }
  }

  return { evenSeats, oddSeats };
}

/**
 * 성별에 따른 유효 좌석 사전 계산 (레거시 166-375행)
 * 'mixed': 체커보드 패턴으로 남녀 좌석을 분리하여 검색 공간 절반으로 축소
 * 'mixedFirst': 소수 성별 전원 + 같은 수의 다수 성별만 체커보드 배치
 * 'same': 동성끼리 공간적으로 그룹화 (행 단위 완전 분리 + 버퍼 행)
 * 'none': 전체 좌석 허용 -> null
 */
export function precomputeGenderSeats(
  students: string[],
  availableSeats: Set<number>,
  posMap: PosMap,
  data: ClassData,
): GenderSeatSets {
  // 레거시는 `data.genderRule || 'none'`, `data.studentGenders || {}`로 방어했지만
  // v2는 ClassDataSchema가 두 필드를 항상 채워 주므로 그대로 읽는다.
  const genderRule = data.genderRule;
  const genders = data.studentGenders;
  const result: Record<string, Set<number>> = {};
  // 레거시의 `const allSeats = [...availableSeats]`와 같은 방어 복사.
  // 호출부(백트래킹)가 availableSeats를 변형해도 사전 계산 결과는 고정된다.
  const allSeats = new Set(availableSeats);

  // 'none'(과 알 수 없는 값): 좌석 제약 없음.
  // 레거시는 이때도 학생마다 allSeats를 채운 객체를 돌려줬다 -> v2는 null로 표현한다.
  if (genderRule !== 'mixed' && genderRule !== 'mixedFirst' && genderRule !== 'same') {
    return null;
  }

  if (genderRule === 'mixed') {
    // 체커보드 패턴: 그리드에서 (row+col) 패리티로 두 색 그룹 생성
    // 같은 색 좌석끼리는 절대 인접하지 않으므로, 남녀를 다른 색에 배치하면
    // 성별 제약이 자동으로 만족됨 -> 백트래킹 탐색 공간 대폭 감소
    const { evenSeats, oddSeats } = splitCheckerboard(availableSeats, posMap, data);
    const { maleCount, femaleCount } = countGenders(students, genders);

    // 최적 방향: 큰 성별 그룹을 큰 좌석 세트에 배정
    const fit1 = maleCount <= evenSeats.length && femaleCount <= oddSeats.length;
    const fit2 = maleCount <= oddSeats.length && femaleCount <= evenSeats.length;

    let maleSeats: Set<number>, femaleSeats: Set<number>;
    if (fit1 && fit2) {
      // 레거시 그대로. 두 slack은 항상 (evenSeats + oddSeats - maleCount - femaleCount)로
      // 같으므로 아래 else는 레거시에서도 실행되지 않는 죽은 가지다 — 이식 동일성을
      // 위해 그대로 둔다.
      const slack1 = evenSeats.length - maleCount + (oddSeats.length - femaleCount);
      const slack2 = oddSeats.length - maleCount + (evenSeats.length - femaleCount);
      if (slack1 >= slack2) {
        maleSeats = new Set(evenSeats);
        femaleSeats = new Set(oddSeats);
      } else {
        maleSeats = new Set(oddSeats);
        femaleSeats = new Set(evenSeats);
      }
    } else if (fit1) {
      maleSeats = new Set(evenSeats);
      femaleSeats = new Set(oddSeats);
    } else if (fit2) {
      maleSeats = new Set(oddSeats);
      femaleSeats = new Set(evenSeats);
    } else {
      // 어느 방향으로도 완벽 분할 불가 -> 전체 좌석 사용 (제약 검사기가 처리)
      maleSeats = allSeats;
      femaleSeats = allSeats;
    }

    students.forEach((s) => {
      const g = genders[s];
      if (g === 'M') result[s] = maleSeats;
      else if (g === 'F') result[s] = femaleSeats;
      else result[s] = allSeats;
    });

    return result;
  }

  if (genderRule === 'mixedFirst') {
    // 이성 우선: 소수 성별 전원 + 같은 수의 다수 성별을 체커보드 배치,
    // 나머지 다수 성별은 전체 좌석 사용 (동성 인접 허용)
    const { evenSeats, oddSeats } = splitCheckerboard(availableSeats, posMap, data);
    const { maleCount, femaleCount } = countGenders(students, genders);

    const minorGender: Gender = maleCount <= femaleCount ? 'M' : 'F';
    const majorGender: Gender = minorGender === 'M' ? 'F' : 'M';
    const minorCount = Math.min(maleCount, femaleCount);

    // 소수 성별 -> 한 색, 다수 성별 중 minorCount명 -> 반대 색
    const fit1 = minorCount <= evenSeats.length;
    const fit2 = minorCount <= oddSeats.length;

    let minorSeats: Set<number>, pairedMajorSeats: Set<number>;
    if (fit1 && fit2) {
      if (evenSeats.length >= oddSeats.length) {
        minorSeats = new Set(oddSeats);
        pairedMajorSeats = new Set(evenSeats);
      } else {
        minorSeats = new Set(evenSeats);
        pairedMajorSeats = new Set(oddSeats);
      }
    } else if (fit1) {
      minorSeats = new Set(evenSeats);
      pairedMajorSeats = new Set(oddSeats);
    } else if (fit2) {
      minorSeats = new Set(oddSeats);
      pairedMajorSeats = new Set(evenSeats);
    } else {
      minorSeats = allSeats;
      pairedMajorSeats = allSeats;
    }

    let majorPairedCount = 0;
    students.forEach((s) => {
      const g = genders[s];
      if (g === minorGender) {
        result[s] = minorSeats;
      } else if (g === majorGender) {
        if (majorPairedCount < minorCount) {
          result[s] = pairedMajorSeats;
          majorPairedCount++;
        } else {
          result[s] = allSeats; // 남은 다수 성별: 전체 좌석
        }
      } else {
        result[s] = allSeats;
      }
    });

    return result;
  }

  {
    // genderRule === 'same'
    // 동성 인접: 같은 성별끼리 모이도록 행 단위로 완전 분리
    // 핵심: 남/녀 좌석 풀이 겹치면 경계에서 이성 인접 -> 백트래킹 폭발
    // 해결: 남학생 영역 / 빈 버퍼 행 / 여학생 영역으로 완전 분리
    const { maleCount, femaleCount } = countGenders(students, genders);

    // 행 정보 수집
    const rowSet = new Set<number>();
    for (const seatIdx of availableSeats) {
      const pos = posMap[seatIdx];
      if (pos) rowSet.add(pos.row);
    }
    const rows = [...rowSet].sort((a, b) => a - b);

    // 각 행에 속한 좌석 수 계산
    const seatsPerRow: Record<number, number> = {};
    rows.forEach((r) => {
      seatsPerRow[r] = 0;
    });
    for (const seatIdx of availableSeats) {
      const pos = posMap[seatIdx];
      if (pos && seatsPerRow[pos.row] !== undefined) seatsPerRow[pos.row]!++;
    }

    // 행을 누적하며 한 성별에 충분한 행 수 찾기
    // 남학생: 위쪽 행, 여학생: 아래쪽 행, 중간에 1행 이상 버퍼
    let maleRows = 0,
      maleCapacity = 0;
    for (let i = 0; i < rows.length; i++) {
      maleCapacity += seatsPerRow[rows[i]!]!;
      maleRows = i + 1;
      if (maleCapacity >= maleCount) break;
    }

    let femaleRows = 0,
      femaleCapacity = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      femaleCapacity += seatsPerRow[rows[i]!]!;
      femaleRows++;
      if (femaleCapacity >= femaleCount) break;
    }

    // 버퍼 포함하여 분리 가능한지 확인 (남학생 행 + 버퍼 1행 + 여학생 행 <= 전체 행)
    const canSeparate =
      maleRows + 1 + femaleRows <= rows.length &&
      maleCapacity >= maleCount &&
      femaleCapacity >= femaleCount;

    if (canSeparate) {
      const maleRowSet = new Set(rows.slice(0, maleRows));
      const femaleRowSet = new Set(rows.slice(rows.length - femaleRows));

      const maleSeats = new Set<number>();
      const femaleSeats = new Set<number>();
      for (const s of allSeats) {
        const pos = posMap[s];
        if (!pos) continue;
        if (maleRowSet.has(pos.row)) maleSeats.add(s);
        if (femaleRowSet.has(pos.row)) femaleSeats.add(s);
      }

      students.forEach((s) => {
        const g = genders[s];
        if (g === 'M') result[s] = maleSeats;
        else if (g === 'F') result[s] = femaleSeats;
        else result[s] = allSeats;
      });
    } else {
      // 분리 불가능 -> 전체 좌석 사용 (제약 검사기가 처리)
      students.forEach((s) => {
        result[s] = allSeats;
      });
    }

    return result;
  }
}
