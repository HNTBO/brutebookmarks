# State & Data Flow Audit

Comprehensive audit of state management, data flow, and sync architecture across Brute Bookmarks.
Conducted 2026-02-19.

---

## Executive Summary

The application has a **dual-mode architecture** — local-only (localStorage) and sync (Convex real-time backend) — controlled by a single `_convexActive` flag. Every mutation helper in `store.ts` branches on this flag, creating **two parallel codepaths** that must remain semantically identical but have diverged in subtle ways.

The core state lives in three module-level variables (`_categories`, `_layoutItems`, `_tabGroups`) rebuilt from either localStorage or three independent Convex subscriptions. Those subscriptions fire independently, meaning `rebuild()` runs up to 3 times on initial load (once per subscription) and can run with stale data for one or two of the three tables. The raw Convex data is typed as `any[]`, erasing all type safety at the boundary between backend and frontend.

The undo system captures closures over entity IDs that may become stale after Convex creates new IDs (delete + undo re-creates with a different ID). The preference sync uses a debounce timer with an `_applyingFromConvex` guard that is synchronous-only — if the callback triggers any async work, the guard will have already been released. Subscriptions are never cleaned up, and `saveData()` is called from `drag-drop.ts` without checking `_convexActive`, relying on the early-return guard inside `saveData()` rather than not calling it at all.

None of these issues are actively crashing the app in normal usage. They surface under edge conditions: rapid undo/redo sequences in sync mode, simultaneous edits on multiple devices, tab visibility changes during pending preference saves, and the brief window between independent subscription arrivals.

---

## Findings by Severity

### CRITICAL: Zero findings

No showstoppers. The app works. Data integrity is maintained in normal usage patterns.

### HIGH: Structural Data Flow Issues

#### H1. `any` typing on raw Convex subscription data (`store.ts`)

**Lines 19-21.** The raw subscription results are stored as `any[]`, discarding all type information from the Convex schema.

```typescript
// store.ts:19-21
let _rawCategories: any[] | null = null;
let _rawBookmarks: any[] | null = null;
let _rawTabGroups: any[] | null = null;
```

Every access in `rebuild()` uses `as string`, `as number`, or `(result as any)` casts:

```typescript
// store.ts:206
_rawCategories = result as any[];

// store.ts:291-294, inside rebuild()
return {
  id: cat._id as string,
  name: cat.name as string,
  order: cat.order as number,
  groupId: (cat.groupId as string) ?? undefined,
  bookmarks: rawBookmarks.map((b: any) => ({
    id: b._id as string,
    title: b.title as string,
    url: b.url as string,
    iconPath: (b.iconPath as string) ?? null,
    order: b.order as number,
  })),
};
```

The preferences subscription is even worse — every field is accessed through `(result as any).fieldName`:

```typescript
// store.ts:233-241
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
- If the Convex schema changes (field renamed, type changed), TypeScript will not catch the mismatch — it compiles clean and fails at runtime
- The `as string` / `as number` casts are silent lies — if a field is `undefined` or a different type, the cast passes and the error surfaces downstream in unrelated code
- The Convex SDK generates typed API bindings (`convex/_generated/api.ts`). The `onUpdate` callback result is already typed by the SDK — the `as any[]` cast actively destroys that type information
- 16 separate `(result as any).field` accesses in the preferences handler, any of which could silently return `undefined` if the schema drifts

**Recommendation:** Import the generated document types from `convex/_generated/dataModel` and type `_rawCategories`, `_rawBookmarks`, and `_rawTabGroups` as `Doc<'categories'>[]`, `Doc<'bookmarks'>[]`, `Doc<'tabGroups'>[]`. Remove all `as any` casts. The SDK's `onUpdate` already returns the correct type — just stop erasing it.

#### H2. Tab group null-guard gap in `rebuild()` (`store.ts`)

**Line 254.** The rebuild guard checks `_rawCategories` and `_rawBookmarks` but not `_rawTabGroups`:

```typescript
// store.ts:254
if (_rawCategories === null || _rawBookmarks === null) return;
```

Then on line 308, `_rawTabGroups` is used with a fallback:

```typescript
// store.ts:308
const rawGroups = _rawTabGroups ?? [];
```

**Problems:**
- The three subscriptions (`categories.list`, `bookmarks.listAll`, `tabGroups.list`) fire independently. If categories and bookmarks arrive first, `rebuild()` runs with `_rawTabGroups === null`, which falls back to `[]`. This means the first render shows all categories as ungrouped, then a moment later when tab groups arrive, `rebuild()` runs again and groups appear. The user sees a flash of ungrouped layout.
- The migration check on lines 257-271 fires on the **first** `rebuild()` call (`_migrationChecked = false`). If tab groups haven't arrived yet, the migration check runs against incomplete data. If the user has tab groups but the subscription hasn't delivered them, the migration prompt could appear incorrectly (though in practice this is unlikely since a user with tab groups also has categories/bookmarks).
- The asymmetry between the categories/bookmarks null-guard and the tab groups fallback makes the subscription ordering dependency invisible. A developer reading the guard naturally assumes all three sources are ready.

**Recommendation:** Either add `_rawTabGroups` to the null-guard (wait for all three subscriptions before first `rebuild()`), or document the intentional fallback with a comment explaining why partial rendering is acceptable. The first option is safer — it adds at most a few hundred milliseconds of delay but guarantees consistent first render.

#### H3. `getConvexClient()!` non-null assertions in all mutation helpers (`store.ts`)

**Lines 449, 474, 502, 534, 584, 640, 668, 687, 701, 723, 739, 754, 792, 809, 824, 835.** Every Convex-mode mutation path uses the non-null assertion operator:

```typescript
// store.ts:449 (createCategory — representative of all 16 occurrences)
if (_convexActive) {
  const client = getConvexClient()!;
  newId = await client.mutation(api.categories.create, { name });
```

**Problems:**
- `_convexActive` is set to `true` in `activateConvex()` before the subscriptions are confirmed working. If the Convex client fails to connect or the auth token expires, `getConvexClient()` returns the client object (not null), but the mutation will throw at the network level — so the `!` itself is safe. However, there is a code-level assumption that `_convexActive === true` implies `getConvexClient() !== null`, which is currently enforced by the `activateConvex()` flow but is not type-guarded.
- If `activateConvex()` is ever called before `initConvexClient()` (e.g., during a refactor), every mutation silently crashes on the `!` assertion. The check `if (!client) return;` at line 199 guards `activateConvex()` itself, but the 16 call sites downstream blindly trust the result.
- No error handling on the mutations themselves — if a `client.mutation()` call throws (network error, auth expired, validation failure), the error propagates up to the caller. For most callers this is fine (the UI action just fails). But for undo/redo, the error can leave the undo stack in an inconsistent state (see H4).

**Recommendation:** Extract a helper like `requireConvexClient(): ConvexClient` that throws a descriptive error if the client is null, rather than using `!`. Consider wrapping mutation calls in try/catch at the store level, with a user-visible error notification for failures.

#### H4. Undo/redo closures capture stale entity IDs in Convex mode (`store.ts`, `undo.ts`)

The undo system captures IDs at the time of the action. In Convex mode, delete + undo re-creates the entity, which gets a **new Convex ID**. The `ref` pattern mitigates this for the immediate undo/redo pair:

```typescript
// store.ts:457-463
if (!isUndoing()) {
  const ref = { currentId: newId };
  pushUndo({
    undo: () => deleteCategory(ref.currentId),
    redo: async () => { ref.currentId = await createCategory(name); },
  });
}
```

But for `deleteCategory`, the undo closure re-creates bookmarks with new IDs that are not tracked:

```typescript
// store.ts:514-523
pushUndo({
  undo: async () => {
    ref.currentId = await createCategory(data.name);
    for (const bk of data.bookmarks) {
      await createBookmark(ref.currentId, bk.title, bk.url, bk.iconPath);
    }
  },
  redo: () => deleteCategory(ref.currentId),
});
```

**Problems:**
- When `deleteCategory` undo fires, it calls `createBookmark` for each bookmark. Each `createBookmark` call pushes its own undo entry (delete the newly created bookmark). This means undoing a category delete pushes N+1 new entries onto the undo stack (1 for the category + N for bookmarks), polluting the stack.
- The `isUndoing()` guard at the top of `pushUndo()` prevents this specific pollution:
  ```typescript
  // undo.ts:21
  if (_isUndoing) return;
  ```
  So the bookmark undo entries are correctly suppressed. However, the `_isUndoing` flag is set before `executeItem()` and cleared in `finally` — if `executeItem` is async (which it is), the flag is held for the entire duration of the sequential `createBookmark` calls. If any of those calls fail, the remaining bookmarks are not restored, but `_isUndoing` is still cleared by `finally`. The partial restore is not rolled back.
- The `redo()` call on line 70 pushes the item to `redoStack`, but if the undo partially fails (some bookmarks restored, some not), the redo entry will re-delete the category including any bookmarks that weren't restored. Data loss.
- In `drag-drop.ts`, the undo closures for local-mode reorder capture `beforeIds`/`afterIds` arrays:
  ```typescript
  // drag-drop.ts:1092-1098
  const beforeIds = category.bookmarks.map((b) => b.id);
  // ...splice...
  const afterIds = category.bookmarks.map((b) => b.id);
  pushUndo({
    undo: () => restoreLocalOrder(catId, beforeIds, renderCallback),
    redo: () => restoreLocalOrder(catId, afterIds, renderCallback),
  });
  ```
  These closures hold references to arrays of IDs. In local mode the IDs are stable. But the `restoreLocalOrder` function calls `saveData()`, which in local mode writes to localStorage. If the user switches to sync mode between the action and the undo, `saveData()` will early-return (correct), but `restoreLocalOrder` will have spliced `_categories` directly — and no Convex mutation is sent. The in-memory state diverges from the backend.

**Recommendation:**
1. Wrap `executeItem` in a transaction-like pattern: if the undo fails partway, revert all changes made so far (or at minimum, don't push the broken item to the redo stack).
2. For category delete undo, perform the re-creation as a single atomic operation (a Convex action that creates the category and all its bookmarks in one mutation), rather than N+1 sequential mutations.
3. For drag-drop undo in local mode, guard against mode switches by checking `isConvexMode()` inside the closure.

### MEDIUM: Sync and Timing Issues

#### M1. Migration check fires on incomplete data (`store.ts`)

**Lines 257-271.** The `_migrationChecked` flag is set to `true` on the first call to `rebuild()`, which happens when the first two subscriptions (categories and bookmarks) arrive. But this check also inspects the data to decide whether to prompt for migration or seed defaults.

```typescript
// store.ts:257-271
if (!_migrationChecked) {
  _migrationChecked = true;
  if (getAppMode() === 'sync' && _rawCategories.length === 0 && _rawBookmarks.length === 0) {
    const savedData = localStorage.getItem('speedDialData');
    if (savedData) {
      const legacy: Category[] = JSON.parse(savedData);
      if (legacy.length > 0) {
        promptMigration(legacy);
        return;
      }
    }
    // No legacy data either — offer seed defaults
    promptSeedDefaults();
    return;
  }
}
```

**Problems:**
- The check runs when `_rawCategories` and `_rawBookmarks` are both non-null but `_rawTabGroups` might still be null. If the user has only tab groups (no standalone categories or bookmarks — unlikely but not impossible), the migration check sees empty data and offers to seed defaults.
- `promptMigration` and `promptSeedDefaults` are `async` functions that `return` early from `rebuild()`. While the user is looking at the confirmation dialog, subsequent subscription updates call `rebuild()` again. Since `_migrationChecked` is already `true`, the rebuild proceeds and renders the (empty) state. If the user then confirms migration, the imported data overlaps with whatever was rendered.
- There is no lock or debounce on the migration prompt. If both `categories` and `bookmarks` subscriptions arrive simultaneously (common on fast connections), `rebuild()` is called twice in quick succession. The first call sets `_migrationChecked = true` and shows the prompt. The second call skips the migration check and renders empty state.

**Recommendation:** Gate `rebuild()` behind a "migration pending" flag that prevents rendering while the migration dialog is open. Clear the flag when the dialog resolves (either confirmed or dismissed).

#### M2. `saveData()` called from sync mode code paths in `drag-drop.ts`

**Lines 25, 40, 799, 1100, 1125 of `drag-drop.ts`.** The local-mode bookmark drag helpers (`restoreLocalOrder`, `moveBookmarkLocal`) and the local-mode branch of `performBookmarkDrop` all call `saveData()`. This is correct — they are in the `else` branch after `if (isConvexMode())`.

However, the helper functions `restoreLocalOrder` and `moveBookmarkLocal` are also used as **undo closures** that can be called at any time:

```typescript
// drag-drop.ts:20-26
function restoreLocalOrder(categoryId: string, ids: string[], renderCallback: () => void): void {
  const cat = getCategories().find((c) => c.id === categoryId);
  if (!cat) return;
  const bkMap = new Map(cat.bookmarks.map((b) => [b.id, b]));
  cat.bookmarks = ids.map((id) => bkMap.get(id)).filter(Boolean) as typeof cat.bookmarks;
  saveData();
  renderCallback();
}
```

```typescript
// drag-drop.ts:29-41
function moveBookmarkLocal(
  bkId: string, fromCatId: string, toCatId: string, insertIdx: number, renderCallback: () => void,
): void {
  const cats = getCategories();
  const from = cats.find((c) => c.id === fromCatId);
  const to = cats.find((c) => c.id === toCatId);
  if (!from || !to) return;
  const i = from.bookmarks.findIndex((b) => b.id === bkId);
  if (i === -1) return;
  const [m] = from.bookmarks.splice(i, 1);
  to.bookmarks.splice(Math.min(insertIdx, to.bookmarks.length), 0, m);
  saveData();
  renderCallback();
}
```

**Problems:**
- These undo closures were created when the app was in local mode. If the user upgrades to sync mode (`upgradeToSync()`) mid-session and then triggers undo, the closure calls `saveData()` which early-returns because `_convexActive` is now `true`. The early-return is correct — but the closure also mutates `_categories` directly (splice operations). In sync mode, `_categories` is rebuilt from Convex subscriptions. The direct mutation will be overwritten on the next subscription update, making the undo visually flash and then revert.
- The function names (`restoreLocalOrder`, `moveBookmarkLocal`) imply local-only use, but they're captured in undo closures that persist across mode changes.

**Recommendation:** Either clear the undo stack on mode upgrade, or make these undo closures mode-aware (check `isConvexMode()` and use the appropriate codepath).

#### M3. Preference sync: `_applyingFromConvex` guard is synchronous-only (`store.ts`)

**Lines 243-248.** The flag is set synchronously around the callback:

```typescript
// store.ts:243-248
_applyingFromConvex = true;
try {
  _prefsCallback(prefs);
} finally {
  _applyingFromConvex = false;
}
```

The callback is wired in `main.ts:224-228`:

```typescript
// main.ts:224-228
setPreferencesCallback((prefs) => {
  applyTheme(prefs.theme, prefs.accentColorDark, prefs.accentColorLight);
  applyPreferences(prefs, renderCategories);
  syncWireframeBtnState();
});
```

`applyTheme` and `applyPreferences` are synchronous — they update module-level state, localStorage, and DOM. However, `applyPreferences` calls `renderCategories()` (via the `renderCallback` parameter on line 161 of `preferences.ts`), and `renderCategories` in turn goes through `dragController.requestRender()`:

```typescript
// main.ts:223
setRenderCallback(() => dragController.requestRender(renderCategories));
```

Wait — the `setRenderCallback` is for the **store's** rerender, not the preferences callback. The preferences callback calls `applyPreferences(prefs, renderCategories)` where `renderCategories` is the direct function. So the callback chain is synchronous.

**Problems:**
- Currently safe because the entire callback chain is synchronous. But the guard pattern is fragile — if any function in the chain becomes async (e.g., if `renderCategories` gains an async step), the guard will release before the async work completes, and the next preference change during that window will trigger a save-back to Convex, creating an echo loop.
- The `savePreferencesToConvex` function (line 138-162) checks `_applyingFromConvex` at call time, not at debounce-fire time:
  ```typescript
  // store.ts:139
  if (!_convexActive || _applyingFromConvex) return;
  ```
  This is correct for the current synchronous chain. But `syncToConvex()` in `preferences.ts:94-96` is called from `applyPreferences` indirectly — actually no, `applyPreferences` does NOT call `syncToConvex()`. It only updates state and DOM. So the guard works. The risk is purely future-facing.
- The real timing issue: `toggleTheme()` in `theme.ts` calls `syncToConvex()` directly (line 38). If a Convex preference update triggers `applyTheme` which triggers theme UI updates, and the user toggles the theme during the `_applyingFromConvex` window, the toggle's `syncToConvex()` call will be suppressed (correct). But `toggleTheme` also writes to localStorage (line 35). So localStorage and Convex can diverge briefly until the next non-suppressed sync.

**Recommendation:** Document the synchronous-only constraint on `_prefsCallback`. Consider using a `Promise`-based guard or a version counter instead of a boolean flag, to handle potential future async callbacks.

#### M4. Subscriptions are never cleaned up (`store.ts`, `convex-client.ts`)

**Lines 205-249 of `store.ts`.** Four `client.onUpdate()` subscriptions are created in `activateConvex()`. The return values (unsubscribe functions) are discarded:

```typescript
// store.ts:205-208
client.onUpdate(api.categories.list, {}, (result) => {
  _rawCategories = result as any[];
  rebuild();
});
```

In `convex-client.ts`, there is no `close()` or teardown method:

```typescript
// convex-client.ts:1-35 (complete file — no cleanup API)
let client: ConvexClient | null = null;

export function initConvexClient(): ConvexClient | null { ... }
export function getConvexClient(): ConvexClient | null { ... }
export function setConvexAuth(...): void { ... }
```

**Problems:**
- The `ConvexClient.onUpdate()` method returns an unsubscribe function. By discarding it, there is no way to stop the subscriptions without destroying the entire client.
- If `activateConvex()` were called twice (e.g., during a reconnect flow or a future "re-auth" feature), each call would create 4 new subscriptions without removing the previous 4. Each subscription fires `rebuild()` independently, so 8 subscriptions would cause double-rebuilds on every data change.
- The current code guards against double-initialization at a higher level (`main.ts:289`: `if (getConvexClient()) return;`), so this is not actively happening. But the subscription lifecycle is invisible at the store level.
- There is no mechanism to gracefully deactivate Convex (e.g., if the user logs out or the auth token expires). `_convexActive` is set to `true` but never set back to `false`.

**Recommendation:** Store the unsubscribe functions returned by `onUpdate()`. Add a `deactivateConvex()` function that calls them, sets `_convexActive = false`, and resets `_rawCategories/_rawBookmarks/_rawTabGroups` to null. Call it on sign-out.

#### M5. localStorage cache writes on every `rebuild()` but only caches categories (`store.ts`)

**Line 347.** At the end of `rebuild()`:

```typescript
// store.ts:347
localStorage.setItem('speedDialData', JSON.stringify(_categories));
```

This writes the denormalized `_categories` array (which includes embedded bookmarks) on every subscription update. But tab groups are NOT cached from sync mode — only the local-mode `saveData()` (line 120) writes `speedDialTabGroups`:

```typescript
// store.ts:119-120
localStorage.setItem('speedDialData', JSON.stringify(_categories));
localStorage.setItem('speedDialTabGroups', JSON.stringify(_localTabGroups));
```

The `initializeData()` function (lines 100-114) reads BOTH `speedDialData` and `speedDialTabGroups` on cold start:

```typescript
// store.ts:100-114
export async function initializeData(): Promise<void> {
  const savedData = localStorage.getItem('speedDialData');
  if (savedData) {
    _categories = JSON.parse(savedData);
  } else {
    _categories = [];
  }
  const savedGroups = localStorage.getItem('speedDialTabGroups');
  if (savedGroups) {
    _localTabGroups = JSON.parse(savedGroups);
  } else {
    _localTabGroups = [];
  }
  rebuildLocalLayout();
}
```

**Problems:**
- In sync mode, `speedDialData` is updated on every rebuild (line 347), but `speedDialTabGroups` is never updated because `saveData()` early-returns. So the localStorage tab groups cache becomes stale the moment the user switches to sync mode.
- On the next cold start in sync mode, `initializeData()` loads the stale `speedDialTabGroups` into `_localTabGroups`, calls `rebuildLocalLayout()` which uses `_localTabGroups` to build the initial layout. Then `main.ts:249` skips the initial render for sync mode (`if (getAppMode() !== 'sync')`). So the stale cache is loaded into `_localTabGroups` but never displayed. However, `_categories` IS used for the migration check — a stale categories cache could incorrectly trigger the "migrate local data?" prompt if the cache is out of date.
- Write frequency: in sync mode with active editing, `localStorage.setItem('speedDialData', ...)` fires on every Convex subscription update. For a user with many bookmarks, this serializes the entire dataset to JSON on every single change. Not a performance crisis, but unnecessary I/O for large datasets.

**Recommendation:** Cache tab groups alongside categories in `rebuild()`. Consider throttling the cache writes (e.g., write at most once per second, or only on `visibilitychange`).

### LOW: Code Quality and Edge Cases

#### L1. `setCategories()` exposes raw state mutation (`store.ts`)

**Lines 95-97.** A legacy function allows external code to overwrite `_categories`:

```typescript
// store.ts:94-97
// --- Legacy compat (used by category-modal delete) ---
export function setCategories(data: Category[]): void {
  _categories = data;
}
```

Used in `settings-modal.ts:192-194` for local-mode import:

```typescript
// settings-modal.ts:192-194
setCategories(importedData);
// or
setCategories([...getCategories(), ...importedData]);
```

**Problems:**
- `setCategories` directly replaces the module-level `_categories` without calling `rebuildLocalLayout()` or `rerender()`. The callers must manually call `saveData()` and `renderCategories()` after. If a caller forgets, the state and the UI diverge.
- There is no validation on the incoming data. Malformed imports silently replace the entire dataset.
- In sync mode, if `setCategories` were accidentally called, it would overwrite the Convex-derived `_categories` with arbitrary data. The next `rebuild()` from a subscription update would overwrite it back, but during the gap the UI shows incorrect data.

**Recommendation:** Remove `setCategories` and route the local import through `importBulk` (which already handles both modes). If raw state replacement is truly needed for the local path, make it a private function that also calls `rebuildLocalLayout()` and `rerender()`.

#### L2. `seedLocalDefaults()` uses `Date.now()` for IDs, risking collisions (`store.ts`)

**Lines 399-442.** Local IDs are generated as `'c' + Date.now() + '-' + catOrder` and `'b' + Date.now() + '-' + i`:

```typescript
// store.ts:419-421
const ts = Date.now();
categories.push({
  id: 'c' + ts + '-' + catOrder,
```

**Problems:**
- If `seedLocalDefaults()` is called in a tight loop or rapid succession, `Date.now()` returns the same value. The `catOrder` and `i` suffixes differentiate within a single call, but two rapid calls would produce duplicate IDs.
- In practice, `seedLocalDefaults` is called once on first visit. The risk is theoretical, but the same `Date.now()` pattern appears in all local-mode create operations (lines 452, 542, 707, 414).
- The IDs don't follow any recognizable format — mixing timestamps with counters makes debugging harder.

**Recommendation:** Use `crypto.randomUUID()` (available in all modern browsers) for local IDs. It eliminates collision risk and produces standard-format IDs.

#### L3. Undo stack has no mode awareness (`undo.ts`)

**Lines 12-13.** The undo and redo stacks are plain arrays with no metadata about which mode (local/sync) was active when the entry was created:

```typescript
// undo.ts:12-13
const undoStack: StackItem[] = [];
const redoStack: StackItem[] = [];
```

**Problems:**
- An undo entry created in local mode captures closures that call `saveData()` and mutate `_categories` directly. If the user upgrades to sync mode (`upgradeToSync()`), those closures still run but their effects don't propagate to Convex.
- Conversely, an undo entry created in sync mode captures closures that call `client.mutation()`. If the Convex client is somehow lost (unlikely but possible via auth expiry), the closure will throw an unhandled error.
- The MAX_STACK of 50 entries can accumulate significant closure memory, especially for `deleteCategory` undo entries that capture the entire category's bookmark data.

**Recommendation:** Clear both stacks on mode upgrade. Consider adding a `mode: 'local' | 'sync'` field to `StackItem` and skipping entries from the wrong mode.

#### L4. Preference debounce timer not cleared on sign-out / deactivation (`store.ts`)

**Lines 27, 141-161.** The `_prefsSaveTimer` is a module-level timeout:

```typescript
// store.ts:27
let _prefsSaveTimer: ReturnType<typeof setTimeout> | null = null;

// store.ts:141-162
if (_prefsSaveTimer) clearTimeout(_prefsSaveTimer);
_prefsSaveTimer = setTimeout(async () => {
  const client = getConvexClient();
  if (!client) return;
  const prefs = getPrefs();
  try {
    await client.mutation(api.preferences.set, { ... });
  } catch (err) {
    console.error('[Store] Failed to save preferences:', err);
  }
}, 500);
```

**Problems:**
- If the user changes a preference and then the auth token expires within the 500ms debounce window, the timer fires and attempts a mutation that will fail. The `catch` handles this gracefully (console error), but the preference change is silently lost from the backend.
- The `flushPreferencesToConvex` function (line 169-189) is called on `visibilitychange` and `beforeunload` to force-save pending changes. But `beforeunload` is not guaranteed to complete async work — if the mutation takes more than a few milliseconds, the browser may kill the page before it completes.
- There is no `clearTimeout(_prefsSaveTimer)` in any deactivation path, because no deactivation path exists (see M4).

**Recommendation:** Use `navigator.sendBeacon` for the `beforeunload` flush (if the Convex API supports it), or accept the limitation and document it. Clear the timer in the future `deactivateConvex()` function.

#### L5. `getItem<T>` in `local-storage.ts` has an unsafe cast (`local-storage.ts`)

**Lines 15-23.** The generic helper uses `as T` which is an unchecked cast:

```typescript
// local-storage.ts:15-23
export function getItem<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}
```

**Problems:**
- `JSON.parse(raw) as T` — if the stored JSON doesn't match `T`, the cast passes silently. Calling code gets a runtime type mismatch.
- The `catch` branch returns `raw as unknown as T` — if `T` is a number and the raw value is a non-numeric string that fails `JSON.parse`, the caller gets a string typed as a number.
- This function is used for reading preferences from localStorage in `preferences.ts` (though `preferences.ts` uses `localStorage.getItem` directly — this helper appears unused for preferences). Check: it may be used by the welcome gate or extension bridge.

**Recommendation:** Add runtime validation (e.g., a validator function parameter) or narrow the generic to known safe types. At minimum, document the cast risk in a comment.

#### L6. Preferences module reads localStorage at import time (`preferences.ts`)

**Lines 6-12.** Module-level variables are initialized from `localStorage` when the module is first imported:

```typescript
// preferences.ts:6-12
let currentCardSize = Math.max(60, Math.min(120, parseInt(localStorage.getItem('cardSize') || '90') || 90));
let currentPageWidth = Math.max(50, Math.min(100, parseInt(localStorage.getItem('pageWidth') || '100') || 100));
let showCardNames = localStorage.getItem('showCardNames') !== 'false';
let autofillUrl = localStorage.getItem('autofillUrl') === 'true';
let easterEggs = localStorage.getItem('easterEggs') !== 'false';
let showNameOnHover = localStorage.getItem('showNameOnHover') !== 'false';
let mobileColumns: 3 | 4 | 5 = (parseInt(localStorage.getItem('mobileColumns') || '5') || 5) as 3 | 4 | 5;
```

**Problems:**
- Import-time side effects (reading localStorage) make the module harder to test and reason about. The values are read once and never re-read from localStorage — all subsequent updates go through the setter functions.
- The `mobileColumns` cast `as 3 | 4 | 5` does not validate the parsed value. If localStorage contains `'7'`, `parseInt` returns 7, which is cast to the union type and used as-is. The CSS would receive `repeat(7, 1fr)` which might work but is outside the intended range.
- The clamping for `cardSize` and `pageWidth` (60-120 and 50-100) is duplicated here and implicit in the CSS. If the ranges change, both places must be updated.

**Recommendation:** Extract the clamping ranges as constants. Validate `mobileColumns` against the allowed values. Consider lazy initialization (read on first access) or an explicit `initPreferences()` function.

---

## Data Flow Map

### Initialization Flow (Cold Start)

```
Browser loads index.html
  |
  v
main.ts: renderApp() ──> HTML shell injected into DOM
  |
  v
main.ts: init()
  |
  +──> initializeData()
  |      |
  |      +──> localStorage.getItem('speedDialData') ──> _categories
  |      +──> localStorage.getItem('speedDialTabGroups') ──> _localTabGroups
  |      +──> rebuildLocalLayout() ──> _layoutItems, _tabGroups
  |
  +──> setRenderCallback() ──> wires dragController.requestRender
  +──> setPreferencesCallback() ──> wires theme + preferences apply
  +──> setPreferencesCollector() ──> stores collectPreferences reference
  |
  +──> syncThemeUI(), syncPreferencesUI() ──> DOM from localStorage state
  |
  +──> [if mode !== 'sync'] renderCategories() ──> first paint from cache
  |
  +──> [if mode === 'sync'] initClerk() ──> startConvex()
         |
         +──> initConvexClient() ──> ConvexClient created
         +──> setConvexAuth() ──> Clerk JWT wired
         +──> activateConvex() ──> 4 subscriptions started
               |
               +──> categories.list   ─┐
               +──> bookmarks.listAll  ├──> each fires rebuild()
               +──> tabGroups.list     ─┘       on update
               +──> preferences.get ──> fires _prefsCallback
```

### Convex Subscription Data Flow

```
Convex Cloud (server-side)
  |
  | (WebSocket push on data change)
  v
ConvexClient.onUpdate callback
  |
  +──> _rawCategories = result   ──┐
  +──> _rawBookmarks = result    ──┼──> rebuild()
  +──> _rawTabGroups = result    ──┘
  |
  v
rebuild()
  |
  +──> [first call] migration check
  |      |
  |      +──> [empty Convex + local data] promptMigration()
  |      +──> [empty Convex + no local data] promptSeedDefaults()
  |
  +──> denormalize: _rawBookmarks grouped by categoryId
  +──> denormalize: _rawCategories + bookmarks ──> _categories (Category[])
  +──> denormalize: _rawTabGroups + _categories ──> _layoutItems, _tabGroups
  +──> localStorage.setItem('speedDialData', _categories) ──> cache write
  +──> rerender() ──> _renderCallback() ──> dragController.requestRender()
         |
         +──> [if dragging] deferred ──> pendingRenderFn
         +──> [if not dragging] renderCategories() ──> DOM update
```

### Mutation Flow (User Action)

```
User clicks "Add Bookmark"
  |
  v
bookmark-modal.ts: submit handler
  |
  v
store.ts: createBookmark(categoryId, title, url, iconPath)
  |
  +──> [if _convexActive]
  |      |
  |      +──> client.mutation(api.bookmarks.create, {...})
  |      |      |
  |      |      v
  |      |    Convex server: insert into bookmarks table
  |      |      |
  |      |      v
  |      |    Subscription fires: _rawBookmarks updated ──> rebuild() ──> rerender()
  |      |
  |      +──> pushUndo({ undo: deleteBookmarkById, redo: createBookmark })
  |
  +──> [if !_convexActive]
         |
         +──> cat.bookmarks.push({ id, title, url, iconPath })  (direct mutation)
         +──> saveData() ──> localStorage write
         +──> rerender() ──> renderCategories()
         +──> pushUndo({ undo: deleteBookmarkById, redo: createBookmark })
```

### Preference Sync Flow

```
User drags size controller
  |
  v
preferences.ts: updateCardSize(size)
  |
  +──> currentCardSize = size
  +──> applyCardSizeToDOM() ──> CSS grid update
  +──> localStorage.setItem('cardSize', size)
  +──> syncToConvex() ──> savePreferencesToConvex(collectPreferences)
         |
         v
store.ts: savePreferencesToConvex()
  |
  +──> [if !_convexActive || _applyingFromConvex] return (suppressed)
  +──> clearTimeout(_prefsSaveTimer)
  +──> setTimeout(500ms)
         |
         v (after 500ms of inactivity)
  +──> client.mutation(api.preferences.set, {...})
         |
         v
Convex server: upsert userPreferences
  |
  v
preferences.get subscription fires
  |
  v
store.ts: _prefsCallback(prefs)
  |
  +──> _applyingFromConvex = true  ──────────────── guard ON
  +──> applyTheme() ──> DOM + localStorage
  +──> applyPreferences() ──> state + DOM + localStorage
  +──> _applyingFromConvex = false ──────────────── guard OFF
```

### Undo/Redo Flow

```
User presses Ctrl+Z
  |
  v
undo.ts: undo()
  |
  +──> item = undoStack.pop()
  +──> _isUndoing = true
  +──> executeItem(item, 'undo')
  |      |
  |      +──> [single entry] await entry.undo()
  |      +──> [group] for each entry (reversed): await entry.undo()
  |             |
  |             v
  |      Closure runs: e.g. deleteCategory(ref.currentId)
  |        |
  |        +──> [inside mutation helper] isUndoing() === true
  |        +──> pushUndo() suppressed (guard: if (_isUndoing) return)
  |        +──> mutation executes normally
  |
  +──> redoStack.push(item)
  +──> _isUndoing = false
  +──> _afterUndoRedo?.() ──> UI sync (wireframe btn, size handle)
```

---

## Recommended Overhaul Plan

### Phase 1: Type Safety (eliminates H1)

1. **Type the raw subscription data** using Convex-generated `Doc<>` types
   - Import `Doc` from `convex/_generated/dataModel`
   - Change `_rawCategories: any[] | null` to `Doc<'categories'>[] | null`
   - Change `_rawBookmarks: any[] | null` to `Doc<'bookmarks'>[] | null`
   - Change `_rawTabGroups: any[] | null` to `Doc<'tabGroups'>[] | null`
   - Remove all `as any[]` casts in `activateConvex()` and all `as string`/`as number` casts in `rebuild()`
   - Type the `preferences.get` result properly — use the generated type or define a local interface
   - Effort: ~30 min, zero risk (pure type changes, no runtime behavior change)

### Phase 2: Subscription Lifecycle (eliminates M4, partially addresses H2)

2. **Store unsubscribe functions and add `deactivateConvex()`**
   - Save return values of `client.onUpdate()` in module-level variables
   - Add `deactivateConvex()` that calls unsubscribes, resets `_convexActive`, clears raw data, clears `_prefsSaveTimer`
   - Add a guard in `activateConvex()` to prevent double-subscription
   - Effort: ~20 min, low risk

3. **Fix the tab groups null-guard in `rebuild()`** (H2)
   - Add `_rawTabGroups === null` to the guard on line 254
   - Effort: ~2 min, low risk (delays first render by one subscription delivery — typically < 100ms)

### Phase 3: Undo System Hardening (addresses H4, L3)

4. **Clear undo/redo stacks on mode upgrade**
   - In `upgradeToSync()`, call a new `clearUndoStacks()` export from `undo.ts`
   - Effort: ~5 min, zero risk

5. **Add error handling to `executeItem`**
   - Wrap undo/redo execution in try/catch
   - If a group entry partially fails, don't push the broken item to the opposite stack
   - Log the error and notify the user ("Undo failed — some changes could not be reverted")
   - Effort: ~30 min, medium risk (needs careful testing of all undo paths)

### Phase 4: Non-null Assertion Cleanup (addresses H3)

6. **Replace `getConvexClient()!` with a safe accessor**
   - Create `requireConvexClient(): ConvexClient` that throws a clear error
   - Replace all 16 `getConvexClient()!` call sites
   - Effort: ~15 min, zero risk

### Phase 5: Cache and Migration Consistency (addresses M1, M5)

7. **Gate `rebuild()` during migration prompt** (M1)
   - Add a `_migrationPending` flag set before `promptMigration`/`promptSeedDefaults` and cleared after
   - Early-return from `rebuild()` while the flag is set
   - Effort: ~10 min, low risk

8. **Cache tab groups in sync-mode `rebuild()`** (M5)
   - Add `localStorage.setItem('speedDialTabGroups', JSON.stringify(...))` at the end of `rebuild()` alongside the existing `speedDialData` write
   - Effort: ~5 min, zero risk

### Phase 6: Cleanup (addresses L1, L2, L4, L6)

9. **Remove `setCategories()` export** (L1)
   - Route `settings-modal.ts` import through `importBulk()` for both modes
   - Effort: ~15 min, low risk

10. **Use `crypto.randomUUID()` for local IDs** (L2)
    - Replace all `'c' + Date.now()` / `'b' + Date.now()` / `'g' + Date.now()` patterns
    - Effort: ~10 min, zero risk

### What NOT to change

- **The dual-mode architecture itself** — rewriting the app to use a single data source is a large refactor with high risk. The branch-on-`_convexActive` pattern is verbose but functional.
- **The `saveData()` early-return pattern** — the guard `if (_convexActive) return;` is a correct and simple approach. The issue is callers that also mutate state before calling it, not the guard itself.
- **The debounce timer for preference sync** — 500ms is a reasonable balance between responsiveness and write frequency. The `visibilitychange`/`beforeunload` flush covers the edge case.
- **The `requestRender` deferred render pattern** — this correctly prevents DOM destruction during drag. It's one of the best-designed patterns in the codebase.

---

## Summary

| Priority | Item | Files Affected | Effort |
|----------|------|----------------|--------|
| High | H1: Type raw Convex data with `Doc<>` | `store.ts` | 30 min |
| High | H2: Add `_rawTabGroups` to rebuild guard | `store.ts` | 2 min |
| High | H3: Replace `getConvexClient()!` with safe accessor | `store.ts`, `convex-client.ts` | 15 min |
| High | H4: Harden undo error handling + stale ID risk | `store.ts`, `undo.ts` | 30 min |
| Medium | M1: Gate rebuild during migration prompt | `store.ts` | 10 min |
| Medium | M2: Mode-aware undo closures / clear on upgrade | `drag-drop.ts`, `undo.ts`, `main.ts` | 15 min |
| Medium | M3: Document sync-only `_applyingFromConvex` constraint | `store.ts` | 5 min |
| Medium | M4: Store unsubscribe functions + `deactivateConvex()` | `store.ts`, `convex-client.ts` | 20 min |
| Medium | M5: Cache tab groups in sync-mode rebuild | `store.ts` | 5 min |
| Low | L1: Remove `setCategories()` export | `store.ts`, `settings-modal.ts` | 15 min |
| Low | L2: Use `crypto.randomUUID()` for local IDs | `store.ts` | 10 min |
| Low | L3: Clear undo stacks on mode upgrade | `undo.ts`, `main.ts` | 5 min |
| Low | L4: Clear pref debounce timer on deactivation | `store.ts` | 2 min |
| Low | L5: Unsafe `as T` cast in `getItem<T>` | `local-storage.ts` | 10 min |
| Low | L6: Import-time localStorage reads in preferences | `preferences.ts` | 15 min |

Total estimated effort for Phases 1-4 (high-value work): ~2 hours.
Phases 5-6 (cleanup and consistency): ~1 hour.
