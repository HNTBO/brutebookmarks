/**
 * Content script — runs on the Brute Bookmarks website.
 *
 * Listens for auth token messages from the main app (posted via window.postMessage)
 * and relays them to the extension's background worker for storage.
 *
 * This is the "auth bridge" — when the user visits BB while logged in,
 * the main app automatically sends a fresh Convex JWT to the extension.
 */
export default defineContentScript({
  matches: ['*://*.brutebookmarks.com/*', 'http://localhost:5173/*'],
  runAt: 'document_idle',

  main() {
    // Tell the page the extension is installed
    window.postMessage({ type: 'BB_EXT_INSTALLED' }, window.location.origin);

    // Listen for token from the main app
    const ALLOWED_ORIGINS = ['https://brutebookmarks.com', 'https://www.brutebookmarks.com', 'http://localhost:5173'];
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (!ALLOWED_ORIGINS.includes(event.origin)) return;
      if (event.data?.type !== 'BB_EXT_AUTH') return;

      const token = event.data.token as string;
      if (!token) return;

      // Relay to background worker
      browser.runtime.sendMessage({
        type: 'BB_AUTH_TOKEN',
        token,
      });
    });

    // Request a fresh token periodically (every 30 min while tab is open)
    function requestToken() {
      window.postMessage({ type: 'BB_EXT_REQUEST_TOKEN' }, window.location.origin);
    }

    requestToken();
    setInterval(requestToken, 30 * 60 * 1000);
  },
});
