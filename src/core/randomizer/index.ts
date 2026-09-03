// 좌석 랜덤 배치 진입점 (legacy/js/algorithm/seat-randomizer.js:76-131 이식)
// 레거시 대비 의도한 변경은 네 가지다.
//   1. `Math.random` -> 주입된 `rng` (모든 shuffle 호출로 전달)
//   2. `Date.now()` -> 주입 가능한 `clock` (기본값 `Date.now`)
//   3. `yieldToUI` 주입 (기본값 setTimeout 0)
//   4. 실패 시 null/alert 대신 `{ ok: false, reason, detail }` 반환
// 시드 rng + `yieldToUI: async () => {}` + 넉넉한 timeoutMs면 완전히 결정적이다.
import type { Assignment, ClassData } from '../model/types';
import { getTotalSeats, layouts } from '../layouts';
import type { SeatLayout } from '../layouts/types';
import { buildAdjacencyMap, buildRuleLookup, type PosMap } from './lookup';
import { tryAssignment, type Clock } from './assign';
import type { Rng } from './rng';

export type RandomizeFailure = 'no-layout' | 'no-students' | 'capacity' | 'constraints';
export type RandomizeResult =
  | { ok: true; mapping: Assignment; historyFallback: boolean }
  | { ok: false; reason: RandomizeFailure; detail: string };
export interface RandomizeOptions {
  rng?: Rng;
  timeoutMs?: number;
  maxAttempts?: number;
  yieldToUI?: () => Promise<void>;
  /** 현재 시각(ms). 레거시 `Date.now` 자리 — 타임아웃 경로를 테스트하려고 주입 가능하게 했다. */
  clock?: Clock;
}

const defaultYield = () => new Promise<void>((r) => setTimeout(r, 0));

export async function randomizeSeats(
  data: ClassData,
  options: RandomizeOptions = {},
): Promise<RandomizeResult> {
  const {
    rng = Math.random,
    timeoutMs = 2000,
    maxAttempts = 15,
    yieldToUI = defaultYield,
    clock = Date.now,
  } = options;
  const { students, layoutType, layoutSettings, fixedSeats, separationRules } = data;
  // 레거시 `seatLayoutMap[layoutType]`와 같은 직접 조회.
  // `getLayout`은 알 수 없는 값에도 exam으로 폴백하므로 no-layout을 판정할 수 없다.
  const layout: SeatLayout | undefined = layouts[layoutType];
  if (!layout) return { ok: false, reason: 'no-layout', detail: `알 수 없는 배치: ${layoutType}` };

  const positions = layout.getSeatPositions(layoutSettings);
  const totalSeats = positions.length;
  if (students.length === 0) return { ok: false, reason: 'no-students', detail: '학생 명단이 비어 있습니다.' };
  // 좌석 수는 layouts.getTotalSeats가 유일한 기준이다(R57, R59):
  // 비활성 좌석 중 범위 밖·중복 인덱스는 빼지 않는다.
  const usable = getTotalSeats(data);
  if (students.length > usable)
    return { ok: false, reason: 'capacity', detail: `학생 ${students.length}명, 좌석 ${usable}석` };

  const posMap: PosMap = {};
  for (const p of positions) posMap[p.index] = p;
  const adjacencyMap = buildAdjacencyMap(positions, posMap, data);
  const ruleLookup = buildRuleLookup(separationRules);

  // 시도 루프가 데드라인 때문에 끊겼는지 (실패 detail 문구에만 쓴다)
  let timedOut = false;

  const run = async (d: ClassData): Promise<Assignment | null> => {
    const deadline = clock() + timeoutMs;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (clock() > deadline) {
        timedOut = true;
        break;
      }
      // 매 시도마다 UI 양보
      if (attempt > 0 && (attempt & 3) === 0) await yieldToUI();
      const r = tryAssignment(
        students,
        positions,
        posMap,
        totalSeats,
        fixedSeats,
        separationRules,
        layout,
        d,
        adjacencyMap,
        deadline,
        ruleLookup,
        rng,
        clock,
      );
      if (r) return r;
    }
    // 루프를 다 돌고 실패했을 때도 데드라인을 확인한다 (R71).
    // 앞의 검사만으로는 마지막 시도의 backtrack 안에서 시간이 다한 경우
    // (특히 maxAttempts가 1일 때) 타임아웃을 놓친다.
    timedOut = timedOut || clock() > deadline;
    return null;
  };

  // 1차: 모든 제약 (history 포함) 적용
  const first = await run(data);
  if (first) return { ok: true, mapping: first, historyFallback: false };

  // 2차 폴백: history 제약 없이 재시도
  // 레거시(seat-randomizer.js:109)는 `assignmentHistory.length > 0`만 봤다. 그런데
  // checkHistoryConstraint는 lastAssignment.mapping도 배제 대상으로 쓰므로,
  // "이력은 비었고 lastAssignment만 있는" 상태에서는 이력 때문에 실패하고도 폴백을
  // 시도하지 않았다. 레거시와 의도적으로 다름 (R70): lastAssignment도 조건에 넣는다.
  // 빈 매핑({})은 이력이 아니다 (R72): 배제할 자리가 하나도 없는데 폴백을 켜면
  // 2차 시도가 시도 횟수와 난수만 태우고 historyFallback을 거짓으로 표시한다.
  const hasHistory =
    (data.assignmentHistory ?? []).length > 0 ||
    Object.keys(data.lastAssignment?.mapping ?? {}).length > 0;
  if (data.useHistoryExclusion !== false && hasHistory) {
    await yieldToUI();
    const second = await run({ ...data, useHistoryExclusion: false });
    if (second) return { ok: true, mapping: second, historyFallback: true };
  }
  const base = '분리 규칙·성별 규칙·고정 자리를 동시에 만족하는 배치를 찾지 못했습니다.';
  return {
    ok: false,
    reason: 'constraints',
    detail: timedOut ? `${base} (${timeoutMs}ms 제한 초과)` : base,
  };
}

export { verifyAssignment } from './verify';
export type { Violation } from './verify';
