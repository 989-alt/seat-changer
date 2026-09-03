// 반 데이터 모델 타입 정의 (legacy/js/data/models.js 대응, schemaVersion 2)

export type LayoutType = 'exam' | 'pair' | 'ushape' | 'custom' | 'group';
export type GenderRule = 'none' | 'same' | 'mixed' | 'mixedFirst';
export type Gender = 'M' | 'F';
export type Assignment = Record<number, string>; // seatIndex -> 학생 이름

export interface Desk {
  x: number;
  y: number;
}

export interface GroupPosition {
  groupIndex: number;
  x: number;
  y: number;
}

export interface LayoutSettings {
  columns: number;
  rows: number;
  customDesks: Desk[];
  groupSize: number;
  groupCount: number;
  groupSizes: number[];
  groupLayoutMode: 'auto' | 'manual';
  groupDesks: Desk[];
  groupPositions?: GroupPosition[];
  disabledSeats: number[];
}

export interface FixedSeat {
  studentName: string;
  seatIndex: number;
}

export interface SeparationRule {
  studentA: string;
  studentB: string;
  minDistance: number;
}

export interface AssignmentRecord {
  mapping: Assignment;
  timestamp: number;
  date?: string;
}

export interface GroupRecord {
  groups: string[][];
  timestamp: number;
  date?: string;
}

export interface ClassData {
  schemaVersion: 2;
  students: string[];
  classSize: number;
  layoutType: LayoutType;
  layoutSettings: LayoutSettings;
  fixedSeats: FixedSeat[];
  separationRules: SeparationRule[];
  lastAssignment: AssignmentRecord | null;
  studentGenders: Record<string, Gender>;
  genderRule: GenderRule;
  assignmentHistory: AssignmentRecord[];
  historyExcludeCount: 1 | 2 | 3;
  useHistoryExclusion: boolean;
  viewPerspective: 'student' | 'teacher';
  groupHistory: GroupRecord[];
  useGroupExclusion: boolean;
  groupExcludeCount: 1 | 2 | 3;
}
