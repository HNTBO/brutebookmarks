import { test, expect, Page } from './fixtures/browser';
import * as fs from 'fs';
import * as path from 'path';
import { selectBackup } from './fixtures/import';

/**
 * E2E tests for import/export round-trip.
 *
 * Verifies that exporting bookmarks and re-importing them
 * preserves all categories and bookmark data.
 */

const SEED_DATA = JSON.stringify([
  {
    id: 'exp-cat-1', name: 'Work', order: 1,
    bookmarks: [
      { id: 'exp-bm-1', title: 'GitHub', url: 'https://github.com', iconPath: null, order: 1 },
      { id: 'exp-bm-2', title: 'Jira', url: 'https://jira.example.com', iconPath: null, order: 2 },
    ],
  },
  {
    id: 'exp-cat-2', name: 'Social', order: 2,
    bookmarks: [
      { id: 'exp-bm-3', title: 'Twitter', url: 'https://twitter.com', iconPath: null, order: 1 },
    ],
  },
]);

async function setupLocalMode(page: Page): Promise<void> {
  await page.addInitScript((seedData: string) => {
    localStorage.setItem('appMode', 'local');
    localStorage.setItem('speedDialData', seedData);
  }, SEED_DATA);
  await page.goto('/');
  await page.waitForSelector('.category', { timeout: 10_000 });
}

const embedded = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>');
const remoteIcon = 'https://www.google.com/s2/favicons?domain=fixture.example&sz=64';

function importFixture(oversized = false) {
  const icons = [embedded, remoteIcon];
  if (oversized) icons.push(embedded.padEnd(50_001, ' '));
  return [{ name: 'Incoming', bookmarks: icons.map((iconPath, i) => ({
    title: 'Incoming ' + i, url: 'https://fixture.example/' + i, iconPath,
  })) }];
}

test('oversized image warning allows cancellation or keeping all other images', async ({ page }, testInfo) => {
  await setupLocalMode(page);
  const backup = importFixture(true);
  for (const proceed of [false, true]) {
    await selectBackup(page, backup);
    const modal = page.locator('#confirm-modal');
    await expect(modal).toContainText('50,000');
    await testInfo.attach('Oversized image warning', { body: await modal.locator('.modal-content').screenshot(), contentType: 'image/png' });
    expect(await page.evaluate(() => localStorage.getItem('speedDialData'))).toBe(SEED_DATA);
    if (!proceed) {
      await page.getByRole('button', { name: 'Cancel', exact: true }).press('Enter');
      await expect(modal).toBeHidden();
      continue;
    }
    await page.getByRole('button', { name: 'Skip oversized image' }).click();
    await page.getByRole('button', { name: 'Replace', exact: true }).click();
    await expect(modal).toContainText('Imported 1 category with 3 bookmarks');
    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('speedDialData')!));
    expect(restored[0].bookmarks).toMatchObject(backup[0].bookmarks.map((bk, i) => ({ ...bk, iconPath: i === 2 ? null : bk.iconPath })));
  }
});

test('local quota offers one cancellable append without incoming embedded images', async ({ page }, testInfo) => {
  await setupLocalMode(page);
  const backup = importFixture();
  backup[0].bookmarks[0].iconPath = embedded.padEnd(40_000, ' ');
  await page.evaluate(() => {
    // Fill this isolated Chromium origin, leaving space for links and titles.
    let available = 0;
    for (let step = 1024 * 1024; step >= 1024; step /= 2) {
      for (;;) {
        try {
          localStorage.setItem('quota-fixture', 'x'.repeat(available + step));
          available += step;
        } catch (error) {
          if (!(error instanceof DOMException) || error.name !== 'QuotaExceededError') throw error;
          break;
        }
      }
    }
    localStorage.setItem('quota-fixture', 'x'.repeat(available - 2048));
  });
  for (const proceed of [false, true]) {
    await selectBackup(page, backup);
    await page.getByRole('button', { name: 'Append', exact: true }).click();
    const retry = page.getByRole('button', { name: 'Retry without images' });
    await expect(retry).toBeVisible();
    await testInfo.attach('Append recovery choice', { body: await page.locator('#confirm-modal .modal-content').screenshot(), contentType: 'image/png' });
    expect(await page.evaluate(() => localStorage.getItem('speedDialData'))).toBe(SEED_DATA);
    if (!proceed) {
      await page.keyboard.press('Escape');
      continue;
    }
    await retry.click();
    await expect(page.locator('#confirm-modal')).toContainText('Imported 1 category with 2 bookmarks');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('speedDialData')!));
    expect(saved.slice(0, 2)).toEqual(JSON.parse(SEED_DATA));
    expect(saved[2].bookmarks).toMatchObject(backup[0].bookmarks.map((bk, i) => ({ ...bk, iconPath: i === 0 ? null : remoteIcon })));
  }
});

test.describe('Import/Export round-trip', () => {
  test('Replace keeps the visible and saved library when browser storage rejects the new data', async ({ page }) => {
    await setupLocalMode(page);
    await page.evaluate(() => {
      const write = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'speedDialData' && value.includes('Too large')) {
          throw new DOMException('Synthetic import quota', 'QuotaExceededError');
        }
        return write.call(this, key, value);
      };
    });
    await page.click('#settings-btn');
    await page.click('#import-data-btn');
    const chooser = page.waitForEvent('filechooser');
    await page.click('#confirm-modal-ok');
    await (await chooser).setFiles({
      name: 'valid-backup.json', mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify([{ id: 'new', name: 'Too large', bookmarks: [] }])),
    });
    await expect(page.locator('#confirm-modal-message')).toContainText('Replace them or append');
    await page.click('#confirm-modal-ok');
    await expect(page.locator('#confirm-modal-message')).toContainText('insufficient storage');
    expect(await page.evaluate(() => localStorage.getItem('speedDialData'))).toBe(SEED_DATA);
    await expect(page.getByAltText('GitHub')).toBeVisible();
    await expect(page.getByAltText('Twitter')).toBeVisible();
  });

  test('export produces valid JSON with correct structure', async ({ page }) => {
    await setupLocalMode(page);

    // Open settings modal
    await page.click('#settings-btn');
    await expect(page.locator('#settings-modal')).toHaveClass(/active/);

    // Trigger export and capture the downloaded file
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#export-data-btn'),
    ]);

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    const content = fs.readFileSync(downloadPath!, 'utf-8');
    const parsed = JSON.parse(content);

    // Should be an array of categories
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);

    // First category should have expected structure
    expect(parsed[0].name).toBe('Work');
    expect(parsed[0].bookmarks).toHaveLength(2);
    expect(parsed[0].bookmarks[0].title).toBe('GitHub');
    expect(parsed[0].bookmarks[0].url).toBe('https://github.com');

    // Second category
    expect(parsed[1].name).toBe('Social');
    expect(parsed[1].bookmarks).toHaveLength(1);
  });

  test('import restores bookmarks from exported file', async ({ page }) => {
    await setupLocalMode(page);

    // Open settings and export first
    await page.click('#settings-btn');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#export-data-btn'),
    ]);
    const exportPath = await download.path();
    const exportedContent = fs.readFileSync(exportPath!, 'utf-8');

    // Close settings
    await page.keyboard.press('Escape');

    // Clear all data by importing an empty set, then re-import the exported file
    // First, navigate fresh with empty data
    await page.addInitScript(() => {
      localStorage.setItem('appMode', 'local');
      localStorage.setItem('speedDialData', JSON.stringify([
        { id: 'empty-cat', name: 'Empty', order: 1, bookmarks: [] },
      ]));
    });
    await page.goto('/');
    await page.waitForSelector('.category', { timeout: 10_000 });

    // Write the exported content to a temp file for upload
    const tmpDir = path.join(process.cwd(), 'test-results');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, 'reimport-test.json');
    fs.writeFileSync(tmpFile, exportedContent);

    // Open settings and click import
    await page.click('#settings-btn');
    await expect(page.locator('#settings-modal')).toHaveClass(/active/);
    await page.click('#import-data-btn');

    // Confirm dialog asks "From File" vs "From Browser" — click "From File" (OK button)
    await expect(page.locator('#confirm-modal')).toHaveClass(/active/, { timeout: 3000 });
    // Set up filechooser listener BEFORE clicking so we catch the dynamic input
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('#confirm-modal-ok'),
    ]);
    await fileChooser.setFiles(tmpFile);

    // "Replace or Append" dialog appears since we have existing data — click "Replace"
    await expect(page.locator('#confirm-modal')).toHaveClass(/active/, { timeout: 3000 });
    await page.click('#confirm-modal-ok');

    // Success alert — dismiss it
    await expect(page.locator('#confirm-modal')).toHaveClass(/active/, { timeout: 3000 });
    await page.click('#confirm-modal-ok');

    // Wait for import to complete — categories should reappear
    await page.waitForSelector('.category', { timeout: 10_000 });

    // Verify the data was imported correctly
    const categoryNames = await page.$$eval('.category-title', (els) =>
      els.map((el) => el.textContent?.trim()),
    );
    expect(categoryNames).toContain('Work');
    expect(categoryNames).toContain('Social');

    // Verify bookmarks are present
    const bookmarkTitles = await page.$$eval('.bookmark-title', (els) =>
      els.map((el) => el.textContent?.trim()),
    );
    expect(bookmarkTitles).toContain('GitHub');
    expect(bookmarkTitles).toContain('Twitter');

    // Clean up
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });
});
