// 데이터 모델 및 검증

export function createDefaultData() {
  return {
    students: [],
    classSize: 0,
    layoutType: 'exam',
    layoutSettings: {
      columns: 6,
      rows: 5,
      customDesks: []
    },
    fixedSeats: [],
    separationRules: [],
    lastAssignment: null,
    studentGenders: {},
    genderRule: 'none',
    assignmentHistory: [],
    historyExcludeCount: 1,
    useHistoryExclusion: true,
    viewPerspective: 'student'
  };
}

export function validateStudents(students) {
  if (!Array.isArray(students)) return [];
  return students
    .filter(s => typeof s === 'string')
    .map(s => s.trim().slice(0, 50))
    .filter(s => s.length > 0)
    .slice(0, 100);
}

export function validateFixedSeat(fixedSeat, students, totalSeats) {
  if (!fixedSeat.studentName || fixedSeat.seatIndex === undefined) return false;
  if (!students.includes(fixedSeat.studentName)) return false;
  if (fixedSeat.seatIndex < 0 || fixedSeat.seatIndex >= totalSeats) return false;
  return true;
}

export function validateSeparationRule(rule, students) {
  if (!rule.studentA || !rule.studentB) return false;
  if (rule.studentA === rule.studentB) return false;
  if (!students.includes(rule.studentA) || !students.includes(rule.studentB)) return false;
  if (rule.minDistance < 1 || rule.minDistance > 5) return false;
  return true;
}

export function getTotalSeats(data) {
  if (data.layoutType === 'custom') {
    return data.layoutSettings.customDesks.length;
  }
  return data.layoutSettings.columns * data.layoutSettings.rows;
}
