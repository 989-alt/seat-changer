import { test, expect, type Locator } from '@playwright/test';

/** boundingBox()의 null 가능성을 한곳에서 처리한다. */
async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('boundingBox를 얻지 못했다');
  return b;
}

test('코르크 갤러리: 전 상태 렌더, 이미지 요청 없음, 스크린샷', async ({ page }) => {
  const imageRequests: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'image') imageRequests.push(r.url());
  });

  await page.goto('/dev/cork');
  const root = page.locator('[data-page="dev-cork"]');
  await expect(root).toBeVisible();

  // --- 좌석 전 상태와 칠판 ---
  await expect(page.locator('[data-cork="note-seat"][data-state="assigned"]').first()).toBeVisible();
  await expect(page.locator('[data-cork="note-seat"][data-state="fixed"]').first()).toBeVisible();
  await expect(page.locator('[data-cork="note-seat"][data-state="empty"]').first()).toBeVisible();
  await expect(page.locator('[data-cork="note-seat"][data-state="disabled"]').first()).toBeVisible();
  await expect(page.locator('[data-cork="chalkboard"][data-kind="board"]')).toBeVisible();
  await expect(page.locator('[data-cork="chalkboard"][data-kind="podium"]')).toBeVisible();

  // R38: 삭제 좌석은 onRestore 유무에 따라 문구가 갈린다(되살리기 / 삭제된 자리).
  await expect(page.locator('[data-cork="note-seat"][data-state="disabled"]').filter({ hasText: '되살리기' }).first()).toBeVisible();
  await expect(page.locator('[data-cork="note-seat"][data-state="disabled"]').filter({ hasText: '삭제된 자리' }).first()).toBeVisible();

  // --- 계산된 스타일(R24/R26): 토큰과 질감이 실제로 적용됐다 ---
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bodyBg).toBe('rgb(200, 149, 90)');

  const rootBgImage = await root.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(rootBgImage).toContain('radial-gradient');

  const h1Font = await page.locator('h1').first().evaluate((el) => getComputedStyle(el).fontFamily);
  expect(h1Font).toContain('Gaegu');

  // --- 장식 배치(R27): 압정이 카드 위쪽 가운데에 꽂혀 있다 ---
  const card = page.locator('[data-cork="paper-card"]').first();
  const pin = card.locator('[data-cork="pushpin"]').first();
  const cardBox = await box(card);
  const pinBox = await box(pin);
  const cardCenterX = cardBox.x + cardBox.width / 2;
  const pinCenterX = pinBox.x + pinBox.width / 2;
  expect(Math.abs(pinCenterX - cardCenterX)).toBeLessThanOrEqual(12);
  expect(pinBox.y).toBeGreaterThanOrEqual(cardBox.y - 14);
  expect(pinBox.y).toBeLessThanOrEqual(cardBox.y + 4);

  // --- 클릭 통과: 테이프(pointer-events-none) 위를 눌러도 좌석이 눌린다 ---
  const seat0 = page.locator('[data-cork="note-seat"][data-seat="0"]').first();
  const tape = seat0.locator('[data-cork="tape"]').first();
  const tapeBox = await box(tape);
  await expect(root).toHaveAttribute('data-clicks', '0');
  await page.mouse.click(tapeBox.x + tapeBox.width / 2, tapeBox.y + tapeBox.height / 2);
  await expect(root).toHaveAttribute('data-clicks', '1');

  // --- 이름 잘림(5자 "황보아리랑") ---
  const big = page.locator('[data-cork="note-seat"][data-size="lg"]').filter({ hasText: '황보아리랑' }).first();
  const bigBox = await box(big);
  expect(bigBox.width).toBeGreaterThanOrEqual(150);
  const nameSpan = big.locator('span', { hasText: '황보아리랑' }).first();
  const metrics = await nameSpan.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    height: el.clientHeight,
    fontSize: parseFloat(getComputedStyle(el).fontSize),
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
  // 줄바꿈 없이 한 줄에 들어간다(두 줄이 되면 높이가 글자 크기의 1.6배를 넘는다).
  expect(metrics.height).toBeLessThan(metrics.fontSize * 1.6);
  const nameBox = await box(nameSpan);
  expect(nameBox.x).toBeGreaterThanOrEqual(bigBox.x - 1);
  expect(nameBox.x + nameBox.width).toBeLessThanOrEqual(bigBox.x + bigBox.width + 1);

  // --- 이미지 요청 없음(질감·테이프·압정은 전부 CSS) ---
  expect(imageRequests).toEqual([]);

  await page.screenshot({ path: 'test-results/dev-cork.png', fullPage: true });
  await page.screenshot({ path: 'test-results/dev-cork-1080.png', fullPage: false });
});
