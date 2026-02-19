# Extension Bridge Audit (Auth + Bookmark Messaging)

Date: 2026-02-19

## Scope

This audit covers communication between the web app and browser extension, with focus on:
- postMessage trust boundaries and origin validation
- auth token relay lifecycle
- request/response robustness for browser bookmark import
- maintainability and future protocol evolution

Primary files reviewed:
- `src/utils/extension-bridge.ts`
- `src/auth/clerk.ts`
- `src/main.ts`
- `extension/src/entrypoints/content.ts`
- `extension/src/entrypoints/background.ts`

## Executive Summary

The bridge works and the main architecture is sensible (page <-> content script <-> background), but validation and lifecycle handling are uneven across modules. The extension side is stricter than parts of the web-app side.

The biggest near-term risk is inconsistent message validation and listener lifecycle management as the protocol expands.

## Findings (ranked)

### 1. Origin validation is inconsistent in page-side bridge listeners (High)

Evidence:
- `src/utils/extension-bridge.ts` listeners validate `event.source === window` but do not validate `event.origin`: `src/utils/extension-bridge.ts:4`, `src/utils/extension-bridge.ts:33`.
- `src/auth/clerk.ts` bridge listener does validate origin: `src/auth/clerk.ts:255`, `src/auth/clerk.ts:257`.

Impact:
- Security posture depends on which listener path handles a message.
- Inconsistent trust checks increase protocol drift risk.

### 2. Message protocol has no explicit version/channel contract (Medium)

Evidence:
- Message handling is type-string based (`BB_EXT_*`) without a shared schema/version handshake: `src/utils/extension-bridge.ts:6`, `src/utils/extension-bridge.ts:34`, `src/auth/clerk.ts:258`, `extension/src/entrypoints/content.ts:25`, `extension/src/entrypoints/content.ts:36`.

Impact:
- Harder to evolve protocol safely across app and extension releases.
- Increases fragility for backwards compatibility.

### 3. Bridge listeners are one-way initialized with no teardown path (Medium)

Evidence:
- `initExtensionDetection()` and `initExtensionBridge()` attach window listeners and do not expose unbind logic: `src/utils/extension-bridge.ts:3`, `src/auth/clerk.ts:250`, `src/auth/clerk.ts:255`.
- Init is called from sync startup paths: `src/main.ts:23`, `src/main.ts:295`, `src/main.ts:335`.

Impact:
- No formal lifecycle for cleanup (future logout/session reset, hot reload edge cases).
- Possible duplicate listeners if init path changes in future refactors.

### 4. Token handling is practical but minimal in lifecycle semantics (Medium)

Evidence:
- Token relayed via page message then stored in extension local storage: `src/auth/clerk.ts:239`, `extension/src/entrypoints/content.ts:28`, `extension/src/entrypoints/background.ts:12`.
- Periodic refresh request every 30 minutes in content script with `setInterval`: `extension/src/entrypoints/content.ts:55`, `extension/src/entrypoints/content.ts:61`.

Impact:
- Works for current flow, but explicit expiry/error-handling semantics are thin.
- Future multi-account/logout edge cases may be harder to reason about.

### 5. Allowed origin list is hardcoded (Low)

Evidence:
- Content script allowlist is static array: `extension/src/entrypoints/content.ts:19`.

Impact:
- Operational overhead for environment changes.
- Risk of mismatch between deployed hostnames and extension expectations.

## What Is Already Strong

- Clear separation between content and background responsibilities.
- Content script uses strict origin allowlist and same-window check: `extension/src/entrypoints/content.ts:21`, `extension/src/entrypoints/content.ts:22`.
- Request/response correlation for bookmark fetch via `requestId`: `src/utils/extension-bridge.ts:25`, `src/utils/extension-bridge.ts:35`, `extension/src/entrypoints/content.ts:37`, `extension/src/entrypoints/content.ts:42`.

## Overhaul Recommendations

## Target Architecture

1. Shared protocol contract module
- Define discriminated union for all bridge messages.
- Include protocol `version` and `channel`.

2. Centralized page bridge runtime
- Single `startBridge()` / `stopBridge()` that registers all listeners once.
- Enforce one validation policy (source + origin + schema guard).

3. Auth session semantics
- Track token metadata (issued/expiry) and refresh outcomes.
- Clear token on explicit logout/disconnect path consistently.

4. Environment-configured trust policy
- Generate allowlisted origins from build-time config instead of hardcoding.

## Migration Plan (phased)

### Phase 1: Validation parity
- Add origin checks to `src/utils/extension-bridge.ts` listeners.
- Introduce schema guards for incoming message payloads.

### Phase 2: Lifecycle control
- Refactor to one bridge manager with idempotent init and teardown.
- Prevent duplicate listener registration with internal guard.

### Phase 3: Protocol hardening
- Add protocol version field and capability handshake.
- Keep compatibility adapter for old message formats during rollout.

### Phase 4: Testing
- Add integration tests for spoofed message rejection and valid request flows.
- Add extension E2E smoke test for token relay and bookmark import round trip.

## Concrete Technical Rules To Adopt

- Always validate `event.source`, `event.origin`, and payload schema on message ingress.
- Keep message protocol typed and versioned.
- All global listeners must have explicit ownership and teardown.
- Token relay flows should define refresh/error/disconnect behavior explicitly.
- Host allowlists must be config-driven, not ad hoc constants.

## Suggested Priority Backlog

1. Patch origin validation in `src/utils/extension-bridge.ts`.
2. Create shared message types and runtime guards.
3. Implement singleton bridge manager with start/stop.
4. Add security-focused message spoofing tests.

## Bottom Line

The extension bridge is operational and mostly sound, but it needs **protocol and lifecycle hardening** before it grows further. Standardizing validation and introducing a versioned bridge contract will materially reduce future risk.
