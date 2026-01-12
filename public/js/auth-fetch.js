/**
 * auth-fetch.js - Authenticated fetch wrapper for Bookmark Grid
 *
 * This module wraps the native fetch API to automatically include
 * Clerk authentication tokens in requests.
 *
 * Usage:
 *   // Replace fetch() with authFetch()
 *   const response = await authFetch('/api/data');
 *
 *   // Or override the global fetch (do this early in your app)
 *   enableAuthFetch();
 */

/**
 * Fetch wrapper that includes auth token in requests
 * Falls back to regular fetch if auth is not available
 */
async function authFetch(url, options = {}) {
  // Don't add auth to config endpoint (needed before auth is set up)
  const isConfigEndpoint = url === '/api/config';

  // Get auth token if available and not a public endpoint
  let token = null;
  if (!isConfigEndpoint && window.BookmarkAuth?.getAuthToken) {
    try {
      token = await window.BookmarkAuth.getAuthToken();
    } catch (err) {
      console.warn('[AuthFetch] Failed to get auth token:', err);
    }
  }

  // Build headers
  const headers = {
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Make the request
  const response = await fetch(url, {
    ...options,
    headers,
  });

  // Handle 401 Unauthorized - redirect to sign in
  if (response.status === 401 && !isConfigEndpoint) {
    console.warn('[AuthFetch] Received 401, user may need to sign in');
    // Optionally trigger sign-in flow
    if (window.BookmarkAuth?.requireAuth) {
      window.BookmarkAuth.requireAuth();
    }
  }

  return response;
}

/**
 * Override the global fetch function to use authFetch
 * Call this early in your application before any API calls
 */
function enableAuthFetch() {
  if (window._originalFetch) {
    console.warn('[AuthFetch] Already enabled');
    return;
  }

  window._originalFetch = window.fetch;
  window.fetch = authFetch;
  console.log('[AuthFetch] Global fetch override enabled');
}

/**
 * Restore the original fetch function
 */
function disableAuthFetch() {
  if (window._originalFetch) {
    window.fetch = window._originalFetch;
    delete window._originalFetch;
    console.log('[AuthFetch] Global fetch override disabled');
  }
}

// Export for use in other scripts
window.authFetch = authFetch;
window.enableAuthFetch = enableAuthFetch;
window.disableAuthFetch = disableAuthFetch;
