// 자리바꾸기 로직 검증 테스트 (최적화 알고리즘 반영)
// 알고리즘 핵심 함수들을 인라인으로 포함 (Node.js에서 DOM 없이 실행)

// === layout-engine ===
function manhattanDistance(pos1, pos2) {
  return Math.abs(pos1.row - pos2.row) + Math.abs(pos1.col - pos2.col);
}

// === layouts ===
function gridPositions(settings) {
  const positions = [];
  for (let r = 0; r < settings.rows; r++) {
    for (let c = 0; c < settings.columns; c++) {
      positions.push({ index: r * settings.columns + c, row: r, col: c });
    }
  }
  return positions;
}

function ushapePositions(settings) {
  const { columns, rows } = settings;
  const positions = [];
  let idx = 0;
  for (let c = 0; c < columns; c++) positions.push({ index: idx++, row: 0, col: c });
  for (let r = 1; r <= rows; r++) positions.push({ index: idx++, row: r, col: 0 });
  for (let r = 1; r <= rows; r++) positions.push({ index: idx++, row: r, col: columns - 1 });
  return positions;
}

const layouts = {
  exam: {
    getSeatPositions: gridPositions,
    getSeatCount: s => s.columns * s.rows,
    distance: manhattanDistance
  },
  pair: {
    getSeatPositions: gridPositions,
    getSeatCount: s => s.columns * s.rows,
    distance: manhattanDistance
  },
  ushape: {
    getSeatPositions: ushapePositions,
    getSeatCount: s => s.columns + s.rows * 2,
    distance: manhattanDistance
  }
};

// === 최적화된 알고리즘 (seat-randomizer.js와 동일) ===

const MAX_ATTEMPTS = 15;
const TIMEOUT_MS = 3000;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildAdjacencyMap(positions, posMap, data) {
  const map = {};
  for (const pos of positions) {
    const neighbors = [];
    if (data.layoutType === 'pair') {
      const partnerCol = pos.col % 2 === 0 ? pos.col + 1 : pos.col - 1;
      for (const other of positions) {
        if (other.row === pos.row && other.col === partnerCol) {
          neighbors.push(other.index);
        }
      }
    } else {
      for (const other of positions) {
        const dist = Math.abs(pos.row - other.row) + Math.abs(pos.col - other.col);
        if (dist === 1) neighbors.push(other.index);
      }
    }
    map[pos.index] = neighbors;
  }
  return map;
}

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

    const fit1 = (maleCount <= evenSeats.length && femaleCount <= oddSeats.length);
    const fit2 = (maleCount <= oddSeats.length && femaleCount <= evenSeats.length);

    let maleSeats, femaleSeats;
    if (fit1 && fit2) {
      const slack1 = (evenSeats.length - maleCount) + (oddSeats.length - femaleCount);
      const slack2 = (oddSeats.length - maleCount) + (evenSeats.length - femaleCount);
      if (slack1 >= slack2) { maleSeats = evenSeats; femaleSeats = oddSeats; }
      else { maleSeats = oddSeats; femaleSeats = evenSeats; }
    } else if (fit1) {
      maleSeats = evenSeats; femaleSeats = oddSeats;
    } else if (fit2) {
      maleSeats = oddSeats; femaleSeats = evenSeats;
    } else {
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
    let maleCount = 0, femaleCount = 0;
    students.forEach(s => {
      if (genders[s] === 'M') maleCount++;
      else if (genders[s] === 'F') femaleCount++;
    });

    const rowSet = new Set();
    for (const seatIdx of availableSeats) {
      const pos = posMap[seatIdx];
      if (pos) rowSet.add(pos.row);
    }
    const rows = [...rowSet].sort((a, b) => a - b);

    const seatsPerRow = {};
    rows.forEach(r => { seatsPerRow[r] = 0; });
    for (const seatIdx of availableSeats) {
      const pos = posMap[seatIdx];
      if (pos && seatsPerRow[pos.row] !== undefined) seatsPerRow[pos.row]++;
    }

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
      students.forEach(s => { result[s] = allSeats; });
    }
    return result;
  }

  students.forEach(s => { result[s] = allSeats; });
  return result;
}

function checkConstraints(student, seatIdx, assignment, posMap, rules, layout) {
  const pos = posMap[seatIdx];
  if (!pos) return false;
  for (const rule of rules) {
    let otherStudent = null;
    if (rule.studentA === student) otherStudent = rule.studentB;
    else if (rule.studentB === student) otherStudent = rule.studentA;
    else continue;
    for (const [assignedSeat, assignedName] of Object.entries(assignment)) {
      if (assignedName === otherStudent) {
        const otherPos = posMap[Number(assignedSeat)];
        if (otherPos && layout.distance(pos, otherPos) <= rule.minDistance) return false;
      }
    }
  }
  return true;
}

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

function checkHistoryConstraint(student, seatIdx, data) {
  if (data.useHistoryExclusion === false) return true;
  const fixedSeats = data.fixedSeats || [];
  if (fixedSeats.some(fs => fs.studentName === student && fs.seatIndex === seatIdx)) return true;
  const history = data.assignmentHistory || [];
  const excludeCount = data.historyExcludeCount || 1;
  const recordsToCheck = [];
  if (data.lastAssignment && data.lastAssignment.mapping) recordsToCheck.push(data.lastAssignment.mapping);
  const recentHistory = history.slice(-excludeCount);
  for (const record of recentHistory) {
    if (record.mapping) recordsToCheck.push(record.mapping);
  }
  for (const mapping of recordsToCheck) {
    if (mapping[seatIdx] === student) return false;
  }
  return true;
}

function backtrack(studentIdx, students, availableSeats, assignment, posMap, rules, layout, data, adjacencyMap, genderValidSeats, deadline) {
  if (studentIdx >= students.length) return true;
  if ((studentIdx & 7) === 0 && Date.now() > deadline) return false;

  const student = students[studentIdx];
  const validSeats = genderValidSeats[student] || [];
  const candidates = [];
  for (const s of validSeats) {
    if (availableSeats.has(s)) candidates.push(s);
  }
  if (candidates.length === 0) return false;
  shuffle(candidates);

  for (const seatIdx of candidates) {
    if (!checkConstraints(student, seatIdx, assignment, posMap, rules, layout)) continue;
    if (!checkGenderConstraintFast(student, seatIdx, assignment, adjacencyMap, data)) continue;
    if (!checkHistoryConstraint(student, seatIdx, data)) continue;

    assignment[seatIdx] = student;
    availableSeats.delete(seatIdx);

    if (backtrack(studentIdx + 1, students, availableSeats, assignment, posMap, rules, layout, data, adjacencyMap, genderValidSeats, deadline)) {
      return true;
    }

    delete assignment[seatIdx];
    availableSeats.add(seatIdx);
  }
  return false;
}

function tryAssignment(students, positions, posMap, totalSeats, fixedSeats, separationRules, layout, data, adjacencyMap, deadline) {
  const assignment = {};
  const assignedStudents = new Set();
  const availableSeats = new Set();

  for (const fs of fixedSeats) {
    if (!students.includes(fs.studentName)) continue;
    if (fs.seatIndex >= totalSeats) continue;
    assignment[fs.seatIndex] = fs.studentName;
    assignedStudents.add(fs.studentName);
  }

  positions.forEach(p => {
    if (assignment[p.index] === undefined) availableSeats.add(p.index);
  });

  const remaining = students.filter(s => !assignedStudents.has(s));
  const genderValidSeats = precomputeGenderSeats(remaining, availableSeats, posMap, data);

  const genders = data.studentGenders || {};
  const genderRule = data.genderRule || 'none';
  const constraintScore = {};

  remaining.forEach(s => {
    let score = 0;
    separationRules.forEach(rule => {
      if (rule.studentA === s || rule.studentB === s) score += 2;
    });
    const validCount = genderValidSeats[s] ? genderValidSeats[s].length : availableSeats.size;
    score += Math.max(0, availableSeats.size - validCount);
    constraintScore[s] = score;
  });

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

  const success = backtrack(0, remaining, availableSeats, assignment, posMap, separationRules, layout, data, adjacencyMap, genderValidSeats, deadline);
  return success ? assignment : null;
}

function randomizeSeats(data) {
  const { students, layoutType, layoutSettings, fixedSeats, separationRules } = data;
  const layout = layouts[layoutType];
  if (!layout) return null;
  const positions = layout.getSeatPositions(layoutSettings);
  const totalSeats = positions.length;
  if (students.length === 0 || students.length > totalSeats) return null;
  const posMap = {};
  positions.forEach(p => posMap[p.index] = p);

  const adjacencyMap = buildAdjacencyMap(positions, posMap, data);
  const deadline = Date.now() + TIMEOUT_MS;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (Date.now() > deadline) break;
    const result = tryAssignment(students, positions, posMap, totalSeats, fixedSeats, separationRules, layout, data, adjacencyMap, deadline);
    if (result) return result;
  }

  if (data.useHistoryExclusion !== false && (data.assignmentHistory || []).length > 0) {
    const fallbackData = { ...data, useHistoryExclusion: false };
    const deadline2 = Date.now() + TIMEOUT_MS;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (Date.now() > deadline2) break;
      const result = tryAssignment(students, positions, posMap, totalSeats, fixedSeats, separationRules, layout, fallbackData, adjacencyMap, deadline2);
      if (result) { result._historyFallback = true; return result; }
    }
  }

  return null;
}

// ============================================================
// 테스트 실행
// ============================================================

const students = Array.from({ length: 20 }, (_, i) => String(i + 1));

const studentGenders = {};
for (let i = 1; i <= 10; i++) studentGenders[String(i)] = 'M';
for (let i = 11; i <= 20; i++) studentGenders[String(i)] = 'F';

const fixedSeats = [{ studentName: '5', seatIndex: 0 }];

const separationRules = [
  { studentA: '2', studentB: '3', minDistance: 3 },
  { studentA: '8', studentB: '20', minDistance: 4 },
  { studentA: '9', studentB: '11', minDistance: 1 },
];

const layoutConfigs = {
  exam:   { columns: 6, rows: 5 },
  pair:   { columns: 6, rows: 5 },
  ushape: { columns: 10, rows: 7 },
};

const genderRules = ['none', 'same', 'mixed'];
const RUNS = 10;

let totalTests = 0;
let totalFails = 0;

for (const [layoutType, layoutSettings] of Object.entries(layoutConfigs)) {
  for (const genderRule of genderRules) {
    const layout = layouts[layoutType];
    const positions = layout.getSeatPositions(layoutSettings);
    const posMap = {};
    positions.forEach(p => posMap[p.index] = p);
    const totalSeats = positions.length;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`레이아웃: ${layoutType} (${totalSeats}석) | 성별규칙: ${genderRule}`);
    console.log('='.repeat(60));

    let passCount = 0;
    let failCount = 0;
    const times = [];

    for (let run = 1; run <= RUNS; run++) {
      const data = {
        students,
        layoutType,
        layoutSettings,
        fixedSeats,
        separationRules,
        studentGenders,
        genderRule,
        assignmentHistory: [],
        historyExcludeCount: 1,
        useHistoryExclusion: false,
        lastAssignment: null,
      };

      const t0 = performance.now();
      const result = randomizeSeats(data);
      const elapsed = performance.now() - t0;
      times.push(elapsed);
      totalTests++;

      if (!result) {
        console.log(`  [${run}] ❌ 배치 실패 (null 반환) [${elapsed.toFixed(1)}ms]`);
        failCount++;
        totalFails++;
        continue;
      }

      const violations = [];

      // 1. 고정 자리 검증
      for (const fs of fixedSeats) {
        if (result[fs.seatIndex] !== fs.studentName) {
          violations.push(`고정자리 위반: "${fs.studentName}"이 ${fs.seatIndex + 1}번이 아닌 다른 자리에 배치됨`);
        }
      }

      // 2. 분리 규칙 검증
      for (const rule of separationRules) {
        let seatA = null, seatB = null;
        for (const [seat, name] of Object.entries(result)) {
          if (name === rule.studentA) seatA = Number(seat);
          if (name === rule.studentB) seatB = Number(seat);
        }
        if (seatA !== null && seatB !== null) {
          const posA = posMap[seatA];
          const posB = posMap[seatB];
          if (posA && posB) {
            const dist = manhattanDistance(posA, posB);
            if (dist <= rule.minDistance) {
              violations.push(`분리 위반: "${rule.studentA}" ↔ "${rule.studentB}" 거리=${dist} (최소 ${rule.minDistance} 필요)`);
            }
          }
        }
      }

      // 3. 성별 규칙 검증
      if (genderRule !== 'none') {
        for (const [seat, name] of Object.entries(result)) {
          const seatIdx = Number(seat);
          const pos = posMap[seatIdx];
          const myGender = studentGenders[name];
          if (!myGender || !pos) continue;

          const neighbors = [];
          if (layoutType === 'pair') {
            const partnerCol = pos.col % 2 === 0 ? pos.col + 1 : pos.col - 1;
            for (const [s2, n2] of Object.entries(result)) {
              const p2 = posMap[Number(s2)];
              if (p2 && p2.row === pos.row && p2.col === partnerCol) neighbors.push(n2);
            }
          } else {
            for (const [s2, n2] of Object.entries(result)) {
              if (s2 === seat) continue;
              const p2 = posMap[Number(s2)];
              if (p2 && manhattanDistance(pos, p2) === 1) neighbors.push(n2);
            }
          }

          for (const neighbor of neighbors) {
            const nGender = studentGenders[neighbor];
            if (!nGender) continue;
            if (genderRule === 'same' && myGender !== nGender) {
              violations.push(`성별(동성) 위반: "${name}"(${myGender}) ↔ "${neighbor}"(${nGender}) | 자리 ${seatIdx + 1}번`);
            }
            if (genderRule === 'mixed' && myGender === nGender) {
              violations.push(`성별(이성) 위반: "${name}"(${myGender}) ↔ "${neighbor}"(${nGender}) | 자리 ${seatIdx + 1}번`);
            }
          }
        }
        const uniqueViolations = [...new Set(violations)];
        violations.length = 0;
        violations.push(...uniqueViolations);
      }

      // 4. 모든 학생 배치 확인
      const assignedStudents = new Set(Object.values(result).filter(v => typeof v === 'string'));
      for (const s of students) {
        if (!assignedStudents.has(s)) {
          violations.push(`미배치 학생: "${s}"`);
        }
      }

      if (violations.length > 0) {
        console.log(`  [${run}] ❌ 위반 ${violations.length}건: [${elapsed.toFixed(1)}ms]`);
        violations.forEach(v => console.log(`       - ${v}`));
        failCount++;
        totalFails++;
      } else {
        console.log(`  [${run}] ✅ 통과 [${elapsed.toFixed(1)}ms]`);
        passCount++;
      }
    }

    const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
    const maxMs = Math.max(...times);
    console.log(`  → 결과: ${passCount}/${RUNS} 통과, ${failCount}/${RUNS} 실패 | 평균 ${avgMs.toFixed(1)}ms, 최대 ${maxMs.toFixed(1)}ms`);
  }
}

// === 이전 자리 방지 테스트 ===
console.log(`\n${'='.repeat(60)}`);
console.log(`이전 자리 방지 테스트 (exam 6x5=30석, 성별규칙 없음)`);
console.log('='.repeat(60));

{
  const layoutType = 'exam';
  const layoutSettings = { columns: 6, rows: 5 };
  const layout = layouts[layoutType];
  const positions = layout.getSeatPositions(layoutSettings);
  const posMap = {};
  positions.forEach(p => posMap[p.index] = p);

  let lastAssignment = null;
  const assignmentHistory = [];
  let historyViolations = 0;

  for (let run = 1; run <= RUNS; run++) {
    const data = {
      students,
      layoutType,
      layoutSettings,
      fixedSeats,
      separationRules,
      studentGenders,
      genderRule: 'none',
      assignmentHistory: assignmentHistory.slice(),
      historyExcludeCount: 1,
      useHistoryExclusion: true,
      lastAssignment: lastAssignment,
    };

    const t0 = performance.now();
    const result = randomizeSeats(data);
    const elapsed = performance.now() - t0;
    totalTests++;

    if (!result) {
      console.log(`  [${run}] ❌ 배치 실패 [${elapsed.toFixed(1)}ms]`);
      totalFails++;
      continue;
    }

    const fallback = result._historyFallback;
    if (fallback) delete result._historyFallback;

    let overlaps = 0;
    if (lastAssignment && lastAssignment.mapping) {
      const prev = lastAssignment.mapping;
      for (const [seat, name] of Object.entries(result)) {
        if (fixedSeats.some(fs => fs.studentName === name && fs.seatIndex === Number(seat))) continue;
        if (prev[seat] === name) overlaps++;
      }
    }

    if (overlaps > 0 && !fallback) {
      console.log(`  [${run}] ❌ 이전 자리 중복 ${overlaps}건 (폴백 아님) [${elapsed.toFixed(1)}ms]`);
      historyViolations++;
      totalFails++;
    } else if (overlaps > 0 && fallback) {
      console.log(`  [${run}] ⚠️  폴백 발동 (중복 ${overlaps}건) [${elapsed.toFixed(1)}ms]`);
    } else {
      console.log(`  [${run}] ✅ 통과 (중복 0건) [${elapsed.toFixed(1)}ms]`);
    }

    if (lastAssignment && lastAssignment.mapping) {
      assignmentHistory.push({ mapping: lastAssignment.mapping, timestamp: Date.now() });
      if (assignmentHistory.length > 5) assignmentHistory.shift();
    }
    lastAssignment = { mapping: result, timestamp: Date.now() };
  }

  console.log(`  → 이전 자리 위반: ${historyViolations}건`);
}

// === 성능 스트레스 테스트 (35명, mixed, 분리규칙 5개) ===
console.log(`\n${'='.repeat(60)}`);
console.log(`성능 스트레스 테스트 (35명, exam 7x6=42석, mixed, 분리규칙 5개)`);
console.log('='.repeat(60));

{
  const bigStudents = Array.from({ length: 35 }, (_, i) => `학생${i + 1}`);
  const bigGenders = {};
  bigStudents.forEach((s, i) => { bigGenders[s] = i < 18 ? 'M' : 'F'; });

  const bigRules = [
    { studentA: '학생1', studentB: '학생2', minDistance: 3 },
    { studentA: '학생5', studentB: '학생10', minDistance: 2 },
    { studentA: '학생15', studentB: '학생20', minDistance: 4 },
    { studentA: '학생25', studentB: '학생30', minDistance: 2 },
    { studentA: '학생3', studentB: '학생35', minDistance: 3 },
  ];

  const stressTimes = [];
  let stressPass = 0;

  for (let run = 1; run <= 5; run++) {
    const data = {
      students: bigStudents,
      layoutType: 'exam',
      layoutSettings: { columns: 7, rows: 6 },
      fixedSeats: [{ studentName: '학생1', seatIndex: 0 }],
      separationRules: bigRules,
      studentGenders: bigGenders,
      genderRule: 'mixed',
      assignmentHistory: [],
      historyExcludeCount: 1,
      useHistoryExclusion: false,
      lastAssignment: null,
    };

    const t0 = performance.now();
    const result = randomizeSeats(data);
    const elapsed = performance.now() - t0;
    stressTimes.push(elapsed);
    totalTests++;

    if (!result) {
      console.log(`  [${run}] ❌ 실패 [${elapsed.toFixed(1)}ms]`);
      totalFails++;
    } else {
      console.log(`  [${run}] ✅ 통과 [${elapsed.toFixed(1)}ms]`);
      stressPass++;
    }
  }

  const avgMs = stressTimes.reduce((a, b) => a + b, 0) / stressTimes.length;
  const maxMs = Math.max(...stressTimes);
  console.log(`  → ${stressPass}/5 통과 | 평균 ${avgMs.toFixed(1)}ms, 최대 ${maxMs.toFixed(1)}ms`);
  if (maxMs < 500) console.log(`  → ⚡ 성능 우수 (최대 ${maxMs.toFixed(0)}ms < 500ms)`);
  else if (maxMs < 3000) console.log(`  → ⏳ 성능 보통 (최대 ${maxMs.toFixed(0)}ms < 3000ms)`);
  else console.log(`  → 🐌 성능 미흡 (최대 ${maxMs.toFixed(0)}ms >= 3000ms)`);
}

// === 최종 요약 ===
console.log(`\n${'='.repeat(60)}`);
console.log(`최종 요약`);
console.log('='.repeat(60));
console.log(`총 테스트: ${totalTests}건`);
console.log(`통과: ${totalTests - totalFails}건`);
console.log(`실패: ${totalFails}건`);
console.log(totalFails === 0 ? '\n🎉 모든 테스트 통과!' : '\n⚠️  일부 테스트 실패');
