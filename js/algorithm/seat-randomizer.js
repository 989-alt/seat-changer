// 제약조건 기반 랜덤 배치 알고리즘

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

  const MAX_ATTEMPTS = 100;

  // 1차: 모든 제약 (history 포함) 적용
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = tryAssignment(students, positions, posMap, totalSeats, fixedSeats, separationRules, layout, data);
    if (result) return result;
  }

  // 2차 폴백: history 제약 없이 재시도
  if (data.useHistoryExclusion !== false && (data.assignmentHistory || []).length > 0) {
    const fallbackData = { ...data, useHistoryExclusion: false };
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const result = tryAssignment(students, positions, posMap, totalSeats, fixedSeats, separationRules, layout, fallbackData);
      if (result) {
        result._historyFallback = true;
        return result;
      }
    }
  }

  return null; // 실패
}

function tryAssignment(students, positions, posMap, totalSeats, fixedSeats, separationRules, layout, data) {
  const assignment = {}; // seatIndex → studentName
  const assignedStudents = new Set();
  const usedSeats = new Set();

  // 1. 고정 자리 먼저 배정
  for (const fs of fixedSeats) {
    if (!students.includes(fs.studentName)) continue;
    if (fs.seatIndex >= totalSeats) continue;
    assignment[fs.seatIndex] = fs.studentName;
    assignedStudents.add(fs.studentName);
    usedSeats.add(fs.seatIndex);
  }

  // 2. 나머지 학생 & 자리
  const remaining = students.filter(s => !assignedStudents.has(s));
  const freeSeats = positions
    .map(p => p.index)
    .filter(idx => !usedSeats.has(idx));

  // 제약 조건이 많은 학생 우선 (Most-Constrained-First)
  const constraintCount = {};
  remaining.forEach(s => constraintCount[s] = 0);
  separationRules.forEach(rule => {
    if (constraintCount[rule.studentA] !== undefined) constraintCount[rule.studentA]++;
    if (constraintCount[rule.studentB] !== undefined) constraintCount[rule.studentB]++;
  });

  remaining.sort((a, b) => constraintCount[b] - constraintCount[a]);

  // 자리 순서 셔플
  shuffle(freeSeats);

  // 3. 백트래킹 배치
  const success = backtrack(0, remaining, freeSeats, assignment, posMap, separationRules, layout, data);
  return success ? assignment : null;
}

function backtrack(studentIdx, students, freeSeats, assignment, posMap, rules, layout, data) {
  if (studentIdx >= students.length) return true;

  const student = students[studentIdx];
  const shuffledSeats = [...freeSeats];
  shuffle(shuffledSeats);

  for (const seatIdx of shuffledSeats) {
    if (assignment[seatIdx] !== undefined) continue;

    // 분리 규칙 검증
    if (!checkConstraints(student, seatIdx, assignment, posMap, rules, layout)) continue;

    // 성별 제약 검증
    if (!checkGenderConstraint(student, seatIdx, assignment, posMap, layout, data)) continue;

    // 이전 자리 제약 검증
    if (!checkHistoryConstraint(student, seatIdx, data)) continue;

    // 배치
    assignment[seatIdx] = student;

    if (backtrack(studentIdx + 1, students, freeSeats, assignment, posMap, rules, layout, data)) {
      return true;
    }

    // 되돌리기
    delete assignment[seatIdx];
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
 * 성별 제약 검증
 * pair 레이아웃: 짝 파트너와 비교
 * 기타 레이아웃: Manhattan 거리 1인 인접 자리와 비교
 */
function checkGenderConstraint(student, seatIdx, assignment, posMap, layout, data) {
  const genderRule = data.genderRule || 'none';
  if (genderRule === 'none') return true;

  const genders = data.studentGenders || {};
  const myGender = genders[student];
  if (!myGender) return true; // 성별 미지정이면 통과

  const pos = posMap[seatIdx];
  if (!pos) return true;

  // 인접 좌석 찾기
  const adjacentSeats = [];
  if (data.layoutType === 'pair') {
    // 짝대형: 같은 행에서 짝 파트너
    const partnerCol = pos.col % 2 === 0 ? pos.col + 1 : pos.col - 1;
    for (const [seat, name] of Object.entries(assignment)) {
      const otherPos = posMap[Number(seat)];
      if (otherPos && otherPos.row === pos.row && otherPos.col === partnerCol) {
        adjacentSeats.push(name);
      }
    }
  } else {
    // 기타: 상하좌우 (Manhattan 거리 1)
    for (const [seat, name] of Object.entries(assignment)) {
      const otherPos = posMap[Number(seat)];
      if (otherPos) {
        const dist = Math.abs(pos.row - otherPos.row) + Math.abs(pos.col - otherPos.col);
        if (dist === 1) adjacentSeats.push(name);
      }
    }
  }

  for (const neighbor of adjacentSeats) {
    const neighborGender = genders[neighbor];
    if (!neighborGender) continue; // 상대 성별 미지정이면 건너뜀
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
