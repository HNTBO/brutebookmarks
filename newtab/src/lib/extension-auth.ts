import { clearToken, getAppUrl, getStoredToken, getTokenExpiry, isConnected, TOKEN_KEY } from './auth';
import {
  isChromiumClerkRefreshSupported,
  type ChromiumTokenFailureReason,
} from './chromium-clerk';

export type ExtensionAuthState = 'connected' | 'expired' | 'signed_out';

export interface ExtensionAuthSnapshot {
  state: ExtensionAuthState;
  token: string | null;
  expiresAt: number | null;
}

export interface ExtensionAuthAdapter {
  clearSession(): Promise<void>;
  getAuthState(): Promise<ExtensionAuthSnapshot>;
  getValidConvexToken(): Promise<string | null>;
  refreshConvexToken(): Promise<string | null>;
  getLastRefreshFailure(): ChromiumTokenFailureReason | null;
  requestFreshTokenFromApp(options?: RefreshTokenOptions): Promise<RefreshTokenResult>;
  subscribeToAuthChanges(listener: (snapshot: ExtensionAuthSnapshot) => void): () => void;
}

export interface RefreshTokenOptions {
  active?: boolean;
  timeoutMs?: number;
}

export type RefreshTokenResult =
  | { ok: true; token: string; snapshot: ExtensionAuthSnapshot }
  | { ok: false; reason: 'signed_out' | 'timed_out' | 'failed'; message: string };

const DEFAULT_REFRESH_TIMEOUT_MS = 15_000;
const TOKEN_MIN_VALIDITY_MS = 30_000;
let lastRefreshFailure: ChromiumTokenFailureReason | null = null;
let backgroundRefreshPromise: Promise<string | null> | null = null;

export async function getAuthState(): Promise<ExtensionAuthSnapshot> {
  const token = await getStoredToken();
  const expiresAt = getTokenExpiry(token);

  if (!token) {
    return { state: 'signed_out', token: null, expiresAt: null };
  }

  if (!isConnected(token, TOKEN_MIN_VALIDITY_MS)) {
    return { state: 'expired', token, expiresAt };
  }

  return { state: 'connected', token, expiresAt };
}

export async function getValidConvexToken(): Promise<string | null> {
  const snapshot = await getAuthState();
  if (snapshot.state === 'connected') return snapshot.token;

  return await refreshConvexToken();
}

export async function refreshConvexToken(): Promise<string | null> {
  if (backgroundRefreshPromise) return await backgroundRefreshPromise;
  backgroundRefreshPromise = requestFreshTokenFromBackground().finally(() => {
    backgroundRefreshPromise = null;
  });
  return await backgroundRefreshPromise;
}

export function getLastRefreshFailure(): ChromiumTokenFailureReason | null {
  return lastRefreshFailure;
}

export async function clearSession(): Promise<void> {
  await clearToken();
}

export function subscribeToAuthChanges(
  listener: (snapshot: ExtensionAuthSnapshot) => void,
): () => void {
  const onChanged = (changes: Record<string, Browser.storage.StorageChange>, areaName: string) => {
    if (areaName !== 'local') return;
    if (!changes[TOKEN_KEY]) return;
    void getAuthState().then(listener);
  };

  browser.storage.onChanged.addListener(onChanged);
  return () => browser.storage.onChanged.removeListener(onChanged);
}

export async function requestFreshTokenFromApp(
  options: RefreshTokenOptions = {},
): Promise<RefreshTokenResult> {
  const existing = await getValidConvexToken();
  if (existing) {
    const snapshot = await getAuthState();
    return { ok: true, token: existing, snapshot };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_REFRESH_TIMEOUT_MS;
  const openTabActive = options.active ?? false;
  const url = await getAppUrl();
  const tab = await browser.tabs.create({ url, active: openTabActive });

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve({
        ok: false,
        reason: 'timed_out',
        message: 'Reconnect timed out. Is the app open and signed in?',
      });
    }, timeoutMs);

    function cleanup() {
      browser.storage.onChanged.removeListener(onTokenChanged);
      clearTimeout(timeout);
      if (!openTabActive && tab.id) browser.tabs.remove(tab.id).catch(() => {});
    }

    function finish(result: RefreshTokenResult) {
      cleanup();
      resolve(result);
    }

    function onTokenChanged(changes: Record<string, Browser.storage.StorageChange>, areaName: string) {
      if (areaName !== 'local') return;
      const rawToken = changes[TOKEN_KEY]?.newValue;
      if (typeof rawToken !== 'string' || !isConnected(rawToken)) return;

      void getAuthState().then((snapshot) => {
        lastRefreshFailure = null;
        finish({ ok: true, token: rawToken, snapshot });
      });
    }

    browser.storage.onChanged.addListener(onTokenChanged);
  });
}

async function requestFreshTokenFromBackground(): Promise<string | null> {
  if (!isChromiumClerkRefreshSupported()) {
    lastRefreshFailure = import.meta.env.BROWSER === 'chrome' ? 'misconfigured' : 'signed_out';
    return null;
  }

  try {
    const response = await browser.runtime.sendMessage({
      type: 'BB_GET_AUTH_TOKEN',
    }) as {
      success?: boolean;
      token?: string | null;
      reason?: ChromiumTokenFailureReason;
    };

    if (typeof response?.token !== 'string' || !isConnected(response.token, TOKEN_MIN_VALIDITY_MS)) {
      lastRefreshFailure = response?.reason ?? 'transient';
      return null;
    }

    lastRefreshFailure = null;
    return response.token;
  } catch {
    lastRefreshFailure = typeof navigator !== 'undefined' && navigator.onLine === false
      ? 'offline'
      : 'transient';
    return null;
  }
}

export const extensionAuth: ExtensionAuthAdapter = {
  clearSession,
  getAuthState,
  getValidConvexToken,
  refreshConvexToken,
  getLastRefreshFailure,
  requestFreshTokenFromApp,
  subscribeToAuthChanges,
};
