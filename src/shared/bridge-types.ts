/**
 * Shared message types for the extension bridge protocol.
 *
 * Used by:
 * - Main app (src/utils/extension-bridge.ts, src/auth/clerk.ts)
 * - Extension content script (extension/src/entrypoints/content.ts)
 * - Extension background worker (extension/src/entrypoints/background.ts)
 */

export const BRIDGE_VERSION = 1;

// --- Page ↔ Content Script (window.postMessage) ---

/** Content script → Page: extension is installed */
export interface BridgeMsgInstalled {
  type: 'BB_EXT_INSTALLED';
  v: typeof BRIDGE_VERSION;
}

/** Page → Content script: send auth token */
export interface BridgeMsgAuth {
  type: 'BB_EXT_AUTH';
  v: typeof BRIDGE_VERSION;
  token: string;
}

/** Page → Content script: request browser bookmarks */
export interface BridgeMsgRequestBookmarks {
  type: 'BB_EXT_REQUEST_BOOKMARKS';
  v: typeof BRIDGE_VERSION;
  requestId: string;
}

/** Content script → Page: browser bookmarks result */
export interface BridgeMsgBookmarksResult {
  type: 'BB_EXT_BOOKMARKS_RESULT';
  v: typeof BRIDGE_VERSION;
  requestId: string;
  success: boolean;
  bookmarks?: unknown[];
  error?: string;
}

/** Page → Content script: request fresh token */
export interface BridgeMsgRequestToken {
  type: 'BB_EXT_REQUEST_TOKEN';
  v: typeof BRIDGE_VERSION;
}

/** Page → Content script: disconnect (sign out) */
export interface BridgeMsgDisconnect {
  type: 'BB_EXT_DISCONNECT';
  v: typeof BRIDGE_VERSION;
}

/** Page → Content script: current theme/accent preferences */
export interface BridgeMsgTheme {
  type: 'BB_EXT_THEME';
  v: typeof BRIDGE_VERSION;
  theme: 'dark' | 'light' | 'auto';
  resolvedTheme: 'dark' | 'light';
  accentColorDark: string | null;
  accentColorLight: string | null;
}

export interface BridgeLocalBookmark {
  id: string;
  title: string;
  url: string;
  iconPath?: string | null;
  order?: number;
}

export interface BridgeLocalCategory {
  id: string;
  name: string;
  order?: number;
  groupId?: string;
  bookmarks: BridgeLocalBookmark[];
}

export interface BridgeLocalQuickSave {
  id: string;
  categoryId: string;
  title: string;
  url: string;
  createdAt: number;
}

/** Page → Content script: publish local-mode categories to the extension. */
export interface BridgeMsgLocalSnapshot {
  type: 'BB_EXT_LOCAL_SNAPSHOT';
  v: typeof BRIDGE_VERSION;
  categories: BridgeLocalCategory[];
}

/** Page → Content script: ask extension for queued local Quick Saves. */
export interface BridgeMsgLocalPendingRequest {
  type: 'BB_EXT_LOCAL_PENDING_REQUEST';
  v: typeof BRIDGE_VERSION;
  requestId: string;
}

/** Content script → Page: queued local Quick Saves. */
export interface BridgeMsgLocalPendingResult {
  type: 'BB_EXT_LOCAL_PENDING_RESULT';
  v: typeof BRIDGE_VERSION;
  requestId: string;
  success: boolean;
  saves?: BridgeLocalQuickSave[];
  error?: string;
}

/** Page → Content script: acknowledge queued saves merged into local data. */
export interface BridgeMsgLocalPendingAck {
  type: 'BB_EXT_LOCAL_PENDING_ACK';
  v: typeof BRIDGE_VERSION;
  ids: string[];
}

/** Content script → Page: a local Quick Save was just created. */
export interface BridgeMsgLocalSaveNow {
  type: 'BB_EXT_LOCAL_SAVE_NOW';
  v: typeof BRIDGE_VERSION;
  save: BridgeLocalQuickSave;
}

/** Content script → Page: extension asks the app tab to refresh its data/UI. */
export interface BridgeMsgRefreshNow {
  type: 'BB_EXT_REFRESH_NOW';
  v: typeof BRIDGE_VERSION;
}

/** Union of all page ↔ content script messages */
export type BridgeMessage =
  | BridgeMsgInstalled
  | BridgeMsgAuth
  | BridgeMsgRequestBookmarks
  | BridgeMsgBookmarksResult
  | BridgeMsgRequestToken
  | BridgeMsgDisconnect
  | BridgeMsgTheme
  | BridgeMsgLocalSnapshot
  | BridgeMsgLocalPendingRequest
  | BridgeMsgLocalPendingResult
  | BridgeMsgLocalPendingAck
  | BridgeMsgLocalSaveNow
  | BridgeMsgRefreshNow;

// --- Content Script ↔ Background (runtime.sendMessage) ---

/** Content script → Background: store auth token */
export interface RuntimeMsgAuthToken {
  type: 'BB_AUTH_TOKEN';
  token: string;
}

/** Content script → Background: disconnect */
export interface RuntimeMsgDisconnect {
  type: 'BB_DISCONNECT';
}

/** Content script → Background: get browser bookmarks */
export interface RuntimeMsgRequestBookmarks {
  type: 'BB_REQUEST_BOOKMARKS';
}

/** Popup/background auth refresh request */
export interface RuntimeMsgGetAuthToken {
  type: 'BB_GET_AUTH_TOKEN';
}

/** Content script → Background: current theme/accent preferences */
export interface RuntimeMsgTheme {
  type: 'BB_THEME';
  theme: 'dark' | 'light' | 'auto';
  resolvedTheme: 'dark' | 'light';
  accentColorDark: string | null;
  accentColorLight: string | null;
}

export interface RuntimeMsgLocalSnapshot {
  type: 'BB_LOCAL_SNAPSHOT';
  categories: BridgeLocalCategory[];
}

export interface RuntimeMsgLocalGetData {
  type: 'BB_LOCAL_GET_DATA';
}

export interface RuntimeMsgLocalSaveBookmark {
  type: 'BB_LOCAL_SAVE_BOOKMARK';
  categoryId: string;
  title: string;
  url: string;
}

export interface RuntimeMsgLocalGetPendingSaves {
  type: 'BB_LOCAL_GET_PENDING_SAVES';
}

export interface RuntimeMsgLocalAckPendingSaves {
  type: 'BB_LOCAL_ACK_PENDING_SAVES';
  ids: string[];
}

export interface RuntimeMsgRefreshOpenTabs {
  type: 'BB_REFRESH_OPEN_TABS';
}

/** Union of all runtime messages */
export type RuntimeMessage =
  | RuntimeMsgAuthToken
  | RuntimeMsgDisconnect
  | RuntimeMsgRequestBookmarks
  | RuntimeMsgGetAuthToken
  | RuntimeMsgTheme
  | RuntimeMsgLocalSnapshot
  | RuntimeMsgLocalGetData
  | RuntimeMsgLocalSaveBookmark
  | RuntimeMsgLocalGetPendingSaves
  | RuntimeMsgLocalAckPendingSaves
  | RuntimeMsgRefreshOpenTabs;
