/**
 * Background service worker.
 *
 * Listens for messages from the web app's content script to receive
 * auth tokens during the connection flow.
 */
import { storeToken, clearToken } from '../lib/auth';
import { getFreshChromiumConvexToken } from '../lib/chromium-clerk';

export default defineBackground(() => {
  // Listen for auth token from the web app (sent via content script)
  browser.runtime.onMessage.addListener(
    (message: { type: string; token?: string }, _sender, sendResponse) => {
      if (message.type === 'BB_GET_AUTH_TOKEN') {
        getFreshChromiumConvexToken()
          .then(async (token) => {
            if (token) {
              await storeToken(token);
            }
            sendResponse({ success: true, token });
          })
          .catch((err) => {
            console.error('[Background] Chromium auth refresh failed:', err);
            sendResponse({ success: false, token: null, error: String(err) });
          });
        return true;
      }

      if (message.type === 'BB_AUTH_TOKEN' && message.token) {
        storeToken(message.token).then(() => {
          sendResponse({ success: true });
        });
        return true; // async response
      }

      if (message.type === 'BB_DISCONNECT') {
        clearToken().then(() => {
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
