import { BRIDGE_VERSION } from '../shared/bridge-types';
import type {
  BridgeLocalCategory,
  BridgeLocalQuickSave,
  BridgeMsgLocalPendingAck,
  BridgeMsgLocalPendingRequest,
  BridgeMsgLocalPendingResult,
  BridgeMsgLocalSaveNow,
  BridgeMsgLocalSnapshot,
  BridgeMsgRefreshNow,
  BridgeMsgRequestBookmarks,
  BridgeMsgBookmarksResult,
  BridgeMsgTheme,
} from '../shared/bridge-types';
import type { Category } from '../types';

let extensionInstalled = false;
let _detectionInitialized = false;
const EXTENSION_INSTALLED_EVENT = 'bb-extension-installed';
const LOCAL_QUICK_SAVE_EVENT = 'bb-local-quick-save';
const EXTENSION_REFRESH_EVENT = 'bb-extension-refresh';

export function initExtensionDetection(): void {
  if (_detectionInitialized) return;
  _detectionInitialized = true;
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    if (event.data?.type === 'BB_EXT_INSTALLED') {
      extensionInstalled = true;
      window.dispatchEvent(new CustomEvent(EXTENSION_INSTALLED_EVENT));
      return;
    }
    if (event.data?.type === 'BB_EXT_LOCAL_SAVE_NOW') {
      window.dispatchEvent(new CustomEvent(LOCAL_QUICK_SAVE_EVENT, {
        detail: (event.data as BridgeMsgLocalSaveNow).save,
      }));
      return;
    }
    if (event.data?.type === 'BB_EXT_REFRESH_NOW') {
      window.dispatchEvent(new CustomEvent(EXTENSION_REFRESH_EVENT, {
        detail: event.data as BridgeMsgRefreshNow,
      }));
    }
  });
}

export function isExtensionInstalled(): boolean {
  return extensionInstalled;
}

export function onExtensionInstalled(listener: () => void): () => void {
  window.addEventListener(EXTENSION_INSTALLED_EVENT, listener);
  return () => window.removeEventListener(EXTENSION_INSTALLED_EVENT, listener);
}

export function onLocalQuickSave(listener: (save: BridgeLocalQuickSave | null) => void): () => void {
  const handler = (event: Event) => {
    listener(event instanceof CustomEvent ? event.detail ?? null : null);
  };
  window.addEventListener(LOCAL_QUICK_SAVE_EVENT, handler);
  return () => window.removeEventListener(LOCAL_QUICK_SAVE_EVENT, handler);
}

export function onExtensionRefreshRequested(listener: () => void): () => void {
  window.addEventListener(EXTENSION_REFRESH_EVENT, listener);
  return () => window.removeEventListener(EXTENSION_REFRESH_EVENT, listener);
}

export function syncExtensionThemePreference(
  theme: BridgeMsgTheme['theme'],
  resolvedTheme: BridgeMsgTheme['resolvedTheme'],
  accentColorDark: string | null,
  accentColorLight: string | null,
): void {
  const msg: BridgeMsgTheme = {
    type: 'BB_EXT_THEME',
    v: BRIDGE_VERSION,
    theme,
    resolvedTheme,
    accentColorDark,
    accentColorLight,
  };
  window.postMessage(msg, window.location.origin);
}

export function syncExtensionLocalSnapshot(categories: Category[]): void {
  const bridgeCategories: BridgeLocalCategory[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    order: category.order,
    groupId: category.groupId,
    bookmarks: category.bookmarks.map((bookmark) => ({
      id: bookmark.id,
      title: bookmark.title,
      url: bookmark.url,
      iconPath: bookmark.iconPath,
      order: bookmark.order,
    })),
  }));
  const msg: BridgeMsgLocalSnapshot = {
    type: 'BB_EXT_LOCAL_SNAPSHOT',
    v: BRIDGE_VERSION,
    categories: bridgeCategories,
  };
  window.postMessage(msg, window.location.origin);
}

export function requestLocalQuickSaves(): Promise<BridgeLocalQuickSave[]> {
  return new Promise((resolve, reject) => {
    const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('Extension did not respond within 10 seconds.'));
    }, 10_000);

    function handler(event: MessageEvent<BridgeMsgLocalPendingResult>) {
      if (event.source !== window) return;
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'BB_EXT_LOCAL_PENDING_RESULT') return;
      if (event.data.requestId !== requestId) return;

      window.removeEventListener('message', handler as EventListener);
      clearTimeout(timeout);

      if (event.data.success) {
        resolve(event.data.saves ?? []);
      } else {
        reject(new Error(event.data.error || 'Failed to read local Quick Saves.'));
      }
    }

    window.addEventListener('message', handler as EventListener);
    const msg: BridgeMsgLocalPendingRequest = {
      type: 'BB_EXT_LOCAL_PENDING_REQUEST',
      v: BRIDGE_VERSION,
      requestId,
    };
    window.postMessage(msg, window.location.origin);
  });
}

export function ackLocalQuickSaves(ids: string[]): void {
  if (ids.length === 0) return;
  const msg: BridgeMsgLocalPendingAck = {
    type: 'BB_EXT_LOCAL_PENDING_ACK',
    v: BRIDGE_VERSION,
    ids,
  };
  window.postMessage(msg, window.location.origin);
}

export interface BookmarkTreeNode {
  id: string;
  title: string;
  url?: string;
  children?: BookmarkTreeNode[];
}

export function requestBrowserBookmarks(): Promise<BookmarkTreeNode[]> {
  return new Promise((resolve, reject) => {
    const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('Extension did not respond within 10 seconds.'));
    }, 10_000);

    function handler(event: MessageEvent) {
      if (event.source !== window) return;
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'BB_EXT_BOOKMARKS_RESULT') return;
      if (event.data.requestId !== requestId) return;

      window.removeEventListener('message', handler);
      clearTimeout(timeout);

      if (event.data.success) {
        resolve(event.data.bookmarks as BookmarkTreeNode[]);
      } else {
        reject(new Error(event.data.error || 'Failed to read browser bookmarks.'));
      }
    }

    window.addEventListener('message', handler);
    const msg: BridgeMsgRequestBookmarks = { type: 'BB_EXT_REQUEST_BOOKMARKS', v: BRIDGE_VERSION, requestId };
    window.postMessage(msg, window.location.origin);
  });
}
