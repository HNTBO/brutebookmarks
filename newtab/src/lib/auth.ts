/**
 * Auth module for the browser extension.
 *
 * Chromium obtains fresh Convex tokens from Clerk in the background. Storage is
 * only a short-lived cache; the BruteBookmarks website bridge remains a fallback
 * for unsupported browsers and explicit recovery flows.
 */

export const TOKEN_KEY = 'bb_auth_token';
const APP_URL_KEY = 'bb_app_url';

export async function getStoredToken(): Promise<string | null> {
  const result = await browser.storage.local.get(TOKEN_KEY);
  const token = result[TOKEN_KEY];
  return typeof token === 'string' ? token : null;
}

export async function storeToken(token: string): Promise<void> {
  await browser.storage.local.set({ [TOKEN_KEY]: token });
}

export async function clearToken(): Promise<void> {
  await browser.storage.local.remove(TOKEN_KEY);
}

export async function getAppUrl(): Promise<string> {
  const result = await browser.storage.local.get(APP_URL_KEY);
  const appUrl = result[APP_URL_KEY];
  return typeof appUrl === 'string' ? appUrl : 'https://brutebookmarks.com';
}

export function getTokenExpiry(token: string | null): number | null {
  if (!token || token.length === 0) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isConnected(token: string | null, minValidityMs = 0): boolean {
  if (!token || token.length === 0) return false;
  const expiresAt = getTokenExpiry(token);
  return expiresAt !== null && expiresAt > Date.now() + minValidityMs;
}
