/**
 * Background service worker.
 *
 * Listens for messages from the web app's content script to receive
 * auth tokens during the connection flow.
 */
import { storeToken, clearToken } from '../lib/auth';
import { getFreshChromiumConvexToken } from '../lib/chromium-clerk';
import { updateActionIconForTheme, type ActionIconGlyph, type ActionIconTheme } from '../lib/action-icon';
import {
  ackPendingLocalQuickSaves,
  getLocalSnapshot,
  getPendingLocalQuickSaves,
  saveLocalBookmark,
  storeLocalSnapshot,
  type LocalCategory,
} from '../lib/local-quick-save';

const QUICK_SAVE_THEME_CACHE_KEY = 'bb_cached_theme';
const NEW_TAB_THEME_CACHE_KEY = 'bb_ntp_cached_theme';

function getActionIconConfig(): { cacheKey: string; glyph: ActionIconGlyph } | null {
  const name = browser.runtime.getManifest().name;
  if (name.includes('Quick Save')) {
    return { cacheKey: QUICK_SAVE_THEME_CACHE_KEY, glyph: 'quicksave' };
  }
  if (name.includes('New Tab')) {
    return { cacheKey: NEW_TAB_THEME_CACHE_KEY, glyph: 'newtab' };
  }
  return null;
}

async function applyCachedActionIcon(): Promise<void> {
  const config = getActionIconConfig();
  if (!config) return;
  try {
    const result = await browser.storage.local.get(config.cacheKey);
    const cached = result[config.cacheKey] as ActionIconTheme | undefined;
    if (cached) await updateActionIconForTheme(cached, config.glyph);
  } catch {
    // Non-critical: keep the packaged static icon.
  }
}

async function applyThemeMessage(theme: ActionIconTheme): Promise<void> {
  const config = getActionIconConfig();
  if (!config) return;
  await browser.storage.local.set({ [config.cacheKey]: theme });
  await updateActionIconForTheme(theme, config.glyph);
}

async function notifyOpenBruteBookmarksTabsOfLocalSave(): Promise<void> {
  const tabs = await browser.tabs.query({
    url: [
      'https://brutebookmarks.com/*',
      'https://www.brutebookmarks.com/*',
      'http://localhost:5173/*',
    ],
  });
  await Promise.all(tabs.map((tab) => {
    if (!tab.id) return Promise.resolve();
    return browser.tabs.sendMessage(tab.id, { type: 'BB_LOCAL_SAVED' }).catch(() => {});
  }));
}

export default defineBackground(() => {
  applyCachedActionIcon();
  browser.runtime.onStartup?.addListener(() => {
    applyCachedActionIcon();
  });
  browser.runtime.onInstalled?.addListener(() => {
    applyCachedActionIcon();
  });

  // Listen for auth token from the web app (sent via content script)
  browser.runtime.onMessage.addListener(
    (
      message: {
        type: string;
        token?: string;
        theme?: ActionIconTheme['theme'];
        resolvedTheme?: ActionIconTheme['resolvedTheme'];
        accentColorDark?: string | null;
        accentColorLight?: string | null;
        categories?: LocalCategory[];
        categoryId?: string;
        title?: string;
        url?: string;
        ids?: string[];
      },
      _sender,
      sendResponse,
    ) => {
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

      if (message.type === 'BB_THEME') {
        if (message.theme !== 'dark' && message.theme !== 'light' && message.theme !== 'auto') {
          sendResponse({ success: false, error: 'Invalid theme' });
          return true;
        }
        applyThemeMessage({
          theme: message.theme,
          resolvedTheme: message.resolvedTheme === 'dark' || message.resolvedTheme === 'light'
            ? message.resolvedTheme
            : undefined,
          accentColorDark: typeof message.accentColorDark === 'string' ? message.accentColorDark : null,
          accentColorLight: typeof message.accentColorLight === 'string' ? message.accentColorLight : null,
        })
          .then(() => sendResponse({ success: true }))
          .catch((err) => sendResponse({ success: false, error: String(err) }));
        return true;
      }

      if (message.type === 'BB_LOCAL_SNAPSHOT') {
        storeLocalSnapshot(Array.isArray(message.categories) ? message.categories : [])
          .then((snapshot) => sendResponse({ success: true, snapshot }))
          .catch((err) => sendResponse({ success: false, error: String(err) }));
        return true;
      }

      if (message.type === 'BB_LOCAL_GET_DATA') {
        Promise.all([getLocalSnapshot(), getPendingLocalQuickSaves()])
          .then(([snapshot, pending]) => sendResponse({ success: true, snapshot, pending }))
          .catch((err) => sendResponse({ success: false, error: String(err) }));
        return true;
      }

      if (message.type === 'BB_LOCAL_SAVE_BOOKMARK') {
        if (!message.categoryId || !message.title || !message.url) {
          sendResponse({ success: false, error: 'Missing bookmark data' });
          return true;
        }
        saveLocalBookmark(message.categoryId, message.title, message.url)
          .then(async (result) => {
            await notifyOpenBruteBookmarksTabsOfLocalSave();
            sendResponse({ success: true, ...result });
          })
          .catch((err) => sendResponse({ success: false, error: String(err) }));
        return true;
      }

      if (message.type === 'BB_LOCAL_GET_PENDING_SAVES') {
        getPendingLocalQuickSaves()
          .then((saves) => sendResponse({ success: true, saves }))
          .catch((err) => sendResponse({ success: false, error: String(err) }));
        return true;
      }

      if (message.type === 'BB_LOCAL_ACK_PENDING_SAVES') {
        ackPendingLocalQuickSaves(Array.isArray(message.ids) ? message.ids : [])
          .then(() => sendResponse({ success: true }))
          .catch((err) => sendResponse({ success: false, error: String(err) }));
        return true;
      }
    },
  );
});
