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
      groupCount: 0,
      groupSizes: [],
      groupLayoutMode: 'auto',
      groupDesks: [],
      disabledSeats: []  // 사용자가 X로 삭제한 좌석 인덱스들
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
  const disabled = (data.layoutSettings.disabledSeats || []).length;
  let raw;
  if (data.layoutType === 'custom') {
    raw = data.layoutSettings.customDesks.length;
  } else if (data.layoutType === 'group') {
    const fallback = Math.max(2, Math.min(8, data.layoutSettings.groupSize || 4));
    if (Array.isArray(data.layoutSettings.groupSizes) && data.layoutSettings.groupSizes.length > 0) {
      raw = data.layoutSettings.groupSizes
        .map(n => Math.max(1, Math.min(8, parseInt(n) || fallback)))
        .reduce((a, b) => a + b, 0);
    } else if (data.layoutSettings.groupCount && data.layoutSettings.groupCount > 0) {
      raw = data.layoutSettings.groupCount * fallback;
    } else if (data.layoutSettings.groupPositions && data.layoutSettings.groupPositions.length > 0) {
      raw = data.layoutSettings.groupPositions.length * fallback;
    } else {
      const cols = data.layoutSettings.columns || 6;
      const rows = data.layoutSettings.rows || 5;
      raw = cols * rows;
    }
  } else {
    raw = data.layoutSettings.columns * data.layoutSettings.rows;
  }
  // 사용자가 X로 비활성화한 좌석 제외 (자유배치는 책상 자체가 배열에서 빠지므로 별도 차감 불필요)
  return data.layoutType === 'custom' ? raw : Math.max(0, raw - disabled);
}
