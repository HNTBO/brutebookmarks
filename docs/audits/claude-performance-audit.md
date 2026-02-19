# Performance Audit

Comprehensive audit of rendering performance, memory usage, and computational efficiency across Brute Bookmarks.
Conducted 2026-02-19.

---

## Executive Summary

The application has a **nuclear render model**: every Convex subscription update triggers a full DOM teardown and rebuild of the entire bookmark grid. This is not a subtle inefficiency — it is the architectural foundation. Every category, every bookmark card, every event listener, every drag handle is destroyed and recreated from scratch on every data change. On initial connection, this happens **three times in rapid succession** as the three Convex subscriptions (categories, bookmarks, tabGroups) fire independently.

For a typical user with 5 categories and 40 bookmarks, each render cycle:
- Generates ~50 DOM elements via `innerHTML`
- Attaches ~400+ event listeners (8-10 per card x 40 cards, plus category/tab handlers)
- Calls `window.matchMedia('(max-width: 768px)')` 3+ times without caching
- Serializes the entire category tree to `localStorage` via `JSON.stringify`

The app still *feels* fast because the dataset is small and modern browsers are efficient at DOM operations. But the architecture creates a low ceiling — as data grows, every operation gets proportionally slower, and there is no path to partial updates without a fundamental rethink.

---

## Findings by Severity

### CRITICAL: Full DOM Rebuild on Every Subscription Update

#### C1. `rebuild()` → `rerender()` → `renderCategories()` destroys and recreates the entire UI

**Files: `store.ts:253-349`, `categories.ts:464-510`**

The core data flow is:

```
Convex subscription fires
  → store.ts rebuild() [lines 253-349]
    → _categories = allCategories (full recompute)
    → _layoutItems = [...] (full recompute)
    → localStorage.setItem('speedDialData', JSON.stringify(_categories)) [line 347]
    → rerender() [line 349]
      → _renderCallback() [line 53]
        → dragController.requestRender(renderCategories) [main.ts:223]
          → renderCategories() [categories.ts:464-510]
            → container.innerHTML = '' [line 466] ← NUCLEAR
            → items.forEach → renderSingleCategory / renderTabGroup [lines 489-497]
              → wireBookmarkCards [line 250] ← re-attaches ALL listeners
```

And in `renderCategories()`:

```typescript
// categories.ts:464-467
export function renderCategories(): void {
  const container = document.getElementById('categories-container')!;
  container.innerHTML = '';   // ← Everything is destroyed here
  // ... rebuild everything from scratch
```

**Problems:**
- Every bookmark edit, reorder, add, or delete triggers a complete UI rebuild
- All DOM nodes are garbage-collected and recreated (no diffing, no recycling)
- All event listeners attached in `wireBookmarkCards()` are destroyed and reattached
- The `container.innerHTML = ''` approach prevents any incremental update strategy
- No way to preserve scroll position, focus state, or CSS transition mid-state across renders

**Recommendation:** Implement a targeted update strategy. The minimum viable change is to diff `_layoutItems` against the previous state and only re-render categories/groups that actually changed. The nuclear option is adopting a virtual DOM or reactive framework, but a hand-rolled diff on the flat `LayoutItem[]` array would cover 90% of cases with minimal refactoring.

#### C2. Triple render on initial Convex connection

**File: `store.ts:204-220`**

Three independent subscriptions fire on connection, each calling `rebuild()`:

```typescript
// store.ts:205-220
client.onUpdate(api.categories.list, {}, (result) => {
  _rawCategories = result as any[];
  rebuild();   // ← render #1
});

client.onUpdate(api.tabGroups.list, {}, (result) => {
  _rawTabGroups = result as any[];
  rebuild();   // ← render #2
});

client.onUpdate(api.bookmarks.listAll, {}, (result) => {
  _rawBookmarks = result as any[];
  rebuild();   // ← render #3
});
```

The `rebuild()` function has an early exit (`if (_rawCategories === null || _rawBookmarks === null) return;` at line 254) so it won't run until both categories and bookmarks arrive. But once both are present, every subsequent subscription callback triggers a full rebuild. In practice:

1. Categories arrive → `rebuild()` exits (no bookmarks yet)
2. Bookmarks arrive → `rebuild()` runs → **full render #1**
3. Tab groups arrive → `rebuild()` runs → **full render #2**
4. If categories subscription also fires a second update → **full render #3**

On a slow connection, the user sees the UI flicker/rebuild 2-3 times within ~200ms.

**Problems:**
- 2-3x redundant full DOM rebuilds on every page load
- Visible flicker as the grid is destroyed and recreated
- ~1200 event listeners created and destroyed within 200ms (400 per render x 3)
- localStorage written 2-3 times with identical data

**Recommendation:** Debounce `rebuild()` using `requestAnimationFrame` or `queueMicrotask`. A simple pattern:

```typescript
let rebuildScheduled = false;
function scheduleRebuild(): void {
  if (rebuildScheduled) return;
  rebuildScheduled = true;
  queueMicrotask(() => {
    rebuildScheduled = false;
    rebuild();
  });
}
```

This coalesces all subscription callbacks within the same microtask into a single rebuild.

### HIGH: Event Listener Mass Recreation

#### H1. ~400+ event listeners destroyed and recreated per render cycle

**File: `categories.ts:117-153` (`wireBookmarkCards`)**

Every render cycle calls `wireBookmarkCards()` on each category element, which attaches 8-10 event listeners per bookmark card:

```typescript
// categories.ts:117-153
function wireBookmarkCards(el: HTMLElement): void {
  el.querySelectorAll<HTMLImageElement>('.bookmark-icon').forEach((img) => {
    img.addEventListener('error', () => { img.src = FALLBACK_ICON; }, { once: true });  // 1
    img.addEventListener('load', () => { ... }, { once: true });                         // 2
  });

  const bookmarkCards = el.querySelectorAll<HTMLElement>('.bookmark-card:not(.add-bookmark)');
  bookmarkCards.forEach((card) => {
    card.addEventListener('pointermove', handleCardPointerMove);  // 3
    card.addEventListener('pointerleave', handleCardPointerLeave); // 4
    card.addEventListener('dragstart', (e) => e.preventDefault()); // 5
    initLongPress(card);   // 6-11: pointerdown, pointermove, pointerup, pointercancel, touchmove, contextmenu
    card.addEventListener('click', (e) => { ... });                // 12
  });

  const grids = el.querySelectorAll<HTMLElement>('.bookmarks-grid');
  grids.forEach((grid) => {
    if (isMobile) initGridLongPress(grid); // 13-17: pointerdown, pointermove, pointerup, pointercancel, contextmenu
  });
}
```

And `initLongPress` in `bookmark-card.ts:77-222` adds 6 more listeners per card:

```typescript
// bookmark-card.ts:85-222
export function initLongPress(card: HTMLElement): void {
  card.addEventListener('pointerdown', ...);   // line 85
  card.addEventListener('pointermove', ...);   // line 115
  card.addEventListener('pointerup', ...);     // line 158
  card.addEventListener('pointercancel', ...); // line 187
  card.addEventListener('touchmove', ...);     // line 203
  card.addEventListener('contextmenu', ...);   // line 219
}
```

For a grid of 40 bookmark cards:
- `wireBookmarkCards` listeners: 40 x 5 = 200
- `initLongPress` listeners: 40 x 6 = 240
- `img` listeners: 40 x 2 = 80
- Grid long-press (mobile): 5 x 5 = 25
- Category/tab handle drag: ~20
- **Total: ~565 listeners per render**

All of these are destroyed by `container.innerHTML = ''` and recreated from scratch.

**Problems:**
- Hundreds of closures allocated per render cycle, each capturing local variables (`startX`, `startY`, `timer`, `activated`, `dragStarted`, `savedEvent`)
- Each closure is a separate heap allocation with its own captured scope
- Previous closures become garbage — GC pressure spikes on every render
- No mechanism to reuse listeners across renders (e.g. via `AbortController` or event delegation)

**Recommendation:** The `click` delegation in `main.ts:104-142` already demonstrates the right pattern — a single document-level listener handles all click actions via `closest('[data-action]')`. Extend this pattern:
1. Use event delegation for `pointermove`/`pointerleave` on the container (one listener instead of 40)
2. Use event delegation for `pointerdown` on the container, identify the target card, and manage long-press state in a `Map<HTMLElement, LongPressState>`
3. This eliminates per-card listener attachment entirely

#### H2. `localStorage.setItem` with full `JSON.stringify` on every rebuild

**File: `store.ts:347`**

```typescript
// store.ts:347
localStorage.setItem('speedDialData', JSON.stringify(_categories));
```

This runs inside `rebuild()`, which is called on every Convex subscription update. `JSON.stringify` on the entire `_categories` array is O(n) where n = total bookmarks across all categories. For 100 bookmarks with icon paths, this could be 10-20KB of JSON serialized synchronously on every update.

Additionally, `saveData()` (line 119) does the same thing for local-mode operations:

```typescript
// store.ts:117-122
export async function saveData(): Promise<void> {
  if (_convexActive) return;
  localStorage.setItem('speedDialData', JSON.stringify(_categories));
  localStorage.setItem('speedDialTabGroups', JSON.stringify(_localTabGroups));
  rebuildLocalLayout();
}
```

**Problems:**
- Synchronous `JSON.stringify` on every subscription update blocks the main thread
- `localStorage.setItem` is also synchronous and may trigger disk I/O
- On the triple-render at connection time (C2), this runs 2-3 times with identical data
- Drag-and-drop reorder operations call `saveData()` → `renderCallback()`, so every bookmark move serializes the full dataset

**Recommendation:** Debounce localStorage writes. The data doesn't need to be saved on every render — it's a cache for instant restore on next page load. A 1-second debounce timer would eliminate redundant writes without any user-visible impact.

### MEDIUM: Computational Waste

#### M1. `window.matchMedia` called per-render without caching

**Files: `categories.ts:85,150,487`, `preferences.ts:177,226`**

`window.matchMedia('(max-width: 768px)')` is called in multiple places on every render:

```typescript
// categories.ts:85 (inside renderBookmarksGrid — called once per category per render)
const mobile = window.matchMedia('(max-width: 768px)').matches;

// categories.ts:150 (inside wireBookmarkCards — called once per category per render)
const isMobile = window.matchMedia('(max-width: 768px)').matches;

// categories.ts:487 (inside renderCategories — called once per render)
const isMobile = window.matchMedia('(max-width: 768px)').matches;

// preferences.ts:177 (inside applyCardSizeToDOM)
const mobile = window.matchMedia('(max-width: 768px)').matches;

// preferences.ts:226 (inside applyBarscaleToDOM)
if (window.matchMedia('(max-width: 768px)').matches) {
```

For 5 categories, that's ~12 `matchMedia` calls per render cycle. Each call creates a new `MediaQueryList` object that is immediately discarded.

**Problems:**
- Unnecessary object creation and evaluation per call
- The result doesn't change between calls within the same render cycle
- Creates GC pressure from discarded `MediaQueryList` objects
- Inconsistent pattern — sometimes the result is cached in a local variable, sometimes it's inline

**Recommendation:** Create a single cached query at module level with a change listener:

```typescript
const mobileQuery = window.matchMedia('(max-width: 768px)');
let isMobile = mobileQuery.matches;
mobileQuery.addEventListener('change', (e) => { isMobile = e.matches; });
export function getIsMobile(): boolean { return isMobile; }
```

#### M2. `getBoundingClientRect()` inside `handleCardPointerMove` on every pointer move

**File: `bookmark-card.ts:4-29`**

```typescript
// bookmark-card.ts:4-29
export function handleCardPointerMove(e: PointerEvent): void {
  if (e.pointerType === 'touch') return;
  const card = e.currentTarget as HTMLElement;
  const rect = card.getBoundingClientRect();          // ← forced layout read
  const proximityRadius = Math.max(25, rect.width * 0.35);

  const editBtn = card.querySelector<HTMLElement>('.edit-btn');
  const deleteBtn = card.querySelector<HTMLElement>('.delete-btn');

  if (editBtn) {
    const br = editBtn.getBoundingClientRect();       // ← forced layout read
    const dx = e.clientX - (br.left + br.width / 2);
    const dy = e.clientY - (br.top + br.height / 2);
    editBtn.classList.toggle('visible', ...);          // ← potential layout write
  }

  if (deleteBtn) {
    const br = deleteBtn.getBoundingClientRect();     // ← forced layout read
    // ...
    deleteBtn.classList.toggle('visible', ...);        // ← potential layout write
  }
}
```

This runs on **every mouse move** over any bookmark card. Each call triggers 3x `getBoundingClientRect()` (card + editBtn + deleteBtn) and up to 2x `classList.toggle` operations. `getBoundingClientRect()` forces a layout recalculation if the layout is dirty.

**Problems:**
- 3 forced layout reads per mouse move event (could be 60+ times per second at high mouse polling rates)
- `classList.toggle` writes between `getBoundingClientRect` reads could cause layout thrashing (read → write → read → write pattern)
- `querySelector` DOM traversal on every move (finds `.edit-btn` and `.delete-btn` anew each time)

**Recommendation:**
1. Cache the button references on first encounter (or via a `WeakMap` keyed on the card element)
2. Batch the reads before the writes: read all 3 rects first, then toggle both classes
3. Consider throttling to 30fps using `requestAnimationFrame` — proximity hover at 30fps is indistinguishable from 60fps to the user

#### M3. SVG noise texture rendered as a full-viewport `body::before` overlay

**File: `main.css:136-144`**

```css
/* main.css:136-144 */
body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image: url("data:image/svg+xml,...feTurbulence...");
    opacity: 0.03;
    pointer-events: none;
    z-index: 1000;
}
```

This creates a full-viewport pseudo-element with an inline SVG filter (`feTurbulence`) that the browser must composite on every frame. The element is `position: fixed` and `z-index: 1000`, so it sits in its own stacking context above all content.

**Problems:**
- The SVG `feTurbulence` filter is computationally expensive to render
- `position: fixed` + `z-index: 1000` creates a stacking context that the compositor must handle on every scroll/paint
- The filter is applied to a viewport-sized element on every composite pass
- On low-end devices and mobile, this may contribute to scroll jank
- The `opacity: 0.03` means the visual effect is barely visible — high cost for minimal visual impact

**Recommendation:** Replace the SVG filter with a pre-rendered PNG noise tile (e.g. 200x200px, tiled via `background-repeat`). This eliminates the filter computation entirely and replaces it with a simple tiled texture that the GPU can handle trivially. Alternatively, add `will-change: transform` to hint the compositor to cache it on its own layer.

#### M4. Auto-scroll `requestAnimationFrame` loop runs for entire drag duration

**File: `drag-drop.ts:975-993`**

```typescript
// drag-drop.ts:975-993
private startAutoScroll(): void {
  const scroll = () => {
    if (!this.isDragging) return;
    const EDGE = AUTO_SCROLL_EDGE;
    const y = this.currentY;
    const vh = window.innerHeight;

    if (y < EDGE) {
      const speed = ((EDGE - y) / EDGE) * 12;
      window.scrollBy(0, -speed);         // ← scrolls even when not near edge
    } else if (y > vh - EDGE) {
      const speed = ((y - (vh - EDGE)) / EDGE) * 12;
      window.scrollBy(0, speed);
    }

    this.scrollRAF = requestAnimationFrame(scroll);  // ← always re-schedules
  };
  this.scrollRAF = requestAnimationFrame(scroll);
}
```

The `requestAnimationFrame` loop runs continuously for the entire drag duration, calling `window.scrollBy(0, 0)` even when the pointer is in the middle of the viewport (neither `if` nor `else if` branch triggers, but the `rAF` keeps running).

**Problems:**
- Continuous rAF loop fires 60 times/second for the entire drag, even when no scrolling is needed
- Each frame calls `window.innerHeight` (cheap but unnecessary when not near edges)
- The loop only stops when `this.isDragging` becomes false or `stopAutoScroll()` is called

**Recommendation:** Only start the rAF loop when the pointer enters an edge zone, and stop it when it leaves. Or keep the loop but skip the `scrollBy` call entirely when outside both zones (the current code already does this implicitly, but the rAF overhead remains).

### LOW: Minor Inefficiencies and Potential Issues

#### L1. Undo stack closures capture data snapshots indefinitely

**File: `store.ts:493-523` (deleteCategory), `store.ts:626-663` (deleteBookmarkById), and others**

The undo system captures full data snapshots in closures:

```typescript
// store.ts:493-523
export async function deleteCategory(id: string): Promise<void> {
  let capturedData: { name: string; bookmarks: Bookmark[] } | undefined;
  if (!isUndoing()) {
    const cat = _categories.find((c) => c.id === id);
    if (cat) {
      capturedData = { name: cat.name, bookmarks: cat.bookmarks.map((b) => ({ ...b })) };
      //                                           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      //                                           Full shallow copy of every bookmark
    }
  }
  // ...
  if (!isUndoing() && capturedData) {
    const data = capturedData;
    pushUndo({
      undo: async () => {
        ref.currentId = await createCategory(data.name);
        for (const bk of data.bookmarks) {
          await createBookmark(ref.currentId, bk.title, bk.url, bk.iconPath);
          //                                                     ^^^^^^^^^^^
          //                                    iconPath can be a data: URI (10-50KB each)
        }
      },
      redo: () => deleteCategory(ref.currentId),
    });
  }
}
```

The undo stack holds up to 50 entries (`MAX_STACK = 50` in `undo.ts:14`). Each delete-category undo entry captures a full copy of all bookmarks in that category, including `iconPath` which can be a `data:` URI of 10-50KB for uploaded icons.

**Problems:**
- Worst case: 50 undo entries x category with 20 bookmarks x 50KB icon each = ~50MB retained in memory
- Closures are never explicitly freed — they persist in the undo/redo stacks until shifted out by `MAX_STACK`
- The `bookmarks.map((b) => ({ ...b }))` creates shallow copies but retains string references (iconPath strings are shared, not duplicated, which mitigates the worst case)
- Group undo entries (`UndoGroup.entries`) can multiply this further

**Recommendation:**
1. For `data:` URI icons, store only the bookmark ID and look up the icon from the current state on undo (avoids retaining large strings)
2. Consider reducing `MAX_STACK` to 20 — 50 undos is generous and most users won't need it
3. Add a size estimate check: if an undo entry would capture more than N bytes of icon data, skip capturing icons and re-fetch them on undo

#### L2. `renderBookmarksGrid` generates HTML via string concatenation with multiple `escapeHtml` calls

**File: `categories.ts:84-115`**

```typescript
// categories.ts:84-115
function renderBookmarksGrid(category: Category, currentCardSize: number, showCardNames: boolean): string {
  const mobile = window.matchMedia('(max-width: 768px)').matches;
  const gap = mobile ? getCardGap(60) : getCardGap(currentCardSize);
  const cols = mobile ? `repeat(${getMobileColumns()}, 1fr)` : `repeat(auto-fill, minmax(${currentCardSize}px, 1fr))`;
  const nameOnHover = getShowNameOnHover();
  const btnSize = getBtnSize(currentCardSize);
  return `
    <div class="bookmarks-grid" ...>
      ${category.bookmarks
        .map((bookmark, index) => `
        <div class="bookmark-card ..."
             data-bookmark-id="${escapeHtml(bookmark.id)}"
             ...>
          ...
        </div>
      `).join('')}
    </div>
  `;
}
```

Each bookmark card calls `escapeHtml()` 7 times (id, categoryId, index, url, title x2, iconUrl). For 40 bookmarks, that's 280 `escapeHtml` calls per render.

**Problems:**
- String concatenation with template literals creates many intermediate strings
- `escapeHtml` is called on IDs and URLs that could be pre-validated (Convex IDs never contain HTML-special characters)
- The generated HTML is assigned to `innerHTML`, which the browser must parse — `createElement` + property assignment would be faster for known-safe data

**Recommendation:** Low priority. The `escapeHtml` calls are correct for security (XSS prevention) and the performance cost is negligible compared to the DOM rebuild. Only optimize if profiling shows this as a bottleneck.

#### L3. `initDragListeners` has a one-time guard but checks it on every render

**File: `categories.ts:499-503`**

```typescript
// categories.ts:499-503
if (!dragListenersInitialized) {
  initDragListeners(renderCategories);
  dragListenersInitialized = true;
}
```

This check runs on every render cycle but only executes once. Harmless, but the `visibilitychange` listener inside `DragController.init()` (drag-drop.ts:132-135) would be registered twice if this guard failed.

**Problems:**
- Minimal — the guard works correctly
- `DragController.init()` has no internal guard against double-call (noted in the interaction audit as L2)

**Recommendation:** Already noted in the interaction audit. Add an internal guard to `DragController.init()`.

#### L4. Category entrance animation fires on every render despite suppression attempt

**File: `categories.ts:507-509`, `main.css:406-427`**

```typescript
// categories.ts:507-509
requestAnimationFrame(() => {
  container.classList.add('loaded');
});
```

```css
/* main.css:406-408 */
.category {
    animation: fadeSlide 0.4s ease-out backwards;
}

/* main.css:423-427 */
#categories-container.loaded .category,
#categories-container.loaded .tab-group {
    animation: none;
}
```

The suppression works by adding `.loaded` to the container after the first render. But because `renderCategories` does `container.innerHTML = ''` on every call, the `.loaded` class is preserved on the container (it's on the container, not on the children), so subsequent renders correctly skip the animation. However, there's a gap:

**Problems:**
- The `requestAnimationFrame` on line 507 fires after every render, not just the first — it adds a class that's already there
- On the very first render, there's a brief window where the animation starts, then `.loaded` is added in the next frame, but by then the animation has already been committed — the suppression only affects subsequent renders
- If the render takes longer than 1 frame, users may see a partial animation flicker

**Recommendation:** Move the `loaded` class addition to after the first render only, guarded by a flag. Or use a CSS-only approach: set `animation: none` by default and only enable it via a `.animate-entrance` class added during the initial render.

#### L5. `requestRender` defers renders during drag but doesn't coalesce multiple deferred renders

**File: `drag-drop.ts:146-152`**

```typescript
// drag-drop.ts:146-152
requestRender(renderFn: () => void): void {
  if (this.isDragging) {
    this.pendingRenderFn = renderFn;  // ← overwrites previous pending render
    return;
  }
  renderFn();
}
```

During a drag, if multiple Convex subscription updates arrive, each overwrites `this.pendingRenderFn`. Only the last deferred render executes when the drag completes (cleanup at line 375-379). This is actually correct behavior — multiple renders should be coalesced into one. But it relies on all render functions being identical (`renderCategories`), which is currently true but fragile.

**Problems:**
- Fragile assumption that all deferred renders are the same function
- If different render callbacks were registered (e.g., preferences vs. categories), only the last one would run

**Recommendation:** Low priority. The current design is correct for the current architecture. If render callbacks become heterogeneous, switch to a Set or array of pending renders.

---

## Render Pipeline Map

### Data Flow: Convex → DOM

```
Convex WebSocket
  ├─ categories.list subscription ──┐
  ├─ bookmarks.listAll subscription ─┼──→ rebuild() [store.ts:253]
  ├─ tabGroups.list subscription ───┘      │
  │                                        ├─ Wait for _rawCategories + _rawBookmarks
  │                                        ├─ Denormalize: join bookmarks → categories
  │                                        ├─ Build _layoutItems (sort by order)
  │                                        ├─ localStorage.setItem(JSON.stringify) ← sync write
  │                                        └─ rerender()
  │                                             │
  └─ preferences.get subscription ──→ applyPreferences() [preferences.ts:138]
                                        ├─ applyCardSizeToDOM()  ← direct DOM mutation
                                        ├─ applyPageWidthToDOM() ← direct DOM mutation
                                        ├─ applyWireframeToDOM() ← direct DOM mutation
                                        └─ renderCallback() if names changed
                                             │
                                             ▼
                                    dragController.requestRender(renderCategories)
                                             │
                                    ┌────────┴────────┐
                                    │ isDragging?      │
                                    │ YES → defer      │
                                    │ NO  → execute    │
                                    └────────┬────────┘
                                             │
                                             ▼
                                    renderCategories() [categories.ts:464]
                                             │
                                    ┌────────┴────────┐
                                    │ container.innerHTML = ''     ← NUCLEAR TEARDOWN
                                    │                              │
                                    │ for each LayoutItem:         │
                                    │   ├─ renderSingleCategory()  │
                                    │   │   ├─ renderBookmarksGrid()  ← HTML string gen
                                    │   │   ├─ wireBookmarkCards()     ← 8-12 listeners/card
                                    │   │   └─ initHandleDrag()       ← 5 listeners/handle
                                    │   │                              │
                                    │   └─ renderTabGroup()            │
                                    │       ├─ renderBookmarksGrid() x N panels
                                    │       ├─ wireBookmarkCards()
                                    │       ├─ initTabDrag() per tab
                                    │       ├─ initTabSwipe()
                                    │       └─ initHandleDrag()
                                    │                              │
                                    │ matchMedia() x 3             │
                                    │ rAF → container.classList.add('loaded')
                                    └─────────────────────────────┘
```

### Data Flow: User Action → Convex → DOM

```
User drags bookmark to new position
  → DragController.onPointerUp()
    → executeBookmarkDrop()
      → performBookmarkDrop()
        ├─ Optimistic update: splice in-memory array
        ├─ renderCallback() → renderCategories()  ← full rebuild for optimistic UI
        ├─ reorderBookmark() → Convex mutation
        └─ pushUndo() → captures closure with order values
                            │
                            ▼
                     Convex mutation round-trip (~50-200ms)
                            │
                            ▼
                     Subscription fires → rebuild() → renderCategories()
                            ← SECOND full rebuild for the same operation
```

Every mutation triggers TWO full renders: one optimistic (immediate), one from the subscription echo. This is inherent to the Convex subscription model without optimistic update deduplication.

### What runs per render (quantified for 5 categories, 40 bookmarks):

| Operation | Count | Cost |
|-----------|-------|------|
| `container.innerHTML = ''` | 1 | Destroys ~50 DOM nodes |
| `renderBookmarksGrid` (HTML gen) | 5 | ~280 `escapeHtml` calls |
| `innerHTML` assignment (parse) | 5 | Browser HTML parser |
| `wireBookmarkCards` | 5 | ~480 `addEventListener` calls |
| `initHandleDrag` | ~12 | ~60 `addEventListener` calls |
| `initLongPress` | 40 | ~240 closures allocated |
| `window.matchMedia` | ~12 | ~12 `MediaQueryList` objects |
| `JSON.stringify` (localStorage) | 1 | Serializes ~10-20KB |
| `localStorage.setItem` | 1 | Synchronous disk write |
| `getCardGap` / `getBtnSize` | 5 | Trivial computation |
| `requestAnimationFrame` | 1 | Schedules `.loaded` class |

---

## Recommended Overhaul Plan

### Phase 1: Quick wins — no architectural changes (1-2 hours)

1. **Debounce `rebuild()` via `queueMicrotask`** (`store.ts`)
   - Coalesces the triple-fire on connection into a single render
   - Zero risk — `queueMicrotask` fires before the next frame
   - Eliminates 2 out of 3 initial renders
   - Effort: ~15 min

2. **Debounce `localStorage.setItem` writes** (`store.ts:347`)
   - Wrap in a 1-second `setTimeout` debounce
   - Cache is for instant restore — doesn't need real-time accuracy
   - Effort: ~10 min

3. **Cache `window.matchMedia` result** (`categories.ts`, `preferences.ts`)
   - Create `src/utils/media-query.ts` with a cached `isMobile` getter + change listener
   - Replace all 5+ inline `matchMedia` calls with the cached version
   - Effort: ~15 min

4. **Batch reads before writes in `handleCardPointerMove`** (`bookmark-card.ts:4-29`)
   - Read all 3 rects first, then toggle both classes
   - Eliminates potential layout thrashing
   - Effort: ~10 min

5. **Replace SVG noise filter with PNG tile** (`main.css:136-144`)
   - Generate a 200x200 noise PNG, replace the inline SVG
   - Eliminates per-frame filter computation
   - Effort: ~20 min

### Phase 2: Event delegation — reduce listener count by 90% (2-3 hours)

6. **Delegate `pointermove`/`pointerleave` for proximity hover** (`categories.ts`, `bookmark-card.ts`)
   - Single listener on `#categories-container` instead of 40+ per-card listeners
   - Use `e.target.closest('.bookmark-card')` to identify the card
   - Effort: ~45 min

7. **Delegate long-press initialization** (`bookmark-card.ts`)
   - Single `pointerdown` listener on `#categories-container`
   - Manage per-card state in a `Map<HTMLElement, LongPressState>`
   - Clean up state entries when elements are removed
   - Effort: ~1-2 hours (complex — long-press has many state transitions)

### Phase 3: Targeted rendering — eliminate nuclear rebuilds (4-8 hours)

8. **Diff `_layoutItems` before rendering** (`store.ts`, `categories.ts`)
   - Compare previous and new `_layoutItems` by ID and content hash
   - Only re-render categories/groups that actually changed
   - Preserve unchanged DOM nodes and their event listeners
   - Effort: ~3-4 hours

9. **Deduplicate optimistic + subscription renders** (`store.ts`, `drag-drop.ts`)
   - After an optimistic update, mark the expected subscription echo
   - When the echo arrives with matching data, skip the render
   - Effort: ~2-3 hours (needs careful equality comparison)

### Phase 4: Memory optimization (1-2 hours)

10. **Trim undo stack icon data** (`store.ts`)
    - Don't capture `data:` URI icon paths in undo closures
    - Store only the bookmark ID; re-fetch icon from current state on undo
    - Effort: ~30 min

11. **Reduce `MAX_STACK` or add size tracking** (`undo.ts`)
    - Drop from 50 to 20, or add a byte-size estimate and cap at ~5MB
    - Effort: ~20 min

### What NOT to change

- **`DragController.requestRender()` gating** — This is correct and essential. The deferred render prevents DOM destruction mid-drag, which would break pointer capture.
- **Event listener pattern on cards** — The `initLongPress` pattern with per-card closures is correct behavior, just needs to be delegated rather than recreated per render.
- **`innerHTML` for initial HTML generation** — String templates are fine for generating the initial markup. The problem is that it's used for *every* update, not that it's used at all.
- **`escapeHtml` calls** — These are security-critical. Never remove them.
- **`requestAnimationFrame` for auto-scroll** — The rAF pattern is the correct approach; it just needs the inner no-op case optimized (or left alone — the overhead is trivial during a drag).

---

## Summary

| Priority | ID | Item | Files Affected | Effort |
|----------|-----|------|----------------|--------|
| Critical | C1 | Full DOM rebuild on every update | `store.ts`, `categories.ts` | 3-4 hrs (Phase 3) |
| Critical | C2 | Triple render on connection | `store.ts` | 15 min |
| High | H1 | ~565 event listeners recreated per render | `categories.ts`, `bookmark-card.ts` | 2-3 hrs (Phase 2) |
| High | H2 | `localStorage` serialization on every rebuild | `store.ts` | 10 min |
| Medium | M1 | `matchMedia` called 12x per render | `categories.ts`, `preferences.ts` | 15 min |
| Medium | M2 | Layout thrashing in proximity hover | `bookmark-card.ts` | 10 min |
| Medium | M3 | SVG noise filter computed every frame | `main.css` | 20 min |
| Medium | M4 | rAF auto-scroll loop runs full drag duration | `drag-drop.ts` | 10 min |
| Low | L1 | Undo closures retain data: URI icons | `store.ts` | 30 min |
| Low | L2 | HTML string gen with 280 escapeHtml calls | `categories.ts` | N/A (keep) |
| Low | L3 | initDragListeners guard checked every render | `categories.ts` | 2 min |
| Low | L4 | Entrance animation suppression on every render | `categories.ts`, `main.css` | 5 min |
| Low | L5 | requestRender overwrites (fragile assumption) | `drag-drop.ts` | N/A (monitor) |

**Highest-impact, lowest-effort change:** Debounce `rebuild()` via `queueMicrotask` (C2) — 15 minutes of work eliminates 2 out of 3 initial renders and all their downstream costs.

**Highest-impact overall:** Targeted rendering with `_layoutItems` diffing (C1/Phase 3) — eliminates the nuclear rebuild entirely, but requires significant refactoring.

Total estimated effort for Phase 1 (quick wins): ~1-2 hours.
Total estimated effort for full overhaul (Phases 1-4): ~10-15 hours.
