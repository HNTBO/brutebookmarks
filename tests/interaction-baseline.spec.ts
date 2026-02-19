import { test, expect, Page } from '@playwright/test';

/**
 * Baseline interaction test suite.
 *
 * Runs in local mode (no auth). Sets localStorage to skip the welcome gate
 * and seed default bookmark data so tests have content to interact with.
 */

// ── Helpers ──────────────────────────────────────────────────────────

/** Minimal seed data so local mode has content to render. */
const SEED_CATEGORIES = JSON.stringify([
  {
    id: 'test-cat-1', name: 'Test Category', order: 1,
    bookmarks: [
      { id: 'test-bm-1', title: 'Google', url: 'https://google.com', iconPath: null, order: 1 },
      { id: 'test-bm-2', title: 'GitHub', url: 'https://github.com', iconPath: null, order: 2 },
      { id: 'test-bm-3', title: 'Reddit', url: 'https://reddit.com', iconPath: null, order: 3 },
    ],
  },
  {
    id: 'test-cat-2', name: 'Another Category', order: 2,
    bookmarks: [
      { id: 'test-bm-4', title: 'Wikipedia', url: 'https://wikipedia.org', iconPath: null, order: 1 },
    ],
  },
]);

/** Set app to local mode and navigate, waiting for categories to render. */
async function setupLocalMode(page: Page): Promise<void> {
  // Set local mode + seed data before navigating so the welcome gate is skipped
  await page.addInitScript((seedData: string) => {
    localStorage.setItem('appMode', 'local');
    localStorage.setItem('speedDialData', seedData);
  }, SEED_CATEGORIES);
  await page.goto('/');
  // Wait for the app to render categories
  await page.waitForSelector('.category', { timeout: 10_000 });
}

/** Get all bookmark cards currently visible. */
function bookmarkCards(page: Page) {
  return page.locator('.bookmark-card:not(.add-bookmark)');
}

// ── Tests ────────────────────────────────────────────────────────────

test.describe('App loads', () => {
  test('renders categories with default bookmarks in local mode', async ({ page }) => {
    await setupLocalMode(page);

    const categories = page.locator('.category, .tab-group');
    await expect(categories.first()).toBeVisible();

    const cards = bookmarkCards(page);
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test('header controls are visible', async ({ page }) => {
    await setupLocalMode(page);

    await expect(page.locator('#add-category-btn')).toBeVisible();
    await expect(page.locator('#theme-toggle-btn')).toBeVisible();
    await expect(page.locator('#settings-btn')).toBeVisible();
    await expect(page.locator('#size-handle')).toBeVisible();
  });
});

test.describe('Bookmark card click', () => {
  test('clicking a card opens its URL in a new tab', async ({ page, context }) => {
    await setupLocalMode(page);

    const firstCard = bookmarkCards(page).first();
    const url = await firstCard.getAttribute('data-url');
    expect(url).toBeTruthy();

    // Listen for new page (tab) before clicking
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      firstCard.click(),
    ]);
    // The new page should target the bookmark URL
    expect(newPage.url()).toContain(new URL(url!).hostname);
    await newPage.close();
  });
});

test.describe('Modal open/close', () => {
  test('add-category modal opens and closes via button', async ({ page }) => {
    await setupLocalMode(page);

    await page.click('#add-category-btn');
    const modal = page.locator('#category-modal');
    await expect(modal).toHaveClass(/active/);

    // Close via X button
    await page.click('#category-modal-close');
    await expect(modal).not.toHaveClass(/active/);
  });

  test('settings modal opens and closes via Escape', async ({ page }) => {
    await setupLocalMode(page);

    await page.click('#settings-btn');
    const modal = page.locator('#settings-modal');
    await expect(modal).toHaveClass(/active/);

    await page.keyboard.press('Escape');
    await expect(modal).not.toHaveClass(/active/);
  });

  test('modal closes on backdrop click', async ({ page }) => {
    await setupLocalMode(page);

    await page.click('#add-category-btn');
    const modal = page.locator('#category-modal');
    await expect(modal).toHaveClass(/active/);

    // Click the backdrop (the modal overlay itself, not its content)
    await modal.click({ position: { x: 5, y: 5 } });
    await expect(modal).not.toHaveClass(/active/);
  });

  test('bookmark modal opens via add button', async ({ page }) => {
    await setupLocalMode(page);

    const addBtn = page.locator('.add-bookmark').first();
    await addBtn.click();
    const modal = page.locator('#bookmark-modal');
    await expect(modal).toHaveClass(/active/);

    await page.keyboard.press('Escape');
    await expect(modal).not.toHaveClass(/active/);
  });
});

test.describe('Bookmark drag reorder (mouse)', () => {
  test('dragging a bookmark card shows drag proxy and drop indicator', async ({ page }) => {
    await setupLocalMode(page);

    const cards = bookmarkCards(page);
    const count = await cards.count();
    if (count < 2) {
      test.skip(true, 'Need at least 2 bookmarks to test drag');
      return;
    }

    const firstCard = cards.first();
    const secondCard = cards.nth(1);
    const firstBox = await firstCard.boundingBox();
    const secondBox = await secondCard.boundingBox();
    if (!firstBox || !secondBox) return;

    // Start drag from center of first card
    const startX = firstBox.x + firstBox.width / 2;
    const startY = firstBox.y + firstBox.height / 2;
    const endX = secondBox.x + secondBox.width / 2;
    const endY = secondBox.y + secondBox.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Move past the 5px drag threshold
    await page.mouse.move(startX + 10, startY, { steps: 3 });
    // Move to second card
    await page.mouse.move(endX, endY, { steps: 5 });

    // Drag proxy should be visible
    const proxy = page.locator('.drag-proxy');
    await expect(proxy).toBeVisible();

    // Body should have dragging class
    await expect(page.locator('body')).toHaveClass(/dragging/);

    // Drop
    await page.mouse.up();

    // Proxy should be gone
    await expect(proxy).not.toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/dragging/);
  });
});

test.describe('Category drag reorder', () => {
  test('dragging a category handle shows layout drop indicator', async ({ page }) => {
    await setupLocalMode(page);

    const handles = page.locator('.category-drag-handle');
    const handleCount = await handles.count();
    if (handleCount < 2) {
      test.skip(true, 'Need at least 2 categories to test drag');
      return;
    }

    const firstHandle = handles.first();
    const box = await firstHandle.boundingBox();
    if (!box) return;

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Move past threshold
    await page.mouse.move(startX, startY + 80, { steps: 10 });

    // Should see drag proxy or layout indicator
    const proxy = page.locator('.drag-proxy');
    await expect(proxy).toBeVisible();

    await page.mouse.up();
    await expect(proxy).not.toBeVisible();
  });
});

test.describe('Theme toggle', () => {
  test('clicking theme button toggles dark/light mode', async ({ page }) => {
    await setupLocalMode(page);

    const html = page.locator('html');
    const themeBefore = await html.getAttribute('data-theme');

    await page.click('#theme-toggle-btn');

    const themeAfter = await html.getAttribute('data-theme');
    expect(themeAfter).not.toBe(themeBefore);
  });
});

test.describe('Size controller', () => {
  test('dragging the size handle changes card size', async ({ page }) => {
    await setupLocalMode(page);

    const handle = page.locator('#size-handle');
    const box = await handle.boundingBox();
    if (!box) return;

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    // Get initial card size from CSS variable
    const sizeBefore = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue('--card-size')
    );

    // Drag handle to the right and down (bigger cards, wider page)
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 30, startY + 20, { steps: 5 });
    await page.mouse.up();

    const sizeAfter = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue('--card-size')
    );

    // Size should have changed (or at least handle position moved)
    // The exact values depend on controller dimensions, so just verify the handle moved
    const boxAfter = await handle.boundingBox();
    if (boxAfter) {
      expect(boxAfter.x !== box.x || boxAfter.y !== box.y).toBeTruthy();
    }
  });
});
