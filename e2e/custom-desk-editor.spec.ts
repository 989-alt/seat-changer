// 자유배치 편집기: 보드 안 정렬, 모드(선택·추가·지우기), 복수 선택.
//
// 시작 데이터는 v1에서 만든 자유배치다. v1 캔버스는 크기가 가변이라
// (legacy/js/layouts/custom-layout.js _fitCanvas) 저장 좌표의 원점이 제각각이고,
// 드래그 좌표는 격자에 스냅되지도 않는다. 편집기가 그런 좌표도 보드 안에
// 가운데로 담아야 한다.
import { test, expect, type Page, type Locator } from '@playwright/test';

const DESK_W = 60;
const DESK_H = 40;
const GRID = 20;

const v1Desks = Array.from({ length: 21 }, (_, i) => ({
  id: i,
  x: 155 + (i % 4) * 155,
  y: 62 + Math.floor(i / 4) * 68,
  seatIndex: i,
}));

const v1Data = {
  students: Array.from({ length: 21 }, (_, i) => `학생${i + 1}`),
  classSize: 21,
  layoutType: 'custom',
  layoutSettings: {
    columns: 6,
    rows: 4,
    customDesks: v1Desks,
    groupSize: 4,
    groupCount: 0,
    groupSizes: [],
    groupLayoutMode: 'auto',
    groupDesks: [],
    disabledSeats: [],
  },
  fixedSeats: {},
  separationRules: [],
  lastAssignment: null,
  studentGenders: {},
  genderRule: 'none',
  assignmentHistory: [],
  historyExcludeCount: 0,
  useHistoryExclusion: false,
  viewPerspective: 'teacher',
};

/** v1 데이터를 넣고 교사 화면을 연다. 편집기가 보이는 자리까지 스크롤한다. */
async function openEditor(page: Page): Promise<{ board: Locator }> {
  await page.addInitScript((raw) => {
    localStorage.setItem('seat-changer-classes', '["6-5"]');
    localStorage.setItem('seat-changer-active', '6-5');
    localStorage.setItem('seat-changer-data-6-5', raw);
  }, JSON.stringify(v1Data));
  await page.goto('/');
  const board = page.getByTestId('desk-board');
  await expect(board).toBeVisible();
  await board.scrollIntoViewIfNeeded();
  return { board };
}

/**
 * 보드 좌표(축소 전 기준)를 화면 좌표로 옮긴다.
 * 축척은 패널 폭에 따라 달라지고 글꼴이 늦게 실리면 도중에 바뀌기도 하므로,
 * 미리 재 두지 않고 누를 때마다 다시 잰다.
 */
async function at(board: Locator, x: number, y: number): Promise<{ x: number; y: number; scale: number }> {
  const rect = (await board.boundingBox())!;
  const width = await board.evaluate((el) => (el as HTMLElement).offsetWidth);
  const scale = rect.width / width;
  return { x: rect.x + x * scale, y: rect.y + y * scale, scale };
}

/** 보드 좌표를 눌렀다 뗀다. */
async function clickAt(page: Page, board: Locator, x: number, y: number): Promise<void> {
  const p = await at(board, x, y);
  await page.mouse.click(p.x, p.y);
}

/** 저장소에 실제로 들어간 책상 좌표. */
function storedDesks(page: Page): Promise<{ x: number; y: number }[]> {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem('seat-changer-data-6-5')!).layoutSettings.customDesks,
  );
}

/** 보드 안에서 책상들이 차지한 자리(화면 좌표계, 축소 전 기준). */
function deskLayout(page: Page) {
  return page.evaluate(() => {
    const board = document.querySelector('[data-testid="desk-board"]') as HTMLElement;
    const desks = [...board.querySelectorAll('[data-desk]')].map((el) => ({
      x: (el as HTMLElement).offsetLeft,
      y: (el as HTMLElement).offsetTop,
      w: (el as HTMLElement).offsetWidth,
      h: (el as HTMLElement).offsetHeight,
    }));
    return { boardW: board.offsetWidth, boardH: board.offsetHeight, desks };
  });
}

/** 책상 개수. toHaveCount는 렌더를 기다렸다 다시 센다(즉시 count()는 경쟁이 생긴다). */
const expectDeskCount = (page: Page, n: number) =>
  expect(page.locator('[data-desk]')).toHaveCount(n);

test('v1 좌표도 보드 안에 들어오고 가운데로 정렬된다', async ({ page }) => {
  await openEditor(page);
  const { boardW, boardH, desks } = await deskLayout(page);
  expect(desks).toHaveLength(21);

  const left = Math.min(...desks.map((d) => d.x));
  const right = boardW - Math.max(...desks.map((d) => d.x + d.w));
  const top = Math.min(...desks.map((d) => d.y));
  const bottom = boardH - Math.max(...desks.map((d) => d.y + d.h));

  expect(left).toBeGreaterThanOrEqual(0);
  expect(right).toBeGreaterThanOrEqual(0);
  expect(top).toBeGreaterThanOrEqual(0);
  expect(bottom).toBeGreaterThanOrEqual(0);
  // 오프셋을 격자에 스냅하므로 좌우·상하 여백은 격자 한 칸 안에서만 어긋난다.
  expect(Math.abs(left - right)).toBeLessThanOrEqual(GRID);
  expect(Math.abs(top - bottom)).toBeLessThanOrEqual(GRID);

  await page.getByTestId('desk-board').screenshot({ path: 'test-results/custom-desk-centered.png' });
});

test('선택 모드에서는 빈 곳을 눌러도 책상이 생기지 않는다', async ({ page }) => {
  const { board } = await openEditor(page);
  await expect(board).toHaveAttribute('data-mode', 'select');
  await clickAt(page, board, 300, 300);
  await page.waitForTimeout(200); // 늦게 생기는 것까지 잡으려면 잠깐 기다렸다 센다
  await expectDeskCount(page, 21);
});

// 누르는 자리는 책상 사이의 빈 곳이어야 한다. 이 데이터에서 책상 열은 보드 좌표
// 35~95, 190~250, 345~405, 500~560을 차지하고 행은 22~62, 90~130, 158~198,
// 226~266, 294~334를 차지한다. 그 사이가 빈 곳이다(책상 위를 누르면 안 생기는 게 맞다).
test('책상 추가 모드에서 누른 자리에 책상이 생기고 ESC로 끝난다', async ({ page }) => {
  const { board } = await openEditor(page);
  await page.getByRole('button', { name: '책상 추가' }).click();
  await expect(board).toHaveAttribute('data-mode', 'add');

  await clickAt(page, board, 300, 300);
  await expectDeskCount(page, 22);
  // 누른 자리가 새 책상의 한가운데다(격자 스냅만큼만 어긋난다).
  const { desks } = await deskLayout(page);
  const made = desks[21]!;
  expect(Math.abs(made.x + DESK_W / 2 - 300)).toBeLessThanOrEqual(GRID);
  expect(Math.abs(made.y + DESK_H / 2 - 300)).toBeLessThanOrEqual(GRID);

  // 모드가 유지되므로 연달아 놓을 수 있다.
  await clickAt(page, board, 140, 300);
  await expectDeskCount(page, 23);

  await page.keyboard.press('Escape');
  await expect(board).toHaveAttribute('data-mode', 'select');
  await clickAt(page, board, 140, 370);
  await page.waitForTimeout(200);
  await expectDeskCount(page, 23);
});

test('지우기 모드는 누르는 책상을 바로 지운다', async ({ page }) => {
  const { board } = await openEditor(page);
  await page.getByRole('button', { name: '책상 지우기' }).click();
  await expect(board).toHaveAttribute('data-mode', 'erase');

  // 좌표를 미리 재 두면 축척이 바뀔 때 빗나간다. 요소를 직접 누른다.
  await page.locator('[data-desk]').nth(1).click();
  await expectDeskCount(page, 20);
  await page.locator('[data-desk]').nth(1).click();
  await expectDeskCount(page, 19);
});

test('Ctrl+클릭으로 여러 개를 골라 한 번에 지운다', async ({ page }) => {
  await openEditor(page);
  const desk = (i: number) => page.locator('[data-desk]').nth(i);
  await desk(0).click();
  await desk(2).click({ modifiers: ['Control'] });
  await desk(4).click({ modifiers: ['Control'] });

  const del = page.getByRole('button', { name: /고른 책상 삭제/ });
  await expect(del).toContainText('3개');
  await del.click();
  await expectDeskCount(page, 18);
});

test('Shift+클릭은 두 책상 사이를 모두 고른다', async ({ page }) => {
  await openEditor(page);
  const desk = (i: number) => page.locator('[data-desk]').nth(i);
  await desk(1).click();
  await desk(4).click({ modifiers: ['Shift'] });

  const del = page.getByRole('button', { name: /고른 책상 삭제/ });
  await expect(del).toContainText('4개');
  await del.click();
  await expectDeskCount(page, 17);
});

test('빈 곳을 끌어 사각형으로 고르고 Delete로 지운다', async ({ page }) => {
  const { board } = await openEditor(page);
  const { desks } = await deskLayout(page);
  // 첫 열의 위 두 책상을 감싸는 사각형(화면 좌표 기준).
  const x0 = desks[0]!.x - 10;
  const y0 = desks[0]!.y - 10;
  const x1 = desks[0]!.x + DESK_W + 10;
  const y1 = desks[4]!.y + DESK_H + 5;

  const from = await at(board, x0, y0);
  const to = await at(board, x1, y1);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByRole('button', { name: /고른 책상 삭제/ })).toContainText('2개');
  await page.keyboard.press('Delete');
  await expectDeskCount(page, 19);
});

test('여러 개를 함께 끌면 간격이 그대로 유지된다', async ({ page }) => {
  const { board } = await openEditor(page);
  const before = await storedDesks(page);
  const desk = (i: number) => page.locator('[data-desk]').nth(i);
  await desk(0).click();
  await desk(1).click({ modifiers: ['Control'] });

  const scale = (await at(board, 0, 0)).scale;
  const grab = (await desk(0).boundingBox())!;
  await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
  await page.mouse.down();
  await page.mouse.move(grab.x + grab.width / 2 + 40 * scale, grab.y + grab.height / 2, { steps: 8 });
  await page.mouse.up();

  await expect.poll(async () => (await storedDesks(page))[0]!.x - before[0]!.x).toBe(40);
  const after = await storedDesks(page);
  expect(after[1]!.x - before[1]!.x).toBe(40);
  expect(after[1]!.x - after[0]!.x).toBe(before[1]!.x - before[0]!.x);
  expect(after[2]).toEqual(before[2]); // 고르지 않은 책상은 그대로
});

test('모두 지우기로 한 번에 비운다', async ({ page }) => {
  const { board } = await openEditor(page);
  await page.getByRole('button', { name: '모두 지우기' }).click();
  await expectDeskCount(page, 0);
  await expect(board).toBeVisible();
  expect(await storedDesks(page)).toEqual([]);
});
