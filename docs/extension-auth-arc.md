# Extension Auth Arc

## Why this exists

The current extension authentication model is good enough for initial popup use, but it is not durable enough for long-lived extension surfaces such as a future new-tab extension.

Today the extension stores a single Convex JWT in `browser.storage.local` and treats that cached token as the extension's auth state. The token is minted by the web app and relayed through the content script bridge when a `brutebookmarks.com` tab is open.

That means the extension does **not** currently own session renewal.

## Current flow

1. The user signs into `brutebookmarks.com` with Clerk.
2. The web app calls `clerk.session.getToken({ template: 'convex' })`.
3. The web app posts `BB_EXT_AUTH` to the page.
4. The content script relays the token to the background worker as `BB_AUTH_TOKEN`.
5. The background worker stores the token in `browser.storage.local`.
6. The popup reads the stored token and sends it to `ConvexHttpClient`.

## Failure mode

The cached Convex token expires after some time, but the extension can only get a fresh one if the website is open and able to answer `BB_EXT_REQUEST_TOKEN`.

Practical consequence:

- the popup works until the cached token expires
- after expiry, the extension falls back to reconnect/onboarding
- users experience re-auth every few days even if their Clerk web session is still valid

This is acceptable as a temporary bridge, but not as the foundation for a second extension that would run on every new tab.

## Constraints

- Chromium can support a stronger path using Clerk's extension-native tooling and Sync Host.
- Firefox and unsupported browsers may still need a fallback bridge.
- Feature entrypoints should not know which browser-specific auth path they are using.

## Target design

Create a shared extension auth adapter with a small interface:

- `getAuthState()`
- `getValidConvexToken()`
- `requestFreshTokenFromApp()`
- `clearSession()`
- `subscribeToAuthChanges()`

Entry points such as the popup and future new-tab page should depend on this adapter instead of reading the cached token directly from storage.

## Planned implementations

### Chromium primary path

Use Clerk's extension-native session sync so extension contexts can mint or refresh Convex JWTs on demand without requiring an already-open site tab.

### Fallback path

Retain the existing site bridge for browsers where the Chromium path is unavailable, but isolate it behind the same adapter.

## First step shipped in this session

- Added this architecture note.
- Introduced a shared extension auth module as the seam for future work.
- Refactored the popup to ask the auth module for a valid token instead of treating storage as the source of truth.
- Added one silent background refresh attempt for expired tokens before showing onboarding.

## Chromium groundwork

The next step is an optional Chromium-native refresh path:

- background worker can try Clerk's extension client to mint a fresh Convex token
- shared auth adapter tries that path first on Chromium
- existing website bridge remains the fallback for Firefox and unsupported setups

This path is config-sensitive and remains additive until fully verified in production.

### Activation notes

- Extension builds read Clerk extension auth config from the package-local `.env`, not the repo-root `.env`.
- For Quick Save, use `quicksave/.env` and `CRX_PUBLIC_KEY=...`.
- For New Tab, use `newtab/.env` and `CRX_PUBLIC_KEY_NEWTAB=...`.
- Chromium refresh only activates when the Chrome build has `VITE_CLERK_PUBLISHABLE_KEY`.
- `VITE_CLERK_FRONTEND_API` stays optional; when omitted, the extension derives the Clerk frontend host from the publishable key.
- `VITE_CLERK_SYNC_HOST` should point at the web app origin whose cookies carry the signed-in Clerk session.
- If `VITE_CLERK_SYNC_HOST` is omitted, the extension defaults to `VITE_APP_URL`, then `https://brutebookmarks.com`.

### Remaining rollout work

- configure a consistent extension ID/CRX key so Clerk allowed origins remain stable
- add the extension origin to Clerk `allowed_origins`
- validate the Chrome manifest with the final production Clerk host permissions before rollout

### Operator checklist

1. Upload the extension zip to the Chrome Developer Dashboard and copy the public key from the package page.
2. Put that value in the relevant package `.env` as `CRX_PUBLIC_KEY=...` for Quick Save or `CRX_PUBLIC_KEY_NEWTAB=...` for New Tab.
3. Build or load the unpacked Chrome extension and note the resulting extension ID from `chrome://extensions`.
4. Add `chrome-extension://<that-id>` to Clerk `allowed_origins` for the matching Clerk instance.
5. Set `VITE_CLERK_SYNC_HOST` to the app origin that carries the Clerk session cookies if it differs from `https://brutebookmarks.com`.
