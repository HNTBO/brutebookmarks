import { describe, it, expect } from 'vitest';
import {
  BRIDGE_VERSION,
  type BridgeMessage,
  type RuntimeMessage,
  type BridgeMsgInstalled,
  type BridgeMsgAuth,
  type BridgeMsgRequestBookmarks,
  type BridgeMsgBookmarksResult,
  type BridgeMsgRequestToken,
  type BridgeMsgDisconnect,
  type RuntimeMsgAuthToken,
  type RuntimeMsgDisconnect,
  type RuntimeMsgRequestBookmarks,
} from '../../src/shared/bridge-types';

// --- Helpers ---

/** Type guard for BridgeMessage — checks that the object has a valid bridge type + version. */
function isBridgeMessage(msg: unknown): msg is BridgeMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (m.v !== BRIDGE_VERSION) return false;
  const validTypes = [
    'BB_EXT_INSTALLED',
    'BB_EXT_AUTH',
    'BB_EXT_REQUEST_BOOKMARKS',
    'BB_EXT_BOOKMARKS_RESULT',
    'BB_EXT_REQUEST_TOKEN',
    'BB_EXT_DISCONNECT',
  ];
  return validTypes.includes(m.type as string);
}

/** Type guard for RuntimeMessage — checks valid runtime type. */
function isRuntimeMessage(msg: unknown): msg is RuntimeMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  const validTypes = ['BB_AUTH_TOKEN', 'BB_DISCONNECT', 'BB_REQUEST_BOOKMARKS'];
  return validTypes.includes(m.type as string);
}

// --- Tests ---

describe('bridge-types', () => {
  it('BRIDGE_VERSION is 1', () => {
    expect(BRIDGE_VERSION).toBe(1);
  });

  describe('BridgeMessage type guards', () => {
    it('accepts valid BB_EXT_INSTALLED message', () => {
      const msg: BridgeMsgInstalled = { type: 'BB_EXT_INSTALLED', v: BRIDGE_VERSION };
      expect(isBridgeMessage(msg)).toBe(true);
    });

    it('accepts valid BB_EXT_AUTH message', () => {
      const msg: BridgeMsgAuth = { type: 'BB_EXT_AUTH', v: BRIDGE_VERSION, token: 'jwt-abc' };
      expect(isBridgeMessage(msg)).toBe(true);
      expect(msg.token).toBe('jwt-abc');
    });

    it('accepts valid BB_EXT_REQUEST_BOOKMARKS message', () => {
      const msg: BridgeMsgRequestBookmarks = {
        type: 'BB_EXT_REQUEST_BOOKMARKS',
        v: BRIDGE_VERSION,
        requestId: 'req-1',
      };
      expect(isBridgeMessage(msg)).toBe(true);
      expect(msg.requestId).toBe('req-1');
    });

    it('accepts valid BB_EXT_BOOKMARKS_RESULT (success)', () => {
      const msg: BridgeMsgBookmarksResult = {
        type: 'BB_EXT_BOOKMARKS_RESULT',
        v: BRIDGE_VERSION,
        requestId: 'req-1',
        success: true,
        bookmarks: [{ id: '1', title: 'Test', url: 'https://test.com' }],
      };
      expect(isBridgeMessage(msg)).toBe(true);
      expect(msg.success).toBe(true);
      expect(msg.bookmarks).toHaveLength(1);
    });

    it('accepts valid BB_EXT_BOOKMARKS_RESULT (failure)', () => {
      const msg: BridgeMsgBookmarksResult = {
        type: 'BB_EXT_BOOKMARKS_RESULT',
        v: BRIDGE_VERSION,
        requestId: 'req-1',
        success: false,
        error: 'Permission denied',
      };
      expect(isBridgeMessage(msg)).toBe(true);
      expect(msg.success).toBe(false);
      expect(msg.error).toBe('Permission denied');
    });

    it('accepts valid BB_EXT_REQUEST_TOKEN message', () => {
      const msg: BridgeMsgRequestToken = { type: 'BB_EXT_REQUEST_TOKEN', v: BRIDGE_VERSION };
      expect(isBridgeMessage(msg)).toBe(true);
    });

    it('accepts valid BB_EXT_DISCONNECT message', () => {
      const msg: BridgeMsgDisconnect = { type: 'BB_EXT_DISCONNECT', v: BRIDGE_VERSION };
      expect(isBridgeMessage(msg)).toBe(true);
    });

    it('rejects message with wrong version', () => {
      const msg = { type: 'BB_EXT_INSTALLED', v: 99 };
      expect(isBridgeMessage(msg)).toBe(false);
    });

    it('rejects message with unknown type', () => {
      const msg = { type: 'BB_UNKNOWN', v: BRIDGE_VERSION };
      expect(isBridgeMessage(msg)).toBe(false);
    });

    it('rejects null and non-objects', () => {
      expect(isBridgeMessage(null)).toBe(false);
      expect(isBridgeMessage('string')).toBe(false);
      expect(isBridgeMessage(42)).toBe(false);
      expect(isBridgeMessage(undefined)).toBe(false);
    });
  });

  describe('RuntimeMessage type guards', () => {
    it('accepts valid BB_AUTH_TOKEN message', () => {
      const msg: RuntimeMsgAuthToken = { type: 'BB_AUTH_TOKEN', token: 'jwt-xyz' };
      expect(isRuntimeMessage(msg)).toBe(true);
      expect(msg.token).toBe('jwt-xyz');
    });

    it('accepts valid BB_DISCONNECT message', () => {
      const msg: RuntimeMsgDisconnect = { type: 'BB_DISCONNECT' };
      expect(isRuntimeMessage(msg)).toBe(true);
    });

    it('accepts valid BB_REQUEST_BOOKMARKS message', () => {
      const msg: RuntimeMsgRequestBookmarks = { type: 'BB_REQUEST_BOOKMARKS' };
      expect(isRuntimeMessage(msg)).toBe(true);
    });

    it('rejects unknown runtime message types', () => {
      expect(isRuntimeMessage({ type: 'BB_UNKNOWN' })).toBe(false);
    });

    it('rejects non-objects', () => {
      expect(isRuntimeMessage(null)).toBe(false);
      expect(isRuntimeMessage(undefined)).toBe(false);
    });
  });

  describe('message shape contracts', () => {
    it('auth messages require a non-empty token', () => {
      const msg: BridgeMsgAuth = { type: 'BB_EXT_AUTH', v: BRIDGE_VERSION, token: 'abc' };
      expect(msg.token.length).toBeGreaterThan(0);
    });

    it('request bookmarks messages require a requestId', () => {
      const msg: BridgeMsgRequestBookmarks = {
        type: 'BB_EXT_REQUEST_BOOKMARKS',
        v: BRIDGE_VERSION,
        requestId: 'req-123',
      };
      expect(msg.requestId).toBeTruthy();
    });

    it('bookmarks result matches request via requestId', () => {
      const requestId = 'req-42';
      const request: BridgeMsgRequestBookmarks = {
        type: 'BB_EXT_REQUEST_BOOKMARKS',
        v: BRIDGE_VERSION,
        requestId,
      };
      const result: BridgeMsgBookmarksResult = {
        type: 'BB_EXT_BOOKMARKS_RESULT',
        v: BRIDGE_VERSION,
        requestId,
        success: true,
        bookmarks: [],
      };
      expect(request.requestId).toBe(result.requestId);
    });
  });
});
