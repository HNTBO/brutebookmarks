# Error Handling Audit

Comprehensive audit of error handling, failure modes, and user feedback across Brute Bookmarks.
Conducted 2026-02-19.

---

## Executive Summary

The codebase has **three distinct error handling strategies** coexisting:

1. **Silent swallow** (most common): errors are caught and either `console.error`'d or discarded entirely, with no user-visible feedback.
2. **User-facing alerts** (selective): some operations use `styledAlert()` to report failures to the user.
3. **Re-throw after cleanup** (settings operations): `fetchAllFavicons` and `smartNameAll` reset UI state in their catch block, then `throw e` — but nothing above them catches, creating unhandled rejections.

The most dangerous pattern is the **absence of a global safety net**: there is no `window.addEventListener('unhandledrejection')` handler, no `window.onerror` handler, and no top-level `try/catch` around `init()`. When async operations fail (Convex mutations, network fetches, undo callbacks), errors propagate silently to the browser console where users never see them. Meanwhile, the operations that DO show user-facing errors (import, migration) create a false sense of completeness — a user might assume "if something goes wrong, the app tells me," when in reality most failures are invisible.

The undo/redo system is particularly fragile: if an undo callback throws, the stack item is popped but never pushed to the opposite stack, leaving the user with corrupted undo history and no indication of what happened.

---

## Findings by Severity

### CRITICAL: Unhandled Rejection Vectors

#### C1. `fetchAllFavicons` and `smartNameAll` throw after catch — no caller catches

**Files:** `settings-modal.ts` lines 294-300, 365-371

Both functions follow the same pattern: try the operation, catch to reset UI state, then re-throw the error. But the callers are `addEventListener('click', fetchAllFavicons)` and `addEventListener('click', smartNameAll)` — event handlers that do not catch the re-thrown error.

```typescript
// settings-modal.ts:294-300 (fetchAllFavicons)
  } catch (e) {
    modalContent.style.pointerEvents = '';
    modalContent.style.opacity = '';
    settingsBusy = false;
    btn.textContent = 'Fetch Favicons';
    throw e;  // <-- re-thrown into addEventListener callback — becomes unhandled rejection
  }

// settings-modal.ts:365-371 (smartNameAll)
  } catch (e) {
    modalContent.style.pointerEvents = '';
    modalContent.style.opacity = '';
    settingsBusy = false;
    btn.textContent = 'Smart Name';
    throw e;  // <-- same problem
  }
```

**Problems:**
- When Convex is offline, or a mutation fails mid-batch, the error becomes an unhandled promise rejection
- The UI resets correctly (button text, opacity), but the user sees nothing — the operation just silently stops partway through
- Some bookmarks may have been updated while others were not, leaving the data in a partially-modified state with no way for the user to know which bookmarks were affected
- In Chrome, unhandled rejections appear in the console but are invisible to users; some browsers may show a generic error popup

**Recommendation:** Replace `throw e` with `await styledAlert('Operation failed: ' + (e instanceof Error ? e.message : 'Unknown error'), title)`. This matches the pattern already used in `promptMigration`.

#### C2. No global unhandled rejection handler

**File:** `main.ts` (entire file — handler is absent)

There is no `window.addEventListener('unhandledrejection', ...)` or `window.addEventListener('error', ...)` anywhere in the codebase. The `init()` function at line 338 is called without any surrounding error handling.

```typescript
// main.ts:338
init();  // async function — if it throws, the rejection is unhandled
```

**Problems:**
- If `initializeData()` throws (e.g., corrupted localStorage JSON — see M2), the app shows a blank screen with no explanation
- If `initClerk().then(...)` throws inside the `.then()` callback, the error vanishes
- All fire-and-forget async calls throughout the app (undo callbacks, preference saves, drag-drop mutations) have no safety net
- During development, this creates hard-to-diagnose issues where the app stops working but the console shows nothing useful

**Recommendation:** Add a global handler in `main.ts`:
```typescript
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled]', event.reason);
  // Optionally: styledAlert('Something went wrong. Try refreshing.', 'Error');
});
```

### HIGH: Silent Failures in Core Operations

#### H1. All store mutation helpers lack try/catch — errors propagate uncaught to callers

**File:** `store.ts` lines 446-851

Every mutation helper (`createCategory`, `updateCategory`, `deleteCategory`, `createBookmark`, `updateBookmark`, `deleteBookmarkById`, `reorderCategory`, `reorderBookmark`, etc.) calls `client.mutation(...)` without any error handling. The async errors propagate to callers, which also don't catch them.

```typescript
// store.ts:449-450 (createCategory)
    const client = getConvexClient()!;
    newId = await client.mutation(api.categories.create, { name });
    // No try/catch — if Convex is offline, this throws

// store.ts:584-591 (updateBookmark)
    const client = getConvexClient()!;
    await client.mutation(api.bookmarks.update, {
      id: id as Id<'bookmarks'>,
      title,
      url,
      iconPath: iconPath ?? undefined,
      categoryId: categoryId ? (categoryId as Id<'categories'>) : undefined,
    });
    // No try/catch — network failure, auth expiry, or validation error all throw
```

The call chain is: `event handler` -> `saveCategory()` / `saveBookmark()` / `deleteBookmark()` -> `store.createCategory()` / `store.updateBookmark()` / etc. -> `client.mutation()`. None of these layers catch the error.

**Problems:**
- When Convex goes offline mid-session, every user action (save, delete, reorder) silently fails
- The user sees the modal close (the `closeBookmarkModal()` call happens after the `await`, so it won't execute on failure — but the user has no feedback about WHY nothing happened)
- Actually, for `saveBookmark` at `bookmark-modal.ts:147-148`, the `closeBookmarkModal()` at line 177 is AFTER the `await`, so the modal stays open — but the user gets no error message explaining why
- For `deleteBookmark` at `bookmark-modal.ts:182`, the await is inside an `if`, so the user just sees... nothing happen
- The `getConvexClient()!` non-null assertion (16 occurrences) will throw a TypeError if the client is somehow null while `_convexActive` is true — an edge case, but it would be an unhelpful "Cannot read properties of null" error

**Recommendation:** Add a centralized mutation wrapper:
```typescript
async function safeMutation<T>(operation: () => Promise<T>, fallbackMessage: string): Promise<T | null> {
  try {
    return await operation();
  } catch (err) {
    console.error(fallbackMessage, err);
    await styledAlert(fallbackMessage, 'Error');
    return null;
  }
}
```

#### H2. Undo/redo errors corrupt the stack silently

**File:** `undo.ts` lines 64-88

When an undo callback throws, the `try/finally` ensures `_isUndoing` is reset, but the item has already been popped from `undoStack` and is NOT pushed to `redoStack` (because the push is inside `try`, after `await executeItem`).

```typescript
// undo.ts:64-75
export async function undo(): Promise<void> {
  const item = undoStack.pop();     // item is removed from undoStack
  if (!item) return;
  _isUndoing = true;
  try {
    await executeItem(item, 'undo'); // if this throws...
    redoStack.push(item);            // ...this never executes
  } finally {
    _isUndoing = false;
  }
  _afterUndoRedo?.();               // ...and this never executes either
}
```

**Problems:**
- The undo entry is permanently lost — the user can't undo OR redo that action anymore
- If a group undo (multiple entries) fails partway through, some entries execute and some don't, leaving data in an inconsistent state
- The `_afterUndoRedo` callback (which refreshes UI) never fires, so visual state may be stale
- The error from `executeItem` propagates upward — but `undo()` is called from `main.ts:152` via `e.preventDefault(); undo();` which doesn't await or catch, creating an unhandled rejection

**Recommendation:** Catch errors inside undo/redo, still push the item to the opposite stack (so the user can at least retry), and show a user-facing alert.

#### H3. Seed defaults failure is invisible to users

**File:** `store.ts` lines 381-396

When a new user clicks "Load sample bookmarks" and the Convex mutation fails, the error is caught, logged to console, and discarded. The user sees an empty app with no explanation.

```typescript
// store.ts:389-396
  try {
    await client.mutation(api.seed.seedDefaults, { items: DEFAULT_LAYOUT });
    console.log('[Store] Seed defaults loaded');
  } catch (error) {
    console.error('[Store] Seed defaults failed:', error);
    // No user feedback — user sees empty app
  }
```

Compare with `promptMigration` (lines 374-376) which DOES show a `styledAlert` on failure.

**Problems:**
- A new user's first experience with the app may be a blank page with no bookmarks and no explanation
- The user just clicked "yes" to load sample bookmarks — the expectation is set that something will appear
- Unlike migration failure (which preserves local data), seed failure leaves the user with nothing

**Recommendation:** Add `await styledAlert('Failed to load sample bookmarks. You can add your own using the + button.', 'Welcome');` in the catch block.

#### H4. Drag-drop mutations are fire-and-forget with no error handling

**File:** `drag-drop.ts` lines 773, 825-896, 1041, 1069

All drag-drop reorder operations call async store mutations (`reorderBookmark`, `reorderCategory`, `reorderTabGroup`, `setCategoryGroup`, `createTabGroup`, `mergeTabGroups`) without awaiting or catching.

```typescript
// drag-drop.ts:773
      reorderBookmark(bkId, newOrder, targetCategoryId);  // not awaited

// drag-drop.ts:825
      createTabGroup('Tab Group', [zone.targetCategoryId, layoutData.id]);  // not awaited

// drag-drop.ts:893
      reorderCategory(layoutData.id, newOrder);  // not awaited
```

**Problems:**
- The UI updates optimistically (local array is already spliced before the mutation call), but if the mutation fails, the next Convex subscription update will revert the UI to the server state — causing a confusing "jump back"
- No user feedback when the revert happens
- The undo entry is pushed to the stack before the mutation succeeds, so the user might undo an operation that never actually persisted

**Recommendation:** At minimum, catch errors and show a toast/alert. Ideally, await the mutation before pushing the undo entry.

### MEDIUM: Fragile Patterns and Missing Safety

#### M1. String matching on error messages for backward compatibility

**File:** `store.ts` lines 767-778

The `setCategoryGroup` function catches errors and checks `err.message.includes("extra field \`order\`")` to detect an older Convex backend that doesn't support the `order` parameter.

```typescript
// store.ts:767-778
    } catch (err) {
      // Backward compatibility: older deployed validator rejects extra "order".
      if (
        order !== undefined &&
        err instanceof Error &&
        err.message.includes("extra field `order`")
      ) {
        await client.mutation(api.categories.setGroup, baseArgs);
        return;
      }
      throw err;
    }
```

**Problems:**
- Convex could change the error message format in a future version, breaking this detection
- If the Convex backend is updated to accept `order` but throws a different error, this catch would re-throw instead of falling back
- The pattern conflates "validation error" with "any error whose message happens to contain that substring"
- This is a temporary migration shim that should be removed once all deployments support the `order` parameter

**Recommendation:** Add a comment with a removal date/condition. Consider checking for a more structured error type if Convex provides one (e.g., `ConvexError` with error codes).

#### M2. `JSON.parse` on localStorage data has no try/catch

**File:** `store.ts` lines 100-113

The `initializeData` function parses localStorage data without any error handling. If the stored JSON is corrupted (browser crash, manual tampering, extension interference), the app crashes on startup.

```typescript
// store.ts:100-113
export async function initializeData(): Promise<void> {
  const savedData = localStorage.getItem('speedDialData');
  if (savedData) {
    _categories = JSON.parse(savedData);  // throws SyntaxError if corrupted
  } else {
    _categories = [];
  }
  const savedGroups = localStorage.getItem('speedDialTabGroups');
  if (savedGroups) {
    _localTabGroups = JSON.parse(savedGroups);  // throws SyntaxError if corrupted
  } else {
    _localTabGroups = [];
  }
  rebuildLocalLayout();
}
```

Same issue at lines 262 and 403 in `rebuild()` and `seedLocalDefaults()`.

**Problems:**
- `SyntaxError` from `JSON.parse` propagates up to `init()`, which has no catch, killing the app
- The user sees a blank/broken page with no way to recover
- localStorage can become corrupted by browser crashes, quota exceeded errors on write, or third-party extensions

**Recommendation:** Wrap in try/catch, fall back to empty arrays, and optionally warn the user:
```typescript
try {
  _categories = JSON.parse(savedData);
} catch {
  console.warn('[Store] Corrupted localStorage — starting fresh');
  _categories = [];
  localStorage.removeItem('speedDialData');
}
```

#### M3. Convex subscription errors are unhandled

**File:** `store.ts` lines 205-249

The `activateConvex()` function registers four `client.onUpdate()` subscriptions but provides no error callback. The Convex `onUpdate` API does support an `onError` parameter.

```typescript
// store.ts:205-208
  client.onUpdate(api.categories.list, {}, (result) => {
    _rawCategories = result as any[];
    rebuild();
  });
  // No error handler — if the subscription fails, it fails silently
```

**Problems:**
- If authentication expires mid-session, subscriptions may fail silently
- If the Convex backend throws a function error, the subscription error is unhandled
- The user sees stale data with no indication that sync has stopped working
- There is no reconnection logic or "offline" indicator

**Recommendation:** Add error callbacks to each subscription, and consider adding a visual "sync status" indicator:
```typescript
client.onUpdate(api.categories.list, {}, (result) => { ... }, (err) => {
  console.error('[Store] Subscription error:', err);
});
```

#### M4. Preference save failures are silently swallowed

**File:** `store.ts` lines 146-161, 178-189

Both `savePreferencesToConvex` and `flushPreferencesToConvex` catch errors and only `console.error`. If preference sync fails, the user's theme, card size, and other settings are lost on the next device but the user has no idea.

```typescript
// store.ts:158-160
    } catch (err) {
      console.error('[Store] Failed to save preferences:', err);
    }

// store.ts:188
  }).catch((err) => console.error('[Store] Failed to flush preferences:', err));
```

**Problems:**
- Cross-device sync is a core feature — preference save failures undermine it silently
- The `flushPreferencesToConvex` (line 178) doesn't even `await` the mutation — it's fire-and-forget with `.catch()`
- Called from `visibilitychange` and `beforeunload` events (main.ts:186-188), which have limited time to execute — the mutation may be cancelled by the browser before completing

**Recommendation:** For the debounced save, this is acceptable (it will retry on next change). For the `beforeunload` flush, consider using `navigator.sendBeacon` as a fallback, or at least document that the flush is best-effort.

#### M5. Auth initialization failure silently disables sync

**File:** `clerk.ts` lines 45-104

The `initClerk` function has a top-level try/catch that returns `null` on any error. The caller in `main.ts` (line 285-310) chains `.then((clerk) => { if (!clerk) return; ... })` — so if auth fails, the app silently runs without sync.

```typescript
// clerk.ts:100-103
  } catch (err) {
    console.error('[Auth] Error:', err);
    return null;
  }

// main.ts:285-286
  initClerk().then((clerk) => {
    if (!clerk) return;  // Auth failed — user has no idea why sync isn't working
```

**Problems:**
- If the Clerk CDN is blocked (corporate firewall, ad blocker, network issue), the user selected "sync" mode but gets no sync with no explanation
- The user sees an empty app (because sync mode skips the initial render at main.ts:249)
- No fallback to local mode, no error message, no retry mechanism

**Recommendation:** When auth fails in sync mode, show a user-facing message and offer to fall back to local mode. At minimum, render the local cache so the user sees their bookmarks.

#### M6. `fetchAndSetTitle` silently fails with no user feedback

**File:** `bookmark-modal.ts` lines 23-66

The title fetch function catches errors silently in two places and falls back to domain-name capitalization.

```typescript
// bookmark-modal.ts:36-41
      try {
        const result = await client.action(api.metadata.fetchPageTitle, { url });
        title = result.title;
      } catch {
        // Silently fail
      }

// bookmark-modal.ts:47-53
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      const name = hostname.split('.')[0];
      title = name.charAt(0).toUpperCase() + name.slice(1);
    } catch {
      // Invalid URL — do nothing
    }
```

**Problems:**
- The silent failure is actually correct here for the title fetch (it's a best-effort enhancement)
- However, the `// Silently fail` comment is concerning — it suggests the catch was added without considering whether feedback is needed
- The generation counter pattern (line 28: `const generation = ++titleFetchGeneration`) is well-implemented and correctly handles race conditions

**Note:** This is one of the **better** error handling patterns in the codebase. The generation counter prevents stale results from overwriting user input. Included here as a reference for what good looks like.

### LOW: Minor Issues and Edge Cases

#### L1. Fire-and-forget favicon resolution after bookmark creation

**File:** `bookmark-modal.ts` lines 151-174

After creating a bookmark, the auto-favicon resolution is intentionally fire-and-forget with `.catch(() => {})`:

```typescript
// bookmark-modal.ts:156-160
          client.action(api.favicons.resolveFavicon, { url }).then((result) => {
            if (result.iconUrl) {
              updateBookmark(newId, title, url, result.iconUrl).catch(() => {});
            }
          }).catch(() => {});
```

**Problems:**
- If the favicon resolution succeeds but `updateBookmark` fails, the empty `.catch(() => {})` swallows the error entirely
- The bookmark exists but never gets its favicon, with no indication to the user
- The `newId` reference may become stale if the user deletes and recreates the bookmark before the favicon resolves

**Recommendation:** This is acceptable as-is since it's a non-critical enhancement. Consider logging to console instead of fully swallowing.

#### L2. `styledAlert` and `styledConfirm` share a single resolver — no queue

**File:** `confirm-modal.ts` lines 3-4, 37-66

The confirm modal uses module-level `_resolve` and `_promptResolve` variables. If two `styledAlert` calls happen concurrently, the second overwrites the first's resolver, leaving the first promise permanently unresolved.

```typescript
// confirm-modal.ts:3-4
let _resolve: ((value: boolean | null) => void) | null = null;
let _promptResolve: ((value: string | null) => void) | null = null;

// confirm-modal.ts:48-50
  return new Promise((resolve) => {
    _resolve = resolve;  // overwrites any existing _resolve
  });
```

**Problems:**
- If `styledAlert('A')` is called, then `styledAlert('B')` before the user dismisses 'A', the 'A' promise never resolves
- Any code `await`ing the first alert hangs forever
- In practice this is rare because the modal is... modal (prevents interaction with the rest of the app), but programmatic calls (e.g., in a loop) could trigger this

**Recommendation:** Either queue modal requests, or reject the previous promise when a new one is created.

#### L3. `getFoundingMemberStats` returns hardcoded fallback without logging

**File:** `founding-stats.ts` lines 6-20

```typescript
// founding-stats.ts:17-18
  } catch {
    return { count: 0, cap: 1000 };
  }
```

**Problems:**
- If the Convex query fails, the UI shows "0 / 1000 claimed" which looks correct but is wrong
- No console.error — the failure is completely invisible even to developers
- The hardcoded cap (1000) could diverge from the actual server-side cap

**Recommendation:** Add `console.warn('[Stats] Failed to fetch founding member stats')` in the catch block.

#### L4. Clipboard read failure is correctly silent

**File:** `bookmark-modal.ts` lines 86-95

```typescript
// bookmark-modal.ts:93-95
    } catch {
      // Clipboard access denied or unavailable — silently ignore
    }
```

**Note:** This is correct. Clipboard API requires user gesture and can be denied by browser policy. Silent failure is the right approach here. Included for completeness.

#### L5. Icon search abort timeout could show stale "loading" state

**File:** `icon-picker.ts` lines 158-219

The Wikimedia search uses `AbortController` with a 4-second timeout (line 159), but if the abort fires, the error falls through to the catch block which hides the loading indicator and shows "Search failed" — this is correct. However, if the `response.json()` call fails (malformed response), the loading indicator is already hidden (line 164) but the results area may be in an inconsistent state.

```typescript
// icon-picker.ts:158-163
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    loadingEl.classList.add('hidden');
    // If response.json() throws here, loadingEl is already hidden — OK
```

**Problems:**
- Minor: if `response.json()` throws (unlikely but possible with malformed API response), the catch block hides `loadingEl` again (no-op since it's already hidden) and shows "Search failed" — actually fine
- The `clearTimeout` at line 162 correctly prevents the abort from firing after a successful response

**Recommendation:** No action needed. The error handling here is solid.

#### L6. `uploadCustomIcon` shows `styledAlert` but doesn't await it

**File:** `icon-picker.ts` lines 297-311

```typescript
// icon-picker.ts:307-310
  } catch (error) {
    console.error('Error processing icon:', error);
    styledAlert('Failed to process image');  // not awaited
    document.getElementById('icon-source')!.textContent = 'No icon selected';
  }
```

**Problems:**
- `styledAlert` returns a Promise — not awaiting means the "No icon selected" text is set while the alert is showing, which is fine
- But if the function caller awaited `uploadCustomIcon()`, the function returns before the user dismisses the alert — the caller wouldn't know there was an error

**Recommendation:** Add `await` before `styledAlert` for consistency with the rest of the codebase.

---

## Error Handling Pattern Map

### What uses which strategy:

| Component | User Alert | Console Only | Silent Swallow | Re-throw | No Handling |
|-----------|:---:|:---:|:---:|:---:|:---:|
| `store.ts` — preference save | - | Yes | - | - | - |
| `store.ts` — migration | Yes | Yes | - | - | - |
| `store.ts` — seed defaults | - | Yes | - | - | - |
| `store.ts` — all mutations | - | - | - | - | **Yes (16x)** |
| `store.ts` — setCategoryGroup | - | - | - | Yes (re-throw) | - |
| `settings-modal.ts` — fetchAllFavicons | - | - | - | **Yes (unhandled)** | - |
| `settings-modal.ts` — smartNameAll | - | - | - | **Yes (unhandled)** | - |
| `settings-modal.ts` — import | Yes | - | - | - | - |
| `settings-modal.ts` — erase | Yes | - | - | - | - |
| `bookmark-modal.ts` — save | - | - | - | - | **Yes** |
| `bookmark-modal.ts` — fetchTitle | - | - | Yes | - | - |
| `bookmark-modal.ts` — favicon auto | - | - | Yes (.catch) | - | - |
| `bookmark-modal.ts` — clipboard | - | - | Yes (correct) | - | - |
| `category-modal.ts` — save/delete | - | - | - | - | **Yes** |
| `icon-picker.ts` — Wikimedia search | UI message | Yes | - | - | - |
| `icon-picker.ts` — custom upload | Yes | Yes | - | - | - |
| `icon-picker.ts` — URL parse | - | - | Yes | - | - |
| `clerk.ts` — initClerk | - | Yes | - | - | - |
| `clerk.ts` — getAuthToken | - | - | Yes | - | - |
| `clerk.ts` — extension bridge | - | - | Yes (correct) | - | - |
| `undo.ts` — undo/redo | - | - | - | - | **Yes** |
| `drag-drop.ts` — all mutations | - | - | - | - | **Yes** |
| `convex-client.ts` — init | - | Console log | - | - | - |
| `local-storage.ts` — getItem | - | - | Yes (fallback) | - | - |
| `founding-stats.ts` — stats | - | - | Yes (fallback) | - | - |
| `main.ts` — init() | - | - | - | - | **Yes** |
| `welcome-gate.ts` — stats fetch | - | - | Yes (fire-forget) | - | - |

**Bold = should have error handling but doesn't.**

### Error feedback coverage:

| Operation Category | Total Operations | Has User Feedback | Console Only | No Handling |
|-------------------|:---:|:---:|:---:|:---:|
| Data mutations (CRUD) | 16 | 0 | 0 | **16** |
| Settings operations | 5 | 3 | 0 | **2** |
| Auth operations | 3 | 0 | 2 | 1 |
| Network fetches | 4 | 2 | 1 | 1 |
| Undo/redo | 2 | 0 | 0 | **2** |
| Drag-drop mutations | 8 | 0 | 0 | **8** |

---

## Recommended Overhaul Plan

### Phase 1: Critical safety nets (prevent unhandled rejections)

1. **Add global `unhandledrejection` handler** (`main.ts`)
   - Catch-all for any unhandled async error
   - Log to console, optionally show a generic user alert
   - Effort: ~5 min, zero risk

2. **Wrap `init()` in try/catch** (`main.ts`)
   - Prevents blank screen on startup failure
   - Show a user-facing "failed to load" message
   - Effort: ~5 min, zero risk

3. **Fix `fetchAllFavicons` and `smartNameAll` re-throw** (`settings-modal.ts`)
   - Replace `throw e` with `await styledAlert(...)`
   - Effort: ~5 min, zero risk

4. **Add user feedback to `promptSeedDefaults`** (`store.ts`)
   - Add `styledAlert` in the catch block (matching `promptMigration` pattern)
   - Effort: ~2 min, zero risk

### Phase 2: Undo/redo resilience

5. **Catch errors in `executeItem` and preserve stack integrity** (`undo.ts`)
   - If undo fails, push item to redo stack anyway (user can retry)
   - Show user alert: "Undo failed"
   - If group undo fails mid-way, consider rolling back completed entries
   - Effort: ~30 min, medium risk (must preserve exact stack semantics)

### Phase 3: Mutation error wrapper

6. **Create centralized mutation error handler** (`store.ts` or new `utils/error-handling.ts`)
   - Wrap all `client.mutation()` calls in a helper that catches and reports errors
   - Use `styledAlert` for user-facing feedback
   - Optionally retry transient failures
   - Effort: ~1 hour, low risk (mechanical wrapping)

7. **Add error handling to drag-drop mutation calls** (`drag-drop.ts`)
   - Await or `.catch()` all reorder/group mutations
   - Show brief toast/alert on failure
   - Effort: ~30 min, low risk

### Phase 4: Resilience improvements

8. **Add try/catch to `JSON.parse` in `initializeData`** (`store.ts`)
   - Fall back to empty arrays on corrupted localStorage
   - Remove the corrupted key
   - Effort: ~10 min, zero risk

9. **Add `onError` callbacks to Convex subscriptions** (`store.ts`)
   - Log subscription errors
   - Consider adding a visual "sync status" indicator
   - Effort: ~15 min for callbacks, ~1 hour for UI indicator

10. **Add auth failure handling for sync mode** (`main.ts` + `clerk.ts`)
    - When auth fails in sync mode, render local cache and show explanation
    - Offer "retry" or "use locally" options
    - Effort: ~1 hour, medium risk

### Phase 5: Polish

11. **Queue `styledAlert`/`styledConfirm` calls** (`confirm-modal.ts`)
    - Prevent resolver overwrite when multiple alerts fire
    - Effort: ~30 min, low risk

12. **Replace string matching in `setCategoryGroup`** (`store.ts`)
    - Use structured error detection or remove the backward-compat shim
    - Effort: ~10 min, zero risk

13. **Add `await` to `styledAlert` calls that are missing it** (various)
    - Grep for `styledAlert(` without preceding `await`
    - Effort: ~10 min, zero risk

### What NOT to change

- **`fetchAndSetTitle` silent catches** — The generation counter pattern is correct and the silent failure is appropriate for a best-effort title suggestion.
- **Clipboard read silent catch** — Browser policy can deny clipboard access; silent failure is the right behavior.
- **Extension bridge silent catches** — The extension may not be installed; silent failure is correct.
- **`getAuthToken` silent catch** — Returns null on failure, which callers handle.
- **Pointer capture try/catch blocks** — These are correctly silenced (capture may fail if pointer was released by the browser).
- **`navigator.vibrate` try/catch blocks** — Correctly silenced (API may not be available).

---

## Summary

| Priority | Item | Files Affected | Effort |
|----------|------|----------------|--------|
| Critical | C1: fetchAllFavicons/smartNameAll unhandled throw | `settings-modal.ts` | 5 min |
| Critical | C2: No global unhandled rejection handler | `main.ts` | 5 min |
| High | H1: Store mutations lack try/catch (16x) | `store.ts` | 1 hr |
| High | H2: Undo/redo errors corrupt stack | `undo.ts` | 30 min |
| High | H3: Seed failure invisible to users | `store.ts` | 2 min |
| High | H4: Drag-drop mutations fire-and-forget | `drag-drop.ts` | 30 min |
| Medium | M1: String matching on error messages | `store.ts` | 10 min |
| Medium | M2: JSON.parse without try/catch | `store.ts` | 10 min |
| Medium | M3: Convex subscriptions lack onError | `store.ts` | 15 min |
| Medium | M4: Preference save failures silent | `store.ts` | 10 min |
| Medium | M5: Auth failure silently disables sync | `main.ts`, `clerk.ts` | 1 hr |
| Medium | M6: fetchAndSetTitle (reference: good pattern) | `bookmark-modal.ts` | 0 min |
| Low | L1: Fire-and-forget favicon resolution | `bookmark-modal.ts` | 5 min |
| Low | L2: Confirm modal resolver overwrite | `confirm-modal.ts` | 30 min |
| Low | L3: Founding stats silent fallback | `founding-stats.ts` | 2 min |
| Low | L5: Icon search edge case (acceptable) | `icon-picker.ts` | 0 min |
| Low | L6: uploadCustomIcon missing await | `icon-picker.ts` | 2 min |

Total estimated effort for Phase 1 (critical safety nets): ~17 minutes.
Total estimated effort for Phases 1-3 (all high-value work): ~2.5 hours.
Phases 4-5 (resilience + polish): ~2.5 hours additional.
