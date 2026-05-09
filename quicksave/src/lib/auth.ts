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

export const TOKEN_KEY = 'bb_auth_token';
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

export function isConnected(token: string | null): boolean {
  if (!token || token.length === 0) return false;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1]));
    if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return false;
    return true;
  } catch {
    return false;
  }
}
