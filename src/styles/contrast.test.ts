import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(__dirname, 'globals.css'), 'utf8');

/** globals.css에서 `--color-<name>: #RRGGBB;` 형태의 토큰 값을 추출한다. */
function extractToken(name: string): string {
  const escapedName = name.replace(/-/g, '\\-');
  const m = css.match(new RegExp(`${escapedName}:\\s*(#[0-9A-Fa-f]{6})`));
  const value = m?.[1];
  if (!value) throw new Error(`token not found in globals.css: ${name}`);
  return value;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return [r, g, b];
}

function srgbChannelToLinear(c: number): number {
  const cs = c / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

/** WCAG 2.1 상대 휘도: L = 0.2126R + 0.7152G + 0.0722B (선형화된 sRGB 채널) */
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
}

/** WCAG 2.1 대비율: (L1 + 0.05) / (L2 + 0.05), L1이 더 밝은 색 */
function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const cork = extractToken('--color-cork');
const corkDark = extractToken('--color-cork-dark');
const paper = extractToken('--color-paper');
const paper2 = extractToken('--color-paper-2');
const paper3 = extractToken('--color-paper-3');
const chalk = extractToken('--color-chalk');
const chalkText = extractToken('--color-chalk-text');
const ink = extractToken('--color-ink');

describe('WCAG 텍스트 대비 (4.5:1 이상)', () => {
  it.each([
    ['paper/ink', paper, ink],
    ['paper-2/ink', paper2, ink],
    ['paper-3/ink', paper3, ink],
    ['chalk/chalk-text', chalk, chalkText],
    ['cork/ink', cork, ink],
    ['cork-dark/paper', corkDark, paper],
    ['cork-dark/chalk-text', corkDark, chalkText],
  ])('%s 는 4.5:1 이상이다', (_label, a, b) => {
    expect(contrastRatio(a, b)).toBeGreaterThanOrEqual(4.5);
  });

  it('cork/paper 조합은 4.5:1 미만이다 (텍스트 사용 금지 근거)', () => {
    expect(contrastRatio(cork, paper)).toBeLessThan(4.5);
  });
});

describe('포커스 링 대비 (비텍스트 요소, 3:1 이상)', () => {
  it.each([
    ['ink/paper', ink, paper],
    ['ink/cork', ink, cork],
    ['paper/chalk', paper, chalk],
    ['paper/cork-dark', paper, corkDark],
  ])('%s 는 3:1 이상이다', (_label, a, b) => {
    expect(contrastRatio(a, b)).toBeGreaterThanOrEqual(3);
  });
});

describe('WoodButton danger 텍스트 대비 (texture-wood 그라디언트, R20)', () => {
  // texture-wood: linear-gradient(#B8813F, #8B5A2B) — light stop → dark stop.
  // 텍스트 색은 #FFF3D6. lg(22px bold)는 large-text 기준 3:1, md(15px bold)는
  // large-text 기준에 못 미치므로 더 어두운(대비가 낮은) dark stop 기준으로 4.5:1을 요구한다.
  it('#FFF3D6 / #B8813F (light stop) 는 3.0:1 이상이다 (lg, large bold text)', () => {
    expect(contrastRatio('#FFF3D6', '#B8813F')).toBeGreaterThanOrEqual(3.0);
  });

  it('#FFF3D6 / #8B5A2B (dark stop) 는 4.5:1 이상이다 (md, 15px bold)', () => {
    expect(contrastRatio('#FFF3D6', '#8B5A2B')).toBeGreaterThanOrEqual(4.5);
  });
});
