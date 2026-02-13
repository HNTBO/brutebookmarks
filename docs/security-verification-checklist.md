# Security Fixes — Browser Verification Checklist

Manual tests to run in the browser after deploying the security fixes.

## 1. Content Security Policy (CSP)

- [ ] Open DevTools Console, hard-refresh the app
- [ ] No CSP violation errors on initial load (scripts, styles, fonts all load)
- [ ] Sign in with Clerk — no CSP violations during auth flow
- [ ] Browse bookmarks, open categories — no violations
- [ ] Toggle theme (dark/light) — no violations
- [ ] Verify Google Fonts load correctly (Outfit + DM Serif Display)
- [ ] Verify Clerk iframe renders (sign-in modal)
- [ ] Verify Convex WebSocket connects (check Network tab for `wss://*.convex.cloud`)

## 2. noopener / noreferrer

- [ ] Right-click a bookmark card → Inspect the opened tab: `window.opener` should be `null`
- [ ] Inspect footer links (GitHub, etc.) — they should have `rel="noopener noreferrer"` in the HTML
- [ ] Click a bookmark card — new tab opens, original tab is not accessible via `window.opener`

## 3. Welcome Gate / Local Mode

- [ ] Clear localStorage (`localStorage.clear()` in Console), refresh
- [ ] Welcome gate appears with two options
- [ ] Pick "Use Locally" — app loads with default bookmarks, no Clerk UI, no network calls to Clerk/Convex
- [ ] Add/edit/delete a bookmark — changes persist in localStorage only
- [ ] Refresh — bookmarks are still there, no welcome gate
- [ ] Clear localStorage again, pick "Sign Up / Sign In" — Clerk sign-in appears
- [ ] Complete sign-in — Convex syncs, bookmarks load from cloud

## 4. postMessage Bridge (Browser Extension)

- [ ] Install the extension, sign in on the web app
- [ ] Verify the extension receives the auth token (check extension popup)
- [ ] Open DevTools Console — no postMessage errors
- [ ] If testing locally (`localhost:5173`), verify messages are accepted
- [ ] On production domain, verify messages are accepted

## 5. Icon Fallback (no inline onerror)

- [ ] Edit a bookmark, set its icon URL to something broken (e.g. `https://example.com/nonexistent.png`)
- [ ] Save — the bookmark card should show the fallback "?" icon
- [ ] No errors in Console related to inline event handlers
- [ ] Check the `<img>` tag in DevTools — should have NO `onerror` attribute

## 6. Theme Flash Prevention

- [ ] Set theme to dark mode
- [ ] Hard-refresh (Ctrl+Shift+R) — page should render dark immediately, no white flash
- [ ] Set theme to light mode, hard-refresh — should render light immediately
- [ ] Verify `theme-init.js` loads as external script (check Network tab), not inline
