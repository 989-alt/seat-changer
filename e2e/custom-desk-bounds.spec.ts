// 재현: v1에서 만든 자유배치 좌표가 v2 편집기 보드(600x400) 밖에 그려진다.
// v1 캔버스는 폭 = 패널 폭, 높이 = max(760, 폭*1.1) 이라 x가 600을, y가 400을 쉽게 넘는다.
// (legacy/js/layouts/custom-layout.js _fitCanvas / _onPointerMove — 드래그는 스냅도 안 한다)
import { test, expect } from '@playwright/test';

// 21개 책상, 4열. v1에서 드래그로 놓은 것처럼 20의 배수가 아니고 보드 밖으로 나간다.
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

test('v1 자유배치 책상이 편집기 보드 안에 들어온다', async ({ page }) => {
  await page.addInitScript((raw) => {
    localStorage.setItem('seat-changer-classes', '["6-5"]');
    localStorage.setItem('seat-changer-active', '6-5');
    localStorage.setItem('seat-changer-data-6-5', raw);
  }, JSON.stringify(v1Data));
  await page.goto('/');

  const board = page.getByTestId('desk-board');
  await expect(board).toBeVisible();

  const overflow = await page.evaluate(() => {
    const board = document.querySelector('[data-testid="desk-board"]')!;
    const b = board.getBoundingClientRect();
    const out: { i: number; right: number; bottom: number }[] = [];
    board.querySelectorAll('[data-desk]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.right > b.right + 0.5 || r.bottom > b.bottom + 0.5) {
        out.push({
          i: Number(el.getAttribute('data-desk')),
          right: Math.round(r.right - b.right),
          bottom: Math.round(r.bottom - b.bottom),
        });
      }
    });
    return { boardW: Math.round(b.width), boardH: Math.round(b.height), out };
  });

  await page.getByTestId('desk-board').screenshot({ path: 'test-results/custom-desk-bounds.png' });
  console.log(JSON.stringify(overflow, null, 2));
  expect(overflow.out).toEqual([]);
});

// 보드가 축소돼 있으면 화면 좌표를 그대로 쓰면 안 된다(엉뚱한 자리에 놓인다).
test('축소된 보드에서도 누른 자리에 책상이 생기고, 끌면 그 자리로 간다', async ({ page }) => {
  await page.addInitScript((raw) => {
    localStorage.setItem('seat-changer-classes', '["6-5"]');
    localStorage.setItem('seat-changer-active', '6-5');
    localStorage.setItem('seat-changer-data-6-5', raw);
  }, JSON.stringify(v1Data));
  await page.goto('/');

  const board = page.getByTestId('desk-board');
  await expect(board).toBeVisible();

  // 보드가 실제로 축소된 상태여야 이 테스트가 의미가 있다.
  const scale = await board.evaluate((el) => el.getBoundingClientRect().width / (el as HTMLElement).offsetWidth);
  expect(scale).toBeLessThan(1);

  // 논리 좌표 (300, 300)의 빈 곳을 누른다 → 그 자리에 중심이 오도록 스냅되어 생긴다.
  await board.scrollIntoViewIfNeeded();
  const box = (await board.boundingBox())!;
  await page.mouse.click(box.x + 300 * scale, box.y + 300 * scale);
  const created = page.locator('[data-desk]').nth(21);
  await expect(created).toHaveCount(1);
  const pos = await created.evaluate((el) => ({
    x: (el as HTMLElement).offsetLeft,
    y: (el as HTMLElement).offsetTop,
  }));
  expect(pos).toEqual({ x: 280, y: 280 }); // snap20(300 - 60/2), snap20(300 - 40/2)

  // 같은 책상을 논리 좌표 (100, 100)만큼 왼쪽 위로 끈다.
  await page.mouse.move(box.x + 300 * scale, box.y + 300 * scale);
  await page.mouse.down();
  await page.mouse.move(box.x + 200 * scale, box.y + 200 * scale, { steps: 5 });
  await page.mouse.up();
  const moved = await created.evaluate((el) => ({
    x: (el as HTMLElement).offsetLeft,
    y: (el as HTMLElement).offsetTop,
  }));
  expect(moved).toEqual({ x: 180, y: 180 });
});
