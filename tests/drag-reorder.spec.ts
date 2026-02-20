import { test, expect, Page } from '@playwright/test';

/**
 * E2E tests for drag-and-drop reorder results.
 *
 * Verifies that dragging bookmarks and categories actually changes
 * the order in the DOM (not just visual feedback).
 */

const SEED_DATA = JSON.stringify([
  {
    id: 'drag-cat-1', name: 'Links', order: 1,
    bookmarks: [
      { id: 'drag-bm-1', title: 'Alpha', url: 'https://alpha.com', iconPath: null, order: 1 },
      { id: 'drag-bm-2', title: 'Beta', url: 'https://beta.com', iconPath: null, order: 2 },
      { id: 'drag-bm-3', title: 'Gamma', url: 'https://gamma.com', iconPath: null, order: 3 },
    ],
  },
  {
    id: 'drag-cat-2', name: 'Second Category', order: 2,
    bookmarks: [
      { id: 'drag-bm-4', title: 'Delta', url: 'https://delta.com', iconPath: null, order: 1 },
    ],
  },
]);

function bookmarkCards(page: Page) {
  return page.locator('.bookmark-card:not(.add-bookmark)');
}

async function setupLocalMode(page: Page): Promise<void> {
  await page.addInitScript((seedData: string) => {
    localStorage.setItem('appMode', 'local');
    localStorage.setItem('speedDialData', seedData);
  }, SEED_DATA);
  await page.goto('/');
  await page.waitForSelector('.category', { timeout: 10_000 });
}

/** Get ordered bookmark titles within a specific category. */
async function getBookmarkTitles(page: Page, categoryId: string): Promise<string[]> {
  return page.$$eval(
    `[data-category-id="${categoryId}"] .bookmark-title`,
    (els) => els.map((el) => el.textContent?.trim() ?? ''),
  );
}

/** Get ordered category names. */
async function getCategoryNames(page: Page): Promise<string[]> {
  return page.$$eval('.category-name', (els) =>
    els.map((el) => el.textContent?.trim() ?? ''),
  );
}

test.describe('Bookmark drag reorder', () => {
  test('dragging first bookmark past second reorders them', async ({ page }) => {
    await setupLocalMode(page);

    // Get initial order within first category
    const titlesBefore = await getBookmarkTitles(page, 'drag-cat-1');
    expect(titlesBefore[0]).toBe('Alpha');
    expect(titlesBefore[1]).toBe('Beta');

    // Get the first two card bounding boxes
    const firstCatCards = page.locator('[data-category-id="drag-cat-1"] .bookmark-card:not(.add-bookmark)');
    const firstCard = firstCatCards.nth(0);
    const secondCard = firstCatCards.nth(1);
    const firstBox = await firstCard.boundingBox();
    const secondBox = await secondCard.boundingBox();
    if (!firstBox || !secondBox) return;

    const startX = firstBox.x + firstBox.width / 2;
    const startY = firstBox.y + firstBox.height / 2;
    const endX = secondBox.x + secondBox.width / 2;
    const endY = secondBox.y + secondBox.height / 2;

    // Perform the drag
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 10, startY, { steps: 3 }); // past threshold
    await page.mouse.move(endX, endY, { steps: 10 });
    await page.mouse.up();

    // Wait for rerender
    await page.waitForTimeout(300);

    // Verify order changed
    const titlesAfter = await getBookmarkTitles(page, 'drag-cat-1');
    // Alpha should have moved — either to position 2 or the order is different
    expect(titlesAfter).not.toEqual(titlesBefore);
  });

  test('drag cancel via Escape preserves original order', async ({ page }) => {
    await setupLocalMode(page);

    const titlesBefore = await getBookmarkTitles(page, 'drag-cat-1');

    const firstCatCards = page.locator('[data-category-id="drag-cat-1"] .bookmark-card:not(.add-bookmark)');
    const firstCard = firstCatCards.nth(0);
    const firstBox = await firstCard.boundingBox();
    if (!firstBox) return;

    const startX = firstBox.x + firstBox.width / 2;
    const startY = firstBox.y + firstBox.height / 2;

    // Start drag
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 10, startY, { steps: 3 });
    await page.mouse.move(startX + 100, startY + 100, { steps: 5 });

    // Cancel
    await page.keyboard.press('Escape');
    await page.mouse.up();

    await page.waitForTimeout(200);

    // Order should be unchanged
    const titlesAfter = await getBookmarkTitles(page, 'drag-cat-1');
    expect(titlesAfter).toEqual(titlesBefore);
  });
});

test.describe('Category drag reorder', () => {
  test('dragging first category handle past second reorders categories', async ({ page }) => {
    await setupLocalMode(page);

    const namesBefore = await getCategoryNames(page);
    expect(namesBefore[0]).toBe('Links');
    expect(namesBefore[1]).toBe('Second Category');

    const handles = page.locator('.category-drag-handle');
    const firstHandle = handles.nth(0);
    const secondHandle = handles.nth(1);
    const firstBox = await firstHandle.boundingBox();
    const secondBox = await secondHandle.boundingBox();
    if (!firstBox || !secondBox) return;

    const startX = firstBox.x + firstBox.width / 2;
    const startY = firstBox.y + firstBox.height / 2;
    // Drag well past the second category
    const endY = secondBox.y + secondBox.height + 40;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY + 10, { steps: 3 }); // past threshold
    await page.mouse.move(startX, endY, { steps: 15 });
    await page.mouse.up();

    await page.waitForTimeout(300);

    const namesAfter = await getCategoryNames(page);
    // Categories should have swapped
    expect(namesAfter).not.toEqual(namesBefore);
  });
});
