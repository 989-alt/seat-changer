// v1 localStorage 데이터가 v2 화면에서 정확히 읽히고, 마이그레이션된 v2 형식으로
// 다시 저장되는지 확인한다.
//
// 계획 1에서는 임시 진단 블록(data-testid="diag")을 읽었지만, 계획 2에서 그 블록이
// 실제 교사 화면으로 교체됐다. 이제는 화면에 실제로 보이는 값과 저장소 상태를 본다.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const v1 = readFileSync('src/test/fixtures/v1-basic.json', 'utf8');

test('v1 localStorage 데이터가 v2에서 읽힌다', async ({ page }) => {
  await page.addInitScript((raw) => {
    localStorage.setItem('seat-changer-classes', '["1반","6-7"]');
    localStorage.setItem('seat-changer-active', '6-7');
    localStorage.setItem('seat-changer-data-6-7', raw);
  }, v1);
  await page.goto('/');

  // 교사 화면이 떴고, 활성 반이 6-7이다
  await expect(page.locator('[data-page="teacher"]')).toBeVisible();
  await expect(page.locator('[data-card="classes"]')).toContainText('6-7');

  // 명단 22명이 화면에 반영된다
  await expect(page.locator('[data-card="roster"]')).toContainText('22');

  // 배치도가 렌더된다
  await expect(page.getByTestId('seat-board')).toBeVisible();

  // 저장 키가 v2로 덮어써졌는지 (기존 키를 그대로 쓴다 — 새 키를 만들지 않는다)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('seat-changer-data-6-7')!));
  expect(saved.schemaVersion).toBe(2);
  expect(saved.students).toHaveLength(22);

  await page.screenshot({ path: 'test-results/teacher-v1-load.png', fullPage: true });
});

test('localStorage가 비어 있으면 기본 반(1반)으로 뜬다', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-page="teacher"]')).toBeVisible();
  await expect(page.locator('[data-card="classes"]')).toContainText('1반');
});
