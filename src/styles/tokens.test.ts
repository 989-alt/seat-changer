import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(__dirname, 'globals.css'), 'utf8');

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
    expect(css.toLowerCase()).toContain(`${name}: ${value}`);
  });
  it('글꼴 토큰', () => {
    expect(css).toMatch(/--font-hand:\s*"Gaegu"/);
    expect(css).toMatch(/--font-body:\s*"Noto Sans KR"/);
  });
  it('질감 클래스', () => {
    for (const cls of ['.texture-cork', '.texture-paper-lines', '.texture-wood']) expect(css).toContain(cls);
  });
  it('이미지 url()이 없다', () => {
    expect(css).not.toMatch(/url\(["']?[^)]*\.(png|jpe?g|gif|svg|webp)/);
  });
});
