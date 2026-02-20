import { test, expect, Page } from '@playwright/test';

/**
 * Security verification test suite.
 * Migrated from tests/security-check.py to TypeScript Playwright.
 *
 * Runs against local dev server in local mode (no auth).
 */

async function setupLocalMode(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('appMode', 'local');
    localStorage.setItem('speedDialData', JSON.stringify([
      {
        id: 'sec-cat-1', name: 'Security Test', order: 1,
        bookmarks: [
          { id: 'sec-bm-1', title: 'Example', url: 'https://example.com', iconPath: null, order: 1 },
        ],
      },
    ]));
  });
  await page.goto('/');
  await page.waitForSelector('.category', { timeout: 10_000 });
}

test.describe('Security checks', () => {
  // --- 1. CSP violations ---
  test('no CSP violations on load', async ({ page }) => {
    const cspErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().toLowerCase().includes('content security policy')) {
        cspErrors.push(msg.text());
      }
    });

    await setupLocalMode(page);
    // Give async rendering time to surface any violations
    await page.waitForTimeout(2000);

    expect(cspErrors).toHaveLength(0);
  });

  // --- 2. Footer link security ---
  test('footer links have noopener and noreferrer', async ({ page }) => {
    await setupLocalMode(page);

    const links = await page.$$eval('footer a[target="_blank"]', (els) =>
      els.map((el) => ({
        href: el.getAttribute('href') ?? '',
        rel: el.getAttribute('rel') ?? '',
      })),
    );

    for (const link of links) {
      expect(link.rel, `Missing noopener on ${link.href}`).toContain('noopener');
      expect(link.rel, `Missing noreferrer on ${link.href}`).toContain('noreferrer');
    }
  });

  // --- 3. No inline event handlers ---
  test('no inline event handlers in DOM', async ({ page }) => {
    await setupLocalMode(page);

    const handlers = await page.evaluate(() => {
      const allElements = document.querySelectorAll('*');
      const found: { tag: string; attr: string; id: string }[] = [];
      const handlerAttrs = [
        'onclick', 'onerror', 'onload', 'onmouseover', 'onmouseout',
        'onchange', 'onsubmit', 'oninput', 'onfocus', 'onblur',
        'onkeydown', 'onkeyup', 'onkeypress',
      ];
      for (const el of allElements) {
        for (const attr of handlerAttrs) {
          if (el.hasAttribute(attr)) {
            found.push({ tag: el.tagName, attr, id: el.id || '' });
          }
        }
      }
      return found;
    });

    expect(handlers, `Found inline handlers: ${JSON.stringify(handlers)}`).toHaveLength(0);
  });

  // --- 4. Theme setup ---
  test('data-theme attribute is present', async ({ page }) => {
    await setupLocalMode(page);

    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    );
    expect(theme).toBeTruthy();
  });

  test('theme-init.js loaded as external script', async ({ page }) => {
    await setupLocalMode(page);

    const hasThemeScript = await page.$('script[src="/theme-init.js"]');
    expect(hasThemeScript).toBeTruthy();
  });

  test('no inline script blocks', async ({ page }) => {
    await setupLocalMode(page);

    const inlineScripts = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script:not([src])');
      return Array.from(scripts).map((s) => s.textContent?.substring(0, 50) ?? '');
    });

    expect(inlineScripts, `Found ${inlineScripts.length} inline scripts`).toHaveLength(0);
  });

  // --- 5. CSP meta tag ---
  test('CSP meta tag exists with required directives', async ({ page }) => {
    await setupLocalMode(page);

    const cspContent = await page.evaluate(() => {
      const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      return meta ? meta.getAttribute('content') : null;
    });

    expect(cspContent, 'CSP meta tag not found').toBeTruthy();

    if (cspContent) {
      expect(cspContent).toContain('script-src');
      expect(cspContent).toContain('img-src');
      expect(cspContent).toContain('connect-src');

      // script-src should not allow unsafe-inline
      const scriptSrc = cspContent.split('script-src')[1]?.split(';')[0] ?? '';
      expect(scriptSrc).not.toContain('unsafe-inline');
    }
  });
});
