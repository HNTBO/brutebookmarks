# Modal System Audit

Comprehensive audit of modal lifecycle, concurrency, animation, and dismiss patterns across Brute Bookmarks.
Conducted 2026-02-19.

---

## Executive Summary

The app has **five modals** sharing one CSS framework (`.modal` / `.modal.active`) and a new centralized close pipeline (`modal-manager.ts`). The modal manager is a positive step: global Escape now calls `dismissAllModals()` instead of hand-listing each modal, and the confirm modal's promise resolution runs through `dismissConfirm()` on every close path. However, several systemic issues remain:

1. **Singleton concurrency in confirm-modal** -- the `_resolve` and `_promptResolve` module-level variables are silently overwritten when a second dialog opens before the first resolves, leaving the first caller's Promise hanging forever.
2. **Dead CSS animation** -- a `.modal-content.dismissing` class with a `modalSlideOut` keyframe animation is defined in CSS but never applied by any JavaScript code. The swipe-dismiss system uses inline styles instead.
3. **Never-removed `popstate` listeners** -- `wireModalSwipeDismiss` registers a permanent `window.addEventListener('popstate')` for each of the 5 modals that call it, and none are ever cleaned up.
4. **Help modal has no named close function** -- it uses inline `classList.remove('active')` in 4 separate places instead of a reusable `closeHelpModal()`, creating divergence from the pattern used by every other modal.
5. **No z-index stacking for layered modals** -- when confirm opens over settings (a common flow), both sit at `z-index: 1000` with stacking determined solely by DOM order. This works by accident but is fragile.
6. **MutationObserver per modal** -- 5 permanent MutationObservers watch for class attribute changes to push history state, but never disconnect.

The app works. No modal is actively broken. But the system is held together by implicit ordering and DOM-position coincidences rather than explicit layering and lifecycle management. Adding a sixth modal or changing DOM order would expose these weaknesses.

---

## Findings by Severity

### CRITICAL: Zero findings

No showstoppers. All modals open, close, and dismiss correctly in normal usage.

### HIGH

#### H1. Confirm-modal singleton concurrency -- `_resolve`/`_promptResolve` overwrite

**Files:** `src/components/modals/confirm-modal.ts`, lines 4-5, 48-50, 63-65, 79-81

The confirm modal uses two module-level resolver variables:

```typescript
// confirm-modal.ts:4-5
let _resolve: ((value: boolean | null) => void) | null = null;
let _promptResolve: ((value: string | null) => void) | null = null;
```

Every call to `styledConfirm`, `styledAlert`, or `styledPrompt` overwrites the corresponding variable:

```typescript
// confirm-modal.ts:48-50 (styledConfirm)
return new Promise((resolve) => {
  _resolve = resolve;
});

// confirm-modal.ts:63-65 (styledAlert)
return new Promise((resolve) => {
  _resolve = () => resolve();
});

// confirm-modal.ts:79-81 (styledPrompt)
return new Promise((resolve) => {
  _promptResolve = resolve;
});
```

**Problems:**
- If `styledConfirm('Delete?')` is called and, before the user responds, another `styledAlert('Done!')` fires, the first Promise's `_resolve` is silently replaced. The first caller awaits forever -- it becomes a memory-leaked, never-resolved Promise.
- This is not hypothetical. The import flow in `settings-modal.ts` calls `styledConfirm` (line 92), then on success calls `styledConfirm` again (line 178), then calls `styledAlert` (line 201). If any code path triggers a second dialog before the first resolves (e.g., a Convex subscription fires `styledAlert` during an `await styledConfirm`), the first hangs.
- `styledConfirm` and `styledPrompt` write to different variables (`_resolve` vs `_promptResolve`), but `styledAlert` writes to `_resolve` -- so `styledAlert` after `styledConfirm` is the highest-risk collision.
- No queue, no stack, no guard. A second call silently replaces the previous resolver.

**Recommendation:** Implement a dialog queue. When a second dialog is requested while one is active, either:
- (a) Queue it and show after the current one closes, or
- (b) Reject/resolve the previous dialog before overwriting (with a default value like `null`).

Option (a) is cleaner. Store pending dialogs in an array and shift the next one on close.

#### H2. Help modal has no named close function -- inline `classList.remove` in 4 places

**Files:** `src/components/modals/settings-modal.ts` lines 392, 463, 473, 494; `src/main.ts` line 172 (now via `dismissAllModals`)

The help modal's close logic is repeated as inline code:

```typescript
// settings-modal.ts:392 (registerModal callback)
registerModal('help-modal', () => {
  document.getElementById('help-modal')!.classList.remove('active');
});

// settings-modal.ts:463 (close button)
document.getElementById('help-modal-close')!.addEventListener('click', () => {
  document.getElementById('help-modal')!.classList.remove('active');
});

// settings-modal.ts:473 (backdrop dismiss)
if (helpPointerDownOnBackdrop && e.target === helpModal) {
  helpModal.classList.remove('active');
}

// settings-modal.ts:494 (swipe dismiss)
wireModalSwipeDismiss('help-modal', () => {
  document.getElementById('help-modal')!.classList.remove('active');
});
```

**Problems:**
- Every other modal has a named `close*Modal()` function (`closeBookmarkModal`, `closeCategoryModal`, `closeSettingsModal`). The help modal is the exception.
- If help ever needs cleanup logic on close (e.g., scroll position reset, analytics), it must be added in 4 separate places.
- The `registerModal` call (line 392) routes through the manager correctly, but the close button (line 463), backdrop (line 473), and swipe (line 494) all bypass the manager and do direct class manipulation. This means `dismissAllModals()` uses the registered function, but the other 3 paths use their own inline logic.

**Recommendation:** Extract `closeHelpModal()` as a named function and use it everywhere, including in the `registerModal` call and as the `wireModalSwipeDismiss` callback.

### MEDIUM

#### M1. Dead CSS animation -- `.dismissing` class defined in CSS, never applied in JS

**Files:** `src/styles/main.css` lines 715-724; `src/utils/modal-swipe-dismiss.ts` (no reference)

```css
/* main.css:715-724 */
@keyframes modalSlideOut {
    to {
        opacity: 0;
        transform: translateY(100%);
    }
}

.modal-content.dismissing {
    animation: modalSlideOut 0.2s ease-in forwards;
}
```

A `modalSlideOut` animation and `.dismissing` class are defined in CSS, but **no JavaScript code anywhere in the codebase applies the `dismissing` class**. Grep across all `.ts` files for `dismissing` only finds the local variable name `let dismissing = false` in `modal-swipe-dismiss.ts` (a boolean tracking gesture state, not a CSS class).

The swipe-dismiss system uses inline styles instead:

```typescript
// modal-swipe-dismiss.ts:99-101
content.style.transition = 'transform 0.2s ease-out, opacity 0.2s ease-out';
content.style.transform = 'translateY(100%)';
content.style.opacity = '0';
```

**Problems:**
- Dead CSS that suggests an animation approach was planned but never implemented.
- The inline style approach in `modal-swipe-dismiss.ts` duplicates the same visual effect (`translateY(100%)`, `opacity: 0`) with slightly different timing (`ease-out` vs `ease-in`).
- Close-on-desktop has no exit animation at all -- `classList.remove('active')` instantly hides the modal (`display: none`), which is jarring compared to the smooth `modalSlide` entry animation.

**Recommendation:** Either:
- (a) Use the `.dismissing` class for desktop close (add class, wait for `animationend`, then remove `.active`), or
- (b) Remove the dead CSS if the inline-style approach in swipe-dismiss is the intended pattern.

Option (a) would give desktop close a smooth exit animation matching the entry, and eliminate the inline style duplication.

#### M2. Five permanent `popstate` listeners from `wireModalSwipeDismiss`

**Files:** `src/utils/modal-swipe-dismiss.ts` lines 143-148

Each call to `wireModalSwipeDismiss` registers a permanent `popstate` listener on `window`:

```typescript
// modal-swipe-dismiss.ts:143-148
window.addEventListener('popstate', (e) => {
  if (modal.classList.contains('active')) {
    closeFn();
    e.stopImmediatePropagation();
  }
});
```

This is called 5 times (bookmark, category, settings, help, confirm), creating 5 permanent listeners.

**Problems:**
- All 5 listeners fire on every `popstate` event (back/forward navigation). Each checks `classList.contains('active')` and returns early if inactive, but the overhead scales linearly with modal count.
- `e.stopImmediatePropagation()` on the first active modal prevents subsequent listeners from firing -- but the order depends on registration order. If the confirm modal (registered last) is active over the settings modal (registered earlier), the settings modal's listener fires first and closes settings instead of confirm.
- No listener is ever removed. Even if a modal were to be destroyed (unlikely but possible in future refactoring), its `popstate` listener would persist and potentially throw on a null DOM reference.

**Recommendation:** Centralize the `popstate` handler in `modal-manager.ts`. Register a single `popstate` listener that iterates the registry in reverse order (top modal first) and closes the first active modal found.

#### M3. Five permanent MutationObservers for history state management

**Files:** `src/utils/modal-swipe-dismiss.ts` lines 134-141

Each `wireModalSwipeDismiss` call creates a MutationObserver that watches the modal's `class` attribute:

```typescript
// modal-swipe-dismiss.ts:134-141
const observer = new MutationObserver(() => {
  if (modal.classList.contains('active')) {
    if (!history.state?.[stateKey]) {
      history.pushState({ [stateKey]: true }, '');
    }
  }
});
observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
```

**Problems:**
- 5 MutationObservers permanently watching class attribute changes on 5 elements. Each fires on every `classList.add` or `classList.remove` on its modal.
- The observers are never disconnected. They persist for the app lifetime.
- The `history.pushState` call pushes a new entry every time a modal opens, but the corresponding `popstate` handler only closes the modal -- it does not verify the history state matches the expected key. If user presses back twice quickly, the second pop may close a different modal or do nothing (benign, but the history stack is polluted with stale entries).
- On modal close, the history entry is NOT cleaned up (no `history.back()` or `replaceState`). This means closing a modal via X button or backdrop click leaves an orphan history entry. The next back-press fires `popstate` on an already-closed modal, which is harmless (the `classList.contains('active')` guard catches it) but creates confusing browser history.

**Recommendation:** Replace MutationObservers with explicit `history.pushState` calls in each modal's `open*` function, and `history.back()` (or `replaceState`) in each modal's `close*` function. This eliminates the need for observers entirely and keeps history clean.

#### M4. No z-index management for modal stacking

**Files:** `src/styles/main.css` line 680; `src/components/modals/confirm-modal.ts` lines 38-82

All 5 modals share the same `z-index: 1000`:

```css
/* main.css:680 */
.modal {
    z-index: 1000;
}
```

The confirm modal frequently opens *on top of* other modals (e.g., "Delete this category?" opens over the category modal, "Replace or append?" opens after settings closes). When confirm opens over an already-active modal, both are at `z-index: 1000`, and stacking depends on DOM order in `app.ts`.

Current DOM order in `app.ts`:
1. `bookmark-modal` (line 67)
2. `category-modal` (line 142)
3. `settings-modal` (line 175)
4. `help-modal` (line 238)
5. `confirm-modal` (line 297)

**Problems:**
- Confirm appears on top only because it is last in the DOM. This is a fragile implicit dependency.
- If the DOM order changes (e.g., someone moves the confirm modal HTML above settings), confirm dialogs would render *behind* the settings modal.
- The `body:has(.modal.active)` scroll lock (line 693) correctly prevents background scroll when any modal is active, but it has no concept of "which modal is on top." Backdrop clicks on the bottom modal's visible edge could close the wrong modal.
- The long-press context menu has `z-index: 1001` (line 1561), deliberately higher than modals. But the drag proxy has `z-index: 10000` (line 1634). The z-index space is used without a documented scale.

**Recommendation:** Define a z-index scale in CSS custom properties:

```css
:root {
  --z-modal: 1000;
  --z-modal-overlay: 1001;  /* confirm/alert over other modals */
  --z-context-menu: 1002;
  --z-drag-proxy: 10000;
  --z-welcome-gate: 10001;
}
```

Apply `--z-modal-overlay` to `#confirm-modal` specifically, so it is explicitly above other modals regardless of DOM order.

#### M5. Escape key double-handling for confirm modal

**Files:** `src/main.ts` line 171-173; `src/components/modals/confirm-modal.ts` lines 127-142; `src/utils/modal-manager.ts` lines 40-45

The confirm modal handles Escape in two places:

1. **Locally** -- `confirm-modal.ts` line 135: a `keydown` listener on the modal element itself handles Escape by resolving the promise with `null`.
2. **Globally** -- `main.ts` line 172: `dismissAllModals()` iterates all registered modals and closes any that are active, which calls `dismissConfirm()`.

```typescript
// confirm-modal.ts:127-141 (local Escape handler)
els.modal.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { /* ... */ }
  else if (e.key === 'Escape') {
    if (_promptResolve) {
      closePrompt(null);
    } else {
      close(null);
    }
  }
});

// main.ts:171-173 (global Escape handler)
if (e.key === 'Escape') {
  dismissAllModals();
}
```

```typescript
// modal-manager.ts:40-45
export function dismissAllModals(): void {
  for (const [modalId, closeFn] of registry) {
    if (isModalActive(modalId)) {
      closeFn();
    }
  }
}
```

**Problems:**
- When the confirm modal is active and Escape is pressed, both handlers fire. The local handler (on the modal element) fires first via event bubbling, closing the modal and nullifying `_resolve`. Then the global handler calls `dismissAllModals()`, which calls `dismissConfirm()`, which calls `close(null)` -- but `_resolve` is already null, so it's a no-op. No crash, but wasted work.
- `dismissAllModals()` closes ALL active modals, not just the topmost. If confirm is open over settings, both close on a single Escape press. The expected behavior is: Escape closes only the topmost modal (confirm), requiring a second Escape to close settings.
- The global handler does not call `e.stopPropagation()` or check if the event was already handled. No mechanism exists for the local handler to signal "I already handled this."

**Recommendation:** Replace `dismissAllModals()` in the Escape handler with a `dismissTopModal()` function that closes only the highest-priority active modal. The modal manager should maintain a priority order (confirm > help > settings > category > bookmark) or track open order via a stack.

### LOW

#### L1. Scroll lock relies on `body:has(.modal.active)` -- no fallback for older browsers

**Files:** `src/styles/main.css` lines 693-695

```css
/* main.css:693-695 */
body:has(.modal.active) {
    overflow: hidden;
}
```

**Problems:**
- `:has()` is supported in all modern browsers (Chrome 105+, Safari 15.4+, Firefox 121+), but has no fallback for older versions.
- If `:has()` is unsupported, modals open but the body remains scrollable behind them, creating a degraded UX.
- A JS-based alternative (toggling a `modal-open` class on `body` in open/close functions) would be more robust.

**Impact:** Low -- the browser support gap is shrinking rapidly. Only affects Firefox < 121 (Dec 2023) and Chrome < 105 (Aug 2022).

**Recommendation:** No action needed unless analytics show significant traffic from older browsers. Document this as a known limitation.

#### L2. Settings modal busy-state bypass risk

**Files:** `src/components/modals/settings-modal.ts` lines 18, 210-211, 479-487

The settings modal has a `settingsBusy` flag that prevents backdrop dismiss during long operations:

```typescript
// settings-modal.ts:18
let settingsBusy = false;

// settings-modal.ts:484-487 (backdrop check)
modal.addEventListener('pointerup', (e) => {
  if (!settingsBusy && pointerDownOnBackdrop && e.target === modal) {
    closeSettingsModal();
  }
  pointerDownOnBackdrop = false;
});
```

But the close button, Escape key (via `dismissAllModals`), and swipe-dismiss do NOT check `settingsBusy`:

```typescript
// settings-modal.ts:395 (close button -- no busy check)
document.getElementById('settings-modal-close')!.addEventListener('click', closeSettingsModal);

// settings-modal.ts:492 (swipe dismiss -- no busy check)
wireModalSwipeDismiss('settings-modal', closeSettingsModal);
```

**Problems:**
- During a "Fetch Favicons" or "Smart Name" operation, the user can close the modal via X button, Escape, or swipe, but not via backdrop click. This inconsistency may confuse users.
- If the modal closes mid-operation, the async function continues running and resets `settingsBusy` / style on completion -- but the modal is already closed, so the style reset targets an invisible element (harmless but wasteful).

**Recommendation:** Either guard all close paths with `settingsBusy` (consistent), or remove the guard from backdrop too and let the user close freely during async operations (simpler).

#### L3. `transitionend` + `setTimeout` race in swipe-dismiss

**Files:** `src/utils/modal-swipe-dismiss.ts` lines 102-109

```typescript
// modal-swipe-dismiss.ts:102-109
const onEnd = () => {
  content.style.transform = '';
  content.style.opacity = '';
  content.style.transition = '';
  closeFn();
};
content.addEventListener('transitionend', onEnd, { once: true });
setTimeout(onEnd, 300); // safety fallback
```

**Problems:**
- `onEnd` can fire twice: once from `transitionend` (at ~200ms) and once from `setTimeout` (at 300ms). The `{ once: true }` removes the event listener after the first `transitionend`, but does not cancel the timeout. The timeout fires 100ms later and calls `closeFn()` again.
- `closeFn()` is `classList.remove('active')`, which is idempotent -- calling it twice is harmless. But if `closeFn` ever gains side effects (analytics, state cleanup), double-call becomes a bug.
- Multiple `transitionend` events can fire (one per property: `transform` + `opacity`). The `{ once: true }` only removes after the first, so `onEnd` fires once from the event and once from the timeout. If the first `transitionend` fires but the timeout hasn't been cleared, `closeFn` runs twice.

**Recommendation:** Store the timeout ID and clear it in `onEnd`:

```typescript
let fallback: ReturnType<typeof setTimeout>;
const onEnd = () => {
  clearTimeout(fallback);
  /* ... cleanup ... */
  closeFn();
};
content.addEventListener('transitionend', onEnd, { once: true });
fallback = setTimeout(onEnd, 300);
```

#### L4. Swipe-dismiss inline styles may conflict with CSS animations

**Files:** `src/utils/modal-swipe-dismiss.ts` lines 55-56, 80-82, 99-101, 125-128; `src/styles/main.css` lines 704, 1459

During swipe tracking, `modal-swipe-dismiss.ts` sets inline styles on `.modal-content`:

```typescript
// modal-swipe-dismiss.ts:55-56
content.style.transition = 'none';

// modal-swipe-dismiss.ts:80-82
content.style.transform = `translateY(${dy}px)`;
content.style.opacity = `${1 - progress * 0.5}`;
```

CSS defines an entry animation on `.modal-content`:

```css
/* main.css:704 */
.modal-content {
    animation: modalSlide 0.3s cubic-bezier(0.2, 0, 0, 1);
}

/* main.css:1459 (mobile override) */
.modal-content {
    animation: none;
}
```

On snap-back (swipe cancelled), `resetContentStyle` clears inline styles:

```typescript
// modal-swipe-dismiss.ts:125-128
function resetContentStyle(): void {
  content!.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
  content!.style.transform = '';
  content!.style.opacity = '';
}
```

**Problems:**
- On desktop (where `animation: modalSlide` is active), if a swipe-dismiss cycle runs and then the modal is closed and reopened, the entry animation replays correctly because `animation` is a CSS property on the class, not an inline style.
- However, after a snap-back, the inline `transition: transform 0.2s ease, opacity 0.2s ease` persists on the element. This inline transition will affect the *next* open's animation (the `modalSlide` keyframe sets `opacity` and `transform`, and the inline transition will interfere). In practice, mobile overrides `animation: none`, so this only matters on desktop -- and desktop users are unlikely to swipe. But it is a latent bug.

**Recommendation:** Clear the inline `transition` after the snap-back animation completes (listen for `transitionend` or use a short timeout), ensuring no stale inline styles remain.

---

## Modal Inventory

### Modal Definitions (DOM order in `app.ts`)

| # | Modal ID | DOM Line | Open Function | Close Function | Has `registerModal`? | Has `wireModalSwipeDismiss`? |
|---|----------|----------|---------------|----------------|---------------------|------------------------------|
| 1 | `bookmark-modal` | app.ts:67 | `openAddBookmarkModal()` / `openEditBookmarkModal()` | `closeBookmarkModal()` | Yes (bookmark-modal.ts:187) | Yes (bookmark-modal.ts:220) |
| 2 | `category-modal` | app.ts:142 | `openAddCategoryModal()` / `openEditCategoryModal()` | `closeCategoryModal()` | Yes (category-modal.ts:115) | Yes (category-modal.ts:136) |
| 3 | `settings-modal` | app.ts:175 | `openSettingsModal()` | `closeSettingsModal()` | Yes (settings-modal.ts:390) | Yes (settings-modal.ts:492) |
| 4 | `help-modal` | app.ts:238 | Inline `classList.add` (settings-modal.ts:460) | **No named function** -- inline `classList.remove` (x4) | Yes (settings-modal.ts:391) | Yes (settings-modal.ts:493) |
| 5 | `confirm-modal` | app.ts:297 | `styledConfirm()` / `styledAlert()` / `styledPrompt()` | `close()` / `closePrompt()` / `dismissConfirm()` (internal) | Yes (confirm-modal.ts:95) | Yes (confirm-modal.ts:161) |

### Close Paths per Modal

| Close Path | Bookmark | Category | Settings | Help | Confirm |
|-----------|:---:|:---:|:---:|:---:|:---:|
| Named close function | `closeBookmarkModal` | `closeCategoryModal` | `closeSettingsModal` | **(none)** | `close()`/`closePrompt()` |
| X button | Yes | Yes | Yes | Yes | Yes |
| Cancel button | Yes | Yes | N/A | N/A | Yes |
| Backdrop click | Yes | Yes | Yes (busy-guarded) | Yes | Yes |
| Escape (global) | via `dismissAllModals` | via `dismissAllModals` | via `dismissAllModals` | via `dismissAllModals` | via `dismissAllModals` + local handler |
| Swipe dismiss | Yes | Yes | Yes | Yes | Yes |
| Android back | Yes | Yes | Yes | Yes | Yes |
| Form submit | `saveBookmark()` | `saveCategory()` | N/A | N/A | N/A |

### Feature Matrix

| Feature | Bookmark | Category | Settings | Help | Confirm |
|---------|:---:|:---:|:---:|:---:|:---:|
| Proper close function | Yes | Yes | Yes | **No** | Yes (internal) |
| Registered in modal-manager | Yes | Yes | Yes | Yes | Yes |
| Backdrop uses pointer events | Yes | Yes | Yes | Yes | Yes |
| Swipe dismiss wired | Yes | Yes | Yes | Yes | Yes |
| MutationObserver (history) | Yes | Yes | Yes | Yes | Yes |
| Permanent popstate listener | Yes | Yes | Yes | Yes | Yes |
| Entry animation (desktop) | CSS `modalSlide` | CSS `modalSlide` | CSS `modalSlide` | CSS `modalSlide` | CSS `modalSlide` |
| Exit animation (desktop) | **None** | **None** | **None** | **None** | **None** |
| Exit animation (mobile swipe) | Inline transition | Inline transition | Inline transition | Inline transition | Inline transition |
| Busy-state protection | No | No | **Yes** (backdrop only) | No | No |
| Promise-based | No | No | No | No | **Yes** |

---

## Z-Index Map

| Layer | z-index | Element |
|-------|---------|---------|
| Noise overlay | 1000 | `body::after` (main.css:143) |
| All modals | 1000 | `.modal` (main.css:680) |
| Context menu | 1001 | `.long-press-menu` (main.css:1561) |
| Drag proxy | 10000 | `.drag-proxy` (main.css:1634) |
| Auth overlay | 10000 | `.auth-overlay` (main.css:2285) |
| Welcome gate | 10001 | `.welcome-gate` (main.css:1899) |

**Key issue:** All 5 modals share z-index 1000. The context menu at 1001 renders above modals. The noise overlay also at 1000 could theoretically interfere (it has `pointer-events: none` so it is harmless functionally, but shares the stacking layer).

---

## Recommended Overhaul Plan

### Phase 1: Fix confirm-modal concurrency (HIGH priority)

1. **Add a dialog queue to confirm-modal.ts**
   - Replace module-level `_resolve`/`_promptResolve` with a queue array.
   - When `styledConfirm`/`styledAlert`/`styledPrompt` is called while a dialog is active, push the new request onto the queue.
   - On close, shift the next queued dialog and show it, or clear the modal if the queue is empty.
   - Effort: ~30 min, medium risk (must verify all callers still work with async queuing).

2. **Replace `dismissAllModals()` with `dismissTopModal()` in the Escape handler**
   - Add a `dismissTopModal()` function to `modal-manager.ts` that closes only the highest-priority active modal.
   - Define priority order: confirm > help > settings > category > bookmark. Or track open order in a stack (push on open, pop on close).
   - Effort: ~20 min, low risk.

### Phase 2: Help modal cleanup (HIGH priority)

3. **Extract `closeHelpModal()` function**
   - Define `function closeHelpModal()` in `settings-modal.ts` (or a new `help-modal.ts` if the modal warrants its own file).
   - Replace all 4 inline `classList.remove('active')` calls with `closeHelpModal()`.
   - Use it in `registerModal`, close button, backdrop dismiss, and swipe dismiss callbacks.
   - Effort: ~10 min, zero risk.

### Phase 3: Animation consistency (MEDIUM priority)

4. **Implement desktop exit animation using `.dismissing` class**
   - Create a `closeWithAnimation(modalId)` utility that adds `.dismissing` to `.modal-content`, waits for `animationend`, then removes `.active` and `.dismissing`.
   - Use this in all modal close functions.
   - Alternatively, remove the dead `.dismissing` CSS if instant close is the intended behavior.
   - Effort: ~30 min if implementing animation, ~2 min if just removing dead CSS.

5. **Fix swipe-dismiss `transitionend`/`setTimeout` double-fire**
   - Store the timeout ID and clear it in the `onEnd` callback.
   - Clear stale inline `transition` after snap-back completes.
   - Effort: ~10 min, low risk.

### Phase 4: Centralize history/popstate management (MEDIUM priority)

6. **Move popstate handling into modal-manager.ts**
   - Register a single `popstate` listener that checks which modal is active (in priority order) and closes it.
   - Remove the per-modal `popstate` listeners from `wireModalSwipeDismiss`.
   - Effort: ~20 min, medium risk (must test Android back gesture with stacked modals).

7. **Replace MutationObservers with explicit history calls**
   - Add `history.pushState` to each modal's open function.
   - Add `history.back()` or `replaceState` to each modal's close function (only if the history entry exists).
   - Remove MutationObservers from `wireModalSwipeDismiss`.
   - Effort: ~30 min, medium risk (history manipulation is error-prone).

### Phase 5: Z-index and stacking (MEDIUM priority)

8. **Define z-index scale as CSS custom properties**
   - Create `--z-modal`, `--z-modal-overlay`, `--z-context-menu`, `--z-drag-proxy`, `--z-welcome-gate`.
   - Apply `--z-modal-overlay` to `#confirm-modal` specifically.
   - Effort: ~15 min, zero risk.

### Phase 6: Cleanup (LOW priority)

9. **Unify settings busy-state guard across all close paths**
   - Either guard X button, Escape, and swipe with `settingsBusy`, or remove the guard from backdrop too.
   - Effort: ~5 min, zero risk.

### What NOT to change

- **`wireModalSwipeDismiss` touch-only approach** -- The use of touch events (not pointer events) is correct and well-documented. Pointer events would cause `pointercancel` on the scrollable `.modal-content` container.
- **`body:has(.modal.active)` scroll lock** -- Works in all modern browsers, is elegant, and avoids JS-based class toggling. No change needed unless analytics show older browser traffic.
- **Backdrop dismiss pointer events** -- Already migrated from `mousedown`/`mouseup` to `pointerdown`/`pointerup` (consistent with the interaction audit recommendations).
- **Confirm modal internal Escape handler** -- The local `keydown` handler on the confirm modal element provides proper promise resolution. It should remain, but `dismissAllModals()` should be replaced with `dismissTopModal()` so it does not double-fire.

---

## Summary

| Priority | Item | Files Affected | Effort |
|----------|------|----------------|--------|
| High | H1: Confirm-modal dialog queue | `confirm-modal.ts` | 30 min |
| High | H2: Extract `closeHelpModal()` | `settings-modal.ts` | 10 min |
| Medium | M1: Remove or implement `.dismissing` animation | `main.css` + all modal close functions | 30 min or 2 min |
| Medium | M2: Centralize popstate in modal-manager | `modal-swipe-dismiss.ts`, `modal-manager.ts` | 20 min |
| Medium | M3: Replace MutationObservers with explicit history | `modal-swipe-dismiss.ts`, all modal open/close | 30 min |
| Medium | M4: Z-index scale + confirm overlay | `main.css` | 15 min |
| Medium | M5: `dismissTopModal()` for Escape | `modal-manager.ts`, `main.ts` | 20 min |
| Low | L2: Settings busy-state consistency | `settings-modal.ts` | 5 min |
| Low | L3: Swipe-dismiss timeout cleanup | `modal-swipe-dismiss.ts` | 10 min |
| Low | L4: Clear stale inline transition after snap-back | `modal-swipe-dismiss.ts` | 5 min |

Total estimated effort for phases 1-2 (the high-value work): ~1 hour.
Phases 3-5 (animation, history, z-index): ~1.5-2 hours depending on whether exit animation is implemented or dead CSS is simply removed.
