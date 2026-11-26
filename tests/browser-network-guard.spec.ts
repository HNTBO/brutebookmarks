import { test as plainTest } from '@playwright/test';
import { expect, test as guardedTest } from './fixtures/browser';

// A separate loopback origin is outside both the fixture allowlist and the
// Chromium proxy bypass. None of the probes needs a listening server.
const fetchURL = 'http://127.0.0.1:4174/unexpected-fetch';
const popupURL = 'http://127.0.0.1:4174/unexpected-popup';
const socketURL = 'ws://127.0.0.1:4174/unexpected-socket';

const test = guardedTest.extend<{ expectGuardFailure: (entry: string) => void }>({
  // Automatic setup precedes the lazy page/context fixtures. Its teardown
  // can inspect the owning test's errors after the real guard has run.
  expectGuardFailure: [async ({}, use, testInfo) => {
    let expectedEntry: string | undefined;
    await use(entry => { expectedEntry = entry; });
    expect(expectedEntry).toBeDefined();
    expect(testInfo.status).toBe('failed');
    expect(testInfo.errors).toHaveLength(1);
    const [error] = testInfo.errors;
    expect(error.message).toContain('Unexpected external browser requests');
    expect(error.message).toContain(JSON.stringify(expectedEntry));
    testInfo.fail(true, 'The guard reported the expected request during teardown');
  }, { auto: true }],
});

test('guard reports an unexpected fetch', async ({ page, expectGuardFailure }) => {
  expectGuardFailure(`GET ${fetchURL}`);
  await page.evaluate(url => fetch(url).catch(() => undefined), fetchURL);
});

test('guard reports an unexpected popup navigation', async ({ context, page, expectGuardFailure }) => {
  expectGuardFailure(`GET ${popupURL}`);
  const failedNavigation = context.waitForEvent('requestfailed', request =>
    request.url() === popupURL && request.isNavigationRequest());
  await page.evaluate(url => { window.open(url); }, popupURL);
  await failedNavigation;
});

test('guard reports an unexpected WebSocket', async ({ page, expectGuardFailure }) => {
  expectGuardFailure(`WebSocket ${socketURL}`);
  await page.evaluate(url => new Promise<void>(resolve => {
    new WebSocket(url).onclose = () => resolve();
  }), socketURL);
});

plainTest('the proxy alone blocks the same fetch', async ({ page }) => {
  const failedFetch = page.waitForEvent('requestfailed', request => request.url() === fetchURL);
  await page.evaluate(url => fetch(url).catch(() => undefined), fetchURL);
  expect((await failedFetch).failure()?.errorText).toBe('net::ERR_PROXY_CONNECTION_FAILED');
});
