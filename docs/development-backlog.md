# BruteBookmarks Development Backlog

This document preserves the forward-looking product and engineering ideas that were previously tracked in beads. It is now the durable project backlog for long-range BruteBookmarks development notes.

The original bead ids are kept only as historical anchors.

## Active Workstreams

### Durable Extension Auth

Original beads: `brute-bookmarks-xjkn`, `brute-bookmarks-d95d`, `brute-bookmarks-w6f6`, `brute-bookmarks-pgmz`, `brute-bookmarks-2ty2`

Goal: replace the cached Convex JWT extension auth model with durable, renewable auth. The extension should be able to obtain a fresh Convex token on demand, survive browser restarts when the Clerk session is still valid, and support both Chromium-first and fallback browser paths.

Current problem:

- The extension stores one Convex JWT in browser storage.
- Refresh depends on an open `brutebookmarks.com` tab.
- Users can be forced to reconnect every few days.
- This is not acceptable for a future new-tab extension that should feel persistent.

Planned shape:

- Build a shared extension auth adapter used by Quick Save and future entrypoints.
- Prefer Clerk extension-native session sync on Chromium.
- Keep a hardened website bridge fallback for Firefox and unsupported browsers.
- Treat storage as short-lived UX/cache state, not the source of auth truth.
- Before authenticated Convex calls, request a valid token from the adapter.
- Make expiry, reconnect, and sign-out propagation explicit and recoverable.

Specific remaining work:

- Implement the Chromium path using Clerk Chrome Extension SDK primitives such as `createClerkClient` and Sync Host.
- Define and implement the non-Chromium fallback path.
- Refactor popup and future extension entrypoints to request fresh auth on demand.
- Add focused tests and manual verification scripts for token expiry, browser restart, sign-out propagation, reconnect flows, and at least one fallback path.
- Add enough observability to diagnose auth drift in production without exposing sensitive tokens.

Dependencies and order:

1. Durable extension auth architecture.
2. Chromium extension-native auth path.
3. Firefox/unsupported-browser fallback path.
4. Entrypoint refactor to use the shared adapter.
5. Expiry/reconnect test coverage.

### New-Tab Replacement Extension

Original bead: `brute-bookmarks-t1z9`

Build the extension new-tab replacement experience on top of durable extension auth. Keep this as the single strategic tracker for the new-tab workstream unless a future dependency needs to survive across sessions.

Current note from the old tracker:

- New-tab extension builds use the supplied new-tab artwork in manifest/action icons, including the 300px store/submission variant.

### Chrome Web Store Submission

Original beads: `brute-bookmarks-cck`, `brute-bookmarks-2oh`

Prepare and submit the extension to the Chrome Web Store.

Remaining submission context:

- Store assets: 128x128 icon, 1280x800 screenshots, promotional tile, privacy policy, listing copy.
- Developer account setup, 2FA, trader status, production build, test, and package ZIP were marked complete in beads.
- The submission itself remained in progress.

Current note from the old tracker:

- Extension icon assets were prepared for Chrome submission.
- Quick Save and New Tab variants have distinct manifest icon sets.
- 16, 32, 48, 128, and 300 px PNG assets were generated from the supplied SVGs.

### Multi-Tier Favicon Resolution

Original beads: `brute-bookmarks-1v9`, `brute-bookmarks-s0j`, `brute-bookmarks-cft`

Replace the single-source Google S2 favicon pipeline with a multi-tier server-side resolver that catches higher-quality icons for major services while keeping reliable fallbacks.

Resolver strategy:

1. Check Convex `faviconCache` and return cached results younger than 30 days.
2. Try `https://{domain}/apple-touch-icon.png`.
3. Try `https://{domain}/apple-touch-icon-precomposed.png`.
4. Fetch the first chunk of page HTML and parse icon links.
5. If a web manifest is declared, fetch `manifest.json` and choose the best icon.
6. Try Icon Horse.
7. Try DuckDuckGo icons.
8. Fall back to Google S2.

Implementation notes:

- Create `convex/favicons.ts`.
- Add `resolveFavicon(url)` returning `{ iconUrl, source }`.
- Add `resolveFaviconBulk(urls)` for the settings "Fetch Favicons" flow.
- Deduplicate bulk fetches by domain.
- Reuse SSRF protection and streaming fetch patterns from `convex/metadata.ts`.
- Use zero new npm dependencies.
- Store resolved URLs in the existing icon path field.

App integration:

- On bookmark creation, if no manual icon was chosen, fire-and-forget `resolveFavicon()`.
- Do not block modal close while favicon resolution runs.
- When a result returns, update the bookmark icon path.
- In local mode, keep the current Google S2 behavior.
- Rewrite the settings "Fetch Favicons" flow to call `resolveFaviconBulk()`.
- Show useful progress, including domain deduplication when possible.

### Icon Studio

Original bead: `brute-bookmarks-68q`

Plan an in-app icon editing feature so bookmarks look good on both light and dark themes without external tools.

Product idea:

- Users currently need to process icons manually in tools like Photoshop to make them work across themes.
- BruteBookmarks could offer simple icon cleanup controls directly in the app.
- This is a strong candidate for a Studio or premium tier because it solves a real personalization pain point.

Potential capabilities:

- Desaturate or recolor icons.
- Generate light-theme and dark-theme variants.
- Preview icons against both theme backgrounds.
- Save processed variants per bookmark.

### Custom App Name

Original bead: `brute-bookmarks-a4x`

Top-tier personalization feature: allow users to rename BruteBookmarks to a custom app name.

Product positioning:

- Bundle with Icon Studio access.
- This belongs in the highest personalization/subscription tier.
- The value proposition is full branding of the user experience.

Dependency:

- Plan Icon Studio first, because custom naming likely belongs in the same premium personalization package.

## Completed Strategic Context

The beads archive also contained many closed implementation tasks. The useful completed themes were:

- Convex backend migration and real-time sync.
- Local-only versus sync-mode onboarding.
- Security hardening after audit findings.
- Chrome/Firefox extension foundation.
- Browser bookmark import through an extension bridge.
- Quick Save, including signed-out local Quick Save.
- New Tab and Quick Save package split.
- Mobile interaction phases, including long-press menus, tab carousel, and iOS safe areas.
- Pointer Events interaction overhaul.
- Undo/redo system.
- Accessibility improvements for focus, dialogs, labels, tab patterns, and keyboard interaction.
- Drag-and-drop reliability, tab grouping, and cross-tab group movement.
- Startup cache/watermark work to avoid blank sync startup.
- Performance work around rebuild debouncing, subscription lifecycle, localStorage writes, layout reads, and auto-scroll.

For detailed archaeology, use Git history around the original bead ids and the historical commits from February through May 2026.
