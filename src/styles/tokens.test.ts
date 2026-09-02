import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(__dirname, 'globals.css'), 'utf8');

/**
 * 속성명은 정확한 대소문자로, 값은 대소문자 무관하게 일치하는지 확인한다.
 * `--color-corK` 같은 오탈자가 `--color-cork` 검증을 통과하지 못하도록
 * 이름 부분은 원문 그대로(case-sensitive) `includes`로 먼저 확인한다.
 */
function hasToken(source: string, name: string, value: string): boolean {
  if (!source.includes(`${name}:`)) return false;
  const escapedName = name.replace(/-/g, '\\-');
  const re = new RegExp(`${escapedName}:\\s*${value}`, 'i');
  return re.test(source);
}

describe('디자인 토큰', () => {
  it.each([
    ['--color-cork', '#c8955a'],
    ['--color-cork-dark', '#7b5130'],
    ['--color-paper', '#fffbf0'],
    ['--color-paper-2', '#fde6b8'],
    ['--color-paper-3', '#e8f1d9'],
    ['--color-chalk', '#2e5a4e'],
    ['--color-chalk-text', '#f3f0e6'],
    ['--color-ink', '#2a211b'],
    ['--color-mute', '#7a6a5c'],
    ['--color-apple', '#d2553d'],
    ['--color-gold', '#e4b04a'],
  ])('%s = %s', (name, value) => {
    expect(hasToken(css, name, value)).toBe(true);
  });
  it('속성명 대소문자가 다르면 통과하지 못한다 (오탐 방지)', () => {
    const typoCss = '--color-corK: #C8955A;';
    expect(hasToken(typoCss, '--color-cork', '#c8955a')).toBe(false);
  });
  it('글꼴 토큰', () => {
    expect(css).toMatch(/--font-hand:\s*"Gaegu"/);
    expect(css).toMatch(/--font-body:\s*"Noto Sans KR"/);
  });
  it('질감 클래스', () => {
    for (const cls of ['texture-cork', 'texture-paper-lines', 'texture-wood']) {
      expect(css).toContain(`@utility ${cls}`);
    }
  });
  it('이미지 url()이 없다', () => {
    expect(css).not.toMatch(/url\(["']?[^)]*\.(png|jpe?g|gif|svg|webp)/);
  });
});
