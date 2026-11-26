import { test as base, expect } from '@playwright/test';

const fontStyles = 'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Outfit:wght@100;300;400;500;600;700&display=swap';
const clerkPreload = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5.122.1/dist/clerk.browser.js';
const icon = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#357"/></svg>';

export const test = base.extend({
  context: async ({ context, baseURL }, use) => {
    const unexpected: string[] = [];
    const origin = new URL(baseURL!).origin;
    // Chromium follows redirects without invoking the route handler again.
    // The launch proxy blocks external hops, and the request event reports them.
    context.on('request', request => {
      if (request.redirectedFrom() && new URL(request.url()).origin !== origin) {
        unexpected.push(`Redirect to ${request.url()}`);
      }
    });
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin === origin) return route.continue();

      if (request.method() === 'GET') {
        if (url.href === 'https://google.com/' && request.isNavigationRequest()) {
          return route.fulfill({ contentType: 'text/html', body: '<title>Google bookmark fixture</title>' });
        }
        if (url.origin === 'https://www.google.com' && url.pathname === '/s2/favicons' && request.resourceType() === 'image') {
          return route.fulfill({ contentType: 'image/svg+xml', body: icon });
        }
        if (url.href === fontStyles && request.resourceType() === 'stylesheet') {
          return route.fulfill({ contentType: 'text/css', body: '@font-face{font-family:Outfit;src:local(Arial)}' });
        }
        if (url.href === clerkPreload && request.resourceType() === 'script') {
          return route.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: '' });
        }
      }
      unexpected.push(`${request.method()} ${url.href}`);
      await route.abort('blockedbyclient');
    });
    const viteSocketOrigin = origin.replace(/^http/, 'ws');
    await context.routeWebSocket(url => url.origin !== viteSocketOrigin, socket => {
      unexpected.push(`WebSocket ${socket.url()}`);
      socket.close();
    });
    await use(context);
    expect(unexpected, 'Unexpected external browser requests').toEqual([]);
  },
});

export { expect };
export type { Page } from '@playwright/test';
