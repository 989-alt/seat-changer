import { ClassDataSchema, sanitizeStudents } from './schema';
import { createDefaultData } from './defaults';

describe('createDefaultData', () => {
  it('v1 기본값과 같은 필드를 가진다', () => {
    const d = createDefaultData();
    expect(d.schemaVersion).toBe(2);
    expect(d.layoutType).toBe('exam');
    expect(d.layoutSettings).toMatchObject({ columns: 6, rows: 5, groupSize: 4, groupCount: 0, groupLayoutMode: 'auto', disabledSeats: [] });
    expect(d.historyExcludeCount).toBe(1);
    expect(d.useHistoryExclusion).toBe(true);
    expect(d.viewPerspective).toBe('student');
  });
});

describe('sanitizeStudents', () => {
  it('공백 제거, 특수문자 제거, 50자 제한, 100명 제한', () => {
    expect(sanitizeStudents([' 김하람 ', '<b>이도윤</b>', '', 42, 'a'.repeat(60)])).toEqual(['김하람', 'b이도윤/b', 'a'.repeat(50)]);
    expect(sanitizeStudents(Array.from({ length: 120 }, (_, i) => `s${i}`))).toHaveLength(100);
  });
  it('배열이 아니면 빈 배열', () => expect(sanitizeStudents(null)).toEqual([]));
});

describe('ClassDataSchema', () => {
  it('기본값은 통과', () => expect(ClassDataSchema.safeParse(createDefaultData()).success).toBe(true));
  it('행·열 범위 밖은 실패', () => {
    const d = createDefaultData();
    d.layoutSettings.columns = 13;
    expect(ClassDataSchema.safeParse(d).success).toBe(false);
  });
  it('성별 값은 M/F만', () => {
    const d = createDefaultData();
    (d.studentGenders as Record<string, string>)['김하람'] = 'male';
    expect(ClassDataSchema.safeParse(d).success).toBe(false);
  });
  it('schemaVersion이 없으면 실패(마이그레이션 대상)', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { schemaVersion: _v, ...rest } = createDefaultData();
    expect(ClassDataSchema.safeParse(rest).success).toBe(false);
  });
});

// R54: fixedSeats 중복(같은 좌석에 두 학생, 같은 학생을 두 좌석에)은 파싱 단계에서 실패해야 한다.
// 나중에 랜덤 배치기가 조용히 한쪽을 무시하는 것을 막는다.
describe('ClassDataSchema fixedSeats 중복 (R54)', () => {
  it('중복된 seatIndex는 실패', () => {
    const d = createDefaultData();
    d.students = ['김하람', '이도윤'];
    d.fixedSeats = [
      { studentName: '김하람', seatIndex: 0 },
      { studentName: '이도윤', seatIndex: 0 },
    ];
    expect(ClassDataSchema.safeParse(d).success).toBe(false);
  });

  it('중복된 studentName은 실패', () => {
    const d = createDefaultData();
    d.students = ['김하람'];
    d.fixedSeats = [
      { studentName: '김하람', seatIndex: 0 },
      { studentName: '김하람', seatIndex: 1 },
    ];
    expect(ClassDataSchema.safeParse(d).success).toBe(false);
  });

  it('서로 다른 두 항목은 통과', () => {
    const d = createDefaultData();
    d.students = ['김하람', '이도윤'];
    d.fixedSeats = [
      { studentName: '김하람', seatIndex: 0 },
      { studentName: '이도윤', seatIndex: 1 },
    ];
    expect(ClassDataSchema.safeParse(d).success).toBe(true);
  });
});

// R55: Assignment(mapping) 키는 '0' | '1'.. 형태의 정규 정수 문자열만 허용한다.
// '', ' 1 ', '1e2', '01', '-1', 안전정수 범위를 벗어나는 값은 조용히 버려지지 않고 파싱 실패로 이어져야 한다.
describe('ClassDataSchema Assignment 키 검증 (R55)', () => {
  it.each(['', ' 1 ', '1e2', '01', '-1', '99999999999999999999'])('비정규 키 "%s"는 실패', (key) => {
    const d = createDefaultData();
    d.lastAssignment = { mapping: { [key]: '김하람' }, timestamp: Date.now() };
    expect(ClassDataSchema.safeParse(d).success).toBe(false);
  });

  it('정규 키는 숫자로 변환되어 통과', () => {
    const d = createDefaultData();
    d.lastAssignment = { mapping: { '0': 'a', '12': 'b' }, timestamp: Date.now() };
    const r = ClassDataSchema.safeParse(d);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.lastAssignment?.mapping).toEqual({ 0: 'a', 12: 'b' });
    }
  });
});

// R76: 명단에 같은 이름이 두 번 들어오면 실패시킨다.
// 이름이 곧 학생 식별자이므로(고정석·분리규칙·성별이 모두 이름으로 참조한다)
// 중복은 배치기가 한 사람을 두 자리에 앉히거나 규칙을 엉뚱한 학생에게 적용하게 만든다.
describe('ClassDataSchema students 중복 (R76)', () => {
  it('중복된 학생 이름은 실패', () => {
    const d = createDefaultData();
    d.students = ['김하람', '이도윤', '김하람'];
    expect(ClassDataSchema.safeParse(d).success).toBe(false);
  });

  it('중복이 없으면 통과', () => {
    const d = createDefaultData();
    d.students = ['김하람', '이도윤'];
    expect(ClassDataSchema.safeParse(d).success).toBe(true);
  });
});
