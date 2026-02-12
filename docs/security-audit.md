# Security Audit — Brute Bookmarks

Date: 2026-02-12  
Auditor: Codex (static code review)

## Scope reviewed

- Main web app (`src/`, `index.html`)
- Convex backend functions (`convex/`)
- Browser extension (`extension/src/`, `extension/wxt.config.ts`)
- Legacy auth/public scripts (`public/js/`)

## Executive summary

The project has strong ownership checks for most CRUD operations in Convex mutations (good baseline), but there are **multiple high-risk client-side injection paths** and **token-bridge weaknesses** that could expose user sessions/tokens in realistic attack scenarios.

### Risk overview

- **High:** 4
- **Medium:** 3
- **Low:** 2

---

## Findings

## 1) Stored XSS via unsafe `innerHTML` rendering of user-controlled data (High)

### What is the issue?
The UI builds HTML strings with template literals and injects them via `innerHTML` using values like category names, bookmark titles, URLs, and icon paths. If any of these values contains HTML/JS payloads, the payload can execute in the browser.

### Where it happens
- Category/bookmark rendering inserts `category.name`, `bookmark.title`, `bookmark.url`, and icon URL directly in HTML/attributes.  
- Icon search results from remote APIs are also injected via `innerHTML` without escaping.

### Why beginners should care
Think of `innerHTML` like saying “browser, trust this text as real HTML code.” If an attacker can store `<img onerror=...>` or `" onmouseover=...`, your page runs attacker code.

### Evidence
- `src/components/categories.ts` (`innerHTML` with interpolated category/bookmark fields).  
- `src/components/icon-picker.ts` (`resultsEl.innerHTML = ...` with remote `thumbUrl`/`title`).

### Suggested fix path
1. Replace string-templated `innerHTML` for dynamic user data with safe DOM APIs (`createElement`, `textContent`, `setAttribute`).
2. If HTML templating is required, sanitize with a proven library (e.g., DOMPurify) and still validate URL-bearing attributes separately.
3. Add central escaping helpers and unit tests with malicious payload fixtures.

---

## 2) Attribute injection and event-handler injection in generated HTML (High)

### What is the issue?
Dynamic values are embedded into HTML attributes like `data-url`, `src`, `alt`, and there is an inline `onerror` attribute in generated markup. Unescaped quotes in attacker-controlled values can break attribute boundaries and inject new attributes/events.

### Why beginners should care
If attacker-controlled text ends up inside `src="..."` or `data-url="..."` without escaping, they may sneak in `" onerror="evil()"` and run scripts.

### Evidence
- `src/components/categories.ts` uses:
  - `data-url="${bookmark.url}"`
  - `src="${getIconUrl(bookmark)}"`
  - `alt="${bookmark.title}"`
  - inline `onerror="..."`

### Suggested fix path
1. Stop generating these nodes via raw HTML strings.
2. Create `<img>` nodes programmatically and set `img.onerror = ...` in JS, not inline HTML.
3. Enforce strict URL validation (`https:` only, optionally `http:`) before assigning to `src` or `data-*` consumed later.

---

## 3) Missing URL scheme validation allows dangerous URLs (High)

### What is the issue?
Bookmark URLs are accepted and persisted as arbitrary strings in both client and backend mutations. Later, clicks call `window.open(url, '_blank')` directly.

### Why beginners should care
If someone stores `javascript:...` (or certain `data:` payloads), clicking the bookmark can execute script instead of opening a normal site.

### Evidence
- Convex accepts `url: v.string()` without scheme/domain validation in create/update/import paths (`convex/bookmarks.ts`).
- Click handler opens `card.dataset.url` directly in `window.open` (`src/components/categories.ts`).

### Suggested fix path
1. Validate URL server-side in Convex mutations (`new URL(url)` + allowlist protocols `https:`/`http:` only).
2. Re-validate in client before navigation.
3. Reject or normalize unsupported schemes.
4. Consider adding a warning dialog for non-HTTPS links.

---

## 4) Reverse-tabnabbing risk (`window.open` without `noopener`) (Medium)

### What is the issue?
Links are opened with `window.open(url, '_blank')` but without `noopener`/`noreferrer`.

### Why beginners should care
A site you open can potentially access `window.opener` and redirect the original app tab to a phishing page.

### Evidence
- `src/components/categories.ts` click handler uses `window.open(url, '_blank')`.

### Suggested fix path
Use one of:
- `window.open(url, '_blank', 'noopener,noreferrer')`
- Open and then set `newWindow.opener = null` defensively.

---

## 5) Token bridge uses wildcard `postMessage` + broad extension match scope (High)

### What is the issue?
The app sends extension auth tokens with `window.postMessage(..., '*')`, and listens for token requests via `postMessage` with weak origin constraints. The extension content script also runs on `*://*.brutebookmarks.com/*` and localhost.

### Why beginners should care
Any injected/third-party script running in that page context can observe/request token flow. Even if this requires script execution on page, this bridge expands blast radius from “XSS in page” to “extension session compromise”.

### Evidence
- App sends token via wildcard target origin in `src/auth/clerk.ts`.
- App listens for `BB_EXT_REQUEST_TOKEN` by checking only `event.source === window`.
- Content script match pattern in `extension/src/entrypoints/content.ts` is broad.

### Suggested fix path
1. Use explicit `targetOrigin` (exact app origin) instead of `'*'`.
2. Verify `event.origin` against strict allowlist before acting.
3. Add a nonce/challenge handshake between app and extension to prevent arbitrary message triggering.
4. Reduce extension `matches` scope to exact trusted origins.

---

## 6) Convex server action can be used as SSRF primitive (Medium)

### What is the issue?
`fetchPageTitle` performs server-side `fetch(url)` for user-provided URLs with only a basic `http(s)` regex check.

### Why beginners should care
Server-Side Request Forgery (SSRF) can let attackers make your server request internal/private endpoints (metadata services, internal APIs) that are unreachable from browsers.

### Evidence
- `convex/metadata.ts` calls `fetch(url)` on user input; no private IP/hostname denylist; no auth check in action handler.

### Suggested fix path
1. Require authentication for this action (if product logic expects signed-in users).
2. Resolve/validate hostname/IP and block private/reserved ranges (RFC1918, localhost, link-local, cloud metadata IPs).
3. Restrict redirects and enforce max response size/time (partially already done with timeout + partial read).

---

## 7) No explicit Content Security Policy in web entrypoint (Medium)

### What is the issue?
No CSP is declared in `index.html`.

### Why beginners should care
CSP is a safety net. If an XSS bug exists, CSP can often stop script execution or token exfiltration.

### Evidence
- `index.html` has no `Content-Security-Policy` meta tag (and no visible server-level policy in repo).

### Suggested fix path
1. Add CSP header at hosting layer (preferred) or temporary `<meta http-equiv="Content-Security-Policy" ...>`.
2. Start with report-only mode, then enforce.
3. Remove inline scripts and inline event handlers to enable stricter CSP (`script-src 'self'` + trusted CDNs with SRI/nonce).

---

## 8) Extension stores bearer token in `browser.storage.local` unencrypted (Low)

### What is the issue?
The extension persists auth token in local extension storage.

### Why beginners should care
This is common in extensions, but if the extension runtime is compromised (malicious extension interactions, local machine compromise), plaintext token theft is easier.

### Evidence
- `extension/src/lib/auth.ts` and `extension/src/entrypoints/background.ts` store/remove `bb_auth_token` in local storage.

### Suggested fix path
1. Prefer short-lived tokens with frequent rotation.
2. Store refresh capability server-side and mint scoped short-lived access tokens.
3. Consider `storage.session` where feasible (lifetime-limited) for lower persistence risk.

---

## 9) Potential abuse/DoS due to unbounded bulk operations (Low)

### What is the issue?
Some endpoints loop through unbounded arrays or collect entire tables, which can be abused to increase compute/storage costs.

### Why beginners should care
A malicious or buggy client can submit huge payloads and force expensive operations.

### Evidence
- `convex/bookmarks.ts` `importBulk` loops over user-supplied arrays without explicit max limits.
- `convex/preferences.ts` computes stats by collecting all user preferences.

### Suggested fix path
1. Add explicit caps (max categories/bookmarks per call).
2. Paginate large reads and maintain precomputed counters where possible.
3. Rate limit expensive mutations per user.

---

## Positive security observations

- Convex CRUD mutations consistently check authentication and user ownership before update/delete operations (`categories`, `bookmarks`, `tabGroups`).
- Bookmark parser blocks several dangerous URL schemes during Netscape import (`javascript:`, `chrome:`, `about:`, etc.), which is a good defensive pattern.

---

## Prioritized remediation plan (suggested order)

1. **Fix client-side injection paths** (`innerHTML` + attribute interpolation) and add tests with attack payloads.
2. **Harden URL handling** (protocol allowlist in backend + client).
3. **Secure extension auth bridge** (`postMessage` origin checks + challenge handshake).
4. **Add CSP** and remove inline handler patterns.
5. **Harden server actions** against SSRF and unauthenticated abuse.
6. **Add operational limits** (payload caps/rate limits) and telemetry for abuse patterns.

---

## Validation notes

This audit is from static source review. Runtime penetration testing, dependency advisory scanning, and infra/header validation should be done next for full coverage.
