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

/** Union of all page ↔ content script messages */
export type BridgeMessage =
  | BridgeMsgInstalled
  | BridgeMsgAuth
  | BridgeMsgRequestBookmarks
  | BridgeMsgBookmarksResult
  | BridgeMsgRequestToken
  | BridgeMsgDisconnect;

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

/** Union of all runtime messages */
export type RuntimeMessage =
  | RuntimeMsgAuthToken
  | RuntimeMsgDisconnect
  | RuntimeMsgRequestBookmarks;
