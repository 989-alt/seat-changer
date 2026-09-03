import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ClassData } from './types';
import { migrateToV2, loadClassData, stripDangerousKeys } from './migrate';
import { ClassDataSchema } from './schema';
import { createDefaultData } from './defaults';
import { exportClassJSON, importClassJSON } from '../storage/json';
// 레거시 교차 확인용. models.js는 부작용이 없다(store.js는 모듈 로드 시 localStorage를 건드리므로 쓰지 않는다).
import { createDefaultData as legacyDefaults, validateStudents as legacyValidateStudents } from '../../../legacy/js/data/models.js';

const fx = (n: string) => readFileSync(resolve(__dirname, '../../test/fixtures', n), 'utf8');

describe('stripDangerousKeys', () => {
  it('__proto__ 제거', () => {
    const o = JSON.parse('{"a":1,"__proto__":{"polluted":true},"n":{"constructor":1}}');
    const s = stripDangerousKeys(o) as Record<string, unknown>;
    expect(Object.keys(s)).toEqual(['a', 'n']);
    expect(Object.keys(s.n as object)).toEqual([]);
  });
});

describe('migrateToV2', () => {
  // migrateToV2는 내부에서 ClassDataSchema.parse를 통과한 값만 돌려주므로
  // safeParse(out).success는 항상 true다(동어반복). 필드 값을 직접 확인한다.
  it.each([
    ['v1-basic.json', { layoutType: 'exam', students: 22, columns: 6, rows: 4, fixedSeats: 1, history: 1 }],
    ['v1-group-history.json', { layoutType: 'group', students: 22, columns: 6, rows: 5, fixedSeats: 0, history: 3 }],
    ['v1-custom-disabled.json', { layoutType: 'custom', students: 18, columns: 6, rows: 5, fixedSeats: 1, history: 0 }],
  ] as const)('%s → 유효한 v2', (f, want) => {
    const out = migrateToV2(JSON.parse(fx(f)));
    expect(out.schemaVersion).toBe(2);
    expect(out.layoutType).toBe(want.layoutType);
    expect(out.students).toHaveLength(want.students);
    expect(out.classSize).toBe(want.students);
    expect(out.layoutSettings.columns).toBe(want.columns);
    expect(out.layoutSettings.rows).toBe(want.rows);
    expect(out.fixedSeats).toHaveLength(want.fixedSeats);
    expect(out.assignmentHistory).toHaveLength(want.history);
  });

  it('v1-custom-disabled.json의 __proto__는 프로토타입을 오염시키지 않는다', () => {
    const out = migrateToV2(JSON.parse(fx('v1-custom-disabled.json')));
    expect((Object.prototype as unknown as { polluted?: unknown }).polluted).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(out, '__proto__')).toBe(false);
    expect(Object.keys(out)).not.toContain('__proto__');
    expect(out.layoutSettings.customDesks).toHaveLength(20);
    expect(out.layoutSettings.disabledSeats).toEqual([1, 2]);
    expect(out.viewPerspective).toBe('teacher');
  });
  it('학생·규칙·이력이 보존된다', () => {
    const src = JSON.parse(fx('v1-basic.json'));
    const out = migrateToV2(src);
    expect(out.students).toEqual(src.students);
    expect(out.fixedSeats).toEqual(src.fixedSeats);
    expect(out.separationRules).toEqual(src.separationRules);
    expect(out.lastAssignment?.mapping).toEqual(src.lastAssignment.mapping);
  });
  // R2: 레거시 importJSON과 동일한 clamp. 음수는 기본값이 아니라 하한으로 접힌다
  // (`Math.max(1, Math.min(12, parseInt(x) || 기본))`).
  it('범위 밖 값은 기본값·상한으로', () => {
    const out = migrateToV2({ layoutSettings: { columns: 99, rows: -1, disabledSeats: [1, 'x', 5000] }, historyExcludeCount: 9 });
    expect(out.layoutSettings.columns).toBe(12);
    expect(out.layoutSettings.rows).toBe(1);
    expect(out.layoutSettings.disabledSeats).toEqual([1]);
    expect(out.historyExcludeCount).toBe(1);
  });
  it('R2: 음수는 레거시처럼 하한으로 접는다', () => {
    const out = migrateToV2({
      layoutSettings: { columns: -3, rows: -1, groupSize: -1, groupSizes: [-2], groupCount: -5 },
      separationRules: [{ studentA: '김하람', studentB: '이도윤', minDistance: -4 }],
    });
    expect(out.layoutSettings.columns).toBe(1);
    expect(out.layoutSettings.rows).toBe(1);
    expect(out.layoutSettings.groupSize).toBe(2);
    expect(out.layoutSettings.groupSizes).toEqual([1]);
    expect(out.layoutSettings.groupCount).toBe(0);
    expect(out.separationRules[0]?.minDistance).toBe(1);
  });
  it('R2: 0·비수치는 레거시처럼 기본값으로', () => {
    const out = migrateToV2({ layoutSettings: { columns: 0, rows: 'abc', groupSize: null, groupSizes: [0, 'x'] } });
    expect(out.layoutSettings.columns).toBe(6);
    expect(out.layoutSettings.rows).toBe(5);
    expect(out.layoutSettings.groupSize).toBe(4);
    expect(out.layoutSettings.groupSizes).toEqual([4, 4]);
  });
  it('이미 v2면 그대로', () => {
    const v2 = migrateToV2(JSON.parse(fx('v1-basic.json')));
    expect(migrateToV2(v2)).toEqual(v2);
  });
});

describe('loadClassData', () => {
  it('null → 기본값, ok:false', () => expect(loadClassData(null)).toMatchObject({ ok: false }));
  it('깨진 JSON → 기본값, ok:false', () => expect(loadClassData('{oops')).toMatchObject({ ok: false }));
  it('v1 → ok, migrated:true', () => expect(loadClassData(fx('v1-basic.json'))).toMatchObject({ ok: true, migrated: true }));
});

describe('json', () => {
  it('내보내기 → 가져오기 왕복 (lastAssignment은 null)', () => {
    const d = migrateToV2(JSON.parse(fx('v1-basic.json')));
    const back = importClassJSON(exportClassJSON(d));
    expect(back.ok).toBe(true); if (!back.ok) return;
    expect(back.data).toEqual({ ...d, lastAssignment: null });
  });
  it('v1 백업 파일도 가져온다', () => expect(importClassJSON(fx('v1-group-history.json')).ok).toBe(true));
  it('배열·문자열은 거부', () => {
    expect(importClassJSON('[1]').ok).toBe(false);
    expect(importClassJSON('"x"').ok).toBe(false);
  });
});

// ---- 여기부터는 브리핑 외 추가 테스트 (스키마가 레거시보다 엄격해진 지점) ----

describe('loadClassData 부가', () => {
  it('빈 문자열 → ok:false, 기본값', () => {
    const r = loadClassData('');
    expect(r.ok).toBe(false);
    expect(r.data).toEqual(createDefaultData());
  });
  it('schemaVersion 2면 migrated:false', () => {
    const v2 = migrateToV2(JSON.parse(fx('v1-basic.json')));
    expect(loadClassData(JSON.stringify(v2))).toMatchObject({ ok: true, migrated: false });
  });
  // 객체가 아닌 JSON은 반 데이터가 아니다. 조용히 빈 반으로 되살리지 않고 실패로 알린다.
  it.each(['null', '[]', '1', '"x"'])('객체가 아닌 JSON %s → ok:false, 기본값', (raw) => {
    const r = loadClassData(raw);
    expect(r.ok).toBe(false);
    expect(r.data).toEqual(createDefaultData());
    expect(r.ok === false && r.error.length > 0).toBe(true);
  });
  it('오류 메시지는 한국어 사용자 문구다(원문 예외 메시지 노출 금지)', () => {
    const r = loadClassData('{oops');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('저장된 데이터를 읽지 못했습니다.');
  });
  it('ok:false여도 data는 유효한 기본값', () => {
    const r = loadClassData(null);
    expect(ClassDataSchema.safeParse(r.data).success).toBe(true);
    expect(r.ok === false && r.error.length > 0).toBe(true);
  });
});

describe('스키마 강화 지점 정규화', () => {
  it('R54: 중복 고정석은 첫 항목만 남는다', () => {
    const out = migrateToV2({
      students: ['김하람', '이도윤'],
      fixedSeats: [
        { studentName: '김하람', seatIndex: 0 },
        { studentName: '이도윤', seatIndex: 0 }, // 같은 좌석
        { studentName: '김하람', seatIndex: 3 }, // 같은 학생
        { studentName: '이도윤', seatIndex: 4 },
        { studentName: 42, seatIndex: 5 }, // 잘못된 모양
        { studentName: '박서준', seatIndex: -1 }, // 음수 좌석
      ],
    });
    expect(out.fixedSeats).toEqual([
      { studentName: '김하람', seatIndex: 0 },
      { studentName: '이도윤', seatIndex: 4 },
    ]);
  });

  it('R55: 정규 형식이 아닌 좌석 키는 버린다', () => {
    const out = migrateToV2({
      students: ['김하람'],
      lastAssignment: { mapping: { '0': '김하람', '01': '이도윤', ' 2': '박서준', '-1': '최지우', '1e2': '정민서', x: '강예린', '3': 5 }, timestamp: 1 },
      assignmentHistory: [{ mapping: { '10': '김하람', '': '이도윤' }, timestamp: 2 }],
    });
    expect(out.lastAssignment?.mapping).toEqual({ 0: '김하람' });
    expect(out.assignmentHistory[0]?.mapping).toEqual({ 10: '김하람' });
  });

  it('R59: disabledSeats는 정수·범위·중복을 정리한다', () => {
    const out = migrateToV2({ layoutSettings: { disabledSeats: [3, 3, 1, 1.5, -2, 999, 1000, '4', 1] } });
    expect(out.layoutSettings.disabledSeats).toEqual([3, 1, 999]);
  });

  it('R76: 중복 학생은 첫 항목만 남고 classSize는 명단 길이', () => {
    const out = migrateToV2({ students: ['김하람', '이도윤', '김하람', ' 이도윤 ', '박서준'] });
    expect(out.students).toEqual(['김하람', '이도윤', '박서준']);
    expect(out.classSize).toBe(3);
  });

  it('성별·모둠 배치 모드 등 열거형 밖 값은 버리거나 기본값으로', () => {
    const out = migrateToV2({
      students: ['김하람', '이도윤'],
      studentGenders: { 김하람: 'F', 이도윤: 'male' },
      genderRule: 'weird',
      layoutType: 'nope',
      viewPerspective: 'wall',
      layoutSettings: { groupLayoutMode: 'freeform' },
    });
    expect(out.studentGenders).toEqual({ 김하람: 'F' });
    expect(out.genderRule).toBe('none');
    expect(out.layoutType).toBe('exam');
    expect(out.viewPerspective).toBe('student');
    expect(out.layoutSettings.groupLayoutMode).toBe('auto');
  });
});

// R82: 필드 하나가 망가졌다고 반 전체를 버리지 않는다.
// migrateToV2가 내부에서 parse를 통과시키므로 safeParse(out).success 검사는 동어반복이다.
// 대신 정규화된 값을 직접 확인하고, 결과가 기본값(=반이 통째로 날아간 상태)이 아닌지 본다.
describe('망가진 입력에도 던지지 않는다', () => {
  const junk: { name: string; input: unknown; check?: (out: ClassData) => void }[] = [
    { name: 'null', input: null },
    { name: 'undefined', input: undefined },
    { name: '숫자', input: 0 },
    { name: '문자열', input: 'string' },
    { name: '빈 배열', input: [] },
    { name: '숫자 배열', input: [1, 2, 3] },
    { name: '빈 객체', input: {} },
    {
      name: '필드 타입 뒤바뀜',
      input: { students: 'not-an-array', layoutSettings: 7 },
      check: (o) => {
        expect(o.students).toEqual([]);
        expect(o.layoutSettings.columns).toBe(6);
      },
    },
    {
      name: '명단·규칙 잡동사니',
      input: { students: [null, 1, {}, '   ', '<김하람>', '이도윤'], fixedSeats: 'x', separationRules: {}, studentGenders: [] },
      check: (o) => {
        expect(o.students).toEqual(['김하람', '이도윤']);
        expect(o.fixedSeats).toEqual([]);
        expect(o.separationRules).toEqual([]);
        expect(o.studentGenders).toEqual({});
      },
    },
    {
      name: '책상·모둠 위치 잡동사니',
      input: { layoutSettings: { customDesks: [{ x: 'a', y: 1 }, null, { x: 1, y: 2 }], groupDesks: 'x', groupPositions: [{ groupIndex: 1.5, x: 0, y: 0 }, { groupIndex: 0, x: 1, y: 2 }] } },
      check: (o) => {
        expect(o.layoutSettings.customDesks).toEqual([{ x: 1, y: 2 }]);
        expect(o.layoutSettings.groupDesks).toEqual([]);
        expect(o.layoutSettings.groupPositions).toEqual([{ groupIndex: 0, x: 1, y: 2 }]);
      },
    },
    {
      name: '이력 잡동사니',
      input: { lastAssignment: 'nope', assignmentHistory: [null, { mapping: null, timestamp: 'x' }], groupHistory: [{ groups: [['김하람'], 'x'], timestamp: 1 }] },
      check: (o) => {
        expect(o.lastAssignment).toBeNull();
        expect(o.assignmentHistory).toEqual([]);
        expect(o.groupHistory).toEqual([{ groups: [['김하람']], timestamp: 1 }]);
      },
    },
    {
      name: '모둠 수치 범위 밖',
      input: { layoutSettings: { groupSizes: [9, 0, -3, '4'], groupCount: 999, groupSize: 99 } },
      check: (o) => {
        expect(o.layoutSettings.groupSizes).toEqual([8, 4, 1, 4]);
        expect(o.layoutSettings.groupCount).toBe(20);
        expect(o.layoutSettings.groupSize).toBe(8);
      },
    },
    // R82-1: 객체가 수치 필드에 들어와도 parseInt 앞에서 문자열화하다 터지면 안 된다.
    {
      name: '수치 필드에 객체',
      input: { students: ['김하람'], layoutSettings: { columns: {}, rows: [], groupSize: { a: 1 }, groupSizes: [{}, 3] } },
      check: (o) => {
        expect(o.students).toEqual(['김하람']);
        expect(o.layoutSettings.columns).toBe(6);
        expect(o.layoutSettings.rows).toBe(5);
        expect(o.layoutSettings.groupSize).toBe(4);
        expect(o.layoutSettings.groupSizes).toEqual([4, 3]);
      },
    },
    {
      name: 'minDistance에 객체',
      input: { students: ['A', 'B'], separationRules: [{ studentA: 'A', studentB: 'B', minDistance: {} }] },
      check: (o) => expect(o.separationRules).toEqual([{ studentA: 'A', studentB: 'B', minDistance: 1 }]),
    },
    // R82-2: 안전정수 범위를 벗어난 값은 스키마의 z.number().int()를 통과하지 못한다.
    {
      name: '안전정수 밖 seatIndex',
      input: { students: ['A'], fixedSeats: [{ studentName: 'A', seatIndex: 1e21 }, { studentName: 'A', seatIndex: 2 }] },
      check: (o) => expect(o.fixedSeats).toEqual([{ studentName: 'A', seatIndex: 2 }]),
    },
    {
      name: '안전정수 밖 groupIndex·disabledSeats',
      input: { layoutSettings: { groupPositions: [{ groupIndex: 1e21, x: 0, y: 0 }], disabledSeats: [1e21, 2] } },
      check: (o) => {
        expect(o.layoutSettings.groupPositions).toEqual([]);
        expect(o.layoutSettings.disabledSeats).toEqual([2]);
      },
    },
    // 널 프로토타입 객체(레거시 sanitizeObj 결과)도 그대로 들어올 수 있다.
    {
      name: '널 프로토타입 객체',
      input: stripDangerousKeys(JSON.parse('{"students":["김하람"],"layoutSettings":{"columns":{"__proto__":null}}}')),
      check: (o) => {
        expect(o.students).toEqual(['김하람']);
        expect(o.layoutSettings.columns).toBe(6);
      },
    },
  ];
  it.each(junk.map((j) => [j.name, j] as const))('입력 %s → 유효한 v2', (_name, j) => {
    const out = migrateToV2(j.input);
    expect(out.schemaVersion).toBe(2);
    j.check?.(out);
    // 자기 자신에 대해 멱등이다.
    expect(migrateToV2(out)).toEqual(out);
  });
});

describe('레거시 대조 (legacy/js/data/models.js)', () => {
  it('학생 정규화는 레거시 validateStudents와 같다 (중복 제거만 v2가 추가)', () => {
    const raw = [' 김하람 ', '<b>이도윤</b>', '', 42, 'a'.repeat(60), '김하람'];
    const legacy = legacyValidateStudents(raw) as string[];
    expect(legacy).toEqual(['김하람', 'b이도윤/b', 'a'.repeat(50), '김하람']);
    expect(migrateToV2({ students: raw }).students).toEqual([...new Set(legacy)]);
  });

  it('빈 입력의 기본값은 레거시 createDefaultData와 같다', () => {
    const out = migrateToV2({});
    const legacy = legacyDefaults() as Record<string, unknown>;
    const compared = [
      'students', 'classSize', 'layoutType', 'fixedSeats', 'separationRules',
      'genderRule', 'assignmentHistory', 'historyExcludeCount', 'useHistoryExclusion',
      'viewPerspective', 'groupHistory', 'useGroupExclusion', 'groupExcludeCount',
    ] as const;
    for (const k of compared) expect([k, out[k]]).toEqual([k, legacy[k]]);
    expect(out.studentGenders).toEqual({});
    expect(out.lastAssignment).toBeNull();
    expect(out.layoutSettings).toEqual({ ...(legacy.layoutSettings as object) });
  });
});

describe('Date 범위 밖 timestamp (R87)', () => {
  it('lastAssignment·이력·모둠 이력의 timestamp가 Date 범위를 넘으면 그 레코드만 버린다', () => {
    const out = migrateToV2({
      students: ['가', '나'],
      lastAssignment: { mapping: { 0: '가', 1: '나' }, timestamp: 1e20 },
      assignmentHistory: [
        { mapping: { 0: '가' }, timestamp: 1e20 },
        { mapping: { 0: '나' }, timestamp: 1700000000000 },
      ],
      groupHistory: [
        { groups: [['가', '나']], timestamp: -1e20 },
        { groups: [['가'], ['나']], timestamp: 1700000000000 },
      ],
    });
    expect(out.lastAssignment).toBeNull();
    expect(out.assignmentHistory).toHaveLength(1);
    expect(out.assignmentHistory[0]?.timestamp).toBe(1700000000000);
    expect(out.groupHistory).toHaveLength(1);
    expect(out.groupHistory[0]?.timestamp).toBe(1700000000000);
    // 살아남은 timestamp는 Date로 변환 가능해야 한다 (스토어 recordAssignment가 toISOString을 호출)
    expect(() => new Date(out.assignmentHistory[0]!.timestamp).toISOString()).not.toThrow();
  });
});
