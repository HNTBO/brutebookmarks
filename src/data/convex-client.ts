import { ConvexClient } from 'convex/browser';

declare global {
  interface Window {
    __BB_MOCK_CONVEX_CLIENT__?: ConvexClient;
  }
}

let client: ConvexClient | null = null;

export function initConvexClient(): ConvexClient | null {
  if (import.meta.env.DEV && typeof window !== 'undefined' && window.__BB_MOCK_CONVEX_CLIENT__) {
    client = window.__BB_MOCK_CONVEX_CLIENT__;
    return client;
  }

  const url = import.meta.env.VITE_CONVEX_URL;
  if (!url) {
    console.log('[Convex] No VITE_CONVEX_URL configured - skipping Convex init');
    return null;
  }

  client = new ConvexClient(url);
  console.log('[Convex] Client initialized, connecting to:', url);
  return client;
}

export function getConvexClient(): ConvexClient | null {
  return client;
}

/**
 * Wire Clerk authentication into the Convex client.
 * Call after both Clerk and Convex are initialized.
 */
export function setConvexAuth(getToken: () => Promise<string | null>): void {
  if (!client) return;

  client.setAuth(async () => {
    const token = await getToken();
    return token ?? undefined;
  });

  console.log('[Convex] Auth wired to Clerk');
}
