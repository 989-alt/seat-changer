// 발표 화면 뽑기 연출의 상태 기계 (스펙 6절).
// 연출 순서: 카운트다운 3-2-1 -> 전체 뒷면 + 셔플 0.8초 -> 앞줄부터 줄 단위 공개(줄당 0.25초) -> 컨페티.
//
// 타이머·난수·배치 함수를 모두 주입할 수 있게 만들어 테스트에서 결정적으로 돌린다.
// 화면(React)에 붙는 훅이지만, 계산은 core의 getLayout·randomizeSeats·verifyAssignment만 쓴다.
import { useCallback, useRef, useState } from 'react';
import { getLayout } from '@/core/layouts';
import { randomizeSeats, verifyAssignment } from '@/core/randomizer';
import type { RandomizeFailure, RandomizeResult, Violation } from '@/core/randomizer';
import type { Assignment, ClassData } from '@/core/model/types';
import type { SoundKind } from './sound';

export type DrawPhase = 'idle' | 'countdown' | 'shuffling' | 'revealing' | 'lottery' | 'done' | 'failed';

/** 연출 구간의 길이(ms). 스펙 6절의 수치를 그대로 옮겼다. */
export const TIMING = {
  countdown: 700,
  shuffle: 800,
  row: 250,
  blink: 90,
  spotlight: 900,
} as const;

/** 한 명씩 뽑기에서 좌석을 훑는 깜빡임 프레임 수 (레거시 lotterySpin의 flashFrames 대응) */
export const BLINK_FRAMES = 8;

export interface DrawFailure {
  reason: RandomizeFailure;
  detail: string;
}

export interface DrawSequenceOptions {
  data: ClassData;
  /** 배치가 확정됐을 때 저장을 요청한다(스토어의 recordAssignment). */
  onAssigned: (mapping: Assignment, historyFallback: boolean) => void;
  /** 기본값은 setTimeout. 테스트에서는 즉시 끝나는 함수를 넣는다. */
  delay?: (ms: number) => Promise<void>;
  /** 깜빡임 좌석 선택에만 쓴다. 배치 자체의 난수는 randomizeSeats 안에 있다. */
  rng?: () => number;
  reducedMotion?: boolean;
  randomize?: (data: ClassData) => Promise<RandomizeResult>;
  playSound?: (kind: SoundKind) => void;
}

export interface DrawSequence {
  phase: DrawPhase;
  /** 카운트다운 중에만 3-2-1, 그 밖에는 null */
  countdown: number | null;
  mapping: Assignment | null;
  /** SeatBoard의 revealedSeats prop에 그대로 넘긴다. */
  revealedSeats: 'all' | number[];
  violations: Violation[];
  failure: DrawFailure | null;
  historyFallback: boolean;
  confetti: boolean;
  /** 연출이 도는 동안에는 조작 막대를 감춘다. */
  running: boolean;
  /** 한 명씩 뽑기에서 잠깐 밝히는 좌석 */
  spotlightSeat: number | null;
  /** 한 명씩 뽑기에서 지금 뽑을 학생 */
  lotteryName: string | null;
  /** 아직 공개되지 않은 학생 수 */
  remaining: number;
  /** 뽑기가 성공할 때마다 1씩 는다. 모둠 역할을 그 시점에 한 번만 배정하려고 쓴다. */
  drawId: number;
  start: () => Promise<void>;
  startLottery: () => Promise<void>;
  revealOne: () => Promise<void>;
  revealAll: () => void;
  swap: (seatA: number, seatB: number) => void;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** 앞줄(row 0)부터 줄 단위로 묶은 좌석 인덱스. 줄 안은 왼쪽(col)부터. */
export function seatRowOrder(data: ClassData): number[][] {
  const positions = getLayout(data.layoutType).getSeatPositions(data.layoutSettings);
  const rows = [...new Set(positions.map((p) => p.row))].sort((a, b) => a - b);
  return rows.map((row) =>
    positions
      .filter((p) => p.row === row)
      .sort((a, b) => a.col - b.col)
      .map((p) => p.index),
  );
}

/** 이름 -> 좌석. 매핑에 없는 학생은 -1. */
function seatOf(mapping: Assignment, name: string): number {
  for (const [seat, who] of Object.entries(mapping)) {
    if (who === name) return Number(seat);
  }
  return -1;
}

export function useDrawSequence({
  data,
  onAssigned,
  delay = sleep,
  rng = Math.random,
  reducedMotion = false,
  randomize = (d) => randomizeSeats(d),
  playSound = () => {},
}: DrawSequenceOptions): DrawSequence {
  const [phase, setPhase] = useState<DrawPhase>('idle');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [mapping, setMappingState] = useState<Assignment | null>(null);
  const [revealed, setRevealedState] = useState<'all' | number[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [failure, setFailure] = useState<DrawFailure | null>(null);
  const [historyFallback, setHistoryFallback] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [spotlightSeat, setSpotlightSeat] = useState<number | null>(null);
  const [lotteryName, setLotteryName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drawId, setDrawId] = useState(0);

  // 비동기 시퀀스 안에서는 최신 값을 state로 읽을 수 없어 ref를 함께 둔다.
  const runningRef = useRef(false);
  const mappingRef = useRef<Assignment | null>(null);
  const revealedRef = useRef<'all' | number[]>([]);

  const setMapping = useCallback((next: Assignment | null) => {
    mappingRef.current = next;
    setMappingState(next);
  }, []);

  const setRevealed = useCallback((next: 'all' | number[]) => {
    revealedRef.current = next;
    setRevealedState(next);
  }, []);

  /** 카운트다운 -> 셔플 -> 배치 확정까지. 성공하면 확정된 매핑을 돌려준다. */
  const runToAssignment = useCallback(async (): Promise<Assignment | null> => {
    setViolations([]);
    setFailure(null);
    setConfetti(false);
    setHistoryFallback(false);
    setSpotlightSeat(null);
    setLotteryName(null);
    setMapping(null);
    setRevealed([]);

    if (!reducedMotion) {
      setPhase('countdown');
      for (const n of [3, 2, 1]) {
        setCountdown(n);
        playSound('tick');
        await delay(TIMING.countdown);
      }
    }
    setCountdown(null);

    setPhase('shuffling');
    if (!reducedMotion) playSound('shuffle');
    const result = await randomize(data);
    if (!reducedMotion) await delay(TIMING.shuffle);

    if (!result.ok) {
      setFailure({ reason: result.reason, detail: result.detail });
      setPhase('failed');
      return null;
    }

    setMapping(result.mapping);
    setHistoryFallback(result.historyFallback);
    onAssigned(result.mapping, result.historyFallback);
    // R74: 성공 직후에도 검증해 남은 위반을 화면에 알린다.
    setViolations(verifyAssignment(result.mapping, data));
    setDrawId((n) => n + 1);
    return result.mapping;
  }, [data, delay, onAssigned, playSound, randomize, reducedMotion, setMapping, setRevealed]);

  const finish = useCallback(() => {
    setPhase('done');
    if (!reducedMotion) {
      setConfetti(true);
      playSound('fanfare');
    }
  }, [playSound, reducedMotion]);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setBusy(true);
    try {
      const result = await runToAssignment();
      if (!result) return;
      if (reducedMotion) {
        // 애니메이션을 건너뛰고 즉시 전체 공개한다.
        setRevealed('all');
        setPhase('done');
        return;
      }
      setPhase('revealing');
      const acc: number[] = [];
      for (const row of seatRowOrder(data)) {
        acc.push(...row);
        setRevealed([...acc]);
        playSound('reveal');
        await delay(TIMING.row);
      }
      setRevealed('all');
      finish();
    } finally {
      runningRef.current = false;
      setBusy(false);
    }
  }, [data, delay, finish, playSound, reducedMotion, runToAssignment, setRevealed]);

  /** 한 명씩 뽑기: 배치는 확정하되 전부 뒷면으로 두고 공개를 기다린다. */
  const startLottery = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setBusy(true);
    try {
      const result = await runToAssignment();
      if (!result) return;
      // 이 모드에서는 reduced-motion이어도 자동 공개하지 않는다.
      // 한 명씩 공개하는 것 자체가 이 모드의 목적이고, 연출만 생략한다.
      setPhase('lottery');
    } finally {
      runningRef.current = false;
      setBusy(false);
    }
  }, [runToAssignment]);

  const revealOne = useCallback(async () => {
    if (runningRef.current) return;
    const current = mappingRef.current;
    const revealedNow = revealedRef.current;
    if (!current || revealedNow === 'all') return;
    const revealedSet = new Set(revealedNow);

    // 레거시 lotteryQueue와 같은 기준: 명단 순서로 아직 공개되지 않은 학생.
    let target = -1;
    let name: string | null = null;
    for (const student of data.students) {
      const seat = seatOf(current, student);
      if (seat >= 0 && !revealedSet.has(seat)) {
        target = seat;
        name = student;
        break;
      }
    }
    if (target < 0 || name === null) return;

    runningRef.current = true;
    setBusy(true);
    try {
      setLotteryName(name);
      const hidden = Object.keys(current)
        .map(Number)
        .filter((seat) => !revealedSet.has(seat));
      if (!reducedMotion && hidden.length > 0) {
        for (let f = 0; f < BLINK_FRAMES; f++) {
          const pick = hidden[Math.floor(rng() * hidden.length)] ?? target;
          setSpotlightSeat(pick);
          playSound('tick');
          await delay(TIMING.blink);
        }
      }
      setSpotlightSeat(target);
      playSound('reveal');
      const next = [...revealedNow, target];
      setRevealed(next);
      if (!reducedMotion) await delay(TIMING.spotlight);
      setSpotlightSeat(null);
      if (next.length >= Object.keys(current).length) {
        setLotteryName(null);
        setRevealed('all');
        finish();
      }
    } finally {
      runningRef.current = false;
      setBusy(false);
    }
  }, [data.students, delay, finish, playSound, reducedMotion, rng, setRevealed]);

  const revealAll = useCallback(() => {
    if (runningRef.current || !mappingRef.current) return;
    setSpotlightSeat(null);
    setLotteryName(null);
    setRevealed('all');
    setPhase('done');
  }, [setRevealed]);

  /**
   * 두 좌석의 학생을 맞바꾼다. 한쪽이 빈 자리면 학생을 그 자리로 옮기고
   * 원래 자리를 비운다 (legacy/js/screens/student-screen.js:370-377과 같은 규칙).
   */
  const swap = useCallback(
    (seatA: number, seatB: number) => {
      const current = mappingRef.current;
      if (!current || seatA === seatB) return;
      const next: Assignment = { ...current };
      const nameA = current[seatA];
      const nameB = current[seatB];
      if (nameA) next[seatB] = nameA;
      else delete next[seatB];
      if (nameB) next[seatA] = nameB;
      else delete next[seatA];
      setMapping(next);
      onAssigned(next, false);
    },
    [onAssigned, setMapping],
  );

  const remaining =
    mapping === null || revealed === 'all'
      ? 0
      : Object.keys(mapping).length - revealed.filter((seat) => mapping[seat] !== undefined).length;

  return {
    phase,
    countdown,
    mapping,
    revealedSeats: revealed,
    violations,
    failure,
    historyFallback,
    confetti,
    running: busy,
    spotlightSeat,
    lotteryName,
    remaining,
    drawId,
    start,
    startLottery,
    revealOne,
    revealAll,
    swap,
  };
}
