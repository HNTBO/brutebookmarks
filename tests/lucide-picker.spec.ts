import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from './fixtures/browser';
import { selectBackup } from './fixtures/import';

const seed = [{ id: 'lab', name: 'Home lab', bookmarks: [
  { id: 'monitor', title: 'Status monitor', url: 'https://status.example/', iconPath: null },
] }];

async function openLibrary(page: Page, theme = 'dark') {
  await page.addInitScript(({ seed, theme }) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('appMode', 'local');
    localStorage.setItem('theme', theme);
    localStorage.setItem('speedDialData', JSON.stringify(seed));
    sessionStorage.setItem('seeded', '1');
    window.addEventListener('message', ({ data, source, origin }) => {
      if (source === window && origin === location.origin && data?.type === 'BB_EXT_LOCAL_SNAPSHOT') {
        sessionStorage.setItem('extension-copy', JSON.stringify(data.categories));
      }
    });
  }, { seed, theme });
  await page.goto('/');
  await page.locator('.add-bookmark').click();
  await page.getByLabel('Name', { exact: true }).fill('Router console');
  await page.getByLabel('URL', { exact: true }).fill('https://router.example/');
}

async function editRouter(page: Page) {
  await page.locator('.bookmark-card').filter({ has: page.getByAltText('Router console') })
    .getByRole('button', { name: 'Edit bookmark' }).click({ force: true });
}

test('keyboard selection, recoloring and cancel preserve a portable icon through refresh and backup', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openLibrary(page);
  const picker = page.getByRole('button', { name: 'Lucide Icons' });
  const search = page.getByRole('searchbox', { name: 'Search Lucide icons' });
  const hex = page.getByRole('textbox', { name: 'Hex icon color' });
  const save = page.getByRole('button', { name: 'Save Bookmark' });
  const image = page.getByAltText('Router console', { exact: true });
  await picker.focus();
  await picker.press('Enter');
  await expect(search).toBeFocused();
  await expect(page.getByRole('radio')).toHaveCount(12);
  await page.getByRole('button', { name: 'Next icons' }).click();
  await expect(page.locator('#lucide-status')).toContainText('13–24');
  await search.fill('nonexistent123');
  await expect(page.locator('#lucide-status')).toHaveText('No matching icons');
  await search.fill('home');
  await expect(page.getByRole('radio', { name: 'house', exact: true })).toBeVisible();
  await search.fill('server');
  await expect(page.getByRole('radio', { name: 'server', exact: true })).toBeVisible();
  await search.fill('router');
  await search.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('radio', { name: 'router', exact: true })).toBeChecked();
  await hex.fill('#eb8652');
  await expect(page.locator('#icon-source')).toHaveText('Lucide · router');
  const original = await page.inputValue('#bookmark-icon-path');
  expect(decodeURIComponent(original)).toContain('stroke="#eb8652"');
  expect(decodeURIComponent(original)).toContain('Cole Bemis');
  await save.click();
  await expect(image).toHaveAttribute('src', original);
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('extension-copy') ?? '[]')
    .flatMap((c: { bookmarks: { iconPath: string }[] }) => c.bookmarks).at(-1)?.iconPath)).toBe(original);
  await page.reload();
  await image.evaluate(async (img: HTMLImageElement) => { await img.decode(); });
  await editRouter(page);
  await expect(hex).toHaveValue('#eb8652');
  await hex.fill('#23a985');
  const changed = await page.inputValue('#bookmark-icon-path');
  await expect(page.locator('#preview-icon')).toHaveAttribute('src', changed);
  await page.click('#bookmark-cancel-btn');
  await expect(image).toHaveAttribute('src', original);
  await editRouter(page);
  await expect(hex).toHaveValue('#eb8652');
  await page.getByLabel('Icon color', { exact: true }).fill('#23a985');
  await expect(hex).toHaveValue('#23a985');
  await testInfo.attach('Dark theme · recoloring a saved router', {
    body: await page.locator('#bookmark-modal .modal-content').screenshot(), contentType: 'image/png',
  });
  await save.click();
  await expect(image).toHaveAttribute('src', changed);

  await page.click('#settings-btn');
  const download = page.waitForEvent('download');
  await page.click('#export-data-btn');
  const backup = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  await page.keyboard.press('Escape');
  await page.evaluate(seed => localStorage.setItem('speedDialData', JSON.stringify(seed)), seed);
  await page.reload();
  await expect(image).toHaveCount(0);
  await selectBackup(page, backup);
  await page.getByRole('button', { name: 'Replace', exact: true }).click();
  await expect(page.locator('#confirm-modal-message')).toContainText('Imported');
  await page.click('#confirm-modal-ok');
  await page.reload();
  await page.click('#settings-btn');
  await page.click('#fetch-favicons-btn');
  await expect(page.locator('#confirm-modal-message')).toHaveText('Updated favicons for 1 bookmark.');
  await page.click('#confirm-modal-ok');
  await expect(image).toHaveAttribute('src', changed);
  await editRouter(page);
  await expect(hex).toHaveValue('#23a985');
});

test('mobile picker resets after cancel and ignores a pending upload', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLibrary(page, 'light');
  // Hold the image decode until after the user chooses a different icon.
  await page.evaluate(() => {
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      const url = create(blob);
      const original = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        ...original,
        set(value) {
          if (value !== url) return original.set!.call(this, value);
          Object.defineProperty(HTMLImageElement.prototype, 'src', original);
          window.addEventListener('finish-upload', () => original.set!.call(this, value), { once: true });
        },
      });
      return url;
    };
  });
  await page.locator('#custom-icon-input').setInputFiles({
    name: 'server.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"/>'),
  });
  await expect(page.locator('#icon-source')).toHaveText('Processing...');
  await page.getByRole('button', { name: 'Lucide Icons' }).click();
  await page.getByRole('radio', { name: 'server', exact: true }).check();
  await page.getByLabel('Hex icon color').fill('#a54b37');
  await page.evaluate(() => {
    const revoke = URL.revokeObjectURL.bind(URL);
    return new Promise<void>(resolve => {
      URL.revokeObjectURL = url => { revoke(url); URL.revokeObjectURL = revoke; resolve(); };
      window.dispatchEvent(new Event('finish-upload'));
    });
  });
  await expect(page.locator('#icon-source')).toHaveText('Lucide · server');
  const modal = page.locator('#bookmark-modal .modal-content');
  expect(await modal.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await testInfo.attach('Light theme · mobile icon picker', { body: await modal.screenshot(), contentType: 'image/png' });
  await page.click('#bookmark-cancel-btn');
  await page.locator('.add-bookmark').click();
  await expect(page.locator('#lucide-picker')).toBeHidden();
  await expect(page.locator('#bookmark-icon-path')).toHaveValue('');
  await page.getByRole('button', { name: 'Lucide Icons' }).click();
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(0);
});
