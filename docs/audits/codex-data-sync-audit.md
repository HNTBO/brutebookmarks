# Data and Sync System Audit (Local Cache + Convex)

Date: 2026-02-19

## Scope

This audit covers data flow and sync behavior in the app runtime, with focus on:
- local cache bootstrapping vs sync mode behavior
- Convex subscription lifecycle and denormalization
- migration/seed flows
- maintainability and failure resilience of state handling

Primary files reviewed:
- `src/data/store.ts`
- `src/main.ts`
- `convex/categories.ts`
- `convex/bookmarks.ts`
- `convex/tabGroups.ts`
- `convex/preferences.ts`

## Executive Summary

The data layer is **functional and product-driven**, but it is currently a **single large stitched system** that blends storage, sync, migration UX, and rendering triggers in one module. It works, but the coupling level is high enough that future changes (especially onboarding/sync transitions) are likely to introduce regressions.

The biggest structural issue is that `src/data/store.ts` acts as both:
- a state container
- a sync orchestration layer
- a UI flow trigger (migration/seed prompts)
- a mutation/undo surface

This should be split into clearer boundaries before adding more sync complexity.

## Findings (ranked)

### 1. Store module is a monolithic mutable state machine (High)

Evidence:
- Multiple module-level mutable globals for core state and mode: `src/data/store.ts:11`, `src/data/store.ts:16`, `src/data/store.ts:19`, `src/data/store.ts:22`, `src/data/store.ts:28`.
- Single module also owns render callback wiring and effects: `src/data/store.ts:48`, `src/data/store.ts:52`.

Impact:
- Hidden coupling between features and lifecycle order.
- Hard to test in isolation because logic depends on implicit global state.

### 2. Subscription lifecycle is not explicitly managed (High)

Evidence:
- `activateConvex()` registers 4 subscriptions via `client.onUpdate(...)` but does not retain/unsubscribe handles: `src/data/store.ts:197`, `src/data/store.ts:205`, `src/data/store.ts:211`, `src/data/store.ts:217`, `src/data/store.ts:223`.
- No guard inside `activateConvex()` against accidental duplicate registration.

Impact:
- Potential duplicate listeners if initialization paths change.
- No clear teardown path for future logout/session-reset flows.

### 3. Rebuild and onboarding side effects are coupled (High)

Evidence:
- `rebuild()` mixes denormalization with first-run migration/seed prompting: `src/data/store.ts:253`, `src/data/store.ts:257`, `src/data/store.ts:264`, `src/data/store.ts:269`.
- UI prompt functions are called directly from data-layer flow: `src/data/store.ts:353`, `src/data/store.ts:381`.

Impact:
- Data refresh timing can trigger user-facing UX prompts.
- Hard to reason about behavior boundaries and test flows deterministically.

### 4. Rebuild is called repeatedly from independent subscriptions (Medium)

Evidence:
- Categories, tab groups, and bookmarks subscriptions each call `rebuild()` independently: `src/data/store.ts:205`, `src/data/store.ts:211`, `src/data/store.ts:217`.
- `rebuild()` writes local cache and triggers rerender: `src/data/store.ts:347`, `src/data/store.ts:349`.

Impact:
- Burst updates can cause repeated denormalization and rerenders.
- More chance of transient intermediate UI states under heavy mutation.

### 5. Local/sync branching is repeated across many mutators (Medium)

Evidence:
- Many mutation helpers branch on `_convexActive` in-place (`createCategory`, `updateCategory`, `deleteCategory`, `createBookmark`, etc.): `src/data/store.ts:446`, `src/data/store.ts:467`, `src/data/store.ts:493`, `src/data/store.ts:526`, `src/data/store.ts:560`, `src/data/store.ts:699`, `src/data/store.ts:752`, `src/data/store.ts:833`.

Impact:
- Change amplification: feature edits often require dual-path updates.
- Greater risk of drift between local and sync semantics.

### 6. Compatibility fallback relies on error string parsing (Medium)

Evidence:
- `setCategoryGroup()` detects backend capability by checking error message text: `src/data/store.ts:768`, `src/data/store.ts:772`.

Impact:
- Brittle contract between frontend and backend deployment versions.
- Error-message wording changes could silently break behavior.

### 7. Backend ordering uses simple patch semantics, no compaction strategy (Low)

Evidence:
- Reorder endpoints patch float order directly: `convex/categories.ts:116`, `convex/bookmarks.ts:121`, `convex/tabGroups.ts:77`.

Impact:
- Over long usage, ordering values can become sparse/non-normalized.
- Not immediately broken, but worth formalizing for long-term stability.

## What Is Already Strong

- Fast local bootstrap before auth/sync is pragmatic and improves perceived performance: `src/data/store.ts:100`.
- Clear ownership checks in Convex mutations reduce cross-user risk: `convex/bookmarks.ts:42`, `convex/categories.ts:44`, `convex/tabGroups.ts:43`.
- Preferences sync includes loop prevention guard: `src/data/store.ts:28`, `src/data/store.ts:243`.

## Overhaul Recommendations

## Target Architecture

1. `src/data/store-core.ts`
- Pure state model + denormalization only.
- No DOM, no prompts, no direct persistence side effects.

2. `src/data/sync-runtime.ts`
- Convex subscription manager with explicit `start()` / `stop()`.
- Owns unsubscribe handles and coalesces updates before one rebuild/render pass.

3. `src/data/onboarding-flow.ts`
- Handles migration and seed prompts outside rebuild logic.
- Triggered once from app bootstrap state transitions.

4. `src/data/repository.ts`
- Unified mutation API with pluggable adapters (`local` vs `convex`).
- Removes repeated `_convexActive` branching from each operation.

## Migration Plan (phased)

### Phase 1: Lifecycle hardening
- Make `activateConvex()` idempotent and capture unsubscribe handles.
- Add explicit `deactivateConvex()` for future logout or mode transitions.
- Coalesce subscription updates into one rebuild per microtask/frame.

### Phase 2: Boundary extraction
- Move migration/seed prompts out of `rebuild()`.
- Keep `rebuild()` pure (input raw docs, output view-model).

### Phase 3: Mutation path unification
- Introduce repository adapter abstraction for local/sync writes.
- Keep undo integration at command layer, not per-branch duplication.

### Phase 4: Contract stabilization
- Replace error-string compatibility fallback with explicit capability/version query.
- Define ordering normalization strategy (periodic reindex or integer rebasing).

## Concrete Technical Rules To Adopt

- Data rebuild functions stay pure and side-effect free.
- Subscription registration must always return and track teardown.
- Onboarding/migration prompts must not run inside subscription callbacks.
- Local and sync mutation semantics should share one command surface.
- Backend compatibility checks should use explicit version/capability flags.

## Suggested Priority Backlog

1. Add idempotent subscription manager with teardown and update coalescing.
2. Extract migration/seed flow from `rebuild()` into bootstrap state machine.
3. Introduce repository adapter (`local` and `convex`) to remove branching duplication.
4. Add tests for sync bootstrap, migration prompt gating, and subscription burst behavior.

## Bottom Line

The data/sync system is delivering value, but it is **too coupled for safe long-term evolution**. The highest-value overhaul is to separate state modeling, sync lifecycle, and onboarding prompts, then standardize mutation paths behind a single repository interface.
