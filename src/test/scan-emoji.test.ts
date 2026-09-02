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
    const v = findViolations([{ path: 'b.tsx', content: "import bg from './cork.png';" }]);
    expect(v).toEqual([{ path: 'b.tsx', line: 1, kind: 'image-import' }]);
  });
});
