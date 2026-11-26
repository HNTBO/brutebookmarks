import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from './fixtures/browser';
import type { Category } from '../src/types';

// A 16 × 16 PNG with alternating orange and blue squares.
const png = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAJUlEQVR42mP4n8YARAxpZ4CIGDYDyRqIVwplk6xh1A+jfqCSHwDWRUuQLmCD/QAAAABJRU5ErkJggg==';
const pngUri = 'data:image/png;base64,' + png;
const site = 'https://fixture.example/';
const automatic = 'https://www.google.com/s2/favicons?domain=fixture.example&sz=64';
const seed = [{ id: 'category', name: 'Fixtures', bookmarks: [
  { id: 'automatic', title: 'Automatic', url: site, iconPath: null },
] }];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(data => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('appMode', 'local');
    localStorage.setItem('speedDialData', JSON.stringify(data));
    sessionStorage.setItem('seeded', '1');
  }, seed);
  await page.route(automatic, route => route.fulfill({ contentType: 'image/png', body: Buffer.from(png, 'base64') }));
  await page.goto('/');
});

async function importFile(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await page.click('#settings-btn');
  await page.click('#import-data-btn');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'From File' }).click();
  await (await chooser).setFiles(file);
  await page.getByRole('button', { name: 'Replace', exact: true }).click();
  await expect(page.locator('#confirm-modal-message')).toContainText('Imported');
  await page.click('#confirm-modal-ok');
}

async function upload(page: Page) {
  await page.locator('.add-bookmark').click();
  await page.fill('#bookmark-title', 'Uploaded');
  await page.fill('#bookmark-url', site);
  await page.locator('#custom-icon-input').setInputFiles({
    name: 'checker.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64'),
  });
  await expect(page.locator('#icon-source')).toHaveText('Custom: checker.png');
  const uri = await page.inputValue('#bookmark-icon-path');
  await page.getByRole('button', { name: 'Save Bookmark' }).click();
  await expect(page.getByAltText('Uploaded', { exact: true })).toBeVisible();
  return uri;
}

async function storedBookmark(page: Page, title: string) {
  return page.evaluate(title => {
    const data: Category[] = JSON.parse(localStorage.getItem('speedDialData')!);
    return data.flatMap(cat => cat.bookmarks).find(bookmark => bookmark.title === title);
  }, title);
}

async function expectEmbeddedIcon(page: Page, title: string, uri: string, size: number) {
  const img = page.getByAltText(title, { exact: true });
  const id = await page.locator('.bookmark-card').filter({ has: img }).getAttribute('data-bookmark-id');
  const saved = await storedBookmark(page, title);
  expect(saved).toMatchObject({ id, title, url: site });
  expect(saved?.iconPath === uri, 'persisted embedded PNG').toBe(true);
  expect(await img.getAttribute('src') === uri, 'card uses the original PNG').toBe(true);
  const decoded = await img.evaluate(async (image: HTMLImageElement) => {
    await image.decode();
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    return [image.naturalWidth, image.naturalHeight, ...ctx.getImageData(0, 0, 1, 1).data];
  });
  expect(decoded).toEqual([size, size, 255, 102, 0, 255]);
}

test('a Netscape HTML icon survives import and reload', async ({ page }) => {
  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL>
    <DT><A HREF="${site}" ICON="${pngUri}">Imported PNG</A>
    <DT><A HREF="${site}" ICON="data:text/plain;base64,YQ==">Unsupported</A>
    <DT><A HREF="${site}" ICON="${pngUri.padEnd(50_001, ' ')}">Oversize</A>
    <DT><A HREF="${site.padEnd(2049, 'x')}" ICON="${pngUri}">Long URL</A>
  </DL>`;
  await importFile(page, { name: 'bookmarks.html', mimeType: 'text/html', buffer: Buffer.from(html) });
  await page.reload();
  await expectEmbeddedIcon(page, 'Imported PNG', pngUri, 16);
  expect(await storedBookmark(page, 'Long URL')).toBeUndefined();
  for (const title of ['Unsupported', 'Oversize']) {
    expect((await storedBookmark(page, title))?.iconPath).toBeNull();
    await expect(page.getByAltText(title)).toHaveAttribute('src', automatic);
  }
});

test('a genuine 16 × 16 automatic favicon stays on its card', async ({ page }, testInfo) => {
  const img = page.getByAltText('Automatic');
  await img.evaluate(async (image: HTMLImageElement) => { await image.decode(); });
  const card = page.locator('[data-bookmark-id="automatic"].bookmark-card');
  await testInfo.attach('Automatic bookmark card', { body: await card.screenshot(), contentType: 'image/png' });
  await expect(img).toHaveAttribute('src', automatic);
  expect(await img.evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight])).toEqual([16, 16]);
});

test('a browser icon stays refreshable after editing and restoring a backup alongside an upload', async ({ page }) => {
  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><DT><A HREF="${site}" ICON="${pngUri}">Browser</A></DL>`;
  await importFile(page, { name: 'browser.html', mimeType: 'text/html', buffer: Buffer.from(html) });
  const uploaded = await upload(page);
  await page.locator('.bookmark-card').filter({ has: page.getByAltText('Browser', { exact: true }) })
    .getByRole('button', { name: 'Edit bookmark' }).click({ force: true });
  await page.fill('#bookmark-title', 'Renamed');
  await page.getByRole('button', { name: 'Save Bookmark' }).click();
  await page.click('#settings-btn');
  const download = page.waitForEvent('download');
  await page.click('#export-data-btn');
  const buffer = await readFile((await (await download).path())!);
  await page.keyboard.press('Escape');
  await importFile(page, { name: 'backup.json', mimeType: 'application/json', buffer });
  await page.reload();
  await page.click('#settings-btn');
  await page.click('#fetch-favicons-btn');
  await expect(page.locator('#confirm-modal-message')).toHaveText('Updated favicons for 1 bookmark.');
  expect((await storedBookmark(page, 'Renamed'))?.iconPath).toBe(automatic);
  await expectEmbeddedIcon(page, 'Uploaded', uploaded, 128);
});

test('Fetch Favicons preserves uploaded, emoji and Wikimedia icons while refreshing an automatic bookmark', async ({ page }) => {
  const manual = [
    { id: 'emoji', title: 'Emoji', url: site, iconPath: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/1f600.svg' },
    { id: 'wiki', title: 'Wikimedia', url: site, iconPath: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Test.png' },
  ];
  for (const bookmark of manual) {
    await page.route(bookmark.iconPath, route => route.fulfill({ contentType: 'image/png', body: Buffer.from(png, 'base64') }));
  }
  await page.evaluate(bookmarks => {
    const data: Category[] = JSON.parse(localStorage.getItem('speedDialData')!);
    data[0].bookmarks.push(...bookmarks);
    localStorage.setItem('speedDialData', JSON.stringify(data));
  }, manual);
  await page.reload();
  const uri = await upload(page);
  await page.click('#settings-btn');
  await page.click('#fetch-favicons-btn');
  await expect(page.locator('#confirm-modal-message')).toContainText('Updated favicons');
  await page.click('#confirm-modal-ok');
  await page.reload();
  expect((await storedBookmark(page, 'Automatic'))?.iconPath).toBe(automatic);
  await expectEmbeddedIcon(page, 'Uploaded', uri, 128);
  for (const bookmark of manual) {
    expect((await storedBookmark(page, bookmark.title))?.iconPath).toBe(bookmark.iconPath);
    await expect(page.getByAltText(bookmark.title, { exact: true })).toHaveAttribute('src', bookmark.iconPath);
  }
});

test('a native backup restores the uploaded PNG after reload', async ({ page }) => {
  const uri = await upload(page);
  expect(uri.length).toBeGreaterThan(2048);
  expect(uri.length).toBeLessThanOrEqual(50_000);
  await page.click('#settings-btn');
  const download = page.waitForEvent('download');
  await page.click('#export-data-btn');
  const backup = await download;
  const buffer = await readFile((await backup.path())!);
  const original = await storedBookmark(page, 'Uploaded');
  await page.evaluate(seed => localStorage.setItem('speedDialData', JSON.stringify(seed)), seed);
  await page.reload();
  await expect(page.getByAltText('Uploaded')).toHaveCount(0);
  await importFile(page, { name: 'backup.json', mimeType: 'application/json', buffer });
  await page.reload();
  await expectEmbeddedIcon(page, 'Uploaded', uri, 128);
  expect((await storedBookmark(page, 'Uploaded'))?.id).toBe(original?.id);
});

test('Replace sends the restored library to the extension before reload', async ({ page }) => {
  await page.addInitScript(() => {
    window.addEventListener('message', ({ source, origin, data }) => {
      if (source !== window || origin !== location.origin) return;
      if (data?.type === 'BB_EXT_LOCAL_SNAPSHOT') {
        sessionStorage.setItem('extension-copy', JSON.stringify(data.categories));
      } else if (data?.type === 'BB_EXT_LOCAL_DATA_REQUEST') {
        const categories = JSON.parse(sessionStorage.getItem('extension-copy') ?? '[]');
        window.postMessage({ type: 'BB_EXT_LOCAL_DATA_RESULT', requestId: data.requestId,
          success: true, snapshot: { categories }, pending: [] }, location.origin);
        sessionStorage.setItem('extension-replied', '1');
      }
    });
  });
  await page.reload();
  await page.evaluate(data => sessionStorage.setItem('extension-copy', JSON.stringify(data)), seed);
  const restored = [{ ...seed[0], bookmarks: [] }];
  await importFile(page, { name: 'older.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(restored)) });
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('extension-copy')!))).toEqual(restored);
  await page.reload();
  await expect(page.locator('.category-title', { hasText: 'Fixtures' })).toBeVisible();
  await page.evaluate(() => window.postMessage({ type: 'BB_EXT_INSTALLED' }, location.origin));
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('extension-replied'))).toBe('1');
  expect(await storedBookmark(page, 'Automatic')).toBeUndefined();
});
