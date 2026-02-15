/**
 * Background service worker.
 *
 * Listens for messages from the web app's content script to receive
 * auth tokens during the connection flow.
 */
export default defineBackground(() => {
  // Listen for auth token from the web app (sent via content script)
  browser.runtime.onMessage.addListener(
    (message: { type: string; token?: string }, _sender, sendResponse) => {
      if (message.type === 'BB_AUTH_TOKEN' && message.token) {
        browser.storage.local.set({ bb_auth_token: message.token }).then(() => {
          sendResponse({ success: true });
        });
        return true; // async response
      }

      if (message.type === 'BB_DISCONNECT') {
        browser.storage.local.remove('bb_auth_token').then(() => {
          sendResponse({ success: true });
        });
        return true;
      }

      if (message.type === 'BB_REQUEST_BOOKMARKS') {
        browser.bookmarks
          .getTree()
          .then((tree) => {
            sendResponse({ success: true, bookmarks: tree });
          })
          .catch((err) => {
            sendResponse({ success: false, error: String(err) });
          });
        return true; // async response
      }
    },
  );
});
