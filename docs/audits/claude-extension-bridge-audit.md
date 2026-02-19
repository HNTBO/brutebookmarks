# Extension Bridge Audit

Comprehensive audit of the postMessage bridge between the Brute Bookmarks web app and the WXT browser extension, covering auth token relay, bookmark import, message validation, and listener lifecycle.
Conducted 2026-02-19.

---

## Executive Summary

The extension bridge has **two independent bridge layers** coexisting in the web app:

1. **Extension detection + bookmark import** (`src/utils/extension-bridge.ts`) -- handles `BB_EXT_INSTALLED` detection and the `BB_EXT_REQUEST_BOOKMARKS` / `BB_EXT_BOOKMARKS_RESULT` round-trip.
2. **Auth token relay** (`src/auth/clerk.ts:228-262`) -- handles `BB_EXT_AUTH` token push and `BB_EXT_REQUEST_TOKEN` pull.

On the extension side, a single content script (`extension/src/entrypoints/content.ts`) acts as the unified relay, forwarding messages between `window.postMessage` (page context) and `browser.runtime.sendMessage` (background worker). The background worker (`extension/src/entrypoints/background.ts`) processes token storage and bookmark tree access.

The architecture is fundamentally sound: the content script enforces origin validation, the bookmark request uses request/response correlation via `requestId`, and all `postMessage` calls use `window.location.origin` (not `'*'`). However, origin validation is asymmetric between the two page-side bridge modules, there is no protocol versioning or schema validation, no listener teardown path exists for any persistent bridge listener, and token lifecycle semantics (expiry, revocation, multi-tab) are minimal. These gaps will compound as the protocol grows.

---

## Findings by Severity

### CRITICAL: Zero findings

No showstoppers. The bridge works. Auth tokens relay correctly. Bookmark import completes.

### HIGH

#### H1. Origin validation is inconsistent between the two page-side bridge modules

The web app has two separate `window.addEventListener('message', ...)` registrations for bridge traffic. They apply different validation logic:

**`src/utils/extension-bridge.ts` -- detection listener (line 4):**
```typescript
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.type === 'BB_EXT_INSTALLED') {
    extensionInstalled = true;
  }
});
```

**`src/utils/extension-bridge.ts` -- bookmark response handler (lines 32-35):**
```typescript
function handler(event: MessageEvent) {
  if (event.source !== window) return;
  if (event.data?.type !== 'BB_EXT_BOOKMARKS_RESULT') return;
  if (event.data.requestId !== requestId) return;
  // ...
}
```

**`src/auth/clerk.ts` -- token request listener (lines 255-261):**
```typescript
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;
  if (event.data?.type === 'BB_EXT_REQUEST_TOKEN') {
    sendTokenToExtension();
  }
});
```

**Problems:**
- `extension-bridge.ts` checks `event.source === window` but **never checks `event.origin`**. Any same-page script (XSS, injected third-party tag, browser extension content script from another extension) can set `extensionInstalled = true` or feed crafted `BB_EXT_BOOKMARKS_RESULT` messages.
- `clerk.ts` checks both `event.source` and `event.origin` -- correct, but the inconsistency means security depends on which listener handles a given message type.
- The `BB_EXT_INSTALLED` message is unauthenticated and unvalidated beyond source check. A malicious script can trick the app into believing the extension is installed, which changes UI behavior (e.g., showing browser bookmark import options).
- The `BB_EXT_BOOKMARKS_RESULT` handler does have the `requestId` correlation as a second factor, which mitigates blind injection. But a same-page script that observes the `BB_EXT_REQUEST_BOOKMARKS` outgoing message (also visible to any `message` listener on the page) can extract the `requestId` and respond with crafted bookmark data.

**Recommendation:** Add `if (event.origin !== window.location.origin) return;` to both listeners in `extension-bridge.ts`, matching the pattern already used in `clerk.ts`. This is a two-line fix.

#### H2. No listener teardown path for any persistent bridge listener

Three `window.addEventListener('message', ...)` calls register permanent listeners with no exposed cleanup mechanism:

| Registration | File | Line | Teardown? |
|---|---|---|---|
| Extension detection | `extension-bridge.ts` | 4 | None |
| Token request listener | `clerk.ts` | 255 | None |
| Bookmark response handler | `extension-bridge.ts` | 47 | Yes (self-removes on response or timeout) |

The detection listener (line 4) and token request listener (line 255) are anonymous arrow functions -- they cannot be removed because no reference is retained.

**Problems:**
- If `initExtensionDetection()` were called twice (e.g., during hot module reload in dev, or a future refactoring accident), a duplicate listener is registered. The detection listener is idempotent (sets a boolean), so this is benign. But the token request listener in `clerk.ts` would send duplicate tokens on each `BB_EXT_REQUEST_TOKEN` message.
- `initExtensionBridge()` is called from two code paths in `main.ts`: the initial auth flow (`main.ts:287`) and the `upgradeToSync()` flow (`main.ts:327`). If a user starts in local mode then upgrades to sync, `initExtensionBridge()` runs. If they somehow trigger the upgrade path twice, two token request listeners exist.
- No explicit cleanup on sign-out. If Clerk's user signs out or switches accounts, the stale token listener remains active and will happily relay the new (or null) token.

**Recommendation:** Refactor both modules to return an `AbortController` or cleanup function. At minimum, add a guard flag:

```typescript
let bridgeInitialized = false;
export function initExtensionBridge(): void {
  if (bridgeInitialized) return;
  bridgeInitialized = true;
  // ... register listeners
}
```

The bookmark response handler in `requestBrowserBookmarks()` (line 47) is the one well-designed case -- it self-removes via `window.removeEventListener('message', handler)` on both success and timeout. This pattern should be the model for any future one-shot listeners.

#### H3. Token relay has no expiry awareness or error recovery

**Token push (`clerk.ts` lines 234-243):**
```typescript
async function sendTokenToExtension(): Promise<void> {
  if (!clerk?.session) return;
  try {
    const token = await clerk.session.getToken({ template: 'convex' });
    if (token) {
      window.postMessage({ type: 'BB_EXT_AUTH', token }, window.location.origin);
    }
  } catch {
    // Silently ignore — extension may not be installed
  }
}
```

**Token storage in background (`background.ts` lines 11-16):**
```typescript
if (message.type === 'BB_AUTH_TOKEN' && message.token) {
  browser.storage.local.set({ bb_auth_token: message.token }).then(() => {
    sendResponse({ success: true });
  });
  return true;
}
```

**Token consumption in popup (`popup/main.ts` lines 282-288):**
```typescript
const token = await getStoredToken();
if (!isConnected(token)) {
  showView('onboarding');
  return;
}
setAuthToken(token);
```

**Token validity check (`auth.ts` lines 39-41):**
```typescript
export function isConnected(token: string | null): boolean {
  return token !== null && token.length > 0;
}
```

**Problems:**
- `isConnected()` only checks that a token string exists and is non-empty. It does not check if the JWT is expired. A Convex JWT template token has a limited lifetime (typically 1 hour). If the user doesn't visit the web app for days, the stored token is expired but `isConnected()` returns `true`.
- The popup will attempt Convex queries with an expired token, get auth errors, and show a generic "Connection failed" error. The user has no idea their token expired -- they see a vague error with a "Reconnect" button.
- The content script requests a fresh token every 30 minutes (`content.ts:61`), but this only works while the Brute Bookmarks tab is open and active. Once the tab is closed, the token ages with no refresh.
- `sendTokenToExtension()` silently swallows all errors. If `getToken()` fails (network issue, session revoked), the extension never learns about it. No error message type exists in the protocol.
- No `BB_EXT_AUTH_REVOKED` or `BB_EXT_LOGOUT` message type exists. When the user signs out via Clerk, the extension keeps the old token until it naturally expires.

**Recommendation:**
1. Store token metadata alongside the token: `{ token, issuedAt, expiresAt }`.
2. Check `expiresAt` in `isConnected()` before using a stored token.
3. Send a `BB_EXT_AUTH_REVOKED` message from the Clerk sign-out listener to clear the extension's stored token.
4. Differentiate "not connected" (onboarding) from "token expired" (show "Session expired, visit the app to reconnect" instead of generic error).

### MEDIUM

#### M1. Message protocol has no version field, no schema validation, no shared type definitions

All message types are bare string literals scattered across files with no shared source of truth:

| Message Type | Sent By | Handled By | Direction |
|---|---|---|---|
| `BB_EXT_INSTALLED` | content.ts:16 | extension-bridge.ts:6 | extension -> page |
| `BB_EXT_AUTH` | clerk.ts:239 | content.ts:25 | page -> extension |
| `BB_EXT_REQUEST_TOKEN` | content.ts:57 | clerk.ts:258 | extension -> page |
| `BB_EXT_REQUEST_BOOKMARKS` | extension-bridge.ts:49 | content.ts:36 | page -> extension |
| `BB_EXT_BOOKMARKS_RESULT` | content.ts:42,48 | extension-bridge.ts:34 | extension -> page |
| `BB_AUTH_TOKEN` | content.ts:29 | background.ts:11 | content -> background |
| `BB_DISCONNECT` | (popup, not traced) | background.ts:18 | popup -> background |
| `BB_REQUEST_BOOKMARKS` | content.ts:39 | background.ts:25 | content -> background |

**Problems:**
- Message types are string literals with no TypeScript union or enum enforcing correctness. A typo (`BB_EXT_AUHT`) silently fails.
- No `version` field on any message. If the protocol changes (e.g., adding fields to `BB_EXT_AUTH`), there is no way for the content script to detect that it's talking to an older/newer version of the web app. Since the extension and web app deploy independently (extension via Chrome Web Store with review delays, web app via Vercel instantly), version skew is a realistic scenario.
- No runtime schema validation. The `event.data?.type` optional chaining is the only guard. For `BB_EXT_AUTH`, the content script does `const token = event.data.token as string` with a truthy check (`if (!token) return;`), but there's no validation that `token` is actually a string vs. an object or number.
- The internal extension messages (`BB_AUTH_TOKEN`, `BB_REQUEST_BOOKMARKS`, `BB_DISCONNECT`) use a different naming convention (no `EXT_` prefix) than the page-facing messages. This is sensible (they're on a different transport -- `browser.runtime.sendMessage` vs `window.postMessage`) but undocumented.

**Recommendation:** Create a shared types file (e.g., `extension/src/lib/bridge-types.ts` or a shared package) with:
```typescript
interface BridgeMessage {
  type: string;
  version: 1;
}
interface BBExtInstalled extends BridgeMessage { type: 'BB_EXT_INSTALLED' }
interface BBExtAuth extends BridgeMessage { type: 'BB_EXT_AUTH'; token: string }
// ... etc.
type PageToBridgeMessage = BBExtAuth | BBExtRequestBookmarks;
type BridgeToPageMessage = BBExtInstalled | BBExtBookmarksResult | BBExtRequestToken;
```

Add a runtime `isBridgeMessage(data: unknown): data is BridgeMessage` guard that checks for `version` and valid `type`. This prevents silent failures on typos and enables graceful version negotiation.

#### M2. Content script match patterns are broader than necessary

**`extension/src/entrypoints/content.ts` line 11:**
```typescript
matches: ['*://*.brutebookmarks.com/*', 'http://localhost:5173/*'],
```

**`extension/src/entrypoints/content.ts` lines 19:**
```typescript
const ALLOWED_ORIGINS = ['https://brutebookmarks.com', 'https://www.brutebookmarks.com', 'http://localhost:5173'];
```

**Problems:**
- The `matches` pattern uses `*://` which includes both `http://` and `https://` for `*.brutebookmarks.com`. In production, the app is HTTPS-only, but the pattern allows the content script to inject on `http://brutebookmarks.com` if the user somehow hits the HTTP version (e.g., a man-in-the-middle downgrade).
- The `*` subdomain wildcard matches ANY subdomain: `foo.brutebookmarks.com`, `evil.brutebookmarks.com`, etc. If any subdomain is compromised or pointed at attacker-controlled content, the extension's content script runs there and will relay tokens to it.
- The `ALLOWED_ORIGINS` list is stricter -- it only allows `https://brutebookmarks.com`, `https://www.brutebookmarks.com`, and `http://localhost:5173`. This is good and catches the overly-broad match pattern at runtime. But the content script still *injects* on those pages (executes JavaScript in the page context), which itself could be a concern.
- `http://localhost:5173` is present in both the match pattern and allowed origins for development. This is fine for dev builds but should not ship in the production extension. There's no build-time stripping of dev origins.

**Recommendation:**
1. Tighten `matches` to `https://brutebookmarks.com/*` and `https://www.brutebookmarks.com/*` for production builds.
2. Use WXT's environment-conditional configuration to include `http://localhost:5173/*` only in development builds.
3. The `ALLOWED_ORIGINS` runtime check is a good defense-in-depth layer and should stay.

#### M3. Bookmark response uses object spread with untrusted data

**`extension/src/entrypoints/content.ts` lines 40-44:**
```typescript
browser.runtime
  .sendMessage({ type: 'BB_REQUEST_BOOKMARKS' })
  .then((response) => {
    window.postMessage(
      { type: 'BB_EXT_BOOKMARKS_RESULT', requestId, ...response },
      window.location.origin,
    );
  })
```

**Problems:**
- The `...response` spread takes whatever the background worker returns and merges it into the postMessage payload. Currently the background worker returns `{ success: true, bookmarks: tree }` or `{ success: false, error: String(err) }`, which is fine.
- But if the background worker's response shape changes or includes unexpected fields (e.g., a `type` field), the spread would overwrite the `type: 'BB_EXT_BOOKMARKS_RESULT'` key. The message would then not be recognized by the page-side handler.
- More broadly, this is an unvalidated passthrough from one trust boundary (extension internal messaging) to another (window postMessage). If the background worker is compromised (e.g., via a malicious extension API response), the spread could inject arbitrary keys into page-visible messages.

**Recommendation:** Explicitly construct the response message instead of spreading:
```typescript
window.postMessage(
  {
    type: 'BB_EXT_BOOKMARKS_RESULT',
    requestId,
    success: response.success,
    bookmarks: response.bookmarks,
    error: response.error,
  },
  window.location.origin,
);
```

#### M4. Extension `BB_DISCONNECT` message is defined but never sent by the web app

**`extension/src/entrypoints/background.ts` lines 18-23:**
```typescript
if (message.type === 'BB_DISCONNECT') {
  browser.storage.local.remove('bb_auth_token').then(() => {
    sendResponse({ success: true });
  });
  return true;
}
```

**Problems:**
- The background worker handles `BB_DISCONNECT` to clear the stored token, but no code in the web app or content script ever sends this message type.
- When a user signs out of Clerk on the web app, the extension's stored token is never cleared. It persists in `browser.storage.local` until it naturally expires (if JWT-based) or until the user manually disconnects from the extension popup.
- Grepping the entire codebase for `BB_DISCONNECT` only returns the handler in `background.ts`. It's dead code that was intended for a logout flow that was never wired up.

**Recommendation:** Wire up a `BB_EXT_DISCONNECT` page-to-extension message in the Clerk sign-out listener. The content script should relay it as `BB_DISCONNECT` to the background worker, matching the existing pattern.

### LOW

#### L1. Content script `setInterval` for token refresh runs unconditionally

**`extension/src/entrypoints/content.ts` lines 55-61:**
```typescript
// Request a fresh token periodically (every 30 min while tab is open)
function requestToken() {
  window.postMessage({ type: 'BB_EXT_REQUEST_TOKEN' }, window.location.origin);
}

requestToken();
setInterval(requestToken, 30 * 60 * 1000);
```

**Problems:**
- The `setInterval` runs for the lifetime of the tab, even if the user is not signed in. The `BB_EXT_REQUEST_TOKEN` message fires every 30 minutes regardless. On the page side, `sendTokenToExtension()` (`clerk.ts:234`) checks `if (!clerk?.session) return;` and exits early, so this is harmless but wasteful.
- The interval is never cleared. If the content script is somehow re-initialized (unlikely with WXT, but possible with extension updates or reloads), multiple intervals could stack.
- The `requestToken()` call on line 60 fires immediately at `document_idle`, which races with the web app's own `initExtensionBridge()` that also sends a token immediately (`clerk.ts:252`). In the best case, the extension gets two tokens in quick succession. In the worst case, `requestToken()` fires before Clerk has initialized, gets no response, and the first real token arrives from `initExtensionBridge()` later anyway. No harm, but redundant.

**Recommendation:** Gate the interval behind a successful token receipt. Only start the 30-minute refresh cycle after the first `BB_EXT_AUTH` message is received, confirming the user is actually authenticated.

#### L2. `requestBrowserBookmarks()` uses `Date.now() + Math.random()` for request IDs

**`extension-bridge.ts` line 25:**
```typescript
const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
```

**Problems:**
- This produces a sufficiently unique ID for the current use case (one bookmark request at a time, from one page). But `Math.random()` is not cryptographically secure. If request ID guessing were a concern (e.g., a malicious script trying to inject a fake response), this would be weak.
- In practice, the `requestId` is a correlation token, not a security token. The real protection is that only the content script can observe the outgoing `BB_EXT_REQUEST_BOOKMARKS` message (via the `message` event on `window`), and any script on the same page can also observe it. So the `requestId` doesn't add security against same-page attackers -- it only prevents stale/mismatched responses.

**Impact:** Minimal. The `requestId` pattern is good engineering for request/response correlation. The weakness of `Math.random()` is academic given the threat model.

**Recommendation:** No immediate action needed. If the protocol ever handles security-sensitive correlation, switch to `crypto.randomUUID()`.

#### L3. Background worker message handler has no catch-all / unknown message logging

**`extension/src/entrypoints/background.ts` lines 9-37:**
```typescript
browser.runtime.onMessage.addListener(
  (message: { type: string; token?: string }, _sender, sendResponse) => {
    if (message.type === 'BB_AUTH_TOKEN' && message.token) {
      // ...
      return true;
    }
    if (message.type === 'BB_DISCONNECT') {
      // ...
      return true;
    }
    if (message.type === 'BB_REQUEST_BOOKMARKS') {
      // ...
      return true;
    }
  },
);
```

**Problems:**
- If a message arrives with an unrecognized `type`, the handler falls through and returns `undefined` (implicitly). The `sendResponse` callback is never called, which means the sender's `browser.runtime.sendMessage()` promise may hang or resolve with `undefined` depending on the browser.
- No logging of unknown messages, making debugging harder.
- The TypeScript typing `{ type: string; token?: string }` is minimal -- it doesn't discriminate between message types.

**Recommendation:** Add a catch-all at the end:
```typescript
console.warn('[Background] Unknown message type:', message.type);
sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
```

#### L4. `isConnected()` provides a false sense of security

**`extension/src/lib/auth.ts` lines 39-41:**
```typescript
export function isConnected(token: string | null): boolean {
  return token !== null && token.length > 0;
}
```

**Problems:**
- This function is used as the auth gate in the popup (`popup/main.ts:283`). It only checks for a non-empty string. An expired JWT, a corrupted string, or even the literal string `"invalid"` would pass.
- The function name `isConnected` implies a meaningful connection state check, but it's just a null/empty check.

**Impact:** Low in isolation -- the Convex client will reject expired tokens at query time and the error is caught. But the UX degradation (user sees "Loading..." then "Connection failed" instead of "Session expired, reconnect") makes this worth noting.

**Recommendation:** Decode the JWT payload (base64, no library needed) and check the `exp` claim:
```typescript
export function isConnected(token: string | null): boolean {
  if (!token || token.length === 0) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}
```

#### L5. `storeToken()` and `clearToken()` in `auth.ts` are exported but never called

**`extension/src/lib/auth.ts` lines 22-28:**
```typescript
export async function storeToken(token: string): Promise<void> {
  await browser.storage.local.set({ [TOKEN_KEY]: token });
}

export async function clearToken(): Promise<void> {
  await browser.storage.local.remove(TOKEN_KEY);
}
```

**Problems:**
- Token storage is handled directly by the background worker (`background.ts:12`), not through these helper functions. They're dead code.
- `clearToken()` would be the natural function to call on disconnect, but `BB_DISCONNECT` in the background worker uses `browser.storage.local.remove('bb_auth_token')` directly instead of importing this helper.
- The `TOKEN_KEY` constant (`'bb_auth_token'`) is duplicated: it's defined in `auth.ts:14` and hardcoded as a string literal in `background.ts:12` and `background.ts:19`.

**Recommendation:** Either use `storeToken()`/`clearToken()` from the background worker, or remove the dead exports. Centralize the `TOKEN_KEY` constant either way.

---

## Bridge Architecture Map

### Message Flow Diagram

```
    Web App (page context)              Content Script               Background Worker
    ========================           ================             ==================

    [Clerk init / sign-in]
         |
         |-- BB_EXT_AUTH ------->  [receives via message]
         |   (token payload)          |
         |   postMessage              |-- BB_AUTH_TOKEN ----------> [stores in storage.local]
         |   origin-scoped            |   runtime.sendMessage
         |                            |
         |                       [setInterval 30min]
         |                            |
         |<-- BB_EXT_REQUEST_TOKEN -- |
         |   postMessage              |
         |   origin-scoped            |
         |                            |
         |-- BB_EXT_AUTH ------->     |  (same as above)
         |                            |
    [Settings: import bookmarks]      |
         |                            |
         |-- BB_EXT_REQUEST_BOOKMARKS -> [receives via message]
         |   postMessage (+ requestId)   |
         |                               |-- BB_REQUEST_BOOKMARKS -> [calls browser.bookmarks.getTree()]
         |                               |   runtime.sendMessage        |
         |                               |                              |-- response (tree)
         |                               |<-- sendResponse -------------|
         |<-- BB_EXT_BOOKMARKS_RESULT ---|
         |   postMessage (+ requestId)   |
         |                               |
    [page load / document_idle]          |
         |                          [sends BB_EXT_INSTALLED]
         |<-- BB_EXT_INSTALLED ---------|
         |   postMessage                |
         |   (sets extensionInstalled)  |

                                   [BB_DISCONNECT handler exists
                                    in background but is never
                                    sent by any code path]
```

### Transport Summary

| Leg | Transport | Validation |
|---|---|---|
| Page -> Content Script | `window.postMessage` | Content: `event.source === window` + `ALLOWED_ORIGINS.includes(event.origin)` |
| Content Script -> Page | `window.postMessage` | Page (clerk.ts): `event.source === window` + `event.origin` check |
| | | Page (extension-bridge.ts): `event.source === window` only (NO origin check) |
| Content Script -> Background | `browser.runtime.sendMessage` | Implicit (same extension, trusted channel) |
| Background -> Content Script | `sendResponse` callback | Implicit (same extension, trusted channel) |

### Who Validates What

| Validator | `event.source` | `event.origin` | `event.data.type` | `event.data.requestId` | Schema/payload |
|---|:---:|:---:|:---:|:---:|:---:|
| `extension-bridge.ts` detection (line 4) | Yes | **No** | Yes | -- | No |
| `extension-bridge.ts` bookmark handler (line 32) | Yes | **No** | Yes | Yes | No |
| `clerk.ts` token listener (line 255) | Yes | Yes | Yes | -- | No |
| Content script (line 20) | Yes | Yes | Yes | Passes through | No |
| Background worker (line 10) | -- (internal) | -- (internal) | Yes | -- | Minimal (`&& message.token`) |

---

## What Is Already Strong

### 1. Request/response correlation via `requestId`

The `requestBrowserBookmarks()` function in `extension-bridge.ts` (lines 23-52) is the best-designed piece of the bridge:

```typescript
const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
```

- Generates a unique correlation ID per request.
- The response handler (line 35) filters by `requestId`, preventing stale or mismatched responses.
- The handler self-removes on both success (line 37) and timeout (line 28).
- The 10-second timeout (line 30) prevents hanging promises.

This pattern should be the template for any future request/response pairs in the protocol.

### 2. Content script origin allowlist

The content script's `ALLOWED_ORIGINS` check (line 22) is strict and correctly implemented:
```typescript
const ALLOWED_ORIGINS = ['https://brutebookmarks.com', 'https://www.brutebookmarks.com', 'http://localhost:5173'];
// ...
if (!ALLOWED_ORIGINS.includes(event.origin)) return;
```

This is defense-in-depth on top of the `matches` pattern, and catches the overly-broad `*://` in the match pattern at runtime.

### 3. All `postMessage` calls use explicit origin

Every `window.postMessage()` call in both the web app and content script uses `window.location.origin` as the target origin, not `'*'`. This restricts who can receive the messages.

### 4. Clear separation of concerns

Content script acts purely as a relay. Background worker handles storage and API access. Page-side code handles UI and Clerk integration. No layer overreaches.

---

## Recommended Overhaul Plan

### Phase 1: Validation parity (quick wins)

1. **Add origin checks to `extension-bridge.ts`**
   - Add `if (event.origin !== window.location.origin) return;` to both listeners (line 5 and line 33).
   - Effort: ~5 min, zero risk.

2. **Add idempotency guard to `initExtensionBridge()`**
   - Add a module-level `let bridgeInitialized = false;` flag. Return early if already initialized.
   - Same for `initExtensionDetection()` in `extension-bridge.ts`.
   - Effort: ~5 min, zero risk.

3. **Fix object spread in content script bookmark relay**
   - Replace `{ type: 'BB_EXT_BOOKMARKS_RESULT', requestId, ...response }` with explicit field mapping.
   - Effort: ~5 min, zero risk.

### Phase 2: Token lifecycle hardening

4. **Wire disconnect message on sign-out**
   - In `clerk.ts`, listen for Clerk sign-out and send `BB_EXT_DISCONNECT` via postMessage.
   - Content script relays as `BB_DISCONNECT` to background (handler already exists).
   - Effort: ~20 min, low risk.

5. **Add JWT expiry check to `isConnected()`**
   - Decode the JWT payload and check `exp` claim in `extension/src/lib/auth.ts`.
   - Show "Session expired" UX instead of generic "Connection failed".
   - Effort: ~15 min, low risk.

6. **Gate content script refresh interval behind successful auth**
   - Only start the 30-minute `setInterval` after receiving a `BB_EXT_AUTH` response.
   - Clear interval if a `BB_EXT_DISCONNECT` is received.
   - Effort: ~10 min, low risk.

### Phase 3: Protocol formalization

7. **Create shared bridge message types**
   - Define a `BridgeMessage` base interface with `version: number` field.
   - Create discriminated unions for page-to-extension and extension-to-page messages.
   - Add runtime type guard (`isBridgeMessage()`).
   - Effort: ~30 min, low risk.

8. **Centralize `TOKEN_KEY` and other magic strings**
   - Move `'bb_auth_token'` to a single exported constant used by both `auth.ts` and `background.ts`.
   - Effort: ~5 min, zero risk.

9. **Remove dead code**
   - Either use `storeToken()`/`clearToken()` from the background worker, or remove the exports from `auth.ts`.
   - Effort: ~5 min, zero risk.

### Phase 4: Environment configuration

10. **Strip dev origins from production extension builds**
    - Use WXT config to conditionally include `http://localhost:5173/*` in `matches` only for dev builds.
    - Strip `http://localhost:5173` from `ALLOWED_ORIGINS` in production.
    - Effort: ~15 min, low risk.

11. **Tighten match patterns to HTTPS-only**
    - Change `*://*.brutebookmarks.com/*` to `https://brutebookmarks.com/*` and `https://www.brutebookmarks.com/*`.
    - Effort: ~5 min, zero risk.

### Phase 5: Testing

12. **Add integration tests for message spoofing rejection**
    - Test that a message with wrong `event.origin` is rejected.
    - Test that a `BB_EXT_BOOKMARKS_RESULT` with wrong `requestId` is ignored.
    - Test that `BB_EXT_AUTH` with non-string token is rejected.
    - Effort: ~1-2 hours.

13. **Add E2E smoke test for token relay round-trip**
    - Simulate: page sends token -> content script relays -> background stores -> popup reads.
    - Effort: ~2-3 hours.

### What NOT to change

- **The `requestId` correlation pattern** -- it's correct and well-implemented. Don't over-engineer it with crypto UUIDs unless the threat model requires it.
- **The content script as relay architecture** -- this is the correct pattern for page-to-background communication. Don't try to use `externally_connectable` or other shortcuts.
- **`window.location.origin` as postMessage target** -- this is correct. Don't change it to `'*'` for any reason.
- **The `browser.runtime.sendMessage` / `sendResponse` pattern** -- this is the standard extension messaging API. The background handler's `return true` for async responses is correct.

---

## Summary

| Priority | Item | Files Affected | Effort |
|---|---|---|---|
| High | H1: Add origin validation to `extension-bridge.ts` | `src/utils/extension-bridge.ts` | 5 min |
| High | H2: Add idempotency guards to bridge init functions | `src/utils/extension-bridge.ts`, `src/auth/clerk.ts` | 5 min |
| High | H3: Wire disconnect message on Clerk sign-out | `src/auth/clerk.ts`, `extension/src/entrypoints/content.ts` | 20 min |
| Medium | M1: Create shared bridge message types + version field | New shared types file, all bridge files | 30 min |
| Medium | M2: Tighten content script match patterns | `extension/src/entrypoints/content.ts` | 5 min |
| Medium | M3: Fix object spread in bookmark relay | `extension/src/entrypoints/content.ts` | 5 min |
| Medium | M4: Wire `BB_DISCONNECT` or remove dead handler | `extension/src/entrypoints/background.ts` | 5 min |
| Low | L1: Gate refresh interval behind auth receipt | `extension/src/entrypoints/content.ts` | 10 min |
| Low | L2: Improve request ID generation (optional) | `src/utils/extension-bridge.ts` | 2 min |
| Low | L3: Add catch-all logging to background handler | `extension/src/entrypoints/background.ts` | 5 min |
| Low | L4: Add JWT expiry check to `isConnected()` | `extension/src/lib/auth.ts` | 15 min |
| Low | L5: Centralize `TOKEN_KEY` / remove dead exports | `extension/src/lib/auth.ts`, `extension/src/entrypoints/background.ts` | 5 min |

Total estimated effort for Phase 1 (validation parity): ~15 minutes.
Total estimated effort for Phase 2 (token lifecycle): ~45 minutes.
Total estimated effort for Phases 3-4 (protocol + config): ~1 hour.
Phase 5 (testing): ~3-5 hours, can be deferred.
