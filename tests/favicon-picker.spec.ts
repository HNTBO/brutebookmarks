import { test, expect, type Page } from './fixtures/browser';

const url = 'https://fixture.example/';
const custom = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="orange"/></svg>');
const candidate = 'https://fixture.example/discovered.svg';
const provider = 'https://icon.horse/icon/fixture.example?fallback=404';
const svg = decodeURIComponent(custom.split(',')[1]);
const bookmark = { id: 'one', title: 'Fixture', url, iconPath: custom, importedFavicon: true };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(bookmark => {
    localStorage.setItem('appMode', 'local');
    localStorage.setItem('speedDialData', JSON.stringify([{ id: 'cat', name: 'Fixtures', bookmarks: [bookmark] }]));
  }, bookmark);
  await page.route(candidate, route => route.fulfill({ contentType: 'image/svg+xml', body: svg }));
  await page.goto('/');
});

function edit(page: Page) {
  return page.getByRole('button', { name: 'Edit bookmark' }).click({ force: true });
}

async function deferSyncAction(page: Page) {
  // Activate the app's development mock client while keeping the seeded bookmark.
  await page.evaluate(async () => {
    const client = '/src/data/convex-client.ts';
    const store = '/src/data/store.ts';
    window.__BB_MOCK_CONVEX_CLIENT__ = {
      action: (_ref: unknown, args: { forceRefresh?: boolean }) => {
        if (!args.forceRefresh) throw new Error('An explicit lookup must bypass cached icon URLs');
        return new Promise(resolve => { (window as any).finishLookup = resolve; });
      },
      onUpdate: () => () => {},
    } as any;
    (await import(client)).initConvexClient();
    (await import(store)).activateConvex();
  });
}

async function finish(page: Page, iconUrl: string, source: string) {
  await page.evaluate(result => (window as any).finishLookup(result), { iconUrl, source });
}

test('local miss keeps the imported preview, path and provenance through save', async ({ page }, testInfo) => {
  await page.route(provider, route => route.fulfill({ status: 404, body: '' }));
  await edit(page);
  await page.click('#use-favicon-btn');
  await expect(page.locator('#bookmark-icon-path')).toHaveValue(custom);
  await expect(page.getByRole('status').filter({ hasText: 'No favicon found' })).toBeVisible();
  await expect(page.locator('#preview-icon')).toHaveAttribute('src', custom);
  await testInfo.attach('Imported icon after a favicon lookup miss', {
    body: await page.locator('#bookmark-modal .icon-section').screenshot(), contentType: 'image/png',
  });
  await page.getByRole('button', { name: 'Save Bookmark' }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('speedDialData')!)[0].bookmarks[0])).toMatchObject(bookmark);
});

test('offline lookup preserves the icon and explains how to retry', async ({ page, context }) => {
  await edit(page);
  await context.setOffline(true);
  await page.click('#use-favicon-btn');
  await expect(page.locator('#favicon-status')).toContainText('offline');
  await expect(page.locator('#bookmark-icon-path')).toHaveValue(custom);
  await expect(page.locator('#preview-icon')).toHaveAttribute('src', custom);
});

test('local lookup loads a real 16px icon before selecting it', async ({ page }) => {
  await page.route(provider, route => route.fulfill({ contentType: 'image/svg+xml', body: svg }));
  await edit(page);
  await page.click('#use-favicon-btn');
  await expect(page.locator('#bookmark-icon-path')).toHaveValue(provider);
  expect(await page.locator('#preview-icon').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(16);
});

test('a late sync discovery is applied only on explicit retry', async ({ page }) => {
  await deferSyncAction(page);
  await edit(page);
  await page.clock.install();
  await page.click('#use-favicon-btn');
  await page.clock.fastForward(5500);
  await expect(page.getByRole('status').filter({ hasText: 'timed out' })).toBeVisible();
  await finish(page, candidate, 'html-favicon');
  await expect(page.locator('#bookmark-icon-path')).toHaveValue(custom);
  await page.click('#use-favicon-btn');
  await expect(page.locator('#bookmark-icon-path')).toHaveValue(candidate);
});

test('a late sync result cannot replace an upload or enter a reopened same-URL dialog', async ({ page }) => {
  await deferSyncAction(page);
  await edit(page);
  await page.click('#use-favicon-btn');
  await page.locator('#custom-icon-input').setInputFiles({ name: 'upload.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
  await expect(page.locator('#icon-source')).toHaveText('Custom: upload.svg');
  const uploaded = await page.inputValue('#bookmark-icon-path');
  await finish(page, candidate, 'html-favicon');
  await expect(page.locator('#bookmark-icon-path')).toHaveValue(uploaded);

  await page.click('#use-favicon-btn');
  await page.click('#bookmark-cancel-btn');
  await edit(page);
  await finish(page, candidate, 'html-favicon');
  await expect(page.locator('#bookmark-icon-path')).toHaveValue(custom);
});

for (const operation of ['post-create', 'bulk'] as const) {
  test(`late ${operation} discovery preserves a newer synced title, URL and custom icon`, async ({ page }) => {
    await page.evaluate(async row => {
      const fixture = '/tests/fixtures/favicon-sync.ts';
      (await import(fixture)).start(row);
    }, bookmark);
    if (operation === 'post-create') {
      await page.locator('.add-bookmark').click();
      await page.fill('#bookmark-title', 'Created');
      await page.fill('#bookmark-url', url);
      await page.getByRole('button', { name: 'Save Bookmark' }).click();
      await expect(page.locator('#bookmark-modal')).not.toHaveClass(/active/);
    } else {
      await page.click('#settings-btn');
      await page.click('#fetch-favicons-btn');
    }
    const edit = { title: 'Edited', url: url + 'new', iconPath: custom, importedFavicon: undefined };
    const discovery = { iconUrl: candidate, source: 'html-favicon' };
    await page.evaluate(async ({ edit, result }) => {
      const fixture = '/tests/fixtures/favicon-sync.ts';
      (await import(fixture)).saveEditAndFinish(edit, result);
    }, { edit, result: operation === 'bulk' ? [{ bookmarkId: 'one', ...discovery }] : discovery });
    await expect.poll(() => page.evaluate(async () => {
      const fixture = '/tests/fixtures/favicon-sync.ts';
      return (await import(fixture)).writes;
    })).toBe(1);
    expect(await page.evaluate(async () => {
      const fixture = '/tests/fixtures/favicon-sync.ts';
      return (await import(fixture)).current();
    })).toMatchObject(edit);
    if (operation === 'bulk') await expect(page.locator('#confirm-modal-message')).toHaveText('Updated favicons for 0 bookmarks.');
  });
}

test('local bulk refresh checks several domains together and probes each candidate once', async ({ page }) => {
  await page.evaluate(async () => {
    const store = '/src/data/store.ts';
    const category = (await import(store)).getCategories()[0];
    category.bookmarks = Array.from({ length: 12 }, (_, i) => ({
      id: String(i), title: 'Example', url: 'https://site' + (i % 9) + '.example/', iconPath: null,
    }));
  });
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const requests: string[] = [];
  await page.route('https://icon.horse/icon/site*', async route => {
    requests.push(route.request().url());
    await pending;
    await route.fulfill({ status: 404, body: '' });
  });
  await page.click('#settings-btn');
  await page.click('#fetch-favicons-btn');
  try {
    await expect.poll(() => requests.length, { timeout: 3000 }).toBe(6);
  } finally {
    release();
  }
  await expect(page.locator('#confirm-modal-message')).toHaveText('Updated favicons for 0 bookmarks.');
  expect(requests).toHaveLength(9);
  expect(new Set(requests).size).toBe(9);
});

test('local bulk refresh skips an icon edited while the provider request was pending', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route(provider, async route => {
    await pending;
    await route.fulfill({ contentType: 'image/svg+xml', body: svg });
  });
  await page.click('#settings-btn');
  const requested = page.waitForRequest(provider);
  await page.click('#fetch-favicons-btn');
  await requested;
  // A second local tab saved an upload with the same bytes as the imported favicon.
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('speedDialData')!);
    delete data[0].bookmarks[0].importedFavicon;
    data[0].bookmarks[0].title = 'Edited in another tab';
    localStorage.setItem('speedDialData', JSON.stringify(data));
  });
  release();
  await expect(page.locator('#confirm-modal-message')).toHaveText('Updated favicons for 0 bookmarks.');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('speedDialData')!)[0].bookmarks[0]))
    .toEqual({ id: 'one', title: 'Edited in another tab', url, iconPath: custom });
});

test('sync rejects an unverified suggestion and an undecodable discovery, then accepts a valid provider icon', async ({ page }) => {
  await deferSyncAction(page);
  await edit(page);
  const broken = url + 'invalid.png';
  await page.route(broken, route => route.fulfill({ contentType: 'image/png', body: 'invalid' }));
  for (const [icon, source] of [[url + 'suggestion', 'google-s2'], [broken, 'html-favicon']]) {
    await page.click('#use-favicon-btn');
    await finish(page, icon, source);
    await expect(page.getByRole('status').filter({ hasText: 'No favicon found' })).toBeVisible();
    await expect(page.locator('#bookmark-icon-path')).toHaveValue(custom);
  }
  await page.click('#use-favicon-btn');
  await finish(page, candidate, 'duckduckgo');
  await expect(page.locator('#bookmark-icon-path')).toHaveValue(candidate);
});

test('a second search wins while the first provider image is loading', async ({ page }) => {
  await deferSyncAction(page);
  await edit(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const slow = url + 'first.svg';
  await page.route(slow, async route => {
    await pending;
    await route.fulfill({ contentType: 'image/svg+xml', body: svg });
  });
  await page.click('#use-favicon-btn');
  const requested = page.waitForRequest(slow);
  await finish(page, slow, 'html-favicon');
  await requested;
  await page.click('#use-favicon-btn');
  await finish(page, candidate, 'favicon-ico');
  await expect(page.locator('#bookmark-icon-path')).toHaveValue(candidate);
  release();
  await expect(page.locator('#preview-icon')).toHaveAttribute('src', candidate);
});

test('time spent discovering a candidate counts against its image load deadline', async ({ page }) => {
  await deferSyncAction(page);
  await edit(page);
  await page.clock.install();
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route(candidate, async route => {
    await pending;
    await route.fulfill({ contentType: 'image/svg+xml', body: svg });
  });
  await page.click('#use-favicon-btn');
  await page.clock.fastForward(3800);
  const requested = page.waitForRequest(candidate);
  await finish(page, candidate, 'html-favicon');
  await requested;
  await page.clock.fastForward(1400);
  await expect(page.locator('#favicon-status')).toHaveText('Favicon lookup timed out.');
  release();
  await expect(page.locator('#bookmark-icon-path')).toHaveValue(custom);
});
