/**
 * Content script — runs on the BruteBookmarks website.
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
    function sendRuntimeMessage(message: unknown): void {
      browser.runtime.sendMessage(message).catch(() => {
        // The page may outlive an extension reload or service worker restart.
        // These bridge messages are retried by later page/theme/auth events.
      });
    }

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
        sendRuntimeMessage({
          type: 'BB_AUTH_TOKEN',
          token,
        });
        return;
      }

      // Disconnect relay (sign-out)
      if (event.data?.type === 'BB_EXT_DISCONNECT') {
        sendRuntimeMessage({ type: 'BB_DISCONNECT' });
        return;
      }

      if (event.data?.type === 'BB_EXT_THEME') {
        sendRuntimeMessage({
          type: 'BB_THEME',
          theme: event.data.theme,
          resolvedTheme: event.data.resolvedTheme,
          accentColorDark: event.data.accentColorDark,
          accentColorLight: event.data.accentColorLight,
        });
        return;
      }

      if (event.data?.type === 'BB_EXT_LOCAL_SNAPSHOT') {
        sendRuntimeMessage({
          type: 'BB_LOCAL_SNAPSHOT',
          categories: event.data.categories,
        });
        return;
      }

      if (event.data?.type === 'BB_EXT_LOCAL_PENDING_REQUEST') {
        const requestId = event.data.requestId;
        browser.runtime
          .sendMessage({ type: 'BB_LOCAL_GET_PENDING_SAVES' })
          .then((response) => {
            window.postMessage(
              { ...response, type: 'BB_EXT_LOCAL_PENDING_RESULT', requestId },
              window.location.origin,
            );
          })
          .catch((err) => {
            window.postMessage(
              { type: 'BB_EXT_LOCAL_PENDING_RESULT', requestId, success: false, error: String(err) },
              window.location.origin,
            );
          });
        return;
      }

      if (event.data?.type === 'BB_EXT_LOCAL_PENDING_ACK') {
        sendRuntimeMessage({
          type: 'BB_LOCAL_ACK_PENDING_SAVES',
          ids: event.data.ids,
        });
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
