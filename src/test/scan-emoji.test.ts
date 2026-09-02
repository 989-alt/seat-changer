import { findViolations } from '../../scripts/scan-emoji.mjs';

describe('scan-emoji', () => {
  it('이모지 코드포인트를 잡는다', () => {
    const v = findViolations([{ path: 'a.tsx', content: 'const x = "완료 \u{1F389}";' }]);
    expect(v).toEqual([{ path: 'a.tsx', line: 1, kind: 'emoji' }]);
  });
  it('한글·기호·화살표는 통과한다', () => {
    const v = findViolations([{ path: 'a.tsx', content: '되살리기 → ✓ ✕ ★ ①' }]);
    expect(v).toEqual([]);
  });
  it('이미지 import를 잡는다', () => {
    // 스캔 게이트가 이 테스트 파일 자체를 걸지 않도록 문자열을 런타임에 이어붙인다.
    const imgLine = "import bg from './cork." + "png';";
    const v = findViolations([{ path: 'b.tsx', content: imgLine }]);
    expect(v).toEqual([{ path: 'b.tsx', line: 1, kind: 'image-import' }]);
  });
  it('기본 이모지 표시 문자를 잡는다', () => {
    // \u{...} 이스케이프로 작성해 이 테스트 파일 자체가 스캔에 걸리지 않게 한다.
    const chars = ['\u{2705}', '\u{274C}', '\u{26A1}', '\u{2600}', '\u{25B6}', '\u{24C2}', '\u{2194}'];
    for (const ch of chars) {
      const v = findViolations([{ path: 'a.tsx', content: ch }]);
      expect(v).toEqual([{ path: 'a.tsx', line: 1, kind: 'emoji' }]);
    }
  });
  it('허용 기호는 통과한다', () => {
    const v = findViolations([{ path: 'a.tsx', content: '되살리기 → ✓ ✕ ★ ①' }]);
    expect(v).toEqual([]);
  });
  it('변형선택자가 붙은 기호는 잡는다', () => {
    const v = findViolations([{ path: 'a.tsx', content: '✓\u{FE0F}' }]);
    expect(v).toEqual([{ path: 'a.tsx', line: 1, kind: 'emoji' }]);
  });
  it('대문자 확장자와 동적 import를 잡는다', () => {
    const line1 = "import a from './x." + "PNG';";
    const line2 = "const m = await import('./y." + "png');";
    const v1 = findViolations([{ path: 'a.tsx', content: line1 }]);
    const v2 = findViolations([{ path: 'b.tsx', content: line2 }]);
    expect(v1).toEqual([{ path: 'a.tsx', line: 1, kind: 'image-import' }]);
    expect(v2).toEqual([{ path: 'b.tsx', line: 1, kind: 'image-import' }]);
  });
});
