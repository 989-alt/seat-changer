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

test('뽑기를 완주하면 모든 이름이 공개되고 결과가 저장된다', async ({ page }) => {
  await page.goto('/present');
  const board = page.getByTestId('seat-board');
  await expect(board).toBeVisible();

  // 뽑기 전에는 이름이 보이지 않는다
  await expect(board).not.toContainText('김하람');

  await page.getByRole('button', { name: /자리 뽑기/ }).click();

  // 연출(카운트다운 3초 + 셔플 0.8초 + 줄 단위 공개)이 끝나면 이름이 모두 공개된다
  await expect(board).toContainText('김하람', { timeout: 20_000 });

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('seat-changer-data-6-7')!));
  expect(saved.lastAssignment).not.toBeNull();
  expect(Object.keys(saved.lastAssignment.mapping).length).toBe(22);

  // 다시 뽑기 라벨로 바뀐다
  await expect(page.getByRole('button', { name: '다시 뽑기' })).toBeVisible();

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
