import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WOOD_TEXT } from '../components/cork/WoodButton';
import { BOARD_BG } from '../components/cork/ChalkBoard';

const css = readFileSync(resolve(__dirname, 'globals.css'), 'utf8');

/** globals.css에서 `--color-<name>: #RRGGBB;` 형태의 토큰 값을 추출한다. */
function extractToken(name: string): string {
  const escapedName = name.replace(/-/g, '\\-');
  const m = css.match(new RegExp(`${escapedName}:\\s*(#[0-9A-Fa-f]{6})`));
  const value = m?.[1];
  if (!value) throw new Error(`token not found in globals.css: ${name}`);
  return value;
}

/** globals.css의 `@utility texture-wood` 블록에서 linear-gradient의 두 stop(light→dark)을 추출한다. */
function extractWoodStops(): { light: string; dark: string } {
  const block = css.match(/@utility texture-wood \{[^}]*\}/);
  if (!block) throw new Error('texture-wood block not found in globals.css');
  const m = block[0].match(/linear-gradient\(#([0-9A-Fa-f]{6}),\s*#([0-9A-Fa-f]{6})\)/);
  if (!m) throw new Error('texture-wood block에서 linear-gradient stop을 찾지 못했다');
  return { light: `#${m[1]}`, dark: `#${m[2]}` };
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
const mute = extractToken('--color-mute');

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

describe('mute 텍스트 대비 (NoteSeat 좌석 번호 색상 선택 근거, Task 6)', () => {
  // mute는 순수 paper 배경에서는 4.5:1을 만족하지만, NoteSeat이 쓰는 paper-2/paper-3
  // 메모지 변주에서는 미달이라 좌석 번호에는 mute 대신 ink를 사용한다.
  it('mute/paper 는 4.5:1 이상이다', () => {
    expect(contrastRatio(paper, mute)).toBeGreaterThanOrEqual(4.5);
  });

  it('mute/paper-2 는 4.5:1 미만이다 (좌석 번호에 mute 사용 금지 근거)', () => {
    expect(contrastRatio(paper2, mute)).toBeLessThan(4.5);
  });

  it('mute/paper-3 는 4.5:1 미만이다 (좌석 번호에 mute 사용 금지 근거)', () => {
    expect(contrastRatio(paper3, mute)).toBeLessThan(4.5);
  });
});

describe('ChalkBoard 배경 대비 (R34)', () => {
  it('BOARD_BG(칠판 배경)/chalk-text 는 4.5:1 이상이다', () => {
    expect(contrastRatio(chalkText, BOARD_BG)).toBeGreaterThanOrEqual(4.5);
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

describe('WoodButton danger 텍스트 대비 (texture-wood 그라디언트, R28)', () => {
  // R28: md(15px bold ≈ 11.25pt)는 WCAG large-text 기준(14pt bold ≈ 18.67px)에 못
  // 미치므로 그라디언트 전 구간(light stop 포함)에서 4.5:1을 만족해야 한다. lg(22px
  // bold)는 large-text 기준인 3:1로 충분하다. stop 값은 globals.css를 정규식으로 읽어
  // CSS가 바뀌면 이 테스트도 따라가도록 한다(하드코딩 금지).
  const { light, dark } = extractWoodStops();

  it.each([
    ['md', 4.5, 'light stop', light],
    ['md', 4.5, 'dark stop', dark],
    ['lg', 3.0, 'light stop', light],
    ['lg', 3.0, 'dark stop', dark],
  ] as const)('%s (%s:1 이상) — %s(%s) 대비가 기준을 만족한다', (_size, threshold, _stopLabel, stop) => {
    expect(contrastRatio(WOOD_TEXT, stop)).toBeGreaterThanOrEqual(threshold);
  });
});
