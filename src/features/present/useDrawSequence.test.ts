import { act, renderHook } from '@testing-library/react';
import { createDefaultData } from '@/core/model/defaults';
import type { Assignment, ClassData } from '@/core/model/types';
import type { RandomizeResult } from '@/core/randomizer';
import { seatRowOrder, TIMING, useDrawSequence } from './useDrawSequence';

const NAMES = ['가람', '나래', '다솜', '라온', '마루', '바다'];

function makeData(patch: Partial<ClassData> = {}): ClassData {
  const base = createDefaultData();
  return {
    ...base,
    students: NAMES,
    classSize: NAMES.length,
    ...patch,
    layoutSettings: { ...base.layoutSettings, columns: 3, rows: 2, ...(patch.layoutSettings ?? {}) },
  };
}

const FULL: Assignment = { 0: '가람', 1: '나래', 2: '다솜', 3: '라온', 4: '마루', 5: '바다' };
const okResult = (): RandomizeResult => ({ ok: true, mapping: { ...FULL }, historyFallback: false });

describe('seatRowOrder', () => {
  it('exam 3x2는 앞줄부터 줄 단위로 묶는다', () => {
    expect(seatRowOrder(makeData())).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ]);
  });

  it('선생님 시선이어도 줄 순서는 앞줄(row 0)부터다', () => {
    expect(seatRowOrder(makeData({ viewPerspective: 'teacher' }))[0]).toEqual([0, 1, 2]);
  });
});

describe('useDrawSequence', () => {
  it('prefers-reduced-motion이면 카운트다운·셔플·컨페티 없이 즉시 전체 공개한다', async () => {
    const delay = vi.fn(async () => {});
    const onAssigned = vi.fn();
    const { result } = renderHook(() =>
      useDrawSequence({
        data: makeData(),
        onAssigned,
        delay,
        reducedMotion: true,
        randomize: async () => okResult(),
        playSound: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.start();
    });

    expect(delay).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('done');
    expect(result.current.revealedSeats).toBe('all');
    expect(result.current.confetti).toBe(false);
    expect(onAssigned).toHaveBeenCalledWith(FULL, false);
  });

  it('앞줄부터 줄 단위로 공개하고 마지막에 컨페티를 켠다', async () => {
    // delay를 손으로 풀어 주는 방식이라 각 구간의 상태를 그 자리에서 확인할 수 있다.
    const waiting: (() => void)[] = [];
    const args: number[] = [];
    const delay = (ms: number) =>
      new Promise<void>((resolve) => {
        args.push(ms);
        waiting.push(resolve);
      });
    const { result } = renderHook(() =>
      useDrawSequence({
        data: makeData(),
        onAssigned: vi.fn(),
        delay,
        reducedMotion: false,
        randomize: async () => okResult(),
        playSound: vi.fn(),
      }),
    );

    let finished!: Promise<void>;
    await act(async () => {
      finished = result.current.start();
    });
    const step = async () => {
      const next = waiting.shift();
      expect(next).toBeDefined();
      await act(async () => {
        next?.();
      });
    };

    expect(result.current.countdown).toBe(3);
    await step();
    expect(result.current.countdown).toBe(2);
    await step();
    expect(result.current.countdown).toBe(1);
    await step();
    // 카운트다운이 끝나면 전부 뒷면인 채로 셔플한다.
    expect(result.current.phase).toBe('shuffling');
    expect(result.current.revealedSeats).toEqual([]);

    await step();
    expect(result.current.phase).toBe('revealing');
    expect(result.current.revealedSeats).toEqual([0, 1, 2]);
    await step();
    expect(result.current.revealedSeats).toEqual([0, 1, 2, 3, 4, 5]);
    await step();

    await act(async () => {
      await finished;
    });
    expect(args).toEqual([
      TIMING.countdown,
      TIMING.countdown,
      TIMING.countdown,
      TIMING.shuffle,
      TIMING.row,
      TIMING.row,
    ]);
    expect(result.current.revealedSeats).toBe('all');
    expect(result.current.phase).toBe('done');
    expect(result.current.confetti).toBe(true);
    expect(result.current.violations).toEqual([]);
  });

  it('배치에 실패하면 사유를 남기고 시퀀스를 멈춘다', async () => {
    const onAssigned = vi.fn();
    const { result } = renderHook(() =>
      useDrawSequence({
        data: makeData({ students: [] }),
        onAssigned,
        delay: async () => {},
        reducedMotion: true,
        randomize: async () => ({ ok: false, reason: 'no-students', detail: '학생 명단이 비어 있습니다.' }),
        playSound: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.phase).toBe('failed');
    expect(result.current.failure).toEqual({ reason: 'no-students', detail: '학생 명단이 비어 있습니다.' });
    expect(result.current.mapping).toBeNull();
    expect(result.current.revealedSeats).toEqual([]);
    expect(onAssigned).not.toHaveBeenCalled();
  });

  it('swap은 두 좌석의 학생을 맞바꾸고 저장을 요청한다', async () => {
    const onAssigned = vi.fn();
    const { result } = renderHook(() =>
      useDrawSequence({
        data: makeData(),
        onAssigned,
        delay: async () => {},
        reducedMotion: true,
        randomize: async () => okResult(),
        playSound: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.start();
    });
    onAssigned.mockClear();
    act(() => {
      result.current.swap(0, 5);
    });

    expect(result.current.mapping?.[0]).toBe('바다');
    expect(result.current.mapping?.[5]).toBe('가람');
    expect(onAssigned).toHaveBeenCalledTimes(1);
    expect(onAssigned.mock.calls[0]?.[1]).toBe(false);
  });

  it('빈 자리와의 교환은 학생을 옮기고 원래 자리를 비운다', async () => {
    const { result } = renderHook(() =>
      useDrawSequence({
        data: makeData({ students: NAMES.slice(0, 2) }),
        onAssigned: vi.fn(),
        delay: async () => {},
        reducedMotion: true,
        randomize: async () => ({ ok: true, mapping: { 0: '가람', 1: '나래' }, historyFallback: false }),
        playSound: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.start();
    });
    act(() => {
      result.current.swap(0, 4);
    });

    expect(result.current.mapping?.[4]).toBe('가람');
    expect(result.current.mapping?.[0]).toBeUndefined();
  });

  it('한 명씩 뽑기는 명단 순서로 아직 공개되지 않은 좌석 하나만 공개한다', async () => {
    const { result } = renderHook(() =>
      useDrawSequence({
        data: makeData(),
        onAssigned: vi.fn(),
        delay: async () => {},
        reducedMotion: true,
        randomize: async () => okResult(),
        playSound: vi.fn(),
        rng: () => 0,
      }),
    );

    await act(async () => {
      await result.current.startLottery();
    });
    expect(result.current.revealedSeats).toEqual([]);

    await act(async () => {
      await result.current.revealOne();
    });
    expect(result.current.revealedSeats).toEqual([0]);

    await act(async () => {
      await result.current.revealOne();
    });
    expect(result.current.revealedSeats).toEqual([0, 1]);
  });
});
