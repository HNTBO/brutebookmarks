import { getAuthToken } from './clerk';

/**
 * Fetch wrapper that includes Clerk auth token in requests.
 * Falls back to regular fetch if auth is not available.
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const isConfigEndpoint = url === '/api/config';

  let token: string | null = null;
  if (!isConfigEndpoint) {
    try {
      token = await getAuthToken();
    } catch (err) {
      console.warn('[AuthFetch] Failed to get auth token:', err);
    }
  }

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401 && !isConfigEndpoint) {
    console.warn('[AuthFetch] Received 401, user may need to sign in');
  }

  return response;
}

/**
 * Override the global fetch to use authFetch.
 * Call early before any API calls.
 */
export function enableAuthFetch(): void {
  if ((window as any)._originalFetch) {
    console.warn('[AuthFetch] Already enabled');
    return;
  }

  (window as any)._originalFetch = window.fetch;
  (window as any).fetch = authFetch;
  console.log('[AuthFetch] Global fetch override enabled');
}

export function disableAuthFetch(): void {
  if ((window as any)._originalFetch) {
    window.fetch = (window as any)._originalFetch;
    delete (window as any)._originalFetch;
    console.log('[AuthFetch] Global fetch override disabled');
  }
}
