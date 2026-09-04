// 교사 화면 핵심 흐름 (스펙 8절 E2E 목록)
//   - 명단 입력·저장
//   - 좌석 삭제 -> 되돌리기 토스트 -> 복구
//   - 규칙 검사가 이력을 남기지 않는다
import { test, expect } from '@playwright/test';

const NAMES = ['김하람', '이도윤', '박서준', '최지우', '정민서', '강예린'];

test('명단을 입력하고 저장하면 저장소와 배치도에 반영된다', async ({ page }) => {
  await page.goto('/');
  const roster = page.locator('[data-card="roster"]');
  await roster.getByRole('textbox').first().fill(NAMES.join('\n'));
  await roster.getByRole('button', { name: '명단 저장' }).click();

  await expect(roster).toContainText(`${NAMES.length}명`);

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('seat-changer-data-1반')!));
  expect(saved.students).toEqual(NAMES);
  expect(saved.schemaVersion).toBe(2);
});

test('좌석을 삭제하면 토스트의 되돌리기로 복구된다', async ({ page }) => {
  await page.goto('/');
  const board = page.getByTestId('seat-board');
  const seatCountBefore = await board.locator('[data-seat]').count();

  await board.locator('[data-seat="5"]').click();
  await page.getByTestId('seat-popover').getByRole('button', { name: /삭제/ }).click();

  // 삭제가 저장소에 반영된다
  await expect
    .poll(async () =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('seat-changer-data-1반')!).layoutSettings.disabledSeats,
      ),
    )
    .toEqual([5]);

  // 토스트의 되돌리기로 복구
  await page.getByRole('status').getByRole('button', { name: '되돌리기' }).click();
  await expect
    .poll(async () =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('seat-changer-data-1반')!).layoutSettings.disabledSeats,
      ),
    )
    .toEqual([]);

  expect(await board.locator('[data-seat]').count()).toBe(seatCountBefore);
});

test('규칙 검사는 미리보기 전용이라 이력을 남기지 않는다', async ({ page }) => {
  await page.goto('/');
  const roster = page.locator('[data-card="roster"]');
  await roster.getByRole('textbox').first().fill(NAMES.join('\n'));
  await roster.getByRole('button', { name: '명단 저장' }).click();

  const check = page.locator('[data-card="check"]');
  await expect(check).toContainText('저장되지 않습니다');
  await check.getByRole('button', { name: /규칙 검사/ }).click();

  // 검사가 끝날 때까지 기다린 뒤 저장소를 확인한다
  await expect(check.getByRole('button', { name: /규칙 검사/ })).toBeEnabled();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('seat-changer-data-1반')!));
  expect(saved.lastAssignment).toBeNull();
  expect(saved.assignmentHistory).toEqual([]);
});
