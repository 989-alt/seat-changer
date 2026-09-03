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
const Assignment = z.record(z.string(), z.string()).transform((r) => {
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(r)) if (Number.isInteger(Number(k))) out[Number(k)] = v;
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
}) as unknown as z.ZodType<ClassData>;
