import { clearToken, getAppUrl, getStoredToken, isConnected, TOKEN_KEY } from './auth';

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

export async function getAuthState(): Promise<ExtensionAuthSnapshot> {
  const token = await getStoredToken();
  const expiresAt = getTokenExpiry(token);

  if (!token) {
    return { state: 'signed_out', token: null, expiresAt: null };
  }

  if (!isConnected(token)) {
    return { state: 'expired', token, expiresAt };
  }

  return { state: 'connected', token, expiresAt };
}

export async function getValidConvexToken(): Promise<string | null> {
  const snapshot = await getAuthState();
  return snapshot.state === 'connected' ? snapshot.token : null;
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
        finish({ ok: true, token: rawToken, snapshot });
      });
    }

    browser.storage.onChanged.addListener(onTokenChanged);
  });
}

function getTokenExpiry(token: string | null): number | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export const extensionAuth: ExtensionAuthAdapter = {
  clearSession,
  getAuthState,
  getValidConvexToken,
  requestFreshTokenFromApp,
  subscribeToAuthChanges,
};
