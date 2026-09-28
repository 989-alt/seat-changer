// 발표 화면 뽑기 완주 (스펙 8절 E2E 목록)
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const v1 = readFileSync('src/test/fixtures/v1-basic.json', 'utf8');

test.beforeEach(async ({ page }) => {
  await page.addInitScript((raw) => {
    localStorage.setItem('seat-changer-classes', '["6-7"]');
    localStorage.setItem('seat-changer-active', '6-7');
    localStorage.setItem('seat-changer-data-6-7', raw);
  }, v1);
});

test('지난 배치가 보이고, 다시 뽑으면 새 결과가 저장된다', async ({ page }) => {
  await page.goto('/present');
  const board = page.getByTestId('seat-board');
  await expect(board).toBeVisible();

  // 저장된 지난 배치가 공개된 채로 열린다(개선 스펙 3-4)
  await expect(board).toContainText('김하람');
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('seat-changer-data-6-7')!));

  await page.getByRole('button', { name: '다시 뽑기' }).click();

  // 연출 중 결과가 저장되면 lastAssignment가 새것으로 바뀌고 직전 배치가 이력으로 간다
  await expect
    .poll(
      async () =>
        page.evaluate(() => JSON.parse(localStorage.getItem('seat-changer-data-6-7')!).lastAssignment.timestamp),
      { timeout: 20_000 },
    )
    .not.toBe(before.lastAssignment.timestamp);
  // 연출이 끝나면 조작 막대가 다시 보인다
  await expect(page.locator('[data-present="controls"]')).not.toHaveClass(/invisible/, { timeout: 20_000 });

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('seat-changer-data-6-7')!));
  expect(Object.keys(saved.lastAssignment.mapping).length).toBe(22);
  expect(saved.assignmentHistory.length).toBe(Math.min(before.assignmentHistory.length + 1, 5));
  await expect(board).toContainText('김하람');

  await page.screenshot({ path: 'test-results/present-drawn.png' });
});

test('배치도가 1920x1080 한 화면에 스크롤 없이 들어간다', async ({ page }) => {
  await page.goto('/present');
  await expect(page.getByTestId('seat-board')).toBeVisible();
  const overflow = await page.evaluate(() => ({
    h: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    v: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
  }));
  expect(overflow).toEqual({ h: false, v: false });
});

test('시점 전환이 칠판과 교탁을 바꾼다', async ({ page }) => {
  await page.goto('/present');
  const board = page.getByTestId('seat-board');
  await expect(board).toHaveAttribute('data-perspective', 'student');

  // 레거시와 같이 버튼 라벨은 "현재" 시점을 보여준다(학생 시선 -> 누르면 선생님 시선).
  await page.getByRole('button', { name: /시선/ }).click();
  await expect(board).toHaveAttribute('data-perspective', 'teacher');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('seat-changer-data-6-7')!));
  expect(saved.viewPerspective).toBe('teacher');
});
