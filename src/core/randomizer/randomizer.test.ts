import { randomizeSeats } from './index';
import { verifyAssignment } from './verify';
import { mulberry32 } from './rng';
import {
  checkConstraints,
  checkGenderConstraintFast,
  checkHistoryConstraint,
  checkGroupConstraint,
} from './constraints';
import { buildRuleLookup, buildAdjacencyMap } from './lookup';
import { getLayout } from '../layouts';
import { createDefaultData } from '../model/defaults';
import type { ClassData, Gender, LayoutType } from '../model/types';
import type { SeatPosition } from '../layouts/types';

const noYield = async () => {};
function cls(over: Partial<ClassData> = {}): ClassData {
  const d = createDefaultData();
  d.students = Array.from({ length: 20 }, (_, i) => `학생${i + 1}`);
  d.classSize = 20;
  return { ...d, ...over };
}

/** 이름 -> 성별 맵 (앞에서부터 list 순서대로) */
function gendersOf(students: string[], list: Gender[]): Record<string, Gender> {
  const out: Record<string, Gender> = {};
  students.forEach((s, i) => {
    out[s] = list[i]!;
  });
  return out;
}

/** 남/녀 번갈아 채우는 성별 목록 */
const alternating = (n: number): Gender[] =>
  Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 'M' : 'F'));

function posMapOf(positions: SeatPosition[]): Record<number, SeatPosition> {
  return Object.fromEntries(positions.map((p) => [p.index, p]));
}

/** 모둠 크기 [4, 4]에서 좌석이 속한 모둠 (0~3번=0모둠, 4~7번=1모둠) */
const groupOf4x2 = (seatIdx: number): 0 | 1 => (seatIdx < 4 ? 0 : 1);

describe('randomizeSeats', () => {
  it('학생 없음', async () => {
    const r = await randomizeSeats(cls({ students: [] }), { yieldToUI: noYield });
    expect(r).toEqual({ ok: false, reason: 'no-students', detail: expect.any(String) });
  });
  it('좌석 부족', async () => {
    const d = cls();
    d.layoutSettings.columns = 3;
    d.layoutSettings.rows = 3;
    const r = await randomizeSeats(d, { yieldToUI: noYield });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('capacity');
  });
  it('시드가 같으면 결과가 같다', async () => {
    const a = await randomizeSeats(cls(), { rng: mulberry32(1), yieldToUI: noYield });
    const b = await randomizeSeats(cls(), { rng: mulberry32(1), yieldToUI: noYield });
    expect(a).toEqual(b);
  });
  it('모든 학생이 한 번씩, 삭제 좌석은 비운다', async () => {
    const d = cls();
    d.layoutSettings.disabledSeats = [0, 1, 2];
    const r = await randomizeSeats(d, { rng: mulberry32(2), yieldToUI: noYield });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const names = Object.values(r.mapping).sort();
    expect(names).toEqual([...d.students].sort());
    expect(Object.keys(r.mapping).map(Number).some((i) => [0, 1, 2].includes(i))).toBe(false);
  });
  it('고정 자리와 분리 규칙을 지킨다', async () => {
    const d = cls();
    d.fixedSeats = [{ studentName: '학생1', seatIndex: 5 }];
    d.separationRules = [{ studentA: '학생2', studentB: '학생3', minDistance: 3 }];
    const r = await randomizeSeats(d, { rng: mulberry32(3), yieldToUI: noYield });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mapping[5]).toBe('학생1');
    expect(verifyAssignment(r.mapping, d)).toEqual([]);
  });
  it('이력 배제 불가 시 historyFallback', async () => {
    const d = cls({ students: ['A', 'B'], classSize: 2 });
    d.layoutSettings.columns = 2;
    d.layoutSettings.rows = 1;
    d.assignmentHistory = [
      { mapping: { 0: 'A', 1: 'B' }, timestamp: 1 },
      { mapping: { 0: 'B', 1: 'A' }, timestamp: 2 },
    ];
    d.historyExcludeCount = 2;
    const r = await randomizeSeats(d, { rng: mulberry32(4), yieldToUI: noYield });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.historyFallback).toBe(true);
  });
  it('충돌하는 분리 규칙은 constraints 실패', async () => {
    const d = cls({ students: ['A', 'B'], classSize: 2 });
    d.layoutSettings.columns = 2;
    d.layoutSettings.rows = 1;
    d.separationRules = [{ studentA: 'A', studentB: 'B', minDistance: 5 }];
    const r = await randomizeSeats(d, { rng: mulberry32(5), yieldToUI: noYield, timeoutMs: 200 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('constraints');
  });

  // --- 브리프 외 추가 케이스 ---

  it('알 수 없는 배치는 no-layout', async () => {
    const d = cls({ layoutType: 'nope' as LayoutType });
    const r = await randomizeSeats(d, { yieldToUI: noYield });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('no-layout');
      expect(r.detail).toContain('nope');
    }
  });

  it('성공하면 historyFallback은 false', async () => {
    const r = await randomizeSeats(cls(), { rng: mulberry32(6), yieldToUI: noYield });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.historyFallback).toBe(false);
    expect(Object.keys(r.mapping)).toHaveLength(20);
  });

  it('시드가 다르면 결과가 다르다', async () => {
    const a = await randomizeSeats(cls(), { rng: mulberry32(11), yieldToUI: noYield });
    const b = await randomizeSeats(cls(), { rng: mulberry32(12), yieldToUI: noYield });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.mapping).not.toEqual(b.mapping);
  });

  it('시도 루프의 데드라인을 넘기면 즉시 중단한다', async () => {
    // clock: 첫 호출(데드라인 계산) 0, 이후 계속 초과 -> attempt 0에서 바로 break
    let i = 0;
    const times = [0, 99999];
    const clock = () => times[Math.min(i++, times.length - 1)]!;
    const r = await randomizeSeats(cls(), {
      rng: mulberry32(7),
      yieldToUI: noYield,
      timeoutMs: 100,
      clock,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('constraints');
  });

  it('백트래킹 중 데드라인을 넘기면 배치를 포기한다', async () => {
    // clock 호출 순서: 데드라인 계산(0) -> 루프 검사(0) -> backtrack(studentIdx 0) 초과
    let i = 0;
    const times = [0, 0, 99999];
    const clock = () => times[Math.min(i++, times.length - 1)]!;
    const r = await randomizeSeats(cls(), {
      rng: mulberry32(8),
      yieldToUI: noYield,
      timeoutMs: 100,
      clock,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('constraints');
    expect(i).toBeGreaterThanOrEqual(3);
  });

  it('타임아웃으로 끝난 실패는 detail에 제한 시간을 밝힌다', async () => {
    let i = 0;
    const times = [0, 99999];
    const clock = () => times[Math.min(i++, times.length - 1)]!;
    const r = await randomizeSeats(cls(), {
      rng: mulberry32(26),
      yieldToUI: noYield,
      timeoutMs: 150,
      clock,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('constraints');
      expect(r.detail).toContain('150ms 제한 초과');
    }
  });

  it('제약 자체가 불가능한 실패의 detail에는 제한 시간이 없다', async () => {
    const d = cls({ students: ['A', 'B'], classSize: 2 });
    d.layoutSettings.columns = 2;
    d.layoutSettings.rows = 1;
    d.separationRules = [{ studentA: 'A', studentB: 'B', minDistance: 5 }];
    // 시계를 고정해 데드라인에 절대 걸리지 않게 한다
    const r = await randomizeSeats(d, { rng: mulberry32(27), yieldToUI: noYield, clock: () => 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('constraints');
      expect(r.detail).not.toContain('제한 초과');
    }
  });

  it('이력이 lastAssignment뿐이어도 이력 폴백을 시도한다 (R70, 레거시와 의도적으로 다름)', async () => {
    const d = cls({ students: ['A'], classSize: 1 });
    d.layoutSettings.columns = 1;
    d.layoutSettings.rows = 1;
    d.lastAssignment = { mapping: { 0: 'A' }, timestamp: 1 };
    d.assignmentHistory = [];
    const r = await randomizeSeats(d, { rng: mulberry32(28), yieldToUI: noYield });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.historyFallback).toBe(true);
    expect(r.mapping).toEqual({ 0: 'A' });
  });

  it('useHistoryExclusion이 false면 이력 폴백을 시도하지 않는다', async () => {
    const d = cls({ students: ['A', 'B'], classSize: 2 });
    d.layoutSettings.columns = 2;
    d.layoutSettings.rows = 1;
    d.useHistoryExclusion = false;
    d.assignmentHistory = [{ mapping: { 0: 'A', 1: 'B' }, timestamp: 1 }];
    d.separationRules = [{ studentA: 'A', studentB: 'B', minDistance: 5 }];
    const r = await randomizeSeats(d, { rng: mulberry32(13), yieldToUI: noYield, timeoutMs: 200 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('constraints');
  });

  it('이력이 없으면 폴백 없이 실패한다', async () => {
    const d = cls({ students: ['A', 'B'], classSize: 2 });
    d.layoutSettings.columns = 2;
    d.layoutSettings.rows = 1;
    d.separationRules = [{ studentA: 'A', studentB: 'B', minDistance: 5 }];
    const r = await randomizeSeats(d, { rng: mulberry32(14), yieldToUI: noYield, timeoutMs: 200 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('constraints');
  });

  it('lastAssignment의 자리도 이력 배제 대상이다', async () => {
    const d = cls({ students: ['A', 'B'], classSize: 2 });
    d.layoutSettings.columns = 2;
    d.layoutSettings.rows = 1;
    d.lastAssignment = { mapping: { 0: 'A', 1: 'B' }, timestamp: 1 };
    const r = await randomizeSeats(d, { rng: mulberry32(15), yieldToUI: noYield });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mapping).toEqual({ 0: 'B', 1: 'A' });
    expect(r.historyFallback).toBe(false);
  });

  it('비활성 좌석에 고정된 자리는 무시하고 다른 자리에 앉힌다', async () => {
    const d = cls({ students: ['A', 'B'], classSize: 2 });
    d.layoutSettings.columns = 3;
    d.layoutSettings.rows = 1;
    d.layoutSettings.disabledSeats = [0];
    d.fixedSeats = [{ studentName: 'A', seatIndex: 0 }];
    const r = await randomizeSeats(d, { rng: mulberry32(16), yieldToUI: noYield });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mapping[0]).toBeUndefined();
    expect(Object.values(r.mapping).sort()).toEqual(['A', 'B']);
    // R68: 배치기가 건너뛴 고정 자리를 검증기가 위반으로 잡으면 안 된다
    expect(verifyAssignment(r.mapping, d)).toEqual([]);
  });

  it('좌석 범위를 벗어난 고정 자리와 명단에 없는 학생의 고정 자리는 무시한다', async () => {
    const d = cls({ students: ['A', 'B'], classSize: 2 });
    d.layoutSettings.columns = 2;
    d.layoutSettings.rows = 1;
    d.fixedSeats = [
      { studentName: 'A', seatIndex: 99 },
      { studentName: 'C', seatIndex: 1 },
    ];
    const r = await randomizeSeats(d, { rng: mulberry32(17), yieldToUI: noYield });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.values(r.mapping).sort()).toEqual(['A', 'B']);
  });

  it('중복·범위 밖 비활성 좌석은 좌석 수 계산에서 무시한다', async () => {
    const d = cls({ students: ['A', 'B'], classSize: 2 });
    d.layoutSettings.columns = 2;
    d.layoutSettings.rows = 1;
    d.layoutSettings.disabledSeats = [999, 999];
    const r = await randomizeSeats(d, { rng: mulberry32(18), yieldToUI: noYield });
    expect(r.ok).toBe(true);
  });

  it.each(['mixed', 'same', 'mixedFirst'] as const)('성별 규칙 %s 배치는 위반이 없다', async (rule) => {
    const d = cls();
    d.genderRule = rule;
    d.studentGenders = gendersOf(d.students, alternating(20));
    const r = await randomizeSeats(d, { rng: mulberry32(21), yieldToUI: noYield });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(verifyAssignment(r.mapping, d)).toEqual([]);
  });

  it('same 규칙에서 성별을 모르는 학생도 배치된다', async () => {
    const d = cls();
    d.genderRule = 'same';
    d.studentGenders = gendersOf(d.students.slice(0, 19), alternating(19));
    const r = await randomizeSeats(d, { rng: mulberry32(25), yieldToUI: noYield });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.values(r.mapping)).toContain('학생20');
    expect(verifyAssignment(r.mapping, d)).toEqual([]);
  });

  it('모둠 이력이 있으면 같은 모둠을 피한다', async () => {
    const students = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const d = cls({ students, classSize: 8, layoutType: 'group' });
    d.layoutSettings.groupSizes = [4, 4];
    d.groupHistory = [{ groups: [['A', 'B']], timestamp: 1 }];
    const r = await randomizeSeats(d, { rng: mulberry32(22), yieldToUI: noYield });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const seatOf = (name: string) =>
      Number(Object.keys(r.mapping).find((k) => r.mapping[Number(k)] === name));
    expect(groupOf4x2(seatOf('A'))).not.toBe(groupOf4x2(seatOf('B')));
  });

  it('모둠 제약을 만족할 수 없으면 constraints 실패', async () => {
    // 이전에 4명이 한 모둠이었는데 모둠이 2개뿐 -> 비둘기집으로 항상 위반
    const students = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const d = cls({ students, classSize: 8, layoutType: 'group' });
    d.layoutSettings.groupSizes = [4, 4];
    d.groupHistory = [{ groups: [['A', 'B', 'C', 'D'], ['E', 'F', 'G', 'H']], timestamp: 1 }];
    const r = await randomizeSeats(d, { rng: mulberry32(23), yieldToUI: noYield, timeoutMs: 300 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('constraints');
  });

  it('useGroupExclusion이 false면 모둠 이력을 무시한다', async () => {
    const students = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const d = cls({ students, classSize: 8, layoutType: 'group' });
    d.layoutSettings.groupSizes = [4, 4];
    d.useGroupExclusion = false;
    d.groupHistory = [{ groups: [['A', 'B', 'C', 'D'], ['E', 'F', 'G', 'H']], timestamp: 1 }];
    const r = await randomizeSeats(d, { rng: mulberry32(24), yieldToUI: noYield, timeoutMs: 300 });
    expect(r.ok).toBe(true);
  });

  it('yieldToUI 기본값(setTimeout)으로도 동작한다', async () => {
    const d = cls({ students: ['A', 'B'], classSize: 2 });
    d.layoutSettings.columns = 2;
    d.layoutSettings.rows = 1;
    d.assignmentHistory = [
      { mapping: { 0: 'A', 1: 'B' }, timestamp: 1 },
      { mapping: { 0: 'B', 1: 'A' }, timestamp: 2 },
    ];
    d.historyExcludeCount = 2;
    const r = await randomizeSeats(d);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.historyFallback).toBe(true);
  });
});

describe('constraints', () => {
  const layout = getLayout('exam');
  const settings = { ...createDefaultData().layoutSettings, columns: 6, rows: 5 };
  const positions = layout.getSeatPositions(settings);
  const posMap = posMapOf(positions);

  it('checkConstraints: 규칙이 없으면 통과', () => {
    const lookup = buildRuleLookup([]);
    expect(checkConstraints('A', 0, {}, posMap, [], layout, lookup, {})).toBe(true);
  });

  it('checkConstraints: 좌석 위치가 없으면 실패', () => {
    const lookup = buildRuleLookup([]);
    expect(checkConstraints('A', 999, {}, posMap, [], layout, lookup, {})).toBe(false);
  });

  it('checkConstraints: 상대가 아직 배정 전이면 통과, 가까우면 실패', () => {
    const rules = [{ studentA: 'A', studentB: 'B', minDistance: 2 }];
    const lookup = buildRuleLookup(rules);
    expect(checkConstraints('A', 0, {}, posMap, rules, layout, lookup, {})).toBe(true);
    expect(checkConstraints('A', 0, { 1: 'B' }, posMap, rules, layout, lookup, { B: 1 })).toBe(false);
    // 경계: 레거시는 `거리 <= minDistance`를 위반으로 본다 (거리 2 = 최소 2 -> 실패)
    expect(checkConstraints('A', 0, { 12: 'B' }, posMap, rules, layout, lookup, { B: 12 })).toBe(false);
    expect(checkConstraints('A', 0, { 18: 'B' }, posMap, rules, layout, lookup, { B: 18 })).toBe(true);
  });

  it('checkGenderConstraintFast: none·mixedFirst는 항상 통과', () => {
    const base = cls();
    const adj = buildAdjacencyMap(positions, posMap, base);
    const d = { ...base, studentGenders: { A: 'M' as Gender, B: 'M' as Gender } };
    expect(checkGenderConstraintFast('A', 0, { 1: 'B' }, adj, { ...d, genderRule: 'none' })).toBe(true);
    expect(checkGenderConstraintFast('A', 0, { 1: 'B' }, adj, { ...d, genderRule: 'mixedFirst' })).toBe(true);
  });

  it('checkGenderConstraintFast: mixed는 동성 인접 불가, same은 이성 인접 불가', () => {
    const base = cls();
    const adj = buildAdjacencyMap(positions, posMap, base);
    const genders = { A: 'M' as Gender, B: 'M' as Gender, C: 'F' as Gender };
    const mixed = { ...base, genderRule: 'mixed' as const, studentGenders: genders };
    const same = { ...base, genderRule: 'same' as const, studentGenders: genders };
    expect(checkGenderConstraintFast('A', 0, { 1: 'B' }, adj, mixed)).toBe(false);
    expect(checkGenderConstraintFast('A', 0, { 1: 'C' }, adj, mixed)).toBe(true);
    expect(checkGenderConstraintFast('A', 0, { 1: 'C' }, adj, same)).toBe(false);
    expect(checkGenderConstraintFast('A', 0, { 1: 'B' }, adj, same)).toBe(true);
    // 성별 모르는 학생·빈 이웃은 검사 대상이 아니다
    expect(checkGenderConstraintFast('Z', 0, { 1: 'B' }, adj, mixed)).toBe(true);
    expect(checkGenderConstraintFast('A', 0, { 1: 'Z' }, adj, mixed)).toBe(true);
    expect(checkGenderConstraintFast('A', 0, {}, adj, mixed)).toBe(true);
  });

  it('checkHistoryConstraint: 고정 자리 학생은 이력 검사를 건너뛴다', () => {
    const d = cls();
    d.fixedSeats = [{ studentName: 'A', seatIndex: 3 }];
    d.assignmentHistory = [{ mapping: { 3: 'A' }, timestamp: 1 }];
    expect(checkHistoryConstraint('A', 3, d)).toBe(true);
    expect(checkHistoryConstraint('A', 3, { ...d, fixedSeats: [] })).toBe(false);
  });

  it('checkHistoryConstraint: useHistoryExclusion false면 통과', () => {
    const d = cls();
    d.assignmentHistory = [{ mapping: { 3: 'A' }, timestamp: 1 }];
    expect(checkHistoryConstraint('A', 3, { ...d, useHistoryExclusion: false })).toBe(true);
  });

  it('checkHistoryConstraint: excludeCount만큼만 최근 기록을 본다', () => {
    const d = cls();
    d.assignmentHistory = [
      { mapping: { 3: 'A' }, timestamp: 1 },
      { mapping: { 4: 'A' }, timestamp: 2 },
    ];
    d.historyExcludeCount = 1;
    expect(checkHistoryConstraint('A', 3, d)).toBe(true);
    expect(checkHistoryConstraint('A', 4, d)).toBe(false);
    expect(checkHistoryConstraint('A', 3, { ...d, historyExcludeCount: 2 })).toBe(false);
  });

  it('checkGroupConstraint: 모둠 대형이 아니면 통과', () => {
    const d = cls();
    expect(checkGroupConstraint('A', 0, { 1: 'B' }, d)).toBe(true);
  });

  it('checkGroupConstraint: 모둠 이력이 비면 통과', () => {
    const d = cls({ layoutType: 'group' });
    d.layoutSettings.groupSizes = [4, 4];
    expect(checkGroupConstraint('A', 0, { 1: 'B' }, d)).toBe(true);
  });

  it('checkGroupConstraint: 모둠 범위를 넘는 좌석은 마지막 모둠으로 본다', () => {
    const d = cls({ layoutType: 'group' });
    d.layoutSettings.groupSizes = [4, 4];
    d.groupHistory = [{ groups: [['A', 'B']], timestamp: 1 }];
    // 99번 자리는 어느 모둠에도 없다 -> 레거시는 마지막 모둠(인덱스 1, 좌석 4~7)으로 폴백
    expect(checkGroupConstraint('A', 99, { 4: 'B' }, d)).toBe(false);
    expect(checkGroupConstraint('A', 99, { 0: 'B' }, d)).toBe(true);
  });

  it('checkGroupConstraint: 같은 모둠에 있던 짝은 거른다', () => {
    const d = cls({ layoutType: 'group' });
    d.layoutSettings.groupSizes = [4, 4];
    d.groupHistory = [{ groups: [['A', 'B']], timestamp: 1 }];
    expect(checkGroupConstraint('A', 0, { 1: 'B' }, d)).toBe(false);
    expect(checkGroupConstraint('A', 0, { 4: 'B' }, d)).toBe(true);
    expect(checkGroupConstraint('A', 0, { 1: 'C' }, d)).toBe(true);
    // 같은 모둠에 아무도 없으면 통과
    expect(checkGroupConstraint('A', 0, {}, d)).toBe(true);
  });
});

describe('verifyAssignment', () => {
  it('고정 자리 위반을 찾는다', () => {
    const d = cls();
    d.fixedSeats = [{ studentName: '학생1', seatIndex: 0 }];
    const v = verifyAssignment({ 0: '학생2', 1: '학생1' }, d);
    expect(v.some((x) => x.kind === 'fixed')).toBe(true);
  });
  it('분리 거리 위반을 찾는다', () => {
    const d = cls();
    d.separationRules = [{ studentA: '학생1', studentB: '학생2', minDistance: 2 }];
    expect(verifyAssignment({ 0: '학생1', 1: '학생2' }, d).some((x) => x.kind === 'separation')).toBe(true);
    // 브리프 원문은 12번 자리를 "충분히 먼 자리"로 썼지만 6열 격자에서 0번-12번은
    // chebyshev 거리 2라 레거시 판정(`거리 <= 최소 거리` -> 위반)에 정확히 걸린다.
    // 레거시 로직을 유지하고 픽스처만 실제로 먼 자리(18번, 거리 3)로 고쳤다.
    expect(verifyAssignment({ 0: '학생1', 12: '학생2' }, d).some((x) => x.kind === 'separation')).toBe(true);
    expect(verifyAssignment({ 0: '학생1', 18: '학생2' }, d)).toEqual([]);
  });

  // --- 브리프 외 추가 케이스 ---

  it('명단에 없는 학생의 고정 자리는 검사하지 않는다', () => {
    const d = cls();
    d.fixedSeats = [{ studentName: '없는학생', seatIndex: 0 }];
    expect(verifyAssignment({ 0: '학생1' }, d)).toEqual([]);
  });

  it('배치기가 건너뛰는 고정 자리는 검사하지 않는다 (R68)', () => {
    // 비활성 좌석에 고정된 자리
    const disabled = cls();
    disabled.layoutSettings.disabledSeats = [0];
    disabled.fixedSeats = [{ studentName: '학생1', seatIndex: 0 }];
    expect(verifyAssignment({ 1: '학생1' }, disabled)).toEqual([]);
    // 좌석 범위를 벗어난 고정 자리
    const outOfRange = cls();
    outOfRange.fixedSeats = [{ studentName: '학생1', seatIndex: 99 }];
    expect(verifyAssignment({ 1: '학생1' }, outOfRange)).toEqual([]);
    // 정상 범위의 고정 자리는 그대로 검사한다
    const normal = cls();
    normal.fixedSeats = [{ studentName: '학생1', seatIndex: 0 }];
    expect(verifyAssignment({ 1: '학생1' }, normal).some((x) => x.kind === 'fixed')).toBe(true);
  });

  it('한쪽만 배정된 분리 규칙은 검사하지 않는다', () => {
    const d = cls();
    d.separationRules = [{ studentA: '학생1', studentB: '학생2', minDistance: 2 }];
    expect(verifyAssignment({ 0: '학생1' }, d)).toEqual([]);
  });

  it('성별 규칙 위반을 찾는다', () => {
    const d = cls();
    d.genderRule = 'mixed';
    d.studentGenders = gendersOf(d.students, alternating(20));
    // 학생1(M)과 학생3(M)이 인접 -> mixed 위반
    expect(verifyAssignment({ 0: '학생1', 1: '학생3' }, d).some((x) => x.kind === 'gender')).toBe(true);
    expect(verifyAssignment({ 0: '학생1', 1: '학생2' }, d)).toEqual([]);
    // same 규칙에서는 정반대
    const same: ClassData = { ...d, genderRule: 'same' };
    expect(verifyAssignment({ 0: '학생1', 1: '학생2' }, same).some((x) => x.kind === 'gender')).toBe(true);
    expect(verifyAssignment({ 0: '학생1', 1: '학생3' }, same)).toEqual([]);
    // mixedFirst는 인접 성별을 보지 않는다
    const first: ClassData = { ...d, genderRule: 'mixedFirst' };
    expect(verifyAssignment({ 0: '학생1', 1: '학생3' }, first)).toEqual([]);
  });

  it('성별을 모르는 학생과 빈 이웃은 성별 검사 대상이 아니다', () => {
    const d = cls();
    d.genderRule = 'mixed';
    d.studentGenders = { 학생1: 'M' };
    // 이웃(학생2)의 성별을 모른다
    expect(verifyAssignment({ 0: '학생1', 1: '학생2' }, d)).toEqual([]);
    // 이웃 자리가 비었다
    expect(verifyAssignment({ 0: '학생1' }, d)).toEqual([]);
    // 본인의 성별을 모른다
    expect(verifyAssignment({ 0: '학생3', 1: '학생4' }, d)).toEqual([]);
  });

  it('학생이 좌석보다 많으면 capacity 위반', () => {
    const d = cls();
    d.layoutSettings.columns = 3;
    d.layoutSettings.rows = 3;
    expect(verifyAssignment({ 0: '학생1' }, d).some((x) => x.kind === 'capacity')).toBe(true);
  });

  it('위반 메시지에 이름과 자리 번호가 들어간다', () => {
    const d = cls();
    d.fixedSeats = [{ studentName: '학생1', seatIndex: 0 }];
    const v = verifyAssignment({ 0: '학생2', 1: '학생1' }, d);
    expect(v[0]!.message).toContain('학생1');
    expect(v[0]!.message).toContain('1번');
  });
});
