import type { ClassData } from './types';

export const LIMITS = { MAX_CLASSES: 15, MAX_STUDENTS: 100, MAX_NAME: 50, MIN_GRID: 1, MAX_GRID: 12, MAX_HISTORY: 5 } as const;

export function createDefaultData(): ClassData {
  return {
    schemaVersion: 2,
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
      disabledSeats: [],
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
    groupExcludeCount: 1,
  };
}
