/**
 * Auth module for the browser extension.
 *
 * Strategy: The extension opens a tab to the Brute Bookmarks web app
 * where the user is already logged in via Clerk. A dedicated /connect-extension
 * page on the web app generates a long-lived Clerk session token and passes
 * it back to the extension via chrome.runtime.sendMessage (using a content script
 * on the BB domain).
 *
 * For now, we store the token in chrome.storage.local and re-use it until
 * it expires or the user disconnects.
 */

const TOKEN_KEY = 'bb_auth_token';
const APP_URL_KEY = 'bb_app_url';

export async function getStoredToken(): Promise<string | null> {
  const result = await browser.storage.local.get(TOKEN_KEY);
  return result[TOKEN_KEY] ?? null;
}

export async function storeToken(token: string): Promise<void> {
  await browser.storage.local.set({ [TOKEN_KEY]: token });
}

export async function clearToken(): Promise<void> {
  await browser.storage.local.remove(TOKEN_KEY);
}

export async function getAppUrl(): Promise<string> {
  const result = await browser.storage.local.get(APP_URL_KEY);
  return result[APP_URL_KEY] ?? 'https://brutebookmarks.com';
}

export async function storeAppUrl(url: string): Promise<void> {
  await browser.storage.local.set({ [APP_URL_KEY]: url });
}

export function isConnected(token: string | null): boolean {
  return token !== null && token.length > 0;
}
