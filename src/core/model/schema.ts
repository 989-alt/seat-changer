import { z } from 'zod';
import type { ClassData } from './types';
import { LIMITS } from './defaults';

export function sanitizeStudents(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim().replace(/[<>"'&]/g, '').slice(0, LIMITS.MAX_NAME))
    .filter((s) => s.length > 0)
    .slice(0, LIMITS.MAX_STUDENTS);
}

const grid = z.number().int().min(LIMITS.MIN_GRID).max(LIMITS.MAX_GRID);
const Desk = z.object({ x: z.number(), y: z.number() });

// R55: '0' 또는 선행 0 없는 자연수 문자열만 정규 좌석 키로 인정한다.
// '', ' 1 ', '1e2', '01', '-1'과 안전정수 범위를 벗어나는 값은 모두 거부해
// safeParse가 실패하도록 한다(조용히 버려지지 않음).
const ASSIGNMENT_KEY_PATTERN = /^(0|[1-9]\d*)$/;

const Assignment = z
  .record(z.string(), z.string())
  .superRefine((r, ctx) => {
    const seen = new Set<number>();
    for (const k of Object.keys(r)) {
      const n = Number(k);
      if (!ASSIGNMENT_KEY_PATTERN.test(k) || !Number.isSafeInteger(n)) {
        ctx.addIssue({ code: 'custom', message: `좌석 키는 0 이상의 정수 문자열이어야 한다: "${k}"`, path: [k] });
        continue;
      }
      if (seen.has(n)) {
        ctx.addIssue({ code: 'custom', message: `중복된 좌석 키: "${k}"`, path: [k] });
        continue;
      }
      seen.add(n);
    }
  })
  .transform((r) => {
    const out: Record<number, string> = {};
    for (const [k, v] of Object.entries(r)) {
      if (ASSIGNMENT_KEY_PATTERN.test(k) && Number.isSafeInteger(Number(k))) out[Number(k)] = v;
    }
    return out;
  });
const AssignmentRecord = z.object({ mapping: Assignment, timestamp: z.number(), date: z.string().optional() });
const count123 = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const ClassDataSchema = z.object({
  schemaVersion: z.literal(2),
  students: z.array(z.string().min(1).max(LIMITS.MAX_NAME)).max(LIMITS.MAX_STUDENTS),
  classSize: z.number().int().min(0),
  layoutType: z.enum(['exam', 'pair', 'ushape', 'custom', 'group']),
  layoutSettings: z.object({
    columns: grid,
    rows: grid,
    customDesks: z.array(Desk).max(200),
    groupSize: z.number().int().min(2).max(8),
    groupCount: z.number().int().min(0).max(20),
    groupSizes: z.array(z.number().int().min(1).max(8)).max(20),
    groupLayoutMode: z.enum(['auto', 'manual']),
    groupDesks: z.array(Desk).max(200),
    groupPositions: z.array(z.object({ groupIndex: z.number().int(), x: z.number(), y: z.number() })).max(50).optional(),
    disabledSeats: z.array(z.number().int().min(0).max(999)).max(200),
  }),
  fixedSeats: z.array(z.object({ studentName: z.string(), seatIndex: z.number().int().min(0) })).max(100),
  separationRules: z.array(z.object({ studentA: z.string(), studentB: z.string(), minDistance: z.number().int().min(1).max(5) })).max(50),
  lastAssignment: AssignmentRecord.nullable(),
  studentGenders: z.record(z.string(), z.enum(['M', 'F'])),
  genderRule: z.enum(['none', 'same', 'mixed', 'mixedFirst']),
  assignmentHistory: z.array(AssignmentRecord).max(10),
  historyExcludeCount: count123,
  useHistoryExclusion: z.boolean(),
  viewPerspective: z.enum(['student', 'teacher']),
  groupHistory: z.array(z.object({ groups: z.array(z.array(z.string())), timestamp: z.number(), date: z.string().optional() })).max(10),
  useGroupExclusion: z.boolean(),
  groupExcludeCount: count123,
})
  // R54: fixedSeats에 같은 좌석이 두 번, 같은 학생이 두 번 나오면 실패시킨다.
  // 이는 나중에 랜덤 배치기가 한쪽을 조용히 무시하는 것을 막는다.
  // 명단 소속·좌석 범위·비활성 좌석 여부는 레이아웃 좌석 수에 의존하므로 이후 Task에서 다룬다.
  .superRefine((data, ctx) => {
    const seatSeen = new Set<number>();
    const nameSeen = new Set<string>();
    data.fixedSeats.forEach((fs, i) => {
      if (seatSeen.has(fs.seatIndex)) {
        ctx.addIssue({ code: 'custom', message: `중복된 좌석 인덱스: ${fs.seatIndex}`, path: ['fixedSeats', i, 'seatIndex'] });
      }
      seatSeen.add(fs.seatIndex);
      if (nameSeen.has(fs.studentName)) {
        ctx.addIssue({ code: 'custom', message: `중복 고정된 학생: ${fs.studentName}`, path: ['fixedSeats', i, 'studentName'] });
      }
      nameSeen.add(fs.studentName);
    });
  }) as unknown as z.ZodType<ClassData>;
