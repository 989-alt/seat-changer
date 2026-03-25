// 제약조건 기반 랜덤 배치 알고리즘 (최적화 버전)
// 주요 개선:
// 1. 타임아웃 메커니즘 (무한 블로킹 방지)
// 2. 인접 좌석 맵 사전 계산 (성별 검사 O(n) → O(1))
// 3. 체커보드 패턴으로 성별 좌석 사전 분할 (검색 공간 ~50% 감소)
// 4. 가용 좌석 Set 관리 (배정된 좌석 재순회 제거)
// 5. 시도 횟수 축소 + 조기 종료

import { examLayout } from '../layouts/exam-layout.js';
import { pairLayout } from '../layouts/pair-layout.js';
import { ushapeLayout } from '../layouts/ushape-layout.js';
import { customLayout } from '../layouts/custom-layout.js';

const layoutMap = {
  exam: examLayout,
  pair: pairLayout,
  ushape: ushapeLayout,
  custom: customLayout
};

const MAX_ATTEMPTS = 15;
const TIMEOUT_MS = 3000;

/**
 * Fisher-Yates shuffle (in-place)
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 제약 기반 랜덤 배치
 * @returns {{ [seatIndex: number]: string } | null} 배정 결과 또는 실패 시 null
 */
export function randomizeSeats(data) {
  const { students, layoutType, layoutSettings, fixedSeats, separationRules } = data;
  const layout = layoutMap[layoutType];
  if (!layout) return null;

  const positions = layout.getSeatPositions(layoutSettings);
  const totalSeats = positions.length;

  if (students.length === 0) return null;
  if (students.length > totalSeats) return null;

  // 위치 인덱스 → 위치 객체 맵
  const posMap = {};
  positions.forEach(p => posMap[p.index] = p);

  // 인접 좌석 맵 사전 계산 (성별 제약 최적화)
  const adjacencyMap = buildAdjacencyMap(positions, posMap, data);

  const deadline = Date.now() + TIMEOUT_MS;

  // 1차: 모든 제약 (history 포함) 적용
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (Date.now() > deadline) break;
    const result = tryAssignment(students, positions, posMap, totalSeats, fixedSeats, separationRules, layout, data, adjacencyMap, deadline);
    if (result) return result;
  }

  // 2차 폴백: history 제약 없이 재시도
  if (data.useHistoryExclusion !== false && (data.assignmentHistory || []).length > 0) {
    const fallbackData = { ...data, useHistoryExclusion: false };
    const deadline2 = Date.now() + TIMEOUT_MS;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (Date.now() > deadline2) break;
      const result = tryAssignment(students, positions, posMap, totalSeats, fixedSeats, separationRules, layout, fallbackData, adjacencyMap, deadline2);
      if (result) {
        result._historyFallback = true;
        return result;
      }
    }
  }

  return null; // 실패
}

/**
 * 인접 좌석 맵 생성
 * 각 좌석에 대해 성별 제약 검사에 사용되는 인접 좌석 인덱스를 미리 계산
 * 기존: 매 검사마다 전체 좌석 순회 O(n) → 개선: 사전 계산 O(1) 조회
 */
function buildAdjacencyMap(positions, posMap, data) {
  const map = {};

  for (const pos of positions) {
    const neighbors = [];

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

/**
 * 성별에 따른 유효 좌석 사전 계산
 * 'mixed': 체커보드 패턴으로 남녀 좌석을 분리하여 검색 공간 절반으로 축소
 * 'same': 동성끼리 공간적으로 그룹화
 * 'none': 전체 좌석 허용
 */
function precomputeGenderSeats(students, availableSeats, posMap, data) {
  const genderRule = data.genderRule || 'none';
  const genders = data.studentGenders || {};
  const result = {};
  const allSeats = [...availableSeats];

  if (genderRule === 'none') {
    students.forEach(s => { result[s] = allSeats; });
    return result;
  }

  if (genderRule === 'mixed') {
    // 체커보드 패턴: 그리드에서 (row+col) 패리티로 두 색 그룹 생성
    // 같은 색 좌석끼리는 절대 인접하지 않으므로, 남녀를 다른 색에 배치하면
    // 성별 제약이 자동으로 만족됨 → 백트래킹 탐색 공간 대폭 감소
    const evenSeats = [];
    const oddSeats = [];

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

    let maleCount = 0, femaleCount = 0;
    students.forEach(s => {
      if (genders[s] === 'M') maleCount++;
      else if (genders[s] === 'F') femaleCount++;
    });

    // 최적 방향: 큰 성별 그룹을 큰 좌석 세트에 배정
    const fit1 = (maleCount <= evenSeats.length && femaleCount <= oddSeats.length);
    const fit2 = (maleCount <= oddSeats.length && femaleCount <= evenSeats.length);

    let maleSeats, femaleSeats;
    if (fit1 && fit2) {
      const slack1 = (evenSeats.length - maleCount) + (oddSeats.length - femaleCount);
      const slack2 = (oddSeats.length - maleCount) + (evenSeats.length - femaleCount);
      if (slack1 >= slack2) {
        maleSeats = evenSeats; femaleSeats = oddSeats;
      } else {
        maleSeats = oddSeats; femaleSeats = evenSeats;
      }
    } else if (fit1) {
      maleSeats = evenSeats; femaleSeats = oddSeats;
    } else if (fit2) {
      maleSeats = oddSeats; femaleSeats = evenSeats;
    } else {
      // 어느 방향으로도 완벽 분할 불가 → 전체 좌석 사용 (제약 검사기가 처리)
      maleSeats = allSeats; femaleSeats = allSeats;
    }

    students.forEach(s => {
      const g = genders[s];
      if (g === 'M') result[s] = maleSeats;
      else if (g === 'F') result[s] = femaleSeats;
      else result[s] = allSeats;
    });

    return result;
  }

  if (genderRule === 'same') {
    // 동성 인접: 같은 성별끼리 모이도록 행 단위로 완전 분리
    // 핵심: 남/녀 좌석 풀이 겹치면 경계에서 이성 인접 → 백트래킹 폭발
    // 해결: 남학생 영역 / 빈 버퍼 행 / 여학생 영역으로 완전 분리

    let maleCount = 0, femaleCount = 0;
    students.forEach(s => {
      if (genders[s] === 'M') maleCount++;
      else if (genders[s] === 'F') femaleCount++;
    });

    // 행 정보 수집
    const rowSet = new Set();
    for (const seatIdx of availableSeats) {
      const pos = posMap[seatIdx];
      if (pos) rowSet.add(pos.row);
    }
    const rows = [...rowSet].sort((a, b) => a - b);

    // 각 행에 속한 좌석 수 계산
    const seatsPerRow = {};
    rows.forEach(r => { seatsPerRow[r] = 0; });
    for (const seatIdx of availableSeats) {
      const pos = posMap[seatIdx];
      if (pos && seatsPerRow[pos.row] !== undefined) seatsPerRow[pos.row]++;
    }

    // 행을 누적하며 한 성별에 충분한 행 수 찾기
    // 남학생: 위쪽 행, 여학생: 아래쪽 행, 중간에 1행 이상 버퍼
    let maleRows = 0, maleCapacity = 0;
    for (let i = 0; i < rows.length; i++) {
      maleCapacity += seatsPerRow[rows[i]];
      maleRows = i + 1;
      if (maleCapacity >= maleCount) break;
    }

    let femaleRows = 0, femaleCapacity = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      femaleCapacity += seatsPerRow[rows[i]];
      femaleRows++;
      if (femaleCapacity >= femaleCount) break;
    }

    // 버퍼 포함하여 분리 가능한지 확인 (남학생 행 + 버퍼 1행 + 여학생 행 ≤ 전체 행)
    const canSeparate = (maleRows + 1 + femaleRows) <= rows.length
      && maleCapacity >= maleCount && femaleCapacity >= femaleCount;

    if (canSeparate) {
      const maleRowSet = new Set(rows.slice(0, maleRows));
      const femaleRowSet = new Set(rows.slice(rows.length - femaleRows));

      const maleSeats = allSeats.filter(s => posMap[s] && maleRowSet.has(posMap[s].row));
      const femaleSeats = allSeats.filter(s => posMap[s] && femaleRowSet.has(posMap[s].row));

      students.forEach(s => {
        const g = genders[s];
        if (g === 'M') result[s] = maleSeats;
        else if (g === 'F') result[s] = femaleSeats;
        else result[s] = allSeats;
      });
    } else {
      // 분리 불가능 → 전체 좌석 사용 (제약 검사기가 처리)
      students.forEach(s => { result[s] = allSeats; });
    }

    return result;
  }

  // 기본: 전체 좌석 허용
  students.forEach(s => { result[s] = allSeats; });
  return result;
}

function tryAssignment(students, positions, posMap, totalSeats, fixedSeats, separationRules, layout, data, adjacencyMap, deadline) {
  const assignment = {};
  const assignedStudents = new Set();
  const availableSeats = new Set();

  // 1. 고정 자리 먼저 배정
  for (const fs of fixedSeats) {
    if (!students.includes(fs.studentName)) continue;
    if (fs.seatIndex >= totalSeats) continue;
    assignment[fs.seatIndex] = fs.studentName;
    assignedStudents.add(fs.studentName);
  }

  // 사용 가능한 좌석 세트 (고정 좌석 제외)
  positions.forEach(p => {
    if (assignment[p.index] === undefined) availableSeats.add(p.index);
  });

  // 2. 나머지 학생
  const remaining = students.filter(s => !assignedStudents.has(s));

  // 3. 성별 기반 유효 좌석 사전 계산
  const genderValidSeats = precomputeGenderSeats(remaining, availableSeats, posMap, data);

  // 4. 제약 많은 학생 우선 배치 (Most-Constrained-First)
  const genders = data.studentGenders || {};
  const genderRule = data.genderRule || 'none';
  const constraintScore = {};

  remaining.forEach(s => {
    let score = 0;
    // 분리 규칙 수
    separationRules.forEach(rule => {
      if (rule.studentA === s || rule.studentB === s) score += 2;
    });
    // 유효 좌석이 적을수록 더 제약됨
    const validCount = genderValidSeats[s] ? genderValidSeats[s].length : availableSeats.size;
    score += Math.max(0, availableSeats.size - validCount);
    constraintScore[s] = score;
  });

  // 'same' 모드: 같은 성별끼리 연속 배치되도록 성별별 그룹화
  if (genderRule === 'same') {
    remaining.sort((a, b) => {
      const gA = genders[a] || 'Z';
      const gB = genders[b] || 'Z';
      if (gA !== gB) return gA < gB ? -1 : 1;
      return constraintScore[b] - constraintScore[a];
    });
  } else {
    remaining.sort((a, b) => constraintScore[b] - constraintScore[a]);
  }

  // 5. 백트래킹 배치
  const success = backtrack(0, remaining, availableSeats, assignment, posMap, separationRules, layout, data, adjacencyMap, genderValidSeats, deadline);
  return success ? assignment : null;
}

function backtrack(studentIdx, students, availableSeats, assignment, posMap, rules, layout, data, adjacencyMap, genderValidSeats, deadline) {
  if (studentIdx >= students.length) return true;

  // 주기적 타임아웃 체크 (매 호출이 아닌 8명마다 → Date.now() 오버헤드 최소화)
  if ((studentIdx & 7) === 0 && Date.now() > deadline) return false;

  const student = students[studentIdx];

  // 유효 좌석 중 현재 사용 가능한 것만 후보로 선정
  const validSeats = genderValidSeats[student] || [];
  const candidates = [];
  for (const s of validSeats) {
    if (availableSeats.has(s)) candidates.push(s);
  }

  // 후보가 없으면 즉시 실패 (조기 가지치기)
  if (candidates.length === 0) return false;

  shuffle(candidates);

  for (const seatIdx of candidates) {
    // 분리 규칙 검증
    if (!checkConstraints(student, seatIdx, assignment, posMap, rules, layout)) continue;

    // 성별 제약 검증 (사전 계산된 인접 맵 사용)
    if (!checkGenderConstraintFast(student, seatIdx, assignment, adjacencyMap, data)) continue;

    // 이전 자리 제약 검증
    if (!checkHistoryConstraint(student, seatIdx, data)) continue;

    // 배치
    assignment[seatIdx] = student;
    availableSeats.delete(seatIdx);

    if (backtrack(studentIdx + 1, students, availableSeats, assignment, posMap, rules, layout, data, adjacencyMap, genderValidSeats, deadline)) {
      return true;
    }

    // 되돌리기
    delete assignment[seatIdx];
    availableSeats.add(seatIdx);
  }

  return false;
}

function checkConstraints(student, seatIdx, assignment, posMap, rules, layout) {
  const pos = posMap[seatIdx];
  if (!pos) return false;

  for (const rule of rules) {
    let otherStudent = null;
    if (rule.studentA === student) otherStudent = rule.studentB;
    else if (rule.studentB === student) otherStudent = rule.studentA;
    else continue;

    // 상대 학생이 이미 배정되었는지 확인
    for (const [assignedSeat, assignedName] of Object.entries(assignment)) {
      if (assignedName === otherStudent) {
        const otherPos = posMap[Number(assignedSeat)];
        if (otherPos && layout.distance(pos, otherPos) <= rule.minDistance) {
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * 최적화된 성별 제약 검증
 * 기존: 전체 배정 목록을 순회하며 인접 좌석 탐색 O(n)
 * 개선: 사전 계산된 인접 맵으로 O(1) 조회 (최대 4개 이웃)
 */
function checkGenderConstraintFast(student, seatIdx, assignment, adjacencyMap, data) {
  const genderRule = data.genderRule || 'none';
  if (genderRule === 'none') return true;

  const genders = data.studentGenders || {};
  const myGender = genders[student];
  if (!myGender) return true;

  const neighbors = adjacencyMap[seatIdx] || [];
  for (const neighborSeat of neighbors) {
    const neighborName = assignment[neighborSeat];
    if (!neighborName) continue;

    const neighborGender = genders[neighborName];
    if (!neighborGender) continue;

    if (genderRule === 'same' && myGender !== neighborGender) return false;
    if (genderRule === 'mixed' && myGender === neighborGender) return false;
  }

  return true;
}

/**
 * 이전 자리 재배치 방지 검증
 */
function checkHistoryConstraint(student, seatIdx, data) {
  if (data.useHistoryExclusion === false) return true;

  // 고정 자리 학생은 history 체크 건너뜀
  const fixedSeats = data.fixedSeats || [];
  if (fixedSeats.some(fs => fs.studentName === student && fs.seatIndex === seatIdx)) return true;

  const history = data.assignmentHistory || [];
  const excludeCount = data.historyExcludeCount || 1;

  // 최근 N개의 기록 + 현재 lastAssignment 확인
  const recordsToCheck = [];
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
