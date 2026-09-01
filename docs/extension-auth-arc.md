# Extension Auth Arc

## Why this exists

The original extension authentication model stored a single Convex JWT in `browser.storage.local` and treated that cached token as authentication truth. That was not durable enough for the Quick Save popup or the New Tab extension.

Chromium production builds now use Clerk's background client and Sync Host to renew Convex tokens on demand. The stored token remains a short-lived cache, while the website bridge remains a fallback for Firefox and recovery flows.

## Current Chromium flow

1. The user signs into `brutebookmarks.com` with Clerk.
2. The extension asks its background worker for a usable Convex token.
3. The background worker creates Clerk's background client with the production publishable key and `https://clerk.brutebookmarks.com` Sync Host.
4. Clerk syncs the website session and mints a fresh `convex` template token.
5. The worker updates the short-lived local cache and returns the token.
6. Authenticated Convex operations re-check token validity, refresh within 30 seconds of expiry, and retry one authentication failure once.

## Original failure mode

The cached Convex token expires after some time, but the extension can only get a fresh one if the website is open and able to answer `BB_EXT_REQUEST_TOKEN`.

Practical consequence:

- the popup works until the cached token expires
- after expiry, the extension falls back to reconnect/onboarding
- users experience re-auth every few days even if their Clerk web session is still valid

This failure mode remains relevant only for unsupported/fallback builds or until a Clerk-enabled extension update is published.

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

## Implemented

- Shared auth adapters are used by Quick Save and New Tab.
- Chromium uses `createClerkClient({ background: true, syncHost })`.
- Production public configuration is tracked in each package's `.env.production`.
- Production Chrome builds fail when the Clerk key, stable Quick Save key, Sync Host, `cookies`, or Clerk host permissions are missing.
- JWT payloads are decoded as base64url, near-expiry tokens refresh proactively, concurrent refreshes are deduplicated, and Convex auth failures retry once.
- Offline, transient Clerk failure, invalid build configuration, and genuine sign-out are distinct UI states.
- `@clerk/chrome-extension` is pinned to the tested `3.1.63` release.

## Production identifiers

- Quick Save: `opkpophbbkkmdjnfedbpcmoajhfebbho` (reproduced by tracked `CRX_PUBLIC_KEY`).
- New Tab: `iplabfiejeppdjkecmeicegjeenlglin` in the Chrome Web Store. The published Store artifact does not expose a manifest key, so clean unpacked builds will not reproduce this ID until the developer key is copied from the Store dashboard.

This path is config-sensitive and remains additive until fully verified in production.

### Activation notes

- Production values are in package-local `.env.production` files. Ignored `.env` files are development overrides only.
- Chromium refresh only activates when the Chrome build has `VITE_CLERK_PUBLISHABLE_KEY`.
- `VITE_CLERK_FRONTEND_API` stays optional; when omitted, the extension derives the Clerk frontend host from the publishable key.
- Production `VITE_CLERK_SYNC_HOST` points at `https://clerk.brutebookmarks.com`, matching the Clerk Frontend API domain.

### Remaining rollout work

- Verify that both `chrome-extension://opkpophbbkkmdjnfedbpcmoajhfebbho` and `chrome-extension://iplabfiejeppdjkecmeicegjeenlglin` are present in the production Clerk instance's `allowed_origins`.
- Enable Native API in the production Clerk instance, as required by Clerk's current Chrome Extension deployment guide. It was disabled when inspected on August 12, 2026.
- Copy the New Tab developer public key from the Chrome Web Store dashboard if reproducible unpacked IDs are required.
- Publish Clerk-enabled updates and manually verify browser restart, token expiry, website sign-out propagation, offline mode, and recovery.
- The production instance is on Clerk Hobby with the default 7-day maximum session lifetime and no inactivity timeout. A custom 30-day lifetime requires upgrading to Pro; it would reduce genuine sign-ins but does not replace background token renewal.

### Operator checklist

1. Build with `npm run build` inside the package.
2. Inspect `.output/chrome-mv3/manifest.json` for `cookies` and `https://clerk.brutebookmarks.com/*`.
3. Confirm the Store extension origin is in production Clerk `allowed_origins`.
4. Load or publish the build and run the manual expiry/restart/sign-out scenarios above.
