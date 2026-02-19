# Testing & QA Audit

Comprehensive audit of test infrastructure, quality gates, and coverage gaps across Brute Bookmarks.
Conducted 2026-02-19.

---

## Executive Summary

The project has **near-zero automated test coverage** for a codebase of ~6,500 lines of application code (excluding generated emoji data). The only quality gate is `npm run build` (Vite build, which runs `tsc` type-checking). There are no `test`, `lint`, or `typecheck` scripts in `package.json`. No CI/CD pipeline exists (no `.github/workflows`).

Two test files exist:
1. `tests/security-check.py` -- a Playwright-based Python script that checks CSP, link security, theme setup, and icon fallbacks against a running dev server. Valuable but narrow and not integrated into any automated workflow.
2. `tests/interaction-baseline.spec.ts` -- a Playwright TypeScript spec covering app load, card click, modal open/close, drag proxy visibility, and size controller. This is the strongest existing test artifact, but it has never been wired to an npm script or CI pipeline.

A `playwright.config.ts` exists and `@playwright/test` is in `devDependencies`, so E2E infrastructure is partially bootstrapped but never operationalized. No unit test framework (Vitest) is installed or configured. No `vitest.config.ts` exists.

TypeScript `strict: true` is enabled in both `tsconfig.json` and `convex/tsconfig.json`, which is the single strongest quality measure currently in place. However, the app code uses `as any` casts in `store.ts` (lines 18-21, 206, 233-241) and `as EventListener` casts in various component files, which undermine strict mode guarantees in the highest-risk code paths.

The highest-risk modules -- `drag-drop.ts` (1,141 lines), `store.ts` (850 lines), `undo.ts` (88 lines, pure logic), and `bookmark-card.ts` (433 lines) -- have zero unit tests. A single bug in any of these modules can cause data loss, broken reordering, or a stuck UI state, with no automated detection before it reaches production.

---

## Findings by Severity

### CRITICAL

#### C1. No test runner configured -- tests exist but cannot be executed via npm

**Files:**
- `package.json:5-8`
- `playwright.config.ts:1-24`
- `tests/interaction-baseline.spec.ts:1-263`

```json
// package.json -- the complete scripts section
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview"
}
```

```typescript
// playwright.config.ts exists and is correctly configured
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  ...
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
  },
});
```

**Problems:**
- Running `npm test` fails (`missing script: test`). A developer or CI system has no canonical command to verify the project.
- `@playwright/test` is in `devDependencies` and `playwright.config.ts` is correctly wired, but there is no `"test:e2e": "npx playwright test"` script to invoke it.
- No `"typecheck": "tsc --noEmit"` script exists. The only way to type-check is through `npm run build`, which also does bundling. This means you cannot run a fast type-check without a full production build.
- No `"lint"` script. No ESLint or Biome configuration exists anywhere in the repo.
- The security check (`tests/security-check.py`) is a standalone Python script with no npm integration -- it requires `pip install playwright` and a running dev server, which is undocumented.

**Recommendation:** Add these scripts to `package.json` immediately:
```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:e2e": "npx playwright test",
  "test:security": "python tests/security-check.py"
}
```

#### C2. No CI/CD pipeline -- all quality checks are manual

**Files:**
- `.github/` -- directory does not exist

**Problems:**
- No GitHub Actions workflow runs on push or pull request. The `npm run build` step only happens on Vercel during deployment -- by then the code is already merged.
- A developer can push code that fails type-checking, breaks E2E tests, or introduces security regressions, and nothing catches it before production.
- The interaction baseline tests (`tests/interaction-baseline.spec.ts`) and security checks (`tests/security-check.py`) are never run automatically. They exist as documentation artifacts rather than active quality gates.
- The Convex backend (`convex/*.ts`) has its own `tsconfig.json` with `strict: true`, but no separate type-check step validates it in CI.

**Recommendation:** Create `.github/workflows/ci.yml` with three jobs: (1) `typecheck` (both `tsc --noEmit` for frontend and Convex), (2) `test` (Vitest unit tests once they exist), (3) `test:e2e` (Playwright against the dev server). Block merges on all three.

### HIGH

#### H1. Undo/redo system has zero tests despite being pure, testable logic

**Files:**
- `src/features/undo.ts:1-88`

```typescript
// undo.ts -- entire module is pure logic, no DOM dependencies
const undoStack: StackItem[] = [];
const redoStack: StackItem[] = [];
const MAX_STACK = 50;

let _isUndoing = false;
let _groupEntries: UndoEntry[] | null = null;

export function pushUndo(entry: UndoEntry): void {
  if (_isUndoing) return;           // guard against re-entrant pushes during undo
  if (_groupEntries) {
    _groupEntries.push(entry);      // group mode: collect, don't push to stack
    return;
  }
  undoStack.push(entry);
  if (undoStack.length > MAX_STACK) undoStack.shift();  // LRU eviction
  redoStack.length = 0;             // any new action clears redo
}
```

**Problems:**
- This module manages all undo/redo state for the entire application. Every CRUD operation, every drag reorder, every preference toggle pushes to this stack. A bug here silently corrupts or loses undo history.
- The module is 88 lines of pure logic with **zero DOM dependencies**. It is the single highest-ROI unit test target in the entire codebase.
- Critical invariants that are currently untested:
  - `pushUndo` during `_isUndoing` is correctly suppressed (prevents infinite undo loops)
  - `beginGroup` / `endGroup` correctly batches entries and pushes as a single `UndoGroup`
  - `endGroup` with no entries does not push an empty group
  - Redo stack is cleared on any new action
  - MAX_STACK eviction (shift) works correctly at boundary
  - Group undo reverses entry order; group redo preserves entry order (line 55)
  - Async undo/redo entries (Convex mutations) are properly awaited
  - Error in one entry of a group does not leave the stack in a corrupt state (there is no try/catch inside the group loop at line 56)

**Recommendation:** This should be the **first** unit test file written. Install Vitest. Create `tests/unit/undo.test.ts`. Cover all invariants listed above. Estimated effort: 1 hour for full coverage.

#### H2. Store rebuild and migration logic has zero tests

**Files:**
- `src/data/store.ts:253-350` (rebuild function)
- `src/data/store.ts:353-396` (migration and seed prompts)
- `src/data/store.ts:399-442` (local seed defaults)

```typescript
// store.ts:253-272 -- rebuild() is the core data pipeline
function rebuild(): void {
  if (_rawCategories === null || _rawBookmarks === null) return;

  // Check migration on first data arrival (only in sync mode)
  if (!_migrationChecked) {
    _migrationChecked = true;
    if (getAppMode() === 'sync' && _rawCategories.length === 0 && _rawBookmarks.length === 0) {
      const savedData = localStorage.getItem('speedDialData');
      if (savedData) {
        const legacy: Category[] = JSON.parse(savedData);
        if (legacy.length > 0) {
          promptMigration(legacy);
          return;  // <-- early return: no rebuild until migration completes
        }
      }
      promptSeedDefaults();
      return;
    }
  }
  // ... 80 more lines of denormalization logic
}
```

**Problems:**
- `rebuild()` is the central data pipeline -- it denormalizes raw Convex subscription data into the app's `Category[]` and `LayoutItem[]` structures. A bug here means the entire UI renders incorrect data.
- The migration path (lines 257-272) has complex conditional logic: sync mode + empty Convex + localStorage present = migration prompt; sync mode + empty everything = seed prompt. These paths are never tested.
- `rebuild()` silently early-returns if `_rawCategories` or `_rawBookmarks` is null. If a subscription fires bookmarks before categories, the bookmarks are lost until categories arrive. This is correct behavior, but it is implicit and fragile.
- The denormalization logic (lines 274-349) groups bookmarks by categoryId, sorts by order, builds tab groups, filters empty groups, and merges into LayoutItem[]. This is complex enough to have edge cases (e.g., bookmark references a deleted category, empty tab group, duplicate orders).
- Module-level mutable state (`_rawCategories`, `_rawBookmarks`, `_rawTabGroups`, `_migrationChecked`, `_convexActive`) makes testing harder but not impossible -- each test would need to reset module state.

**Recommendation:** Extract `rebuild()` logic into a pure function: `rebuildLayout(rawCategories, rawBookmarks, rawTabGroups) => { categories: Category[], layoutItems: LayoutItem[], tabGroups: TabGroup[] }`. Test that function in isolation. The migration/seeding logic can be tested separately by mocking `localStorage` and `styledConfirm`.

#### H3. Drag-drop engine has zero tests for its most complex logic

**Files:**
- `src/features/drag-drop.ts:386-519` (bookmark hit-testing)
- `src/features/drag-drop.ts:652-710` (layout drop zone detection)
- `src/features/drag-drop.ts:716-1130` (drop execution)
- `src/features/drag-drop.ts:44-54` (midpoint computation)

```typescript
// drag-drop.ts:44-54 -- midpoint math for float64 ordering
function computeMidpoint(
  bookmarks: { order?: number }[],
  targetIndex: number,
): number {
  const prev = targetIndex > 0 ? (bookmarks[targetIndex - 1].order ?? targetIndex - 1) : 0;
  const next =
    targetIndex < bookmarks.length
      ? (bookmarks[targetIndex].order ?? targetIndex)
      : (bookmarks.length > 0 ? (bookmarks[bookmarks.length - 1].order ?? bookmarks.length - 1) + 1 : 1);
  return (prev + next) / 2;
}
```

**Problems:**
- `computeMidpoint` is the core ordering algorithm. All drag-drop reordering depends on it calculating a float64 value between two adjacent items. Edge cases: empty array, single element, all elements with `undefined` order, very close float values (precision loss after many reorders).
- `performBookmarkDrop` (lines 1007-1130) has four code paths: same-category Convex, cross-category Convex, same-category local, cross-category local. Each path has different array splicing logic. A splice off-by-one means bookmarks land in the wrong position.
- The hit-testing functions (`hitTestBookmark`, `hitTestLayout`) do DOM queries and rect calculations -- these are E2E test territory, not unit testable.
- `restoreLocalOrder` and `moveBookmarkLocal` (lines 20-42) are pure data manipulation helpers that could be unit tested.

**Recommendation:** Unit-test `computeMidpoint`, `restoreLocalOrder`, and `moveBookmarkLocal` (extract if needed). E2E-test the full drag-drop flow using Playwright (the existing `interaction-baseline.spec.ts` has a starting point but only checks proxy visibility, not actual reorder results).

#### H4. Bookmark parsers have zero tests despite being the import safety net

**Files:**
- `src/utils/bookmark-parsers.ts:1-157`
- `src/utils/browser-bookmark-converter.ts:1-111`

```typescript
// bookmark-parsers.ts:5-17 -- format detection
export function detectFormat(content: string): Format {
  const trimmed = content.trimStart();
  if (
    trimmed.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>') ||
    trimmed.toUpperCase().startsWith('<DL')
  ) {
    return 'netscape-html';
  }
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return 'json';
  }
  return 'unknown';
}
```

```typescript
// bookmark-parsers.ts:23-131 -- Netscape HTML parser
export function parseNetscapeHTML(html: string): Category[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  // ... 100 lines of recursive HTML traversal
}
```

**Problems:**
- These parsers handle user-uploaded bookmark files from Chrome, Firefox, Safari, and Edge. Malformed input here could crash the import, silently drop bookmarks, or inject unexpected content.
- `detectFormat` uses simple prefix matching -- a JSON file with leading whitespace and BOM would be misdetected.
- `parseNetscapeHTML` uses `DOMParser` and recursive traversal. Edge cases: deeply nested folders, bookmarks without titles, bookmarks with non-http(s) schemes (handled by `isSkippableUrl`), empty folders, folders with the same name (handled by merge logic).
- `parseJSON` at line 137 does structural validation but allows extra properties -- a malformed JSON file with `name: 123` (number instead of string) would pass the `typeof` check.
- `browser-bookmark-converter.ts` has its own parallel `cleanFolderName` and `isSkippableUrl` implementations (duplicated from `bookmark-parsers.ts`). These could drift.
- All of these functions are **pure** (no DOM mutation, no side effects beyond DOMParser). They are ideal unit test targets.

**Recommendation:** Create `tests/unit/bookmark-parsers.test.ts` with real exported bookmark files from Chrome, Firefox, and Edge as test fixtures. Test `detectFormat`, `parseNetscapeHTML`, `parseJSON`, and `convertBrowserBookmarks`. Estimated effort: 2 hours.

### MEDIUM

#### M1. TypeScript strict mode is undermined by `as any` casts in critical paths

**Files:**
- `src/data/store.ts:18-21` (raw subscription state)
- `src/data/store.ts:206` (`result as any[]`)
- `src/data/store.ts:233-241` (preferences mapping with `as any`)

```typescript
// store.ts:18-21 -- raw Convex data typed as any
let _rawCategories: any[] | null = null;
let _rawBookmarks: any[] | null = null;
let _rawTabGroups: any[] | null = null;
```

```typescript
// store.ts:232-241 -- preferences mapping with as any casts
const prefs: UserPreferences = {
  theme: (result as any).theme === 'light' ? 'light' : 'dark',
  accentColorDark: (result as any).accentColorDark ?? null,
  accentColorLight: (result as any).accentColorLight ?? null,
  wireframeDark: (result as any).wireframeDark ?? false,
  wireframeLight: (result as any).wireframeLight ?? false,
  cardSize: (result as any).cardSize ?? 90,
  pageWidth: (result as any).pageWidth ?? 100,
  showCardNames: (result as any).showCardNames ?? true,
  autofillUrl: (result as any).autofillUrl ?? false,
};
```

**Problems:**
- The `any` types on raw subscription data mean TypeScript cannot catch shape mismatches between the Convex schema and the frontend's expectations. If a field is renamed in `convex/schema.ts`, the frontend compiles fine but crashes at runtime.
- The `(result as any).fieldName` pattern in the preferences callback (lines 232-241) bypasses type inference entirely. Convex's generated types (`api.preferences.get` return type) could be used here directly.
- `tsconfig.json` has `"strict": true` but also `"skipLibCheck": true` -- this means type errors in `.d.ts` files from dependencies are silently ignored.
- The `exclude: ["convex"]` in `tsconfig.json` means the root `tsc --noEmit` does not type-check backend code. The Convex backend has its own `tsconfig.json` with `strict: true`, but there is no npm script to run it.

**Recommendation:** (1) Type `_rawCategories`, `_rawBookmarks`, `_rawTabGroups` using Convex's generated `Doc<"categories">[]` etc. (2) Add a `"typecheck:convex": "tsc -p convex/tsconfig.json --noEmit"` script. (3) Replace `(result as any)` with proper type narrowing.

#### M2. Extension bridge message protocol is untested and unvalidated

**Files:**
- `src/utils/extension-bridge.ts:1-53`
- `src/auth/clerk.ts:234-262` (extension bridge init)

```typescript
// extension-bridge.ts:4-9 -- detection listener
export function initExtensionDetection(): void {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type === 'BB_EXT_INSTALLED') {
      extensionInstalled = true;
    }
  });
}
```

```typescript
// extension-bridge.ts:23-53 -- bookmark request with timeout
export function requestBrowserBookmarks(): Promise<BookmarkTreeNode[]> {
  return new Promise((resolve, reject) => {
    const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('Extension did not respond within 10 seconds.'));
    }, 10_000);
    // ... message handler with requestId matching
  });
}
```

**Problems:**
- `postMessage` messages are unvalidated beyond `event.source === window` and `event.data?.type`. A malicious or buggy extension could send `BB_EXT_BOOKMARKS_RESULT` with crafted `bookmarks` data that bypasses the tree-to-category converter.
- `requestBrowserBookmarks` generates a `requestId` using `Date.now().toString(36) + Math.random()`. This is not cryptographically secure, but for same-origin postMessage it does not need to be. However, the lack of any schema validation on the response payload is a concern.
- The auth bridge (`clerk.ts:234-262`) sends JWT tokens via `postMessage`. While restricted to `window.location.origin`, no test verifies this origin restriction works correctly.
- The 10-second timeout in `requestBrowserBookmarks` is hardcoded with no test for the timeout path.

**Recommendation:** Create unit tests for the message protocol: mock `window.postMessage` and `addEventListener`, verify requestId matching, timeout behavior, and origin checking. Test with malformed payloads to ensure graceful failure.

#### M3. Settings modal has complex import/export flows with no test coverage

**Files:**
- `src/components/modals/settings-modal.ts` (496 lines)

**Problems:**
- The settings modal handles JSON export, file import (both JSON and Netscape HTML), "erase all data" confirmation, and preference toggles. The import flow reads files via `FileReader`, detects format, parses, and calls `importBulk`. None of this is tested.
- The "erase all data" flow requires a double confirmation via `styledConfirm`. If either confirmation is accidentally bypassed (e.g., by a code change to `confirm-modal.ts`), data is irreversibly deleted.
- The export function serializes `getCategories()` to JSON. If the category structure changes, exports could become incompatible with imports -- no round-trip test verifies this.

**Recommendation:** Add E2E tests for: (1) export produces valid JSON that can be re-imported, (2) import of a Chrome bookmarks.html fixture results in the expected categories, (3) erase-all requires two confirmations.

#### M4. Existing interaction baseline tests are not wired to any workflow

**Files:**
- `tests/interaction-baseline.spec.ts:1-263`
- `playwright.config.ts:1-24`

```typescript
// interaction-baseline.spec.ts:49-67 -- tests exist and are well-structured
test.describe('App loads', () => {
  test('renders categories with default bookmarks in local mode', async ({ page }) => {
    await setupLocalMode(page);
    const categories = page.locator('.category, .tab-group');
    await expect(categories.first()).toBeVisible();
    const cards = bookmarkCards(page);
    expect(await cards.count()).toBeGreaterThan(0);
  });
  // ...
});
```

**Problems:**
- These tests are well-written and cover: app load, header controls, card click (opens new tab), modal open/close (button, Escape, backdrop), drag proxy visibility, category drag, theme toggle, and size controller. This is solid E2E baseline coverage.
- However: no npm script runs them, no CI pipeline invokes them, and there is no documentation indicating a developer should run them. They are invisible infrastructure.
- The tests only run in Chromium. The `playwright.config.ts` defines a single project (`Desktop Chrome`). Firefox and WebKit (Safari) are not tested.
- The tests use `reuseExistingServer: true` but also `webServer.command: 'npm run dev'`. This means they start a dev server if one is not running, but in CI, this dev server would need env vars (`VITE_CLERK_PUBLISHABLE_KEY`, `VITE_CONVEX_URL`). Without them, the app still loads (local mode), which is what these tests use.

**Recommendation:** (1) Add `"test:e2e": "npx playwright test"` to `package.json`. (2) Add Firefox project to `playwright.config.ts`. (3) Add a CI workflow step for E2E tests. (4) Document that these tests run in local mode and do not require auth env vars.

#### M5. Security check script is Python-based and environment-coupled

**Files:**
- `tests/security-check.py:1-168`

```python
# security-check.py:28-29 -- hardcoded localhost
print("\n=== Loading http://localhost:5173 ===\n")
page.goto("http://localhost:5173", wait_until="networkidle")
```

**Problems:**
- The script requires a running dev server at `localhost:5173`. It cannot be run in CI without starting the server first and waiting for it to be ready.
- It uses Python Playwright (`playwright.sync_api`), not the TypeScript Playwright that the rest of the project uses. This means a developer needs both `pip install playwright` and `npm install @playwright/test` -- two separate Playwright installations.
- The checks are valuable: CSP violations, footer link security (`noopener`/`noreferrer`), inline event handlers, icon fallback sizes, theme attribute, Clerk button position, and CSP meta tag directives. These should be preserved.
- The screenshot is saved to `/tmp/bb-security-check.png` -- a Unix path that may not work on Windows without WSL.

**Recommendation:** Migrate the security checks to TypeScript Playwright tests in `tests/security-baseline.spec.ts`. This unifies the test tooling, integrates with `playwright.config.ts` (which already handles dev server startup), and makes the checks runnable via `npm run test:e2e`.

### LOW

#### L1. No linter catches common code quality issues

**Files:**
- No `.eslintrc`, `eslint.config.js`, `biome.json`, or `.prettierrc` found anywhere in the repo.

**Problems:**
- No automated enforcement of consistent code style, unused imports, unreachable code, or common TypeScript anti-patterns.
- The `as any` casts in `store.ts` (H1/M1 above) would be flagged by `@typescript-eslint/no-explicit-any`.
- The `as EventListener` casts noted in the interaction audit would be flagged by `@typescript-eslint/no-unsafe-argument`.

**Recommendation:** Add Biome (faster than ESLint, zero-config for TypeScript). A minimal `biome.json` with default rules would catch the most impactful issues without requiring extensive configuration.

#### L2. No test for the `escapeHtml` utility despite XSS-prevention role

**Files:**
- `src/utils/escape-html.ts:1-11`

```typescript
const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);
}
```

**Problems:**
- This function is the XSS prevention layer. Every piece of user-generated content (bookmark titles, URLs, category names) goes through it before being inserted into innerHTML. If this function is broken, the entire app is vulnerable to stored XSS.
- The function is 3 lines of pure logic. A unit test takes 5 minutes to write and provides permanent safety.
- Edge cases not currently verified: null/undefined input (would throw), empty string, strings with only special characters, backtick (not escaped -- HTML template literal context), forward slash (not escaped -- safe in HTML attribute context but worth documenting).

**Recommendation:** Add to the first Vitest suite. Test: basic escaping, all 5 special characters, empty string, no-op for clean strings.

#### L3. `getIconUrl` uses Google's S2 favicon service without fallback timeout

**Files:**
- `src/utils/icons.ts:1-16`

```typescript
export function getIconUrl(bookmark: Bookmark): string {
  if (bookmark.iconPath) {
    return bookmark.iconPath;
  }
  try {
    const domain = new URL(bookmark.url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return 'data:image/svg+xml,...';
  }
}
```

**Problems:**
- If Google's S2 service is slow or returns a 16x16 globe (the "unknown domain" response), the UI shows tiny or missing icons. The `data-auto-icon` + load handler in `categories.ts:139-148` mitigates this, but neither the URL generation nor the fallback logic is tested.
- `new URL(bookmark.url)` can throw for malformed URLs. The catch block returns a fallback SVG, which is correct, but this path is untested.

**Recommendation:** Unit-test `getIconUrl` with: valid URL, custom iconPath, malformed URL, empty URL string.

#### L4. Convex backend mutations have no integration tests

**Files:**
- `convex/bookmarks.ts:1-238`
- `convex/categories.ts:1-128`
- `convex/tabGroups.ts:1-162`
- `convex/preferences.ts:1-75`

**Problems:**
- All Convex mutations enforce auth (`getUserIdentity`), verify ownership, and validate input (e.g., `validateUrl` in bookmarks). None of this is tested.
- The `importBulk` mutation (bookmarks.ts:150-206) enforces limits (500 categories, 5000 bookmarks) and validates URLs before inserting. If the URL validation `throw` inside the loop doesn't properly abort the transaction, partial imports could occur. Convex mutations are atomic, but this assumption is untested.
- The `eraseAll` mutation (bookmarks.ts:208-238) deletes all user data across three tables. A bug here (e.g., missing userId filter) could delete another user's data. This is the highest-severity backend risk.

**Recommendation:** Use Convex's testing utilities (`convex-test`) to write integration tests for: auth enforcement, ownership verification, import limits, URL validation, and erase-all scope. This is lower priority than frontend tests because Convex provides strong runtime guarantees, but `eraseAll` in particular deserves a test.

---

## Test Coverage Map

### Current State

| Module | Lines | Unit Tests | E2E Tests | Test Priority |
|--------|------:|:----------:|:---------:|:-------------:|
| **src/features/undo.ts** | 88 | None | None | **P0 -- pure logic, highest ROI** |
| **src/features/drag-drop.ts** | 1,141 | None | Proxy visibility only | **P0 -- complex, high user impact** |
| **src/data/store.ts** | 850 | None | None | **P0 -- data pipeline, migration** |
| **src/utils/bookmark-parsers.ts** | 157 | None | None | **P1 -- pure logic, import safety** |
| **src/utils/browser-bookmark-converter.ts** | 111 | None | None | **P1 -- pure logic, extension import** |
| **src/utils/escape-html.ts** | 11 | None | None | **P1 -- XSS prevention** |
| **src/utils/icons.ts** | 16 | None | None | **P2 -- simple, low risk** |
| **src/components/bookmark-card.ts** | 433 | None | Card click only | P1 -- interaction complexity |
| **src/components/categories.ts** | 537 | None | Basic render only | P2 -- rendering, lower risk |
| **src/features/preferences.ts** | 345 | None | Size controller only | P2 -- mostly getters/setters |
| **src/features/theme.ts** | 243 | None | Theme toggle only | P2 -- low complexity |
| **src/components/modals/settings-modal.ts** | 496 | None | Open/close only | P1 -- import/export flows |
| **src/components/modals/bookmark-modal.ts** | 221 | None | Open only | P2 |
| **src/components/modals/category-modal.ts** | 137 | None | Open/close only | P2 |
| **src/components/modals/confirm-modal.ts** | 168 | None | None | P2 -- data deletion guard |
| **src/auth/clerk.ts** | 262 | None | None | P2 -- auth, hard to unit test |
| **src/utils/extension-bridge.ts** | 53 | None | None | P2 -- message protocol |
| **src/utils/interaction-constants.ts** | 40 | N/A (constants) | N/A | None needed |
| **src/main.ts** | 330 | None | Implicit via E2E | P3 -- wiring, covered by E2E |
| **src/data/convex-client.ts** | 34 | None | None | P3 -- thin wrapper |
| **src/data/defaults.ts** | 92 | None | None | P3 -- static data |
| **src/utils/modal-swipe-dismiss.ts** | 149 | None | None | P3 -- touch UX |
| **src/utils/modal-manager.ts** | 46 | None | None | P3 -- simple |
| **convex/bookmarks.ts** | 238 | None | None | P1 -- CRUD + auth + import |
| **convex/categories.ts** | 128 | None | None | P2 |
| **convex/tabGroups.ts** | 162 | None | None | P2 |
| **convex/schema.ts** | 56 | N/A (schema) | N/A | None needed |
| **tests/security-check.py** | 168 | N/A | Manual only | Migrate to TS |
| **tests/interaction-baseline.spec.ts** | 263 | N/A | Exists, unwired | Wire to npm + CI |

### What Kind of Tests Each Module Needs

| Test Type | Best Tool | Target Modules | Rationale |
|-----------|-----------|----------------|-----------|
| **Unit** (pure logic) | Vitest | `undo.ts`, `escape-html.ts`, `bookmark-parsers.ts`, `browser-bookmark-converter.ts`, `icons.ts`, `computeMidpoint` from `drag-drop.ts` | Zero external dependencies, fast, highest confidence per test-line |
| **Unit** (with mocks) | Vitest + mocks | `store.ts` (rebuild logic), `extension-bridge.ts`, `preferences.ts` (state management) | Need localStorage/window mocks but still fast |
| **E2E** (user flows) | Playwright | Modal flows, drag reorder results, import/export round-trip, theme toggle | Verify full interaction chains in a real browser |
| **E2E** (security) | Playwright | CSP, link attributes, inline handlers, icon fallbacks | Currently in Python; migrate to TS Playwright |
| **Backend integration** | convex-test | `bookmarks.ts`, `categories.ts` (auth, ownership, import limits) | Verify server-side invariants |

---

## Risk Inventory

Modules ranked by **complexity x change frequency x user impact**. This determines test priority.

| Rank | Module | Lines | Complexity | Change Freq | User Impact | Risk Score | Current Coverage |
|:----:|--------|------:|:----------:|:-----------:|:-----------:|:----------:|:----------------:|
| 1 | `drag-drop.ts` | 1,141 | Very High | High | Critical (reorder) | **25** | Proxy visibility E2E only |
| 2 | `store.ts` | 850 | Very High | High | Critical (data) | **25** | None |
| 3 | `undo.ts` | 88 | Medium | Medium | High (data integrity) | **15** | None |
| 4 | `bookmark-card.ts` | 433 | High | Medium | High (interaction) | **15** | Card click E2E only |
| 5 | `settings-modal.ts` | 496 | High | Medium | High (import/export) | **15** | Open/close E2E only |
| 6 | `bookmark-parsers.ts` | 157 | Medium | Low | High (data import) | **12** | None |
| 7 | `categories.ts` | 537 | High | High | Medium (rendering) | **12** | Basic render E2E only |
| 8 | `convex/bookmarks.ts` | 238 | Medium | Medium | Critical (backend) | **12** | None |
| 9 | `preferences.ts` | 345 | Medium | Medium | Medium (settings) | **9** | Size controller E2E only |
| 10 | `clerk.ts` | 262 | High | Low | High (auth) | **9** | None |
| 11 | `extension-bridge.ts` | 53 | Low | Low | Medium (extension) | **4** | None |
| 12 | `escape-html.ts` | 11 | Low | Very Low | Critical (XSS) | **4** | None |

Risk score = complexity(1-5) x changeFreq(1-5) x userImpact(1-5), normalized. Modules scoring 12+ should be tested in Phase 1.

---

## Recommended Overhaul Plan

### Phase 0: Wire existing assets (30 minutes)

**Goal:** Make the existing tests runnable with a single command.

1. Add scripts to `package.json`:
   ```json
   "typecheck": "tsc --noEmit",
   "test:e2e": "npx playwright test",
   "test:security": "python tests/security-check.py"
   ```
2. Run `npx playwright install chromium` to ensure browser binaries are available.
3. Verify `npm run test:e2e` passes against the existing `interaction-baseline.spec.ts`.
4. Verify `npm run typecheck` passes.

### Phase 1: Unit test foundation (3-4 hours)

**Goal:** Cover pure-logic modules with zero-setup unit tests.

1. Install Vitest: `npm install -D vitest`
2. Add `vitest.config.ts` (use Vite's existing config):
   ```typescript
   import { defineConfig } from 'vitest/config';
   export default defineConfig({
     test: {
       environment: 'jsdom',  // needed for DOMParser in bookmark-parsers
       include: ['tests/unit/**/*.test.ts'],
     },
   });
   ```
3. Add `"test": "vitest run"` and `"test:watch": "vitest"` to `package.json`.
4. Write unit tests (priority order):
   - `tests/unit/undo.test.ts` -- all invariants from H1 (1 hour)
   - `tests/unit/escape-html.test.ts` -- XSS prevention (15 min)
   - `tests/unit/bookmark-parsers.test.ts` -- format detection, HTML parser, JSON parser (1 hour)
   - `tests/unit/browser-bookmark-converter.test.ts` -- tree conversion (30 min)
   - `tests/unit/icons.test.ts` -- URL generation, fallback (15 min)
   - `tests/unit/drag-drop-helpers.test.ts` -- `computeMidpoint` extracted and tested (30 min)

### Phase 2: Store rebuild tests (2-3 hours)

**Goal:** Test the data pipeline without a running backend.

1. Extract `rebuild` denormalization logic into a pure function (as described in H2).
2. Write `tests/unit/store-rebuild.test.ts`:
   - Empty categories + bookmarks = empty layout
   - Bookmarks correctly grouped by categoryId
   - Tab groups with empty categories are filtered
   - Ordering is correct (categories sorted by order, bookmarks sorted within)
   - Categories with `groupId` referencing a missing group fall to ungrouped
   - Duplicate orders produce stable sort
3. Write `tests/unit/store-migration.test.ts` (mock localStorage):
   - Sync mode + empty Convex + localStorage present = migration path
   - Sync mode + empty everything = seed path
   - Local mode skips migration check

### Phase 3: CI pipeline (1-2 hours)

**Goal:** Automated quality gates on every push.

1. Create `.github/workflows/ci.yml`:
   ```yaml
   name: CI
   on: [push, pull_request]
   jobs:
     quality:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 20 }
         - run: npm ci
         - run: npm run typecheck
         - run: npm test
     e2e:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 20 }
         - run: npm ci
         - run: npx playwright install --with-deps chromium
         - run: npm run test:e2e
   ```
2. Add branch protection rule: require `quality` and `e2e` jobs to pass before merge.

### Phase 4: E2E coverage expansion (3-4 hours)

**Goal:** Test the user flows that unit tests cannot reach.

1. Migrate `tests/security-check.py` to `tests/security-baseline.spec.ts` (TypeScript Playwright).
2. Add E2E tests for:
   - Import/export round-trip: export JSON, re-import, verify data matches
   - Bookmark drag reorder: verify actual DOM order changes after drop (not just proxy visibility)
   - Cross-category bookmark drag: verify bookmark moves between categories
   - Category drag reorder: verify layout order changes
   - Undo/redo via keyboard: Ctrl+Z reverts last action, Ctrl+Y re-applies
   - Modal backdrop click dismiss (all 4 modals)
   - "Erase all data" requires two confirmations
3. Add Firefox to `playwright.config.ts` projects.

### Phase 5: Backend tests and polish (2-3 hours)

**Goal:** Backend safety net and code quality tooling.

1. Install `convex-test` and write integration tests for `convex/bookmarks.ts`:
   - Auth enforcement (unauthenticated user gets empty list / error)
   - Ownership check (user A cannot access user B's bookmarks)
   - `importBulk` limits (501 categories rejected, 5001 bookmarks rejected)
   - `validateUrl` rejects `javascript:` and `data:` URLs
   - `eraseAll` only deletes the calling user's data
2. Add Biome for linting: `npm install -D @biomejs/biome`, add `"lint": "biome check src/"` script.
3. Replace `as any` casts in `store.ts` with proper Convex types.

---

## Summary

| Priority | Item | Files Affected | Effort |
|----------|------|----------------|--------|
| **Critical** | C1: Add npm scripts (test, typecheck, lint) | `package.json` | 10 min |
| **Critical** | C2: Create CI workflow | `.github/workflows/ci.yml` | 1 hour |
| **High** | H1: Unit tests for undo.ts | New: `tests/unit/undo.test.ts` | 1 hour |
| **High** | H2: Unit tests for store rebuild | `store.ts` (extract), new test file | 2-3 hours |
| **High** | H3: Unit tests for drag-drop helpers | `drag-drop.ts` (extract), new test file | 1 hour |
| **High** | H4: Unit tests for bookmark parsers | New: `tests/unit/bookmark-parsers.test.ts` | 2 hours |
| **Medium** | M1: Type `as any` casts properly in store.ts | `src/data/store.ts` | 30 min |
| **Medium** | M2: Extension bridge protocol tests | New test file | 1 hour |
| **Medium** | M3: E2E tests for import/export flows | New spec file | 2 hours |
| **Medium** | M4: Wire existing E2E tests to npm + CI | `package.json`, CI workflow | 15 min |
| **Medium** | M5: Migrate security check to TypeScript | `tests/security-check.py` -> `.spec.ts` | 1 hour |
| **Low** | L1: Add Biome linter | `biome.json`, `package.json` | 30 min |
| **Low** | L2: Unit test escape-html | New test file | 15 min |
| **Low** | L3: Unit test getIconUrl | New test file | 15 min |
| **Low** | L4: Convex backend integration tests | New test files + `convex-test` | 2-3 hours |

**Total estimated effort:**
- Phase 0 (wire existing): 30 minutes
- Phase 1 (unit test foundation): 3-4 hours
- Phase 2 (store tests): 2-3 hours
- Phase 3 (CI pipeline): 1-2 hours
- Phase 4 (E2E expansion): 3-4 hours
- Phase 5 (backend + polish): 2-3 hours

**Grand total: ~12-16 hours** to go from near-zero to comprehensive test coverage with automated CI enforcement. Phases 0-1 alone (4 hours) would catch the majority of regression-causing bugs.
