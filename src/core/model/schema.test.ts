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
