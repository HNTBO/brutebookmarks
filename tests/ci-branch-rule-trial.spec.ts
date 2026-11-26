import { expect, test } from './fixtures/browser';

test('disposable branch rule trial reads a local page title', async ({ page }) => {
  await page.setContent('<title>Branch rule trial</title>');
  expect(await page.title()).toBe('Intentional trial failure');
});
