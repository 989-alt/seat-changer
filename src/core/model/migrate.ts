// v1(스키마 버전 없음) 또는 v2 저장 데이터를 유효한 ClassData로 정규화한다.
// 이식 원본: legacy/js/data/store.js:12-22 (sanitizeObj), 170-215 (importJSON),
//            legacy/js/data/models.js:3-40 (createDefaultData, validateStudents)
//
// 원칙: 실제 교사 데이터를 절대 던져 버리지 않는다. 값이 이상하면 레거시와 같은
// 상한·기본값으로 접고, 스키마(Task 8)가 레거시보다 엄격해진 세 지점(R54/R55/R59)과
// 이번에 추가한 R76(학생 중복)은 parse 전에 결정적으로 정리한다.
import type {
  Assignment,
  AssignmentRecord,
  ClassData,
  Desk,
  FixedSeat,
  Gender,
  GenderRule,
  GroupPosition,
  GroupRecord,
  LayoutType,
  SeparationRule,
} from './types';
import { createDefaultData } from './defaults';
import { ASSIGNMENT_KEY_PATTERN, ClassDataSchema, sanitizeStudents } from './schema';

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** legacy sanitizeObj(store.js:12-22)와 동일. 프로토타입 오염 키를 재귀적으로 제거한다. */
export function stripDangerousKeys<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((v) => stripDangerousKeys(v)) as unknown as T;
  const clean = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (DANGEROUS_KEYS.has(key)) continue;
    clean[key] = stripDangerousKeys((obj as Record<string, unknown>)[key]);
  }
  return clean as unknown as T;
}

type Rec = Record<string, unknown>;

function asRecord(v: unknown): Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Rec) : {};
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Date가 표현할 수 있는 범위(±8.64e15ms) 안의 timestamp만 인정한다. 밖이면 `new Date(t).toISOString()`이 RangeError를 던진다 (R87). */
const MAX_TIMESTAMP_MS = 8.64e15;
function isValidTimestamp(v: unknown): v is number {
  return isFiniteNumber(v) && Math.abs(v) <= MAX_TIMESTAMP_MS;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/**
 * R2: 레거시 `Math.max(min, Math.min(max, parseInt(raw) || fallback))`을 그대로 옮긴다.
 * 0·비수치는 기본값으로, 음수는 하한(min)으로 접힌다.
 * R82: 레거시는 parseInt에 값을 그대로 넘겨 문자열화했지만, 프로토타입이 없는 객체
 * (sanitizeObj/stripDangerousKeys의 결과)는 toString이 없어 문자열화 자체가 던진다.
 * 숫자·문자열만 parseInt로 보내고 나머지는 기본값으로 되돌린다.
 */
function intField(raw: unknown, fallback: number, min: number, max: number): number {
  const n = typeof raw === 'number' || typeof raw === 'string' ? parseInt(String(raw), 10) : NaN;
  const base = Number.isFinite(n) && n !== 0 ? n : fallback;
  return Math.max(min, Math.min(max, base));
}

function pick<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(raw as T) ? (raw as T) : fallback;
}

function count123(raw: unknown): 1 | 2 | 3 {
  return raw === 1 || raw === 2 || raw === 3 ? raw : 1;
}

function desks(raw: unknown): Desk[] {
  return asArray(raw)
    .map((d) => asRecord(d))
    .filter((d) => isFiniteNumber(d.x) && isFiniteNumber(d.y))
    .map((d) => ({ x: d.x as number, y: d.y as number }))
    .slice(0, 200);
}

function groupPositions(raw: unknown): GroupPosition[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .map((p) => asRecord(p))
    .filter((p) => Number.isSafeInteger(p.groupIndex) && isFiniteNumber(p.x) && isFiniteNumber(p.y))
    .map((p) => ({ groupIndex: p.groupIndex as number, x: p.x as number, y: p.y as number }))
    .slice(0, 50);
}

// R59: 레거시 필터(정수·0 이상·1000 미만)에 중복 제거를 더한다. 같은 좌석을 두 번
// 비활성화해도 좌석 수 계산이 어긋나지 않게 한다. 먼저 등장한 순서를 유지한다.
function disabledSeats(raw: unknown): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const n of asArray(raw)) {
    if (!Number.isSafeInteger(n) || (n as number) < 0 || (n as number) >= 1000) continue;
    if (seen.has(n as number)) continue;
    seen.add(n as number);
    out.push(n as number);
  }
  return out.slice(0, 200);
}

// R54: 좌석 인덱스·학생 이름 모두 유일해야 한다. 먼저 나온 항목을 남긴다.
function fixedSeats(raw: unknown): FixedSeat[] {
  const seats = new Set<number>();
  const names = new Set<string>();
  const out: FixedSeat[] = [];
  for (const entry of asArray(raw)) {
    const f = asRecord(entry);
    if (!isNonEmptyString(f.studentName)) continue;
    if (!Number.isSafeInteger(f.seatIndex) || (f.seatIndex as number) < 0) continue;
    const seatIndex = f.seatIndex as number;
    if (seats.has(seatIndex) || names.has(f.studentName)) continue;
    seats.add(seatIndex);
    names.add(f.studentName);
    out.push({ studentName: f.studentName, seatIndex });
  }
  return out.slice(0, 100);
}

function separationRules(raw: unknown): SeparationRule[] {
  return asArray(raw)
    .map((entry) => asRecord(entry))
    .filter((r) => isNonEmptyString(r.studentA) && isNonEmptyString(r.studentB))
    .map((r) => ({
      studentA: r.studentA as string,
      studentB: r.studentB as string,
      // 스키마는 1~5 정수만 받는다. 규칙 자체는 교사가 입력한 의도이므로 버리지 않고 접는다.
      minDistance: intField(r.minDistance, 1, 1, 5),
    }))
    .slice(0, 50);
}

// R55: '0' 또는 선행 0 없는 자연수 문자열만 좌석 키로 인정한다.
// 패턴은 schema.ts에서 가져온다(단일 출처).
function assignmentMapping(raw: unknown): Assignment {
  const out: Assignment = {};
  for (const [k, v] of Object.entries(asRecord(raw))) {
    if (typeof v !== 'string') continue;
    if (!ASSIGNMENT_KEY_PATTERN.test(k) || !Number.isSafeInteger(Number(k))) continue;
    out[Number(k)] = v;
  }
  return out;
}

function assignmentRecord(raw: unknown): AssignmentRecord | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Rec;
  if (!isValidTimestamp(r.timestamp)) return null;
  const record: AssignmentRecord = { mapping: assignmentMapping(r.mapping), timestamp: r.timestamp };
  if (typeof r.date === 'string') record.date = r.date;
  return record;
}

function groupRecords(raw: unknown): GroupRecord[] {
  const out: GroupRecord[] = [];
  for (const entry of asArray(raw)) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue;
    const g = entry as Rec;
    if (!isValidTimestamp(g.timestamp)) continue;
    const groups = asArray(g.groups)
      .filter((row): row is unknown[] => Array.isArray(row))
      .map((row) => row.filter((s): s is string => typeof s === 'string'));
    const record: GroupRecord = { groups, timestamp: g.timestamp };
    if (typeof g.date === 'string') record.date = g.date;
    out.push(record);
  }
  return out.slice(0, 10);
}

// R76: 이름이 곧 학생 식별자이므로 중복은 허용하지 않는다. 먼저 나온 이름을 남긴다.
function uniqueStudents(raw: unknown): string[] {
  return [...new Set(sanitizeStudents(raw))];
}

const LAYOUT_TYPES = ['exam', 'pair', 'ushape', 'custom', 'group'] as const satisfies readonly LayoutType[];
const GENDER_RULES = ['none', 'same', 'mixed', 'mixedFirst'] as const satisfies readonly GenderRule[];

function studentGenders(raw: unknown): Record<string, Gender> {
  const out: Record<string, Gender> = {};
  for (const [name, g] of Object.entries(asRecord(raw))) {
    if (g === 'M' || g === 'F') out[name] = g;
  }
  return out;
}

/**
 * v1 또는 v2 객체를 v2 ClassData로 정규화한다. 값이 이상하면 버리거나 접어서
 * 유효한 ClassData를 만든다(마지막 ClassDataSchema.parse 실패는 이 함수의 버그다).
 *
 * 던질 수 있는 경우: 병적으로 깊게 중첩된 입력에서 stripDangerousKeys 재귀가
 * 스택을 넘길 때뿐이다. 호출자(loadClassData·importClassJSON)가 try/catch로 받는다.
 */
export function migrateToV2(input: unknown): ClassData {
  const parsed = asRecord(stripDangerousKeys(input));
  const defaults = createDefaultData();
  const ls = asRecord(parsed.layoutSettings);

  const students = uniqueStudents(parsed.students);
  const positions = groupPositions(ls.groupPositions);

  const data: ClassData = {
    schemaVersion: 2,
    students,
    classSize: students.length,
    layoutType: pick(parsed.layoutType, LAYOUT_TYPES, defaults.layoutType),
    layoutSettings: {
      columns: intField(ls.columns, defaults.layoutSettings.columns, 1, 12),
      rows: intField(ls.rows, defaults.layoutSettings.rows, 1, 12),
      customDesks: desks(ls.customDesks),
      groupSize: intField(ls.groupSize, defaults.layoutSettings.groupSize, 2, 8),
      groupCount: intField(ls.groupCount, 0, 0, 20),
      groupSizes: asArray(ls.groupSizes)
        .map((n) => intField(n, defaults.layoutSettings.groupSize, 1, 8))
        .slice(0, 20),
      groupLayoutMode: ls.groupLayoutMode === 'manual' ? 'manual' : 'auto',
      groupDesks: desks(ls.groupDesks),
      ...(positions === undefined ? {} : { groupPositions: positions }),
      disabledSeats: disabledSeats(ls.disabledSeats),
    },
    fixedSeats: fixedSeats(parsed.fixedSeats),
    separationRules: separationRules(parsed.separationRules),
    lastAssignment: assignmentRecord(parsed.lastAssignment),
    studentGenders: studentGenders(parsed.studentGenders),
    genderRule: pick(parsed.genderRule, GENDER_RULES, 'none'),
    assignmentHistory: asArray(parsed.assignmentHistory)
      .map((r) => assignmentRecord(r))
      .filter((r): r is AssignmentRecord => r !== null)
      .slice(0, 10),
    historyExcludeCount: count123(parsed.historyExcludeCount),
    useHistoryExclusion: parsed.useHistoryExclusion !== false,
    viewPerspective: parsed.viewPerspective === 'teacher' ? 'teacher' : 'student',
    groupHistory: groupRecords(parsed.groupHistory),
    useGroupExclusion: parsed.useGroupExclusion !== false,
    groupExcludeCount: count123(parsed.groupExcludeCount),
  };

  return ClassDataSchema.parse(data);
}

export type LoadResult =
  | { ok: true; data: ClassData; migrated: boolean }
  | { ok: false; data: ClassData; error: string };

// 저장 데이터를 읽지 못했을 때의 사용자 문구. 원문 예외 메시지는 노출하지 않는다.
const LOAD_UNREADABLE = '저장된 데이터를 읽지 못했습니다.';

export function loadClassData(raw: string | null): LoadResult {
  if (raw === null) return { ok: false, data: createDefaultData(), error: '저장된 데이터가 없습니다.' };
  try {
    // stripDangerousKeys는 migrateToV2가 한 번만 수행한다(중복 순회 방지).
    const parsed: unknown = JSON.parse(raw);
    // 객체가 아니면(null·배열·수·문자열) 반 데이터가 아니다. 빈 반으로 되살리지 않고 실패로 알린다.
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, data: createDefaultData(), error: LOAD_UNREADABLE };
    }
    const migrated = (parsed as { schemaVersion?: number }).schemaVersion !== 2;
    return { ok: true, data: migrateToV2(parsed), migrated };
  } catch {
    return { ok: false, data: createDefaultData(), error: LOAD_UNREADABLE };
  }
}
