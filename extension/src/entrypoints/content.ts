/**
 * Content script — runs on the Brute Bookmarks website.
 *
 * Listens for auth token messages from the main app (posted via window.postMessage)
 * and relays them to the extension's background worker for storage.
 *
 * This is the "auth bridge" — when the user visits BB while logged in,
 * the main app automatically sends a fresh Convex JWT to the extension.
 */
const prodMatches = ['*://*.brutebookmarks.com/*'];
const devMatches = [...prodMatches, 'http://localhost:5173/*'];

export default defineContentScript({
  matches: import.meta.env.MODE === 'development' ? devMatches : prodMatches,
  runAt: 'document_idle',

  main() {
    // Tell the page the extension is installed
    window.postMessage({ type: 'BB_EXT_INSTALLED' }, window.location.origin);

    // Listen for messages from the main app
    const ALLOWED_ORIGINS = import.meta.env.MODE === 'development'
      ? ['https://brutebookmarks.com', 'https://www.brutebookmarks.com', 'http://localhost:5173']
      : ['https://brutebookmarks.com', 'https://www.brutebookmarks.com'];
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (!ALLOWED_ORIGINS.includes(event.origin)) return;

      // Auth token relay
      if (event.data?.type === 'BB_EXT_AUTH') {
        const token = event.data.token as string;
        if (!token) return;
        browser.runtime.sendMessage({
          type: 'BB_AUTH_TOKEN',
          token,
        });
        return;
      }

      // Disconnect relay (sign-out)
      if (event.data?.type === 'BB_EXT_DISCONNECT') {
        browser.runtime.sendMessage({ type: 'BB_DISCONNECT' });
        return;
      }

      // Browser bookmarks request relay
      if (event.data?.type === 'BB_EXT_REQUEST_BOOKMARKS') {
        const requestId = event.data.requestId;
        browser.runtime
          .sendMessage({ type: 'BB_REQUEST_BOOKMARKS' })
          .then((response) => {
            window.postMessage(
              { ...response, type: 'BB_EXT_BOOKMARKS_RESULT', requestId },
              window.location.origin,
            );
          })
          .catch((err) => {
            window.postMessage(
              { type: 'BB_EXT_BOOKMARKS_RESULT', requestId, success: false, error: String(err) },
              window.location.origin,
            );
          });
      }
    });

    // Request a fresh token periodically (every 30 min while tab is open)
    function requestToken() {
      window.postMessage({ type: 'BB_EXT_REQUEST_TOKEN' }, window.location.origin);
    }

    requestToken();
    setInterval(requestToken, 30 * 60 * 1000);
  },
});
