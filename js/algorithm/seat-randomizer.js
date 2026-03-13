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

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = tryAssignment(students, positions, posMap, totalSeats, fixedSeats, separationRules, layout);
    if (result) return result;
  }

  return null; // 실패
}

function tryAssignment(students, positions, posMap, totalSeats, fixedSeats, separationRules, layout) {
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
  const success = backtrack(0, remaining, freeSeats, assignment, posMap, separationRules, layout);
  return success ? assignment : null;
}

function backtrack(studentIdx, students, freeSeats, assignment, posMap, rules, layout) {
  if (studentIdx >= students.length) return true;

  const student = students[studentIdx];
  const shuffledSeats = [...freeSeats];
  shuffle(shuffledSeats);

  for (const seatIdx of shuffledSeats) {
    if (assignment[seatIdx] !== undefined) continue;

    // 분리 규칙 검증
    if (!checkConstraints(student, seatIdx, assignment, posMap, rules, layout)) continue;

    // 배치
    assignment[seatIdx] = student;
    const seatPos = freeSeats.indexOf(seatIdx);

    if (backtrack(studentIdx + 1, students, freeSeats, assignment, posMap, rules, layout)) {
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
