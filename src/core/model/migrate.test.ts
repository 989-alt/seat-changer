import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  it.each(['v1-basic.json', 'v1-group-history.json', 'v1-custom-disabled.json'])('%s → 유효한 v2', (f) => {
    const out = migrateToV2(JSON.parse(fx(f)));
    expect(out.schemaVersion).toBe(2);
    expect(ClassDataSchema.safeParse(out).success).toBe(true);
  });
  it('학생·규칙·이력이 보존된다', () => {
    const src = JSON.parse(fx('v1-basic.json'));
    const out = migrateToV2(src);
    expect(out.students).toEqual(src.students);
    expect(out.fixedSeats).toEqual(src.fixedSeats);
    expect(out.separationRules).toEqual(src.separationRules);
    expect(out.lastAssignment?.mapping).toEqual(src.lastAssignment.mapping);
  });
  it('범위 밖 값은 기본값·상한으로', () => {
    const out = migrateToV2({ layoutSettings: { columns: 99, rows: -1, disabledSeats: [1, 'x', 5000] }, historyExcludeCount: 9 });
    expect(out.layoutSettings.columns).toBe(12);
    expect(out.layoutSettings.rows).toBe(5);
    expect(out.layoutSettings.disabledSeats).toEqual([1]);
    expect(out.historyExcludeCount).toBe(1);
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
    expect(ClassDataSchema.safeParse(out).success).toBe(true);
  });

  it('R55: 정규 형식이 아닌 좌석 키는 버린다', () => {
    const out = migrateToV2({
      students: ['김하람'],
      lastAssignment: { mapping: { '0': '김하람', '01': '이도윤', ' 2': '박서준', '-1': '최지우', '1e2': '정민서', x: '강예린', '3': 5 }, timestamp: 1 },
      assignmentHistory: [{ mapping: { '10': '김하람', '': '이도윤' }, timestamp: 2 }],
    });
    expect(out.lastAssignment?.mapping).toEqual({ 0: '김하람' });
    expect(out.assignmentHistory[0]?.mapping).toEqual({ 10: '김하람' });
    expect(ClassDataSchema.safeParse(out).success).toBe(true);
  });

  it('R59: disabledSeats는 정수·범위·중복을 정리한다', () => {
    const out = migrateToV2({ layoutSettings: { disabledSeats: [3, 3, 1, 1.5, -2, 999, 1000, '4', 1] } });
    expect(out.layoutSettings.disabledSeats).toEqual([3, 1, 999]);
  });

  it('R76: 중복 학생은 첫 항목만 남고 classSize는 명단 길이', () => {
    const out = migrateToV2({ students: ['김하람', '이도윤', '김하람', ' 이도윤 ', '박서준'] });
    expect(out.students).toEqual(['김하람', '이도윤', '박서준']);
    expect(out.classSize).toBe(3);
    expect(ClassDataSchema.safeParse(out).success).toBe(true);
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

describe('망가진 입력에도 던지지 않는다', () => {
  const junk: unknown[] = [
    null,
    undefined,
    0,
    'string',
    [],
    [1, 2, 3],
    {},
    { students: 'not-an-array', layoutSettings: 7 },
    { students: [null, 1, {}, '   ', '<김하람>'], fixedSeats: 'x', separationRules: {}, studentGenders: [] },
    { layoutSettings: { customDesks: [{ x: 'a', y: 1 }, null, { x: 1, y: 2 }], groupDesks: 'x', groupPositions: [{ groupIndex: 1.5, x: 0, y: 0 }, { groupIndex: 0, x: 1, y: 2 }] } },
    { lastAssignment: 'nope', assignmentHistory: [null, { mapping: null, timestamp: 'x' }], groupHistory: [{ groups: [['김하람'], 'x'], timestamp: 1 }] },
    { layoutSettings: { groupSizes: [9, 0, -3, '4'], groupCount: 999, groupSize: 99 } },
  ];
  it.each(junk.map((v, i) => [i, v] as const))('입력 %i → 유효한 v2', (_i, v) => {
    const out = migrateToV2(v);
    expect(ClassDataSchema.safeParse(out).success).toBe(true);
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
