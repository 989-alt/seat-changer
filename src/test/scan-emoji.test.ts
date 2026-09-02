import { findViolations, isImageFile } from '../../scripts/scan-emoji.mjs';

describe('scan-emoji', () => {
  it('이모지 코드포인트를 잡는다', () => {
    const content = `const x = "완료 ${String.fromCodePoint(0x1f389)}";`;
    const v = findViolations([{ path: 'a.tsx', content }]);
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
    // String.fromCodePoint로 런타임에 만들어 이 테스트 파일 자체가 스캔에 걸리지 않게 한다.
    const codePoints = [0x2705, 0x274c, 0x26a1, 0x2600, 0x25b6, 0x24c2, 0x2194];
    for (const cp of codePoints) {
      const v = findViolations([{ path: 'a.tsx', content: String.fromCodePoint(cp) }]);
      expect(v).toEqual([{ path: 'a.tsx', line: 1, kind: 'emoji' }]);
    }
  });

  it('허용 기호는 통과한다', () => {
    const v = findViolations([{ path: 'a.tsx', content: '되살리기 → ✓ ✕ ★ ①' }]);
    expect(v).toEqual([]);
  });

  it('변형선택자가 붙은 기호는 잡는다', () => {
    const content = '✓' + String.fromCodePoint(0xfe0f);
    const v = findViolations([{ path: 'a.tsx', content }]);
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

  it('이스케이프 텍스트로 위장한 이모지도 잡는다', () => {
    // 소스에는 실제 백슬래시 이스케이프도, 이모지도 존재하지 않는다(자기 스캔 회피).
    const escText = String.fromCharCode(92) + 'u{1F389}';
    const content = `const x = "${escText}";`;
    const v = findViolations([{ path: 'a.tsx', content }]);
    expect(v).toEqual([{ path: 'a.tsx', line: 1, kind: 'emoji' }]);
  });

  it('new URL·쿼리스트링·CSS url() 안의 이미지 참조를 잡는다', () => {
    const urlLine = "new URL('./z." + "png', import.meta.url)";
    const queryLine = "const p = './a." + "png?url';";
    const cssLine = "background: url(./b." + "png)";
    expect(findViolations([{ path: 'a.tsx', content: urlLine }])).toEqual([
      { path: 'a.tsx', line: 1, kind: 'image-import' },
    ]);
    expect(findViolations([{ path: 'a.tsx', content: queryLine }])).toEqual([
      { path: 'a.tsx', line: 1, kind: 'image-import' },
    ]);
    expect(findViolations([{ path: 'a.css', content: cssLine }])).toEqual([
      { path: 'a.css', line: 1, kind: 'image-import' },
    ]);
  });

  it('이미지 파일명을 판별한다', () => {
    expect(isImageFile('logo.' + 'PNG')).toBe(true);
    expect(isImageFile('icon.' + 'svg')).toBe(true);
    expect(isImageFile('App.' + 'tsx')).toBe(false);
  });
});
