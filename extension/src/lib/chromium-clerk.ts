const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const CLERK_FRONTEND_API = import.meta.env.VITE_CLERK_FRONTEND_API as string | undefined;
const CLERK_SYNC_HOST = import.meta.env.VITE_CLERK_SYNC_HOST as string | undefined;
const APP_ORIGIN = import.meta.env.VITE_APP_URL as string | undefined;
const IS_CHROMIUM_BUILD = import.meta.env.BROWSER === 'chrome';
const DEFAULT_APP_ORIGIN = 'https://brutebookmarks.com';

function decodeFrontendApiFromPublishableKey(key?: string): string | null {
  if (!key) return null;
  const encoded = key.split('_').slice(2).join('_');
  if (!encoded) return null;
  try {
    const decoded = atob(encoded).replace(/\$$/, '');
    if (!decoded) return null;
    return `https://${decoded}`;
  } catch {
    return null;
  }
}

function normalizeOrigin(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, '');
}

export function getClerkPublishableKey(): string | null {
  return normalizeOrigin(CLERK_PUBLISHABLE_KEY) ?? null;
}

export function getClerkFrontendApi(): string | null {
  const fromEnv = normalizeOrigin(CLERK_FRONTEND_API);
  if (fromEnv) return fromEnv;
  return decodeFrontendApiFromPublishableKey(CLERK_PUBLISHABLE_KEY);
}

export function getClerkSyncHost(): string | null {
  const fromEnv = normalizeOrigin(CLERK_SYNC_HOST);
  if (fromEnv) return fromEnv;
  return normalizeOrigin(APP_ORIGIN) ?? DEFAULT_APP_ORIGIN;
}

export function isChromiumClerkRefreshSupported(): boolean {
  return IS_CHROMIUM_BUILD && !!CLERK_PUBLISHABLE_KEY;
}

export async function getFreshChromiumConvexToken(): Promise<string | null> {
  if (!isChromiumClerkRefreshSupported()) return null;

  const publishableKey = getClerkPublishableKey();
  if (!publishableKey) return null;

  const { createClerkClient } = await import('@clerk/chrome-extension/client');
  const clerk = await createClerkClient({
    publishableKey,
    background: true,
    syncHost: getClerkSyncHost() ?? undefined,
  });

  if (!clerk.session) return null;
  return await clerk.session.getToken({ template: 'convex' });
}
