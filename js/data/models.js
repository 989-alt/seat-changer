// 데이터 모델 및 검증

export function createDefaultData() {
  return {
    students: [],
    classSize: 0,
    layoutType: 'exam',
    layoutSettings: {
      columns: 6,
      rows: 5,
      customDesks: [],
      groupSize: 4,
      groupLayoutMode: 'auto',
      groupDesks: []
    },
    fixedSeats: [],
    separationRules: [],
    lastAssignment: null,
    studentGenders: {},
    genderRule: 'none',
    assignmentHistory: [],
    historyExcludeCount: 1,
    useHistoryExclusion: true,
    viewPerspective: 'student',
    groupHistory: [],
    useGroupExclusion: true,
    groupExcludeCount: 1
  };
}

export function validateStudents(students) {
  if (!Array.isArray(students)) return [];
  return students
    .filter(s => typeof s === 'string')
    .map(s => s.trim().replace(/[<>"'&]/g, '').slice(0, 50))
    .filter(s => s.length > 0)
    .slice(0, 100);
}

export function validateFixedSeat(fixedSeat, students, totalSeats) {
  if (!fixedSeat || typeof fixedSeat !== 'object') return false;
  if (typeof fixedSeat.studentName !== 'string' || !fixedSeat.studentName) return false;
  if (typeof fixedSeat.seatIndex !== 'number' || !Number.isInteger(fixedSeat.seatIndex)) return false;
  if (!students.includes(fixedSeat.studentName)) return false;
  if (fixedSeat.seatIndex < 0 || fixedSeat.seatIndex >= totalSeats) return false;
  return true;
}

export function validateSeparationRule(rule, students) {
  if (!rule || typeof rule !== 'object') return false;
  if (typeof rule.studentA !== 'string' || typeof rule.studentB !== 'string') return false;
  if (!rule.studentA || !rule.studentB) return false;
  if (rule.studentA === rule.studentB) return false;
  if (!students.includes(rule.studentA) || !students.includes(rule.studentB)) return false;
  if (typeof rule.minDistance !== 'number' || rule.minDistance < 1 || rule.minDistance > 5) return false;
  return true;
}

export function getTotalSeats(data) {
  if (data.layoutType === 'custom') {
    return data.layoutSettings.customDesks.length;
  }
  if (data.layoutType === 'group') {
    if (data.layoutSettings.groupPositions && data.layoutSettings.groupPositions.length > 0) {
      const groupSize = data.layoutSettings.groupSize || 4;
      return data.layoutSettings.groupPositions.length * groupSize;
    }
    const groupSize = data.layoutSettings.groupSize || 4;
    const cols = data.layoutSettings.columns || 6;
    const rows = data.layoutSettings.rows || 5;
    return cols * rows;
  }
  return data.layoutSettings.columns * data.layoutSettings.rows;
}
