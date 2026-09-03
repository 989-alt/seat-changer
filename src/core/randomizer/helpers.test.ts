import { shuffle, mulberry32 } from './rng';
import { buildRuleLookup, buildNameToSeatMap, buildAdjacencyMap } from './lookup';
import { precomputeGenderSeats } from './gender';
import { createDefaultData } from '../model/defaults';
import { getLayout } from '../layouts';
import type { ClassData, Gender } from '../model/types';
import type { SeatPosition } from '../layouts/types';

// ---------------------------------------------------------------------------
// 레거시 기준 구현 (비교용)
// `legacy/js/algorithm/seat-randomizer.js`의 shuffle은 모듈 내부 함수라 import할
// 수 없다. 31-37행을 그대로 복사하고 타입만 붙였다(구조·연산 변경 없음).
// Math.random은 테스트에서 스텁해 v2 rng와 동일한 난수열로 구동한다.
// ---------------------------------------------------------------------------
function legacyShuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // noUncheckedIndexedAccess 때문에 단언만 추가 (레거시와 동일한 스왑)
    [arr[i], arr[j]] = [arr[j] as T, arr[i] as T];
  }
  return arr;
}

/** 순환하는 고정 난수열 rng */
function seqRng(seq: number[]): () => number {
  let k = 0;
  return () => seq[k++ % seq.length]!;
}

const RANDOM_SEQ = [0.1, 0.9, 0.5, 0.3, 0.7];

/** 격자 배치용 posMap */
function posMapOf(positions: SeatPosition[]): Record<number, SeatPosition> {
  return Object.fromEntries(positions.map((p) => [p.index, p]));
}

function examData(over: Partial<ClassData> = {}, columns = 6, rows = 5): ClassData {
  const d = createDefaultData();
  return { ...d, layoutSettings: { ...d.layoutSettings, columns, rows }, ...over };
}

function gendersOf(students: string[], list: Gender[]): Record<string, Gender> {
  const out: Record<string, Gender> = {};
  students.forEach((s, i) => {
    out[s] = list[i]!;
  });
  return out;
}

/** 이름 n개 생성 */
const names = (prefix: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

describe('rng', () => {
  it('시드가 같으면 같은 순서', () => {
    const a = shuffle([1, 2, 3, 4, 5, 6], mulberry32(7));
    const b = shuffle([1, 2, 3, 4, 5, 6], mulberry32(7));
    expect(a).toEqual(b);
    expect(a).not.toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('시드가 다르면 다른 순서', () => {
    const a = shuffle(names('s', 12), mulberry32(1));
    const b = shuffle(names('s', 12), mulberry32(2));
    expect(a).not.toEqual(b);
  });

  it('원소 집합은 보존된다 (순열)', () => {
    const out = shuffle([...Array(20).keys()], mulberry32(42));
    expect([...out].sort((x, y) => x - y)).toEqual([...Array(20).keys()]);
  });

  it('길이 0·1 배열은 그대로', () => {
    expect(shuffle([], mulberry32(1))).toEqual([]);
    expect(shuffle(['a'], mulberry32(1))).toEqual(['a']);
  });

  it('in-place로 같은 배열 참조를 돌려준다 (레거시 backtrack이 의존)', () => {
    const arr = [1, 2, 3, 4, 5];
    expect(shuffle(arr, mulberry32(3))).toBe(arr);
  });

  it('레거시 shuffle과 같은 난수열이면 같은 결과', () => {
    // 레거시 shuffle을 Math.random 스텁으로 같은 난수열에 태워 기대값을 만든다.
    const spy = vi.spyOn(Math, 'random').mockImplementation(seqRng(RANDOM_SEQ));
    const expected = legacyShuffle(['a', 'b', 'c', 'd', 'e', 'f']);
    spy.mockRestore();

    // 손계산으로도 같은 값이 나온다 (i=5:j=0, i=4:j=4, i=3:j=2, i=2:j=0, i=1:j=1)
    expect(expected).toEqual(['d', 'b', 'f', 'c', 'e', 'a']);
    expect(shuffle(['a', 'b', 'c', 'd', 'e', 'f'], seqRng(RANDOM_SEQ))).toEqual(expected);
  });

  it('레거시 shuffle과 mulberry32 난수열에서도 일치', () => {
    const spy = vi.spyOn(Math, 'random').mockImplementation(mulberry32(2026));
    const expected = legacyShuffle(names('n', 15));
    spy.mockRestore();
    expect(shuffle(names('n', 15), mulberry32(2026))).toEqual(expected);
  });

  it('mulberry32는 [0,1) 범위의 결정적 수열', () => {
    const r = mulberry32(0);
    const vals = Array.from({ length: 200 }, () => r());
    expect(vals.every((v) => v >= 0 && v < 1)).toBe(true);
    const a = mulberry32(99);
    const b = mulberry32(99);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('buildRuleLookup', () => {
  it('규칙 역방향 맵', () => {
    const m = buildRuleLookup([{ studentA: 'A', studentB: 'B', minDistance: 2 }]);
    expect(m).toEqual({ A: [{ other: 'B', minDistance: 2 }], B: [{ other: 'A', minDistance: 2 }] });
  });

  it('빈 규칙은 빈 맵', () => expect(buildRuleLookup([])).toEqual({}));

  it('한 학생의 여러 규칙이 모두 누적된다', () => {
    const m = buildRuleLookup([
      { studentA: 'A', studentB: 'B', minDistance: 2 },
      { studentA: 'A', studentB: 'C', minDistance: 3 },
      { studentA: 'D', studentB: 'A', minDistance: 1 },
    ]);
    expect(m.A).toEqual([
      { other: 'B', minDistance: 2 },
      { other: 'C', minDistance: 3 },
      { other: 'D', minDistance: 1 },
    ]);
    expect(m.B).toEqual([{ other: 'A', minDistance: 2 }]);
    expect(m.C).toEqual([{ other: 'A', minDistance: 3 }]);
    expect(m.D).toEqual([{ other: 'A', minDistance: 1 }]);
  });

  it('중복 규칙은 레거시처럼 그대로 두 번 쌓인다', () => {
    const m = buildRuleLookup([
      { studentA: 'A', studentB: 'B', minDistance: 2 },
      { studentA: 'A', studentB: 'B', minDistance: 2 },
    ]);
    expect(m.A).toHaveLength(2);
    expect(m.B).toHaveLength(2);
  });

  // 스키마는 'toString'·'constructor'·'__proto__' 같은 이름도 통과시킨다.
  // 일반 객체였다면 상속된 함수 때문에 .push에서 TypeError가 나거나
  // '__proto__' 대입이 삼켜져 규칙이 사라진다.
  it('프로토타입 이름 학생도 안전하게 처리한다', () => {
    const m = buildRuleLookup([
      { studentA: 'toString', studentB: 'constructor', minDistance: 2 },
      { studentA: '__proto__', studentB: 'toString', minDistance: 3 },
      { studentA: 'hasOwnProperty', studentB: 'valueOf', minDistance: 1 },
    ]);
    expect(m['toString']).toEqual([
      { other: 'constructor', minDistance: 2 },
      { other: '__proto__', minDistance: 3 },
    ]);
    expect(m['constructor']).toEqual([{ other: 'toString', minDistance: 2 }]);
    expect(m['__proto__']).toEqual([{ other: 'toString', minDistance: 3 }]);
    expect(m['hasOwnProperty']).toEqual([{ other: 'valueOf', minDistance: 1 }]);
    expect(m['valueOf']).toEqual([{ other: 'hasOwnProperty', minDistance: 1 }]);
    // 프로토타입 오염이 없다
    expect(Object.getPrototypeOf(m)).toBeNull();
    expect(({} as Record<string, unknown>)['toString']).toBe(Object.prototype.toString);
  });

  it('규칙이 없는 학생 이름은 조회해도 값이 없다 (상속 함수를 집지 않는다)', () => {
    const m = buildRuleLookup([{ studentA: 'A', studentB: 'B', minDistance: 2 }]);
    expect(m['toString']).toBeUndefined();
    expect(m['constructor']).toBeUndefined();
  });
});

describe('buildNameToSeatMap', () => {
  it('이름 -> 좌석', () => expect(buildNameToSeatMap({ 3: 'A', 5: 'B' })).toEqual({ A: 3, B: 5 }));
  it('빈 배정은 빈 맵', () => expect(buildNameToSeatMap({})).toEqual({}));
  it('좌석 키는 숫자로 변환된다', () => {
    const m = buildNameToSeatMap({ 0: 'A', 12: 'B' });
    expect(m.A).toBe(0);
    expect(m.B).toBe(12);
    expect(typeof m.B).toBe('number');
  });

  it('프로토타입 이름 학생도 안전하게 처리한다', () => {
    // 일반 객체였다면 map['__proto__'] = 3 대입이 삼켜져 좌석을 잃는다
    const m = buildNameToSeatMap({ 3: '__proto__', 4: 'toString', 5: 'constructor' });
    expect(m['__proto__']).toBe(3);
    expect(m['toString']).toBe(4);
    expect(m['constructor']).toBe(5);
    expect(Object.getPrototypeOf(m)).toBeNull();
  });
});

describe('buildAdjacencyMap', () => {
  // 레거시 132-165행: pair 외 배치는 Manhattan 거리 1(상하좌우)만 인접으로 본다.
  // exam 6x5에서 0번(row0,col0)의 이웃은 1번(row0,col1)과 6번(row1,col0)뿐이다.
  it('시험 대형 6x5의 0번 좌석은 1, 6번과 인접 (상하좌우만)', () => {
    const d = examData();
    const ps = getLayout('exam').getSeatPositions(d.layoutSettings);
    const adj = buildAdjacencyMap(ps, posMapOf(ps), d);
    expect([...adj[0]!].sort((a, b) => a - b)).toEqual([1, 6]);
  });

  it('시험 대형 6x5의 내부 좌석 7번은 상하좌우 4개와 인접, 대각선은 제외', () => {
    const d = examData();
    const ps = getLayout('exam').getSeatPositions(d.layoutSettings);
    const adj = buildAdjacencyMap(ps, posMapOf(ps), d);
    expect([...adj[7]!].sort((a, b) => a - b)).toEqual([1, 6, 8, 13]);
    expect(adj[7]).not.toContain(0); // 대각선
    expect(adj[7]).not.toContain(14); // 대각선
  });

  it('모든 좌석이 키로 존재하고 인접 관계는 대칭', () => {
    const d = examData();
    const ps = getLayout('exam').getSeatPositions(d.layoutSettings);
    const adj = buildAdjacencyMap(ps, posMapOf(ps), d);
    expect(Object.keys(adj)).toHaveLength(30);
    for (const p of ps)
      for (const n of adj[p.index]!) expect(adj[n]).toContain(p.index);
  });

  // 레거시는 disabledSeats를 보지 않는다. 좌석 배열 자체가 필터되지 않으므로
  // getSeatPositions 결과를 그대로 넘기면 비활성 좌석도 이웃으로 남는다(레거시 동일).
  // 반대로 호출부가 가용 좌석만 넘기면 그 좌석은 맵에서 통째로 사라진다.
  it('비활성 좌석: positions를 그대로 넘기면 이웃으로 남는다', () => {
    const d = examData();
    d.layoutSettings.disabledSeats = [1];
    const ps = getLayout('exam').getSeatPositions(d.layoutSettings);
    const adj = buildAdjacencyMap(ps, posMapOf(ps), d);
    expect(ps).toHaveLength(30); // 배치는 비활성 좌석을 빼지 않는다
    expect(adj[0]).toContain(1);
  });

  it('비활성 좌석: positions에서 빼고 넘기면 키와 이웃에서 모두 사라진다', () => {
    const d = examData();
    d.layoutSettings.disabledSeats = [1];
    const disabled = new Set(d.layoutSettings.disabledSeats);
    const ps = getLayout('exam')
      .getSeatPositions(d.layoutSettings)
      .filter((p) => !disabled.has(p.index));
    const adj = buildAdjacencyMap(ps, posMapOf(ps), d);
    expect(Object.keys(adj)).toHaveLength(29);
    expect(adj[1]).toBeUndefined();
    expect(adj[0]).toEqual([6]); // 1번이 빠져 아래쪽 6번만 남는다
    expect(adj[2]).toEqual([3, 8]); // 왼쪽 1번이 빠졌다
    expect(adj[7]).toEqual([6, 8, 13]); // 위쪽 1번이 빠졌다
  });

  // 자유배치: px/py를 CELL_PX(80x60)로 양자화한 row/col로 인접을 본다.
  // 같은 칸에 겹친 두 책상은 Manhattan 거리 0이라 `dist === 1`을 만족하지 못해
  // 서로 인접이 아니다 (레거시의 엄격 비교 그대로).
  it('자유배치는 양자화된 격자 좌표로 인접을 계산하고, 같은 칸 책상은 인접이 아니다', () => {
    const d = examData({ layoutType: 'custom' });
    d.layoutSettings.customDesks = [
      { x: 0, y: 0 }, // 0 -> row0 col0
      { x: 80, y: 0 }, // 1 -> row0 col1
      { x: 0, y: 60 }, // 2 -> row1 col0
      { x: 10, y: 5 }, // 3 -> row0 col0 (0번과 같은 칸)
      { x: 160, y: 0 }, // 4 -> row0 col2
    ];
    const ps = getLayout('custom').getSeatPositions(d.layoutSettings);
    expect(ps.map((p) => [p.row, p.col])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [0, 0],
      [0, 2],
    ]);
    const adj = buildAdjacencyMap(ps, posMapOf(ps), d);
    expect(adj[0]).toEqual([1, 2]);
    expect(adj[3]).toEqual([1, 2]);
    expect(adj[0]).not.toContain(3); // 거리 0 -> 인접 아님
    expect(adj[3]).not.toContain(0);
    expect(adj[1]).toEqual([0, 3, 4]);
    expect(adj[4]).toEqual([1]); // 0번과는 거리 2
  });

  it('짝 대형은 같은 행의 짝 파트너만 인접', () => {
    const d = examData({ layoutType: 'pair' });
    const ps = getLayout('pair').getSeatPositions(d.layoutSettings);
    const adj = buildAdjacencyMap(ps, posMapOf(ps), d);
    expect(adj[0]).toEqual([1]);
    expect(adj[1]).toEqual([0]);
    expect(adj[2]).toEqual([3]);
    expect(adj[6]).toEqual([7]); // 다음 행
  });

  it('짝 대형 홀수 열: 파트너 없는 마지막 좌석은 인접 없음', () => {
    const d = examData({ layoutType: 'pair' }, 5, 2);
    const ps = getLayout('pair').getSeatPositions(d.layoutSettings);
    const adj = buildAdjacencyMap(ps, posMapOf(ps), d);
    expect(adj[4]).toEqual([]); // row0 col4 -> partnerCol 5 없음
    expect(adj[9]).toEqual([]);
  });

  it('좌석이 없으면 빈 맵', () => {
    expect(buildAdjacencyMap([], {}, examData())).toEqual({});
  });
});

describe('precomputeGenderSeats', () => {
  const allExam = () => {
    const d = examData();
    const ps = getLayout('exam').getSeatPositions(d.layoutSettings);
    return { d, ps, posMap: posMapOf(ps), available: new Set(ps.map((p) => p.index)) };
  };
  const parity = (i: number) => ((Math.floor(i / 6) + (i % 6)) % 2);

  it('genderRule none이면 null', () => {
    const d = createDefaultData();
    expect(precomputeGenderSeats(['A'], new Set([0]), {}, d)).toBeNull();
  });

  it('mixed: 학생 성별에 따라 체커보드 두 색으로 갈린다', () => {
    const { d, posMap, available } = allExam();
    const students = ['A', 'B', 'C'];
    const data: ClassData = {
      ...d,
      genderRule: 'mixed',
      studentGenders: gendersOf(students, ['M', 'F', 'M']),
    };
    const r = precomputeGenderSeats(students, available, posMap, data)!;
    expect(r).not.toBeNull();
    // 남녀 각 15칸, 서로 겹치지 않고 합치면 전체
    expect(r.A!.size).toBe(15);
    expect(r.B!.size).toBe(15);
    expect([...r.A!].every((s) => parity(s) === 0)).toBe(true);
    expect([...r.B!].every((s) => parity(s) === 1)).toBe(true);
    expect([...r.A!].some((s) => r.B!.has(s))).toBe(false);
    expect(r.C).toEqual(r.A); // 같은 성별은 같은 좌석 집합
  });

  it('mixed: 성별 없는 학생은 전체 좌석', () => {
    const { d, posMap, available } = allExam();
    const students = ['A', 'X'];
    const data: ClassData = { ...d, genderRule: 'mixed', studentGenders: { A: 'M' } };
    const r = precomputeGenderSeats(students, available, posMap, data)!;
    expect(r.X!.size).toBe(30);
  });

  it('mixed: 한 방향만 들어가면 그 방향을 고른다 (fit2)', () => {
    // 5x3 격자 = 짝수 패리티 8칸, 홀수 7칸.
    // 남 1명·여 8명 -> fit1(1<=8 && 8<=7) 실패, fit2(1<=7 && 8<=8) 성공
    // -> 남학생은 홀수(7칸), 여학생은 짝수(8칸)
    const d = examData({}, 5, 3);
    const ps = getLayout('exam').getSeatPositions(d.layoutSettings);
    const students = ['M1', ...names('F', 8)];
    const data: ClassData = {
      ...d,
      genderRule: 'mixed',
      studentGenders: gendersOf(students, ['M', 'F', 'F', 'F', 'F', 'F', 'F', 'F', 'F']),
    };
    const r = precomputeGenderSeats(students, new Set(ps.map((p) => p.index)), posMapOf(ps), data)!;
    expect(r.M1!.size).toBe(7);
    expect(r.F1!.size).toBe(8);
  });

  it('mixed: 한 방향만 들어가면 그 방향을 고른다 (fit1)', () => {
    // 5x3 격자 = 짝수 8칸, 홀수 7칸. 남 8명·여 1명
    // -> fit1(8<=8 && 1<=7) 성공, fit2(8<=7) 실패 -> 남학생 짝수(8칸), 여학생 홀수(7칸)
    const d = examData({}, 5, 3);
    const ps = getLayout('exam').getSeatPositions(d.layoutSettings);
    const students = [...names('M', 8), 'F1'];
    const data: ClassData = {
      ...d,
      genderRule: 'mixed',
      studentGenders: gendersOf(students, [...(Array(8).fill('M') as Gender[]), 'F']),
    };
    const r = precomputeGenderSeats(students, new Set(ps.map((p) => p.index)), posMapOf(ps), data)!;
    expect(r.M1!.size).toBe(8);
    expect(r.F1!.size).toBe(7);
  });

  it('mixed: 어느 방향으로도 안 들어가면 전체 좌석', () => {
    const d = examData({}, 5, 3);
    const ps = getLayout('exam').getSeatPositions(d.layoutSettings);
    const students = [...names('M', 10), ...names('F', 10)];
    const data: ClassData = {
      ...d,
      genderRule: 'mixed',
      studentGenders: gendersOf(students, [
        ...(Array(10).fill('M') as Gender[]),
        ...(Array(10).fill('F') as Gender[]),
      ]),
    };
    const r = precomputeGenderSeats(students, new Set(ps.map((p) => p.index)), posMapOf(ps), data)!;
    expect(r.M1!.size).toBe(15);
    expect(r.F1!.size).toBe(15);
  });

  it('mixed: 짝 대형은 열 패리티로 나뉜다', () => {
    const d = examData({ layoutType: 'pair' });
    const ps = getLayout('pair').getSeatPositions(d.layoutSettings);
    const students = ['A', 'B'];
    const data: ClassData = {
      ...d,
      genderRule: 'mixed',
      studentGenders: gendersOf(students, ['M', 'F']),
    };
    const r = precomputeGenderSeats(students, new Set(ps.map((p) => p.index)), posMapOf(ps), data)!;
    expect([...r.A!].every((s) => s % 6 === 0 || s % 6 === 2 || s % 6 === 4)).toBe(true);
    expect([...r.B!].every((s) => s % 6 === 1 || s % 6 === 3 || s % 6 === 5)).toBe(true);
  });

  it('mixed: 사용 가능한 좌석만 사용하고 posMap에 없는 좌석은 건너뛴다', () => {
    const { d, posMap } = allExam();
    const students = ['A', 'B'];
    const data: ClassData = {
      ...d,
      genderRule: 'mixed',
      studentGenders: gendersOf(students, ['M', 'F']),
    };
    const r = precomputeGenderSeats(students, new Set([0, 1, 2, 999]), posMap, data)!;
    expect([...r.A!, ...r.B!].sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it('mixedFirst: 소수 성별 전원 + 같은 수의 다수 성별만 체커보드, 나머지는 전체 좌석', () => {
    const { d, posMap, available } = allExam();
    const students = [...names('M', 4), ...names('F', 2)];
    const data: ClassData = {
      ...d,
      genderRule: 'mixedFirst',
      studentGenders: gendersOf(students, ['M', 'M', 'M', 'M', 'F', 'F']),
    };
    const r = precomputeGenderSeats(students, available, posMap, data)!;
    // 소수 성별 F 2명 -> 홀수 좌석(15칸), 다수 M 중 앞 2명 -> 짝수 좌석(15칸)
    expect(r.F1!.size).toBe(15);
    expect(r.F2).toEqual(r.F1);
    expect(r.M1!.size).toBe(15);
    expect(r.M2).toEqual(r.M1);
    expect(r.M1).not.toEqual(r.F1);
    // 짝을 못 찾은 나머지 다수 성별은 전체 좌석
    expect(r.M3!.size).toBe(30);
    expect(r.M4!.size).toBe(30);
  });

  it('mixedFirst: 성별 없는 학생은 전체 좌석', () => {
    const { d, posMap, available } = allExam();
    const students = ['M1', 'F1', 'X'];
    const data: ClassData = {
      ...d,
      genderRule: 'mixedFirst',
      studentGenders: { M1: 'M', F1: 'F' },
    };
    const r = precomputeGenderSeats(students, available, posMap, data)!;
    expect(r.X!.size).toBe(30);
  });

  // 아래 세 케이스는 availableSeats를 좁혀 짝수/홀수 좌석 수를 인위적으로 뒤집는다.
  // (완전한 직사각형 격자에서는 언제나 짝수 좌석 수 >= 홀수 좌석 수)
  it('mixedFirst: 홀수 색이 더 크면 소수 성별이 짝수 색으로 간다', () => {
    // 좌석 0(짝수) + 1,3,5(홀수) -> even 1칸, odd 3칸. 남 2·여 1 -> 소수 F, minorCount 1
    // fit1(1<=1)·fit2(1<=3) 모두 성립하지만 even(1) < odd(3) -> minorSeats=even
    const { d, posMap } = allExam();
    const students = ['M1', 'M2', 'F1'];
    const data: ClassData = {
      ...d,
      genderRule: 'mixedFirst',
      studentGenders: gendersOf(students, ['M', 'M', 'F']),
    };
    const r = precomputeGenderSeats(students, new Set([0, 1, 3, 5]), posMap, data)!;
    expect([...r.F1!]).toEqual([0]);
    expect([...r.M1!].sort((a, b) => a - b)).toEqual([1, 3, 5]);
  });

  it('mixedFirst: 짝수 색에만 들어가면 짝수 색을 고른다 (fit1)', () => {
    // 좌석 0,2,4(짝수 3칸) + 1(홀수 1칸). 남 3·여 2 -> 소수 F, minorCount 2
    // fit1(2<=3) 성공, fit2(2<=1) 실패
    const { d, posMap } = allExam();
    const students = ['M1', 'M2', 'M3', 'F1', 'F2'];
    const data: ClassData = {
      ...d,
      genderRule: 'mixedFirst',
      studentGenders: gendersOf(students, ['M', 'M', 'M', 'F', 'F']),
    };
    const r = precomputeGenderSeats(students, new Set([0, 1, 2, 4]), posMap, data)!;
    expect([...r.F1!].sort((a, b) => a - b)).toEqual([0, 2, 4]);
    expect([...r.M1!]).toEqual([1]);
    expect(r.M3!.size).toBe(4); // 짝을 못 찾은 다수 성별은 전체 좌석
  });

  it('mixedFirst: 홀수 색에만 들어가면 홀수 색을 고른다 (fit2)', () => {
    // 좌석 0(짝수 1칸) + 1,3,5(홀수 3칸). 남 3·여 2 -> 소수 F, minorCount 2
    // fit1(2<=1) 실패, fit2(2<=3) 성공
    const { d, posMap } = allExam();
    const students = ['M1', 'M2', 'M3', 'F1', 'F2'];
    const data: ClassData = {
      ...d,
      genderRule: 'mixedFirst',
      studentGenders: gendersOf(students, ['M', 'M', 'M', 'F', 'F']),
    };
    const r = precomputeGenderSeats(students, new Set([0, 1, 3, 5]), posMap, data)!;
    expect([...r.F1!].sort((a, b) => a - b)).toEqual([1, 3, 5]);
    expect([...r.M1!]).toEqual([0]);
  });

  it('mixedFirst: 소수 성별이 어느 색에도 안 들어가면 전체 좌석', () => {
    const d = examData({}, 5, 3);
    const ps = getLayout('exam').getSeatPositions(d.layoutSettings);
    const students = [...names('M', 9), ...names('F', 9)];
    const data: ClassData = {
      ...d,
      genderRule: 'mixedFirst',
      studentGenders: gendersOf(students, [
        ...(Array(9).fill('M') as Gender[]),
        ...(Array(9).fill('F') as Gender[]),
      ]),
    };
    const r = precomputeGenderSeats(students, new Set(ps.map((p) => p.index)), posMapOf(ps), data)!;
    expect(r.M1!.size).toBe(15);
    expect(r.F1!.size).toBe(15);
  });

  it('same: 남학생은 위쪽 행, 여학생은 아래쪽 행으로 완전 분리', () => {
    const { d, posMap, available } = allExam();
    const students = [...names('M', 6), ...names('F', 6)];
    const data: ClassData = {
      ...d,
      genderRule: 'same',
      studentGenders: gendersOf(students, [
        ...(Array(6).fill('M') as Gender[]),
        ...(Array(6).fill('F') as Gender[]),
      ]),
    };
    const r = precomputeGenderSeats(students, available, posMap, data)!;
    expect([...r.M1!].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    expect([...r.F1!].sort((a, b) => a - b)).toEqual([24, 25, 26, 27, 28, 29]);
  });

  it('same: 버퍼 행을 확보할 수 없으면 전체 좌석', () => {
    // 6x5(30칸)에 남 18·여 12 -> 남 3행 + 버퍼 1행 + 여 2행 = 6 > 5행
    const { d, posMap, available } = allExam();
    const students = [...names('M', 18), ...names('F', 12)];
    const data: ClassData = {
      ...d,
      genderRule: 'same',
      studentGenders: gendersOf(students, [
        ...(Array(18).fill('M') as Gender[]),
        ...(Array(12).fill('F') as Gender[]),
      ]),
    };
    const r = precomputeGenderSeats(students, available, posMap, data)!;
    expect(r.M1!.size).toBe(30);
    expect(r.F1!.size).toBe(30);
  });

  it('same: 성별 없는 학생은 전체 좌석', () => {
    const { d, posMap, available } = allExam();
    const students = [...names('M', 6), ...names('F', 6), 'X'];
    const data: ClassData = {
      ...d,
      genderRule: 'same',
      studentGenders: gendersOf(students, [
        ...(Array(6).fill('M') as Gender[]),
        ...(Array(6).fill('F') as Gender[]),
      ]),
    };
    const r = precomputeGenderSeats(students, available, posMap, data)!;
    expect(r.X!.size).toBe(30);
  });

  it('same: posMap에 없는 좌석은 행 계산·좌석 배분 모두에서 빠진다', () => {
    const { d, posMap } = allExam();
    const students = [...names('M', 6), ...names('F', 6)];
    const data: ClassData = {
      ...d,
      genderRule: 'same',
      studentGenders: gendersOf(students, [
        ...(Array(6).fill('M') as Gender[]),
        ...(Array(6).fill('F') as Gender[]),
      ]),
    };
    const r = precomputeGenderSeats(students, new Set([...Array(30).keys(), 999]), posMap, data)!;
    expect([...r.M1!].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(r.F1!.has(999)).toBe(false);
  });

  it('same: 비활성 좌석이 빠진 행도 정확히 센다', () => {
    // 0~5행 중 첫 행 좌석 2개를 뺀다 -> 남 4명은 여전히 첫 행에 들어간다
    const { d, posMap } = allExam();
    const available = new Set([...Array(30).keys()].filter((i) => i !== 0 && i !== 1));
    const students = [...names('M', 4), ...names('F', 6)];
    const data: ClassData = {
      ...d,
      genderRule: 'same',
      studentGenders: gendersOf(students, [
        ...(Array(4).fill('M') as Gender[]),
        ...(Array(6).fill('F') as Gender[]),
      ]),
    };
    const r = precomputeGenderSeats(students, available, posMap, data)!;
    expect([...r.M1!].sort((a, b) => a - b)).toEqual([2, 3, 4, 5]);
    expect([...r.F1!].sort((a, b) => a - b)).toEqual([24, 25, 26, 27, 28, 29]);
  });

  // ---- 경계: 학생 0명 / 가용 좌석 0칸 -------------------------------------
  // 레거시는 `students.forEach`로만 result를 채우므로 학생이 없으면 빈 객체,
  // 좌석이 없으면 모든 학생이 빈 좌석 집합을 받는다(어느 쪽도 null이 아니다).
  const eachRule = ['mixed', 'mixedFirst', 'same'] as const;

  it.each(eachRule)('%s: 학생이 없으면 빈 맵 (null 아님)', (rule) => {
    const { d, posMap, available } = allExam();
    const data: ClassData = { ...d, genderRule: rule, studentGenders: {} };
    const r = precomputeGenderSeats([], available, posMap, data);
    expect(r).not.toBeNull();
    expect(Object.keys(r!)).toEqual([]);
  });

  it.each(eachRule)('%s: 가용 좌석이 없으면 모든 학생이 빈 집합', (rule) => {
    const { d, posMap } = allExam();
    const students = ['M1', 'F1', 'X'];
    const data: ClassData = {
      ...d,
      genderRule: rule,
      studentGenders: { M1: 'M', F1: 'F' },
    };
    const r = precomputeGenderSeats(students, new Set(), posMap, data)!;
    expect(r).not.toBeNull();
    expect(Object.keys(r).sort()).toEqual(['F1', 'M1', 'X']);
    for (const s of students) expect(r[s]!.size).toBe(0);
  });

  // ---- 프로토타입 이름 학생 ------------------------------------------------
  it('프로토타입 이름 학생도 안전하게 처리한다', () => {
    // 레거시는 genders['toString']이 상속 함수라 'M'/'F' 어느 쪽도 아니어서
    // "성별 모름" -> 전체 좌석으로 떨어졌다. 그 동작을 그대로 유지한다.
    const { d, posMap, available } = allExam();
    const students = ['toString', '__proto__', 'M1'];
    // 객체 리터럴의 `__proto__:`는 프로토타입 지정이라 계산된 키로 넣어야 자기 속성이 된다
    const studentGenders: Record<string, Gender> = { M1: 'M', ['__proto__']: 'F' };
    const data: ClassData = { ...d, genderRule: 'mixed', studentGenders };
    const r = precomputeGenderSeats(students, available, posMap, data)!;
    expect(Object.getPrototypeOf(r)).toBeNull();
    expect(r['toString']!.size).toBe(30); // 성별 모름 -> 전체 좌석
    expect(r['M1']!.size).toBe(15);
    expect(r['__proto__']!.size).toBe(15); // 여학생 좌석
    expect(r['M1']).not.toEqual(r['__proto__']);
  });
});
