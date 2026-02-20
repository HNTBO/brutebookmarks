import { test, expect, type Page } from '@playwright/test';

type LocalCategorySeed = Array<{
  id: string;
  name: string;
  order: number;
  bookmarks: Array<{
    id: string;
    title: string;
    url: string;
    iconPath: string | null;
    order: number;
  }>;
}>;

type WatermarkResponse =
  | { source: 'watermark'; revision: number; updatedAt: number }
  | { source: 'legacyDigest'; digest: string; revision: number; updatedAt: number }
  | null;

interface StartupScenario {
  localData: LocalCategorySeed | null;
  localGroups: Array<{ id: string; name: string; order: number }>;
  localMeta: {
    version: 1;
    cachedAt: number;
    snapshotDigest: string;
    watermarkRevision?: number;
    watermarkUpdatedAt?: number;
  } | null;
  watermarkResponse: WatermarkResponse;
  watermarkDelayMs: number;
  emitLiveData: boolean;
  liveDelayMs: number;
  live: {
    categories: Array<{ _id: string; name: string; order: number; groupId?: string | null }>;
    bookmarks: Array<{ _id: string; title: string; url: string; iconPath?: string | null; order: number; categoryId: string }>;
    tabGroups: Array<{ _id: string; name: string; order: number }>;
  };
}

async function setupSyncStartupScenario(page: Page, scenario: StartupScenario): Promise<void> {
  await page.addInitScript((args: StartupScenario) => {
    localStorage.setItem('appMode', 'sync');

    if (args.localData) {
      localStorage.setItem('speedDialData', JSON.stringify(args.localData));
    } else {
      localStorage.removeItem('speedDialData');
    }

    localStorage.setItem('speedDialTabGroups', JSON.stringify(args.localGroups));

    if (args.localMeta) {
      localStorage.setItem('speedDialSnapshotMeta', JSON.stringify(args.localMeta));
    } else {
      localStorage.removeItem('speedDialSnapshotMeta');
    }

    (window as any).__BB_MOCK_CLERK__ = {
      user: {
        id: 'u_test',
        hasImage: true,
        primaryEmailAddress: { emailAddress: 'startup@test.local' },
      },
      session: {
        getToken: async () => null,
      },
      load: async () => {},
      addListener: () => () => {},
      mountUserButton: (el: HTMLElement) => {
        el.innerHTML = '<button data-testid="mock-user">U</button>';
      },
      mountSignIn: () => {},
    };

    let subscriptionIndex = 0;
    (window as any).__BB_MOCK_CONVEX_CLIENT__ = {
      setAuth: () => {},
      query: async () => {
        if (args.watermarkDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, args.watermarkDelayMs));
        }
        return args.watermarkResponse;
      },
      mutation: async () => null,
      onUpdate: (_ref: unknown, _queryArgs: unknown, callback: (value: unknown) => void) => {
        subscriptionIndex += 1;
        const current = subscriptionIndex;
        if (!args.emitLiveData) {
          return () => {};
        }

        const timer = window.setTimeout(() => {
          // Activation order in store.ts:
          // 1 categories, 2 tabGroups, 3 bookmarks, 4 syncMeta, 5 preferences
          if (current === 1) callback(args.live.categories);
          if (current === 2) callback(args.live.tabGroups);
          if (current === 3) callback(args.live.bookmarks);
          if (current === 4 && args.watermarkResponse?.source === 'watermark') callback(args.watermarkResponse);
          if (current === 5) callback(null);
        }, args.liveDelayMs);

        return () => {
          clearTimeout(timer);
        };
      },
    };
  }, scenario);
}

async function getStartupMeasureNames(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    performance
      .getEntriesByType('measure')
      .map((m) => m.name)
      .filter((name) => name.startsWith('bb:start:')),
  );
}

test.describe('Sync startup behavior', () => {
  test('renders cache immediately when watermark matches', async ({ page }) => {
    await setupSyncStartupScenario(page, {
      localData: [
        {
          id: 'c-local',
          name: 'Cache Local',
          order: 1,
          bookmarks: [
            { id: 'b-local', title: 'Local Bookmark', url: 'https://local.example', iconPath: null, order: 1 },
          ],
        },
      ],
      localGroups: [],
      localMeta: {
        version: 1,
        cachedAt: Date.now(),
        snapshotDigest: 'digest-local',
        watermarkRevision: 7,
        watermarkUpdatedAt: Date.now(),
      },
      watermarkResponse: { source: 'watermark', revision: 7, updatedAt: Date.now() },
      watermarkDelayMs: 20,
      emitLiveData: true,
      liveDelayMs: 700,
      live: {
        categories: [{ _id: 'c-live', name: 'Live Remote', order: 1 }],
        bookmarks: [{ _id: 'b-live', title: 'Remote Bookmark', url: 'https://remote.example', order: 1, categoryId: 'c-live' }],
        tabGroups: [],
      },
    });

    await page.goto('/');

    await expect(page.locator('.category-title', { hasText: 'Cache Local' })).toBeVisible({ timeout: 600 });
    await expect(page.locator('.startup-shell-group')).toHaveCount(0);

    await page.waitForTimeout(800);
    await expect(page.locator('.category-title', { hasText: 'Live Remote' })).toBeVisible();

    const measureNames = await getStartupMeasureNames(page);
    expect(measureNames).toContain('bb:start:time-to-cache-render');
  });

  test('mismatch never flashes stale local cache; shell stays until live data', async ({ page }) => {
    await setupSyncStartupScenario(page, {
      localData: [
        {
          id: 'c-stale',
          name: 'Stale Local',
          order: 1,
          bookmarks: [
            { id: 'b-stale', title: 'Stale Bookmark', url: 'https://stale.example', iconPath: null, order: 1 },
          ],
        },
      ],
      localGroups: [],
      localMeta: {
        version: 1,
        cachedAt: Date.now(),
        snapshotDigest: 'digest-stale',
        watermarkRevision: 1,
      },
      watermarkResponse: { source: 'watermark', revision: 2, updatedAt: Date.now() },
      watermarkDelayMs: 30,
      emitLiveData: true,
      liveDelayMs: 450,
      live: {
        categories: [{ _id: 'c-fresh', name: 'Fresh Remote', order: 1 }],
        bookmarks: [{ _id: 'b-fresh', title: 'Fresh Bookmark', url: 'https://fresh.example', order: 1, categoryId: 'c-fresh' }],
        tabGroups: [],
      },
    });

    await page.goto('/');

    await expect(page.locator('#categories-container.startup-loading')).toBeVisible();
    await expect(page.locator('.category-title', { hasText: 'Stale Local' })).toHaveCount(0);
    await expect(page.locator('.category-title', { hasText: 'Fresh Remote' })).toBeVisible({ timeout: 2000 });

    const measureNames = await getStartupMeasureNames(page);
    expect(measureNames).not.toContain('bb:start:time-to-cache-render');
  });

  test('cold sync (no local cache) shows shell then hydrates live data', async ({ page }) => {
    await setupSyncStartupScenario(page, {
      localData: null,
      localGroups: [],
      localMeta: null,
      watermarkResponse: { source: 'watermark', revision: 10, updatedAt: Date.now() },
      watermarkDelayMs: 20,
      emitLiveData: true,
      liveDelayMs: 300,
      live: {
        categories: [{ _id: 'c-cold', name: 'Cold Sync Remote', order: 1 }],
        bookmarks: [{ _id: 'b-cold', title: 'Cold Bookmark', url: 'https://cold.example', order: 1, categoryId: 'c-cold' }],
        tabGroups: [],
      },
    });

    await page.goto('/');

    await expect(page.locator('#categories-container.startup-loading')).toBeVisible();
    await expect(page.locator('.category-title', { hasText: 'Cold Sync Remote' })).toBeVisible({ timeout: 2000 });
  });

  test('watermark timeout keeps non-blank shell when live data is unavailable', async ({ page }) => {
    await setupSyncStartupScenario(page, {
      localData: [
        {
          id: 'c-timeout',
          name: 'Timeout Local',
          order: 1,
          bookmarks: [
            { id: 'b-timeout', title: 'Timeout Bookmark', url: 'https://timeout.example', iconPath: null, order: 1 },
          ],
        },
      ],
      localGroups: [],
      localMeta: {
        version: 1,
        cachedAt: Date.now(),
        snapshotDigest: 'digest-timeout',
        watermarkRevision: 3,
      },
      watermarkResponse: { source: 'watermark', revision: 3, updatedAt: Date.now() },
      watermarkDelayMs: 2000,
      emitLiveData: false,
      liveDelayMs: 0,
      live: { categories: [], bookmarks: [], tabGroups: [] },
    });

    await page.goto('/');

    await page.waitForTimeout(900);
    await expect(page.locator('#categories-container.startup-loading')).toBeVisible();
    await expect(page.locator('.startup-shell-group')).toHaveCount(2);
    await expect(page.locator('.category-title')).toHaveCount(0);
  });
});
