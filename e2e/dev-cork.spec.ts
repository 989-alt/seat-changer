import { test, expect, type Locator, type Page } from '@playwright/test';

/*
 * 색은 src/styles/globals.css의 @theme 토큰을 rgb()로 옮긴 값이다.
 * 토큰이 바뀌면 이 상수도 함께 고쳐야 한다(원본은 src/styles/tokens.test.ts가 지킨다).
 */
const CORK = 'rgb(200, 149, 90)'; // --color-cork: #C8955A
const INK = 'rgb(42, 33, 27)'; // --color-ink: #2A211B

type Box = { x: number; y: number; width: number; height: number };

/** boundingBox()의 null 가능성을 한곳에서 처리한다. */
async function box(locator: Locator): Promise<Box> {
  const b = await locator.boundingBox();
  if (!b) throw new Error('boundingBox를 얻지 못했다');
  return b;
}

/** 두 사각형의 교집합. 겹치지 않으면 null. */
function intersect(a: Box, b: Box): Box | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

/** 이 페이지가 실제로 그리는 데 필요한 글꼴 얼굴 하나. */
type FontFaceNeed = { font: string; text: string };

/** h1 "코르크 컴포넌트"가 쓰는 얼굴 (font-hand, 굵기 지정 없음 → 400). */
const H1_FACE: FontFaceNeed = { font: '400 36px Gaegu', text: '코르크 컴포넌트' };
/** lg 좌석 이름표가 쓰는 얼굴 (NoteSeat: font-hand font-bold + text-[28px] → 700 28px). */
const SEAT_LG_FACE: FontFaceNeed = { font: '700 28px Gaegu', text: '황보아리랑' };

/**
 * 웹폰트가 실제로 적용된 상태로 페이지를 연다.
 *
 * R46/R48: `document.fonts.ready`는 폰트 로드가 **실패해도** resolve하므로, 그것만
 * 기다리면 대체 글꼴로 잰 치수나 찍은 그림이 조용히 통과한다. 테스트마다 page와
 * 컨텍스트가 따로라 검사를 한 테스트에만 둘 수도 없다.
 *
 * R51: 굵기별로 파일이 갈리므로 "Gaegu 중 하나라도 loaded"로는 부족하다. 400은
 * 받아지고 700이 404여도(Playwright는 404를 requestfailed로 보고하지 않는다) lg
 * 이름표는 대체 글꼴로 그려진다. 그래서 그 테스트가 실제로 기대는 얼굴을 지정해
 * `document.fonts.load()`로 직접 받아내고, 받은 얼굴이 있는지 확인한다.
 */
async function gotoWithFonts(page: Page, url: string, need: FontFaceNeed = H1_FACE): Promise<void> {
  // requestfailed 구독은 반드시 goto 전에 붙어야 한다.
  const failed: string[] = [];
  page.on('requestfailed', (r) => {
    const type = r.resourceType();
    if (type === 'font' || type === 'stylesheet') failed.push(`${type} ${r.url()}`);
  });

  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);

  // document.fonts.check()는 @font-face 자체가 없으면(스타일시트 실패) true를 돌려줘
  // 쓸 수 없다 — 요청한 얼굴을 직접 로드해 본다.
  const result = await page.evaluate(async ({ font, text }) => {
    let loaded = 0;
    try {
      loaded = (await document.fonts.load(font, text)).length;
    } catch {
      // 로드 실패는 아래 단언이 잡는다.
    }
    const errored = Array.from(document.fonts).filter(
      (f) => f.family.replace(/["']/g, '') === 'Gaegu' && f.status === 'error',
    ).length;
    return { loaded, errored };
  }, need);

  expect(result.loaded, `${need.font} 얼굴을 로드하지 못했다`).toBeGreaterThanOrEqual(1);
  expect(result.errored, 'Gaegu FontFace 중 error 상태가 있다').toBe(0);
  expect(failed, '폰트·스타일시트 요청이 실패했다').toEqual([]);
}

const seats = (page: Page) => page.locator('[data-cork="note-seat"]');

test.describe('/dev/cork 코르크 컴포넌트 갤러리', () => {
  test('컴포넌트 전 상태가 한 화면에 렌더된다 (+ G7 스크린샷)', async ({ page }) => {
    // R51: 이 그림에는 lg 이름표가 들어가므로 700 얼굴까지 보장해야 한다.
    await gotoWithFonts(page, '/dev/cork', SEAT_LG_FACE);
    await expect(page.locator('[data-page="dev-cork"]')).toBeVisible();

    await expect(page.locator('[data-cork="note-seat"][data-state="assigned"]').first()).toBeVisible();
    await expect(page.locator('[data-cork="note-seat"][data-state="fixed"]').first()).toBeVisible();
    await expect(page.locator('[data-cork="note-seat"][data-state="empty"]').first()).toBeVisible();
    await expect(page.locator('[data-cork="note-seat"][data-state="disabled"]').first()).toBeVisible();
    await expect(page.locator('[data-cork="note-seat"][data-highlight="true"]').first()).toBeVisible();
    await expect(page.locator('[data-cork="chalkboard"][data-kind="board"]')).toBeVisible();
    await expect(page.locator('[data-cork="chalkboard"][data-kind="podium"]')).toBeVisible();
    await expect(page.locator('[data-cork="paper-card"]').first()).toBeVisible();
    await expect(page.locator('[data-cork="wood-button"]').first()).toBeVisible();

    // R38: 삭제 좌석은 onRestore 유무에 따라 문구가 갈린다.
    await expect(seats(page).filter({ hasText: '되살리기' })).toHaveCount(1);
    await expect(seats(page).filter({ hasText: '삭제된 자리' })).toHaveCount(1);

    // R44: 뒤 단언이 실패해도 G7이 볼 그림은 남도록 여기서 바로 찍는다.
    await page.screenshot({ path: 'test-results/dev-cork.png', fullPage: true });
    await page.screenshot({ path: 'test-results/dev-cork-1080.png', fullPage: false });
  });

  test('토큰·질감·글꼴이 실제로 적용된다', async ({ page }) => {
    await gotoWithFonts(page, '/dev/cork');
    const root = page.locator('[data-page="dev-cork"]');
    await expect(root).toBeVisible();

    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(CORK);
    expect(await root.evaluate((el) => getComputedStyle(el).backgroundImage)).toContain('radial-gradient');

    const h1 = page.locator('h1').first();
    expect(await h1.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Gaegu');
    // R20: cork 배경 위 텍스트는 ink여야 한다(paper는 2.57:1로 금지).
    expect(await h1.evaluate((el) => getComputedStyle(el).color)).toBe(INK);

    // (Gaegu가 실제로 loaded인지, 폰트·스타일시트 요청이 실패하지 않았는지는
    //  gotoWithFonts가 이미 단언했다. 여기서는 font-family 스택만 확인한다.)

    // R33: 강조 링은 gold가 아니라 ink다. Tailwind ring은 box-shadow로 그려진다.
    const highlight = page.locator('[data-cork="note-seat"][data-highlight="true"]').first();
    // outlineColor·borderColor는 기본값이 currentColor(=ink)라 늘 통과한다. box-shadow만 본다.
    const ring = await highlight.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(ring).toContain(INK);
    // 강조가 아닌 좌석에는 그 링이 없다(단언이 실제로 무언가를 가른다).
    const plain = page.locator('[data-cork="note-seat"]:not([data-highlight="true"])').first();
    expect(await plain.evaluate((el) => getComputedStyle(el).boxShadow)).not.toContain(INK);
  });

  test('장식은 클릭을 통과시키고, 좌석 활성/비활성이 규칙대로다', async ({ page }) => {
    await page.goto('/dev/cork');
    const root = page.locator('[data-page="dev-cork"]');
    await expect(root).toBeVisible();

    // --- 장식은 pointer-events: none 이다(클릭 통과의 진짜 근거) ---
    const pointerEvents = (l: Locator) => l.evaluate((el) => getComputedStyle(el).pointerEvents);
    expect(await pointerEvents(page.locator('[data-cork="tape"]').first())).toBe('none');
    expect(await pointerEvents(page.locator('[data-cork="pushpin"]').first())).toBe('none');

    // --- 압정이 카드 위쪽 가운데에 꽂혀 있다 ---
    const card = page.locator('[data-cork="paper-card"]').first();
    const cardBox = await box(card);
    const pinBox = await box(card.locator('[data-cork="pushpin"]').first());
    expect(Math.abs(pinBox.x + pinBox.width / 2 - (cardBox.x + cardBox.width / 2))).toBeLessThanOrEqual(12);
    expect(pinBox.y).toBeGreaterThanOrEqual(cardBox.y - 14);
    expect(pinBox.y).toBeLessThanOrEqual(cardBox.y + 4);

    // --- 테이프와 좌석이 실제로 겹치는 지점을 눌러도 좌석이 눌린다 ---
    const seat = page.getByTestId('seat-grid').locator('[data-cork="note-seat"][data-seat="0"]');
    await expect(seat).toHaveCount(1);
    const hit = intersect(await box(seat.locator('[data-cork="tape"]').first()), await box(seat));
    if (!hit) throw new Error('테이프와 좌석이 겹치는 지점이 없어 클릭 통과를 검증할 수 없다');
    await expect(root).toHaveAttribute('data-clicks', '0');
    await page.mouse.click(hit.x + hit.width / 2, hit.y + hit.height / 2);
    await expect(root).toHaveAttribute('data-clicks', '1');

    // --- R32/R38: 되살릴 수 없는 삭제 좌석만 disabled, 나머지는 전부 활성 ---
    const all = seats(page);
    const total = await all.count();
    expect(total).toBeGreaterThan(0);
    for (let i = 0; i < total; i += 1) {
      const s = all.nth(i);
      const removedWithoutRestore = ((await s.textContent()) ?? '').includes('삭제된 자리');
      if (removedWithoutRestore) await expect(s).toBeDisabled();
      else await expect(s).toBeEnabled();
    }
    await expect(all.filter({ hasText: '삭제된 자리' })).toHaveCount(1);
  });

  test('5자 이름이 잘리지 않고, 이미지 요청이 하나도 없다', async ({ page }) => {
    const imageRequests: string[] = [];
    page.on('request', (r) => {
      if (r.resourceType() === 'image') imageRequests.push(r.url());
    });

    // R46: 대체 글꼴로 잰 치수는 의미가 없다. 웹폰트가 실제로 적용된 뒤 측정한다.
    await gotoWithFonts(page, '/dev/cork', SEAT_LG_FACE);
    await expect(page.locator('[data-page="dev-cork"]')).toBeVisible();

    const big = page.locator('[data-cork="note-seat"][data-size="lg"]').filter({ hasText: '황보아리랑' });
    await expect(big).toHaveCount(1);
    const bigBox = await box(big);
    const name = big.locator('span', { hasText: '황보아리랑' }).first();
    const metrics = await name.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      height: el.clientHeight,
      fontSize: parseFloat(getComputedStyle(el).fontSize),
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
    // 줄바꿈 없이 한 줄에 들어간다(두 줄이면 높이가 글자 크기의 1.6배를 넘는다).
    expect(metrics.height).toBeLessThan(metrics.fontSize * 1.6);
    const nameBox = await box(name);
    expect(nameBox.x).toBeGreaterThanOrEqual(bigBox.x - 1);
    expect(nameBox.x + nameBox.width).toBeLessThanOrEqual(bigBox.x + bigBox.width + 1);

    // 질감·테이프·압정은 전부 CSS다.
    expect(imageRequests).toEqual([]);
  });
});
