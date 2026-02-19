# Interaction System Audit

Comprehensive audit of pointer/mouse/touch event handling across Brute Bookmarks.
Conducted 2026-02-19.

---

## Executive Summary

The codebase has **three distinct generations** of interaction code coexisting:

1. **Legacy mouse+touch split** (header.ts, modal backdrop dismiss)
2. **Modern pointer events** (drag-drop.ts, bookmark-card.ts, categories.ts)
3. **Intentional touch-only** (modal-swipe-dismiss.ts — documented reason)

The core drag system (generation 2) is well-architected. The problems are in the edges: the size controller still uses the old mouse/touch split, all modal backdrops use `mousedown`/`mouseup` instead of pointer events, and the proximity-hover system uses raw `mousemove` (invisible to touch/pen). These inconsistencies won't crash the app, but they create subtle UX gaps (pen input, touch-capable laptops) and make the codebase harder to reason about.

---

## Findings by Severity

### CRITICAL: Zero findings

No showstoppers. The app works. Nothing is actively broken.

### HIGH: Event System Fragmentation

#### H1. Size Controller uses mouse+touch split (`header.ts`)

**Lines 78-84.** The 2D size controller registers `mousedown`/`mousemove`/`mouseup` AND `touchstart`/`touchmove`/`touchend` as parallel handlers. Every other drag interaction in the app uses pointer events.

```typescript
// header.ts — the only file still doing this
handle.addEventListener('mousedown', startDrag);
document.addEventListener('mousemove', onDrag);
document.addEventListener('mouseup', stopDrag);

handle.addEventListener('touchstart', startDrag);
document.addEventListener('touchmove', onDrag);
document.addEventListener('touchend', stopDrag);
```

**Problems:**
- Pen/stylus input is ignored entirely (no `pointerType === 'pen'` path)
- No `setPointerCapture` — if the pointer leaves the controller during drag, events may be lost
- No `touch-action: none` on the handle in CSS — browser may claim the touch for scroll
- Document-level `mousemove`/`touchmove` listeners run *permanently* (every mouse move fires `onDrag` even when not dragging — the `if (!isDragging) return` guard mitigates but wastes cycles)
- The `onDrag` function uses type narrowing (`'touches' in e`) to differentiate mouse vs touch — pointer events eliminate this entirely

**Recommendation:** Rewrite to pointer events following the `initHandleDrag` pattern from `categories.ts`. Add `setPointerCapture`, bind document listeners only during drag, add `touch-action: none` to the handle.

#### H2. Modal backdrop dismiss uses `mousedown`/`mouseup` (4 modals)

All four modals use the same mouse-event pattern for backdrop click-to-dismiss:

| File | Lines |
|------|-------|
| `bookmark-modal.ts` | 206-214 |
| `category-modal.ts` | 122-130 |
| `settings-modal.ts` | 462-478 (x2: settings + help) |
| `confirm-modal.ts` | 134-146 |

```typescript
// Identical pattern in all four modals
let mouseDownOnBackdrop = false;
modal.addEventListener('mousedown', (e) => {
  mouseDownOnBackdrop = e.target === modal;
});
modal.addEventListener('mouseup', (e) => {
  if (mouseDownOnBackdrop && e.target === modal) close();
  mouseDownOnBackdrop = false;
});
```

**Problems:**
- Touch users can't tap the backdrop to dismiss (on most browsers, `mousedown`/`mouseup` DO fire from touch, but this is a compat shim — relying on it is fragile)
- Pen input may not trigger the compat shim on all platforms
- Inconsistent with the rest of the codebase which uses pointer events for input-agnostic handling

**Recommendation:** Replace with `pointerdown`/`pointerup`. Same logic, same variable guard, just use pointer events. This is a mechanical find-and-replace.

#### H3. Proximity hover for edit/delete buttons uses `mousemove`/`mouseleave` (`bookmark-card.ts:3-35`, `categories.ts:131-132`)

The proximity-based button reveal uses `MouseEvent` only:

```typescript
export function handleCardMouseMove(e: MouseEvent): void { ... }
export function handleCardMouseLeave(e: MouseEvent): void { ... }
```

Registered as:
```typescript
card.addEventListener('mousemove', handleCardMouseMove as EventListener);
card.addEventListener('mouseleave', handleCardMouseLeave as EventListener);
```

**Problems:**
- The `as EventListener` type cast hides the type mismatch — these are `MouseEvent` handlers registered on generic event listeners
- Pen/stylus hover (supported on Surface, iPad with Pencil hover) won't trigger these because `mousemove` doesn't fire for pen proximity
- This is desktop-only by design (mobile uses long-press context menu), but pen users on tablets are in a gray zone

**Recommendation:** Switch to `pointermove`/`pointerleave`. The handler logic is identical — `e.clientX`/`e.clientY` exist on `PointerEvent`. Add a `pointerType` guard to skip touch (the current behavior already only makes sense for mouse/pen).

### MEDIUM: Architectural Patterns

#### M1. No centralized interaction constants

Threshold values are scattered across files with no single source of truth:

| Constant | Value | File | Line |
|----------|-------|------|------|
| Long-press timer | 500ms | `bookmark-card.ts` | 100 |
| Long-press timer (grid) | 500ms | `bookmark-card.ts` | 230 |
| Hover-to-switch timer | 400ms | `drag-drop.ts` | 541 |
| Drag threshold (mouse) | 5px | `bookmark-card.ts` | 119 |
| Drag threshold (touch cancel) | 10px | `bookmark-card.ts` | 131, 206, 242 |
| Drag threshold (handles) | 5px | `categories.ts` | 180, 216 |
| Tab swipe threshold | 50px | `categories.ts` | 65 |
| Tab swipe vertical cancel | 15px | `categories.ts` | 60 |
| Context menu swipe dismiss | 60px | `bookmark-card.ts` | 283 |
| Modal swipe dismiss | 80px | `modal-swipe-dismiss.ts` | 95 |
| Auto-scroll edge zone | 60px | `drag-drop.ts` | 977 |
| Click guard timeout | 100ms | `drag-drop.ts` | 308 |

If you ever need to tweak "how far you have to drag before it starts," you need to grep for magic numbers in 4+ files.

**Recommendation:** Create `src/utils/interaction-constants.ts` with named exports. Import everywhere.

#### M2. Duplicated "track pointer + threshold + start drag" pattern

The same pattern appears 4 times with minor variations:

1. `initLongPress` in `bookmark-card.ts` (pointerdown → pointermove → threshold → startDrag)
2. `initHandleDrag` in `categories.ts` (pointerdown → pointermove → threshold → startDrag)
3. `initTabDrag` in `categories.ts` (nearly identical to initHandleDrag)
4. `initTabSwipe` in `categories.ts` (pointerdown → pointermove → threshold → switch tab)

Each reimplements: start position tracking, distance calculation, threshold check, cleanup on pointerup/pointercancel. `initHandleDrag` and `initTabDrag` are 95% identical — only the `getDragData()` call differs.

**Recommendation:** Extract a shared `PointerTracker` utility:
```typescript
interface PointerTrackerOptions {
  threshold: number;
  onThresholdExceeded: (e: PointerEvent) => void;
  onCancel?: () => void;
  preventTouchScroll?: boolean;
}
function attachPointerTracker(el: HTMLElement, opts: PointerTrackerOptions): void { ... }
```

This would reduce `initHandleDrag` + `initTabDrag` to a 3-line call each.

#### M3. `touchmove` + `{ passive: false }` is registered alongside pointer events in 4 places

Every drag-capable element registers BOTH pointer events (for tracking) AND a separate `touchmove` handler (to call `preventDefault`):

| File | Lines | Element |
|------|-------|---------|
| `bookmark-card.ts` | 197-210 | Each bookmark card |
| `categories.ts` | 191-193 | Each category handle |
| `categories.ts` | 226-228 | Each tab |
| `drag-drop.ts` | 219 | Document (during drag) |

This is a *correct* workaround — pointer events can't call `preventDefault` on the underlying touch to stop scroll because `touch-action` is read at gesture start. But it means every draggable element has a hidden `touchmove` listener that's easy to forget when adding new drag sources.

**Recommendation:** Document this as an explicit pattern in a comment block or in the `PointerTracker` utility. The `preventTouchScroll` option in M2 would encapsulate this automatically.

#### M4. Tab swipe (`initTabSwipe`) doesn't use pointer capture

`initTabSwipe` in `categories.ts:46-80` tracks pointer movement for horizontal swipe detection but doesn't call `setPointerCapture`. If the pointer moves over a child element (bookmark card), events may stop reaching the content element.

In practice, this works because bookmark cards are below the content element in the DOM, but it's fragile — if the DOM structure changes, swipe detection could break silently.

**Recommendation:** Add `setPointerCapture` on the content element during swipe tracking, matching the pattern used everywhere else.

### LOW: Cleanup and Edge Cases

#### L1. Context menu dismiss handlers could leak

`showContextMenu` and `showUndoRedoMenu` in `bookmark-card.ts` register `pointerdown` and `scroll` listeners on `document` (capture phase) for dismiss. These are cleaned up when:
- A tap outside the menu triggers `dismissHandler`
- A scroll triggers `scrollDismiss`
- The menu is dismissed via swipe
- `dismissContextMenu()` is called directly

But if `dismissContextMenu()` is called directly (e.g., from the long-press handler at line 174), the document listeners are NOT removed — only the DOM element is removed. The orphaned handlers will fire on the next interaction and try to operate on a removed DOM node (`menu.contains(e.target)` on a detached node returns false, so they self-cleanup on the next click).

**Impact:** Minimal — they self-cleanup on next interaction. But it's a code smell.

**Recommendation:** Store dismiss cleanup functions on the menu element or in a module-level variable, and call them from `dismissContextMenu()`.

#### L2. `visibilitychange` listener in DragController is never removed

`drag-drop.ts:132` registers a `visibilitychange` listener on `document` inside `init()`. This persists forever. Since `init()` is only called once and the DragController is a singleton, this is fine — but if `init()` were accidentally called twice, it would register a duplicate.

**Recommendation:** Add a guard (`if (this.renderCallback) return;` at the top of `init`) or move the listener registration to the constructor.

#### L3. `window.addEventListener('popstate')` in modal-swipe-dismiss is never removed

`modal-swipe-dismiss.ts:141` registers a `popstate` handler on `window` that fires whenever history state changes. If the modal is open, it calls `closeFn()`. This listener persists for the lifetime of the app for every modal that uses `wireModalSwipeDismiss`.

**Impact:** Low — the guard `modal.classList.contains('active')` prevents spurious closes. But with 4 modals, there are 4 permanent `popstate` listeners on `window`.

**Recommendation:** Use an `AbortController` to register and tear down these listeners with the modal lifecycle.

#### L4. Icon picker uses native HTML5 drag events (correct)

`icon-picker.ts:359-378` uses `dragover`/`dragleave`/`drop` for file upload drop zone. This is the correct API for file drops — native drag-and-drop from the OS file manager. These should NOT be converted to pointer events.

**No action needed.** Just noting for completeness that this is intentionally different from the custom drag system.

#### L5. Inconsistent `isPrimary` checks

Some pointer handlers check `e.isPrimary` (reject multi-touch), others don't:

| File | Handler | Checks `isPrimary`? |
|------|---------|---------------------|
| `bookmark-card.ts` | `initLongPress` pointerdown | Yes |
| `bookmark-card.ts` | `initLongPress` pointermove | Yes |
| `bookmark-card.ts` | `initGridLongPress` | No |
| `bookmark-card.ts` | `wireSwipeToDismiss` | No |
| `categories.ts` | `initHandleDrag` pointerdown | Yes |
| `categories.ts` | `initHandleDrag` pointermove | Yes |
| `categories.ts` | `initTabDrag` pointerdown | Yes |
| `categories.ts` | `initTabSwipe` | No |
| `drag-drop.ts` | `startDrag` | Yes |
| `drag-drop.ts` | `onPointerMove` | Yes |

`initGridLongPress`, `wireSwipeToDismiss`, and `initTabSwipe` don't filter for `isPrimary`, meaning a second finger could trigger or interfere with these interactions.

**Recommendation:** Add `if (!e.isPrimary) return;` to all pointer event handlers consistently.

---

## Event System Map

### What uses what:

| Component | Pointer Events | Mouse Events | Touch Events | Reason |
|-----------|:---:|:---:|:---:|--------|
| Bookmark drag (card) | Yes | - | `touchmove` only | Scroll prevention |
| Category/tab drag (handle) | Yes | - | `touchmove` only | Scroll prevention |
| DragController (document) | Yes | - | `touchmove` only | Scroll prevention |
| Tab swipe | Yes | - | - | Clean |
| Long-press (bookmark) | Yes | - | `touchmove` only | Scroll prevention |
| Long-press (grid) | Yes | - | - | Clean |
| Context menu swipe | Yes | - | - | Clean |
| **Size controller** | - | **Yes** | **Yes** | **LEGACY** |
| **Proximity hover** | - | **Yes** | - | **LEGACY** |
| **Modal backdrop dismiss** | - | **Yes** | - | **LEGACY (x5)** |
| Modal swipe-dismiss | - | - | Yes | Intentional (documented) |
| Icon drop zone | - | - | - | HTML5 drag (correct) |
| Context menu dismiss | Yes (pointerdown) | - | - | Clean |
| Keyboard shortcuts | keydown | - | - | Clean |

**Bold = should be migrated to pointer events.**

---

## Recommended Overhaul Plan

### Phase 1: Quick wins (mechanical replacements)

1. **Migrate modal backdrop dismiss to pointer events** (5 instances across 4 files)
   - `mousedown` → `pointerdown`, `mouseup` → `pointerup`
   - Variable name: `mouseDownOnBackdrop` → `pointerDownOnBackdrop`
   - Effort: ~15 min, zero risk

2. **Migrate proximity hover to pointer events** (`bookmark-card.ts`)
   - `handleCardMouseMove` → `handleCardPointerMove`, `MouseEvent` → `PointerEvent`
   - `handleCardMouseLeave` → `handleCardPointerLeave`
   - In `categories.ts`, switch `mousemove` → `pointermove`, `mouseleave` → `pointerleave`
   - Add `if (e.pointerType === 'touch') return;` guard (proximity hover doesn't make sense for touch)
   - Remove `as EventListener` casts
   - Effort: ~15 min, low risk

3. **Add `isPrimary` checks** to `initGridLongPress`, `wireSwipeToDismiss`, `initTabSwipe`
   - Effort: ~5 min, zero risk

### Phase 2: Size controller rewrite

4. **Rewrite `header.ts` to pointer events**
   - Replace mouse+touch split with single pointer event path
   - Add `setPointerCapture` / `releasePointerCapture`
   - Add `touch-action: none` to `.size-handle` in CSS
   - Bind document listeners only during drag (currently permanent)
   - Effort: ~30 min, medium risk (undo integration needs testing)

### Phase 3: Extract shared utilities

5. **Create `src/utils/interaction-constants.ts`**
   - Extract all magic numbers (thresholds, timers, edge zones)
   - Export as named constants
   - Import in all interaction files
   - Effort: ~20 min, zero risk

6. **Create `PointerTracker` utility** (optional, higher effort)
   - Encapsulates: pointerdown → track → threshold → callback → cleanup
   - Handles `setPointerCapture`, `isPrimary` check, touchmove prevention
   - Replaces the 4 duplicated tracking patterns
   - Effort: ~1-2 hours, medium risk (behavioral parity must be exact)

### Phase 4: Cleanup

7. **Fix context menu dismiss listener leak** (`bookmark-card.ts`)
   - Store cleanup function, call from `dismissContextMenu()`
   - Effort: ~10 min, low risk

8. **Guard `DragController.init()` against double-call**
   - Effort: ~2 min, zero risk

### What NOT to change

- **`modal-swipe-dismiss.ts`** — The touch-only approach is correct and well-documented. Pointer events would cause `pointercancel` on the scrollable container.
- **`icon-picker.ts` drag/drop** — HTML5 drag events are the correct API for OS-level file drops.
- **`click` event handlers** — Click is a high-level event that fires correctly from mouse, touch, and keyboard. No migration needed.
- **`keydown` handlers** — Already correct everywhere.
- **`dragstart` preventDefault** — Correct approach to suppress native browser drag on cards/handles.

---

## Summary

| Priority | Item | Files Affected | Effort |
|----------|------|----------------|--------|
| High | H1: Size controller rewrite | `header.ts`, `main.css` | 30 min |
| High | H2: Modal backdrop → pointer events | 4 modal files | 15 min |
| High | H3: Proximity hover → pointer events | `bookmark-card.ts`, `categories.ts` | 15 min |
| Medium | M1: Extract interaction constants | New file + 4 imports | 20 min |
| Medium | M2: PointerTracker utility | New file + 4 refactors | 1-2 hrs |
| Medium | M4: Tab swipe pointer capture | `categories.ts` | 5 min |
| Low | L1: Context menu dismiss leak | `bookmark-card.ts` | 10 min |
| Low | L2: DragController init guard | `drag-drop.ts` | 2 min |
| Low | L5: isPrimary consistency | `bookmark-card.ts`, `categories.ts` | 5 min |

Total estimated effort for phases 1-2 (the high-value work): ~1 hour.
Phase 3 (constants + utility): ~1-2 hours depending on how far you want to go with the PointerTracker abstraction.
