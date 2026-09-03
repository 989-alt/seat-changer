// Phase 2 게이트: v1 localStorage 데이터가 v2 스토어를 통해 정확히 읽히고,
// 마이그레이션된 v2 형식으로 다시 저장되는지 확인한다.
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
  const diag = page.getByTestId('diag');
  await expect(diag).toContainText('"activeClass": "6-7"');
  await expect(diag).toContainText('"students": 22');
  await expect(diag).toContainText('새 버전');

  // 저장 키가 v2로 덮어써졌는지
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('seat-changer-data-6-7')!));
  expect(saved.schemaVersion).toBe(2);
  expect(saved.students).toHaveLength(22);

  await page.screenshot({ path: 'test-results/teacher-diag.png', fullPage: true });
});

test('localStorage가 비어 있으면 기본 반(1반)으로 진단이 뜬다', async ({ page }) => {
  await page.goto('/');
  const diag = page.getByTestId('diag');
  await expect(diag).toContainText('"activeClass": "1반"');
  await expect(diag).toContainText('"students": 0');
  await expect(diag).toContainText('"loadNotice": null');
});
