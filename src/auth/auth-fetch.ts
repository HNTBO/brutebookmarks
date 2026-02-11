import { getAuthToken } from './clerk';

// Saved reference to the real fetch — set before any override
let originalFetch: typeof window.fetch = window.fetch.bind(window);

/**
 * Fetch wrapper that injects Clerk auth token for our own /api/* endpoints.
 * All other requests (Clerk internal, Convex, external) pass through untouched.
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

  // Only inject auth for our own Express API routes
  const isOurApi = url.startsWith('/api/') || url.startsWith(window.location.origin + '/api/');
  const isConfigEndpoint = url === '/api/config' || url.endsWith('/api/config');

  if (!isOurApi || isConfigEndpoint) {
    return originalFetch(input, init);
  }

  let token: string | null = null;
  try {
    token = await getAuthToken();
  } catch (err) {
    console.warn('[AuthFetch] Failed to get auth token:', err);
  }

  const headers: Record<string, string> = {
    ...((init?.headers as Record<string, string>) ?? {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await originalFetch(input, { ...init, headers });

  if (response.status === 401) {
    console.warn('[AuthFetch] Received 401, user may need to sign in');
  }

  return response;
}

/**
 * Override the global fetch to use authFetch.
 */
export function enableAuthFetch(): void {
  if (window.fetch === authFetch) {
    console.warn('[AuthFetch] Already enabled');
    return;
  }

  originalFetch = window.fetch.bind(window);
  window.fetch = authFetch;
  console.log('[AuthFetch] Global fetch override enabled (only /api/* intercepted)');
}

export function disableAuthFetch(): void {
  if (window.fetch === authFetch) {
    window.fetch = originalFetch;
    console.log('[AuthFetch] Global fetch override disabled');
  }
}
