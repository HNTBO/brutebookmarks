# Interaction System Audit (Pointer/Mouse/Touch)

Date: 2026-02-19

## Scope

This audit covers interaction handling in the web app runtime under `src/` with focus on:
- pointer/mouse/touch event model consistency
- drag, long-press, swipe, modal dismissal, and backdrop behavior
- keyboard/accessibility interaction parity
- maintainability and future-proofing

Primary files reviewed:
- `src/features/drag-drop.ts`
- `src/components/bookmark-card.ts`
- `src/components/categories.ts`
- `src/components/header.ts`
- `src/utils/modal-swipe-dismiss.ts`
- `src/components/modals/bookmark-modal.ts`
- `src/components/modals/category-modal.ts`
- `src/components/modals/confirm-modal.ts`
- `src/components/modals/settings-modal.ts`
- `src/main.ts`
- `src/styles/main.css`

## Executive Summary

The interaction layer is **partially unified**. Core drag-and-drop is pointer-based and fairly robust, but the app still has **multiple stitched interaction systems** in parallel:
- pointer-first (drag, long-press, card interactions)
- mouse+touch dual wiring (size controller, modal backdrop click)
- touch-only gesture path (modal swipe-dismiss)

This is workable today, but it increases regression risk and makes future changes expensive. The system is especially fragile around modal close flows, cross-device behavior (pen vs touch vs mouse), and duplicated gesture logic/thresholds.

## Current Interaction Topology

Event usage snapshot (`src/`, via static grep):
- `click`: 53
- `pointerdown/move/up/cancel`: 29 combined
- `mousedown/mouseup/mousemove`: 14 combined
- `touchstart/move/end/cancel`: 11 combined

Interpretation: the codebase is not fully pointer-native yet; it is a mixed model.

## Findings (ranked)

### 1. Mixed interaction paradigms remain in core UX paths (High)

Evidence:
- `src/components/header.ts:26` and `src/components/header.ts:78`-`src/components/header.ts:84` use `MouseEvent | TouchEvent` plus separate mouse/touch listeners for size dragging.
- Modal backdrop dismissal in four modules uses `mousedown` + `mouseup` pairing:
  - `src/components/modals/bookmark-modal.ts:206`
  - `src/components/modals/category-modal.ts:122`
  - `src/components/modals/confirm-modal.ts:134`
  - `src/components/modals/settings-modal.ts:462`, `src/components/modals/settings-modal.ts:475`
- Modal swipe-dismiss is touch-only by design: `src/utils/modal-swipe-dismiss.ts:4`, `src/utils/modal-swipe-dismiss.ts:46`.

Impact:
- Fixes must be repeated in multiple paradigms.
- Pen/stylus and hybrid input devices are inconsistently handled.
- Higher probability of behavior drift after future refactors.

### 2. Modal close behavior is fragmented across independent mechanisms (High)

Evidence:
- Close buttons call per-modal close functions.
- Backdrop uses mouse down/up detection in each modal file.
- Mobile swipe uses separate utility (`wireModalSwipeDismiss`).
- Global Escape bypasses modal close functions and directly mutates classes: `src/main.ts:170`-`src/main.ts:173`.

Impact:
- Close semantics are duplicated and can diverge.
- Harder to guarantee consistent cleanup/state transitions for all close reasons.
- Future modal features (focus trap, analytics, animation completion, history management) will be harder to centralize.

### 3. Pointer-based architecture still depends on extra touch workarounds in multiple layers (Medium)

Evidence:
- Drag controller adds pointer listeners **and** global non-passive `touchmove`: `src/features/drag-drop.ts:212`-`src/features/drag-drop.ts:219`.
- Card long-press adds non-passive `touchmove` preventDefault logic: `src/components/bookmark-card.ts:197`.
- Handle/tab drag each add their own `touchmove` preventDefault: `src/components/categories.ts:191`, `src/components/categories.ts:226`.

Impact:
- Scroll/gesture arbitration is spread out and easy to break.
- New gestures risk introducing accidental conflicts (double-cancel or missing cancel).

### 4. Pen input is implicitly treated as touch in important flows (Medium)

Evidence:
- `initLongPress` routes all non-mouse pointers through touch-style long-press behavior: `src/components/bookmark-card.ts:95` and `src/components/bookmark-card.ts:129`.

Impact:
- Stylus drag behavior may feel delayed or wrong (forced long-press semantics).
- Limits future-proofing for tablets and 2-in-1 devices.

### 5. Viewport-width is used as a proxy for interaction mode (Medium)

Evidence:
- Mobile gating via media query checks in interaction logic: `src/components/categories.ts:83`, `src/components/categories.ts:148`, `src/components/categories.ts:485`.

Impact:
- Narrow desktop window can trigger “mobile” logic unexpectedly.
- Touch-capable large screens may not get intended mobile interactions.

### 6. Keyboard interaction parity is incomplete (Medium)

Evidence:
- Tabs are rendered with `role="button" tabindex="0"` (`src/components/categories.ts:272`, `src/components/categories.ts:409`) but only click handlers are attached (`src/components/categories.ts:32`, `src/components/categories.ts:446`).
- Bookmark cards are clickable `div`s without keyboard activation semantics: `src/components/categories.ts:93`, `src/components/categories.ts:137`.

Impact:
- Inconsistent accessibility and non-pointer usability.
- Extra friction if future keyboard shortcuts/navigation are expanded.

### 7. Hover affordance path is still mouse-specific (Low)

Evidence:
- Card action button reveal uses mouse-only handlers:
  - `src/components/bookmark-card.ts:3`
  - `src/components/bookmark-card.ts:28`
  - wired in `src/components/categories.ts:131`-`src/components/categories.ts:132`

Impact:
- Expected for touch, but also excludes pen hover and limits consistent pointer behavior.

### 8. Interaction test coverage is effectively absent (High)

Evidence:
- `tests/` contains only `tests/security-check.py`; no interaction/gesture integration tests.

Impact:
- Regressions in drag/long-press/swipe/modal close are likely to slip through.
- Refactor cost is high without safety rails.

### 9. Minor maintenance smells (Low)

Evidence:
- Unused exported helper: `src/components/bookmark-card.ts:37` (`openBookmark`).
- Outdated interaction wording in comments (example: `src/data/store.ts:166` references mouseup/click specific behavior).

Impact:
- Signals historical churn and increases cognitive load during future edits.

## What Is Already Strong

- Pointer-based drag core is centralized and reasonably mature (`src/features/drag-drop.ts`).
- Pointer capture is used in key drag starts (`src/features/drag-drop.ts:186`, `src/components/categories.ts:173`, `src/components/categories.ts:209`, `src/components/bookmark-card.ts:93`).
- Mobile-specific scroll fighting has explicit handling where needed (though duplicated).

## Overhaul Recommendations

## Target Architecture

Adopt a single interaction platform layer:

1. `src/interaction/events.ts`
- Unified wrappers for pointer start/move/end/cancel.
- Capability helpers (`isTouchCapable`, `isPen`, `isPrimaryPointer`) without viewport assumptions.

2. `src/interaction/gestures.ts`
- Reusable primitives:
  - `createPressGesture`
  - `createLongPressGesture`
  - `createDragGesture`
  - `createSwipeGesture`
- Centralized thresholds/constants (distance/time/velocity/haptic).

3. `src/interaction/modal-manager.ts`
- Single close pipeline (`closeModal(id, reason)`), reason codes: `escape`, `backdrop`, `button`, `swipe`, `history`.
- Central backdrop handling using pointer events (with click fallback where needed).
- Integrate history/back handling in one place.

4. `src/interaction/accessibility.ts`
- Helpers for keyboard activation parity (`Enter`/`Space`) on custom interactive elements.
- Prefer real `<button>` for tabs/cards where practical.

## Migration Plan (phased, low-risk)

### Phase 1: Normalize critical inconsistencies (short)
- Convert size controller to pointer events and remove split mouse/touch listeners in `src/components/header.ts`.
- Replace modal backdrop `mousedown/mouseup` blocks with one pointer-based helper used by all modals.
- Route Escape key through modal-manager instead of direct class removal (`src/main.ts:170`).

### Phase 2: Consolidate gesture logic (medium)
- Move long-press/drag thresholds to shared config.
- Refactor duplicated `touchmove` preventDefault blocks into shared gesture primitives.
- Explicitly define pen behavior (likely mouse-like immediate drag, not touch long-press).

### Phase 3: Accessibility and input parity (medium)
- Add keyboard activation for tab/category/bookmark custom controls.
- Replace clickable `div` controls with semantic buttons where possible.
- Keep drag via pointer on handles, but preserve keyboard activation for non-drag actions.

### Phase 4: Test hardening (mandatory for future-proofing)
- Add Playwright interaction specs for:
  - bookmark drag (mouse/touch simulation)
  - long-press menu open/dismiss
  - modal close by button/backdrop/swipe/Escape/back
  - tab swipe and tab click behavior
  - pen-like pointerType coverage (simulated)

## Concrete Technical Rules To Adopt

- Pointer-first by default for all direct-manipulation interactions.
- Touch events only in narrowly justified cases (documented), behind shared abstractions.
- No viewport-width checks for input mode decisions; use capabilities and `pointerType`.
- One close path per modal (reason-driven), no direct class toggling outside modal manager.
- One source of truth for gesture constants.

## Suggested Priority Backlog

1. Build `modal-manager` and migrate all modal close paths.
2. Convert size controller to pointer events.
3. Refactor long-press/drag/swipe into shared gesture primitives.
4. Add interaction test suite before large refactor lands.
5. Clean leftovers (`openBookmark`, stale comments) after behavior is stabilized.

## Bottom Line

Interaction handling is **functional but not yet unified**. The codebase contains a strong pointer-based core plus legacy/hybrid segments. An overhaul should be **incremental**, starting with modal and size-controller normalization, then consolidating gesture primitives and adding tests. That path will reduce regressions and make the system materially more future-proof.
