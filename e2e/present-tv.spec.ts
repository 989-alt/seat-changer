// TV 가독성·가로 배치·자리 바꾸기·고정 표시 (개선 스펙 2026-09-28 5절)
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const v1 = JSON.parse(readFileSync('src/test/fixtures/v1-basic.json', 'utf8'));
const KEY = 'seat-changer-data-6-7';

/**
 * 픽스처를 한 번만 심는다. addInitScript는 새로고침마다 다시 돌므로, sessionStorage 표시로
 * 첫 탐색에서만 쓰게 해야 "새로고침 뒤에도 남는다"를 확인할 수 있다.
 */
async function seed(page: Page, data: unknown): Promise<void> {
  await page.addInitScript((raw) => {
    if (sessionStorage.getItem('e2e-seeded')) return;
    sessionStorage.setItem('e2e-seeded', '1');
    localStorage.setItem('seat-changer-classes', '["6-7"]');
    localStorage.setItem('seat-changer-active', '6-7');
    localStorage.setItem('seat-changer-data-6-7', raw);
    localStorage.setItem('seat-changer-sound', 'off');
  }, JSON.stringify(data));
}

const seat = (page: Page, i: number) =>
  page.locator(`[data-present="board"] [data-cork="note-seat"][data-seat="${i}"]`);

/** 화면에 실제로 그려지는 이름 글자 크기 = 글자 크기 x 배치도 배율 */
async function nameFontOnScreen(page: Page): Promise<number> {
  return page.evaluate(() => {
    const board = document.querySelector<HTMLElement>('[data-present="board"]')!;
    const scale = Number(/scale\(([\d.]+)\)/.exec(board.style.transform)?.[1] ?? '1');
    const name = board.querySelector<HTMLElement>('[data-seat-name]')!;
    return parseFloat(getComputedStyle(name).fontSize) * scale;
  });
}

test('지난 배치에서 두 자리를 바꾸면 새로고침 뒤에도 남고 기록은 늘지 않는다', async ({ page }) => {
  await seed(page, v1);
  await page.goto('/present');
  const status = page.locator('[data-present="status"]');

  await expect(seat(page, 1)).toContainText('이도윤');
  await expect(seat(page, 2)).toContainText('박서준');
  await expect(status).toHaveText('두 자리를 차례로 누르면 서로 바뀝니다');

  // 첫 자리를 눌러도 배치도가 움직이지 않는다(상태 칸 높이 고정)
  const transformBefore = await page.locator('[data-present="board"]').getAttribute('style');
  await seat(page, 1).click();
  await expect(status).toContainText('2번 자리를 골랐습니다');
  expect(await page.locator('[data-present="board"]').getAttribute('style')).toBe(transformBefore);

  await seat(page, 2).click();
  await expect(seat(page, 1)).toContainText('박서준');
  await expect(seat(page, 2)).toContainText('이도윤');

  await page.reload();
  await expect(seat(page, 1)).toContainText('박서준');
  await expect(seat(page, 2)).toContainText('이도윤');
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), KEY);
  expect(saved.assignmentHistory).toHaveLength(v1.assignmentHistory.length);
  expect(saved.lastAssignment.timestamp).toBe(v1.lastAssignment.timestamp);
});

for (const vp of [
  { width: 1920, height: 1080, minFont: 60, minWidthRatio: 0.7 },
  { width: 1366, height: 625, minFont: 34, minWidthRatio: 0.6 },
]) {
  test(`${vp.width}x${vp.height}에서 이름이 ${vp.minFont}px 이상이고 배치도가 가로를 넓게 쓴다`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await seed(page, v1);
    await page.goto('/present');
    await expect(page.locator('[data-seat-name]').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    expect(await nameFontOnScreen(page)).toBeGreaterThanOrEqual(vp.minFont);
    const box = await page.locator('[data-present="board"]').boundingBox();
    expect(box!.width / vp.width).toBeGreaterThanOrEqual(vp.minWidthRatio);
    // 세로 스크롤 없이 한 화면에 들어간다
    const overflow = await page.evaluate(
      () => document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
    );
    expect(overflow).toBe(false);

    await page.screenshot({ path: `test-results/present-tv-${vp.width}x${vp.height}.png` });
  });
}

test('U자 배치 자리는 교사 화면과 발표 화면 모두에서 겹치지 않는다', async ({ page }) => {
  // 22명이 앉도록 윗줄 8 + 옆줄 7 x 2 = 22석
  const ushape = {
    ...v1,
    layoutType: 'ushape',
    layoutSettings: { ...v1.layoutSettings, columns: 8, rows: 7 },
    lastAssignment: null,
    assignmentHistory: [],
  };
  await seed(page, ushape);
  for (const url of ['/', '/present']) {
    await page.goto(url);
    const seats = page.locator('[data-testid="seat-board"] [data-cork="note-seat"]');
    await expect(seats).toHaveCount(22);
    const boxes = await seats.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const apart = a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1 || a.y + a.h <= b.y + 1 || b.y + b.h <= a.y + 1;
        expect(apart, `${url}: 좌석 상자 ${i}와 ${j}가 겹친다`).toBe(true);
      }
    }
    if (url === '/') {
      // 교사 미리보기에서도 이름이 두 줄로 깨지지 않는다(미리보기 래퍼 w-max).
      // offsetHeight는 transform(확대·축소) 이전 높이라 글자 크기와 바로 비교할 수 있다.
      const wrapped = await page
        .locator('[data-testid="seat-board"] [data-seat-name]')
        .evaluateAll(
          (els) =>
            els.filter((el) => (el as HTMLElement).offsetHeight >= parseFloat(getComputedStyle(el).fontSize) * 1.6)
              .length,
        );
      expect(wrapped).toBe(0);
    }
    await page.screenshot({ path: `test-results/ushape-${url === '/' ? 'teacher' : 'present'}.png` });
  }
});

test('인쇄는 가로 용지 두 장(학생 시선·선생님 시선)이다', async ({ page }) => {
  await seed(page, v1);
  await page.goto('/present');
  await expect(page.locator('[data-seat-name]').first()).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await expect(page.locator('.present-print-page')).toHaveCount(2);

  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  // Chromium(Skia) PDF의 페이지 사전은 압축되지 않아 /MediaBox가 평문으로 들어 있다.
  const text = pdf.toString('latin1');
  const pages = [...text.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
  expect(pages).toHaveLength(2);
  for (const [w, h] of pages) expect(w).toBeGreaterThan(h!);
});

test('고정 자리 표시는 교사 화면에만 있고 발표 화면·인쇄에는 없다', async ({ page }) => {
  await seed(page, v1); // 김하람이 1번 자리(좌석 0)에 고정
  const pins = page.locator('[data-testid="seat-board"] [data-cork="pushpin"]');

  await page.goto('/');
  await expect(pins).toHaveCount(1);

  await page.goto('/present');
  await expect(page.locator('[data-seat-name]').first()).toBeVisible();
  await expect(pins).toHaveCount(0);

  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await expect(page.locator('.present-print-page')).toHaveCount(2);
  await expect(pins).toHaveCount(0);
});

test('1366x625에서도 교환 안내와 교환 완료 알림이 상태 칸에서 잘리지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 625 });
  await seed(page, v1);
  await page.goto('/present');
  const status = page.locator('[data-present="status"]');
  // 말줄임(truncate)으로 잘리면 scrollWidth가 clientWidth보다 커진다
  const fits = () => status.evaluate((el) => el.scrollWidth <= el.clientWidth);

  await expect(status).toHaveText('두 자리를 차례로 누르면 서로 바뀝니다');
  expect(await fits()).toBe(true);

  await seat(page, 1).click();
  await expect(status).toContainText('2번 자리를 골랐습니다');
  expect(await fits()).toBe(true);

  await seat(page, 2).click();
  // 교환 완료 알림은 토스트가 아니라 상태 칸에 뜬다(배치도·막대를 가리지 않는다)
  await expect(status).toContainText('자리를 바꿨습니다');
  expect(await fits()).toBe(true);
  await expect(page.locator('[data-cork="toast"]').filter({ hasText: '자리를 바꿨습니다' })).toHaveCount(0);

  await page.screenshot({ path: 'test-results/present-tv-1366-swap.png' });
});

test('1920x1080에서는 선생님 시선·전체 화면을 켜도 조작 막대가 한 줄이다', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page, v1);
  await page.goto('/present');
  await expect(page.locator('[data-seat-name]').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const bar = page.locator('[data-present="controls"]');
  // 한 줄이면 약 59px, 두 줄이면 약 103px
  const oneRow = async () => (await bar.boundingBox())!.height <= 70;

  expect(await oneRow()).toBe(true);

  await page.getByRole('button', { name: /학생 시선/ }).click();
  await expect(page.getByRole('button', { name: /선생님 시선/ })).toBeVisible();
  expect(await oneRow()).toBe(true);

  const fullscreen = page.getByRole('button', { name: '전체 화면' });
  if ((await fullscreen.count()) > 0) {
    await fullscreen.click();
    await expect(page.getByRole('button', { name: '전체 화면 끄기' })).toBeVisible();
    expect(await oneRow()).toBe(true);
  }
});
