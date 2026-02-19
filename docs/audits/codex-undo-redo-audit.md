# Undo/Redo System Audit (Command Stack + Grouping)

Date: 2026-02-19

## Scope

This audit covers undo/redo behavior across the app, with focus on:
- stack correctness and failure behavior
- grouped operations and transaction semantics
- async operation safety (local vs Convex-backed mutations)
- maintainability and future extensibility

Primary files reviewed:
- `src/features/undo.ts`
- `src/main.ts`
- `src/data/store.ts`
- `src/features/preferences.ts`
- `src/features/theme.ts`
- `src/features/drag-drop.ts`
- `src/components/header.ts`
- `src/components/bookmark-card.ts`

## Executive Summary

Undo/redo is **feature-rich and widely integrated**, but core mechanics are fragile under failure and scale. The current model is a lightweight stack with grouped entries, but it lacks transaction safety, nested-group support, and robust error handling for async commands.

Most important issue: an exception during undo/redo can drop stack state and leave partially applied changes.

## Findings (ranked)

### 1. Undo/redo can lose stack state on execution error (High)

Evidence:
- `undo()` pops first, then executes; on error, item is not restored to `undoStack`: `src/features/undo.ts:65`, `src/features/undo.ts:69`, `src/features/undo.ts:70`.
- Same pattern for `redo()`: `src/features/undo.ts:78`, `src/features/undo.ts:82`, `src/features/undo.ts:83`.

Impact:
- A failed undo/redo can permanently lose history entry.
- User may be left in partially modified state with no reliable recovery path.

### 2. Grouping is not nested-safe (High)

Evidence:
- `beginGroup()` always resets `_groupEntries = []` and does not track nesting depth: `src/features/undo.ts:31`, `src/features/undo.ts:32`.
- `endGroup()` assumes one active group buffer only: `src/features/undo.ts:35`, `src/features/undo.ts:42`.

Impact:
- If grouped operations ever nest, outer operations are silently clobbered.
- Makes composable command APIs risky.

### 3. Group lifecycle at call-sites is not exception-safe (High)

Evidence:
- Grouping in `main.ts` uses `beginGroup()`/`endGroup()` without `try/finally`: `src/main.ts:66`, `src/main.ts:70`, `src/main.ts:81`, `src/main.ts:85`.

Impact:
- Any thrown error between begin/end can leave buffering state corrupted.
- Later undo entries may be mis-grouped or dropped.

### 4. Async grouped execution has no compensation model (Medium)

Evidence:
- Group execution runs entries sequentially and awaits each: `src/features/undo.ts:53`, `src/features/undo.ts:57`.
- No rollback/compensation if one step fails mid-group.

Impact:
- Partial undo/redo is possible for multi-step operations.
- Behavior under network/intermittent backend failure is non-deterministic.

### 5. Keyboard-triggered undo/redo calls are fire-and-forget (Medium)

Evidence:
- Keyboard handler invokes `undo()` / `redo()` without awaiting or local error handling: `src/main.ts:152`, `src/main.ts:157`.

Impact:
- Rejections can surface as unhandled promise errors.
- User feedback on failures is absent.

### 6. Stack size cap is per item/group, not per atomic command count (Low)

Evidence:
- `MAX_STACK = 50`; grouped operations count as one item regardless of internal size: `src/features/undo.ts:14`, `src/features/undo.ts:38`.

Impact:
- Very large grouped entries can occupy disproportionate memory/time.

## What Is Already Strong

- Undo hooks are consistently integrated across domain mutations and UI preferences (`src/data/store.ts`, `src/features/preferences.ts`, `src/features/theme.ts`, `src/features/drag-drop.ts`).
- `_isUndoing` guard prevents recursive stack pollution: `src/features/undo.ts:16`, `src/features/undo.ts:21`, `src/features/undo.ts:45`.
- Long-press mobile undo/redo affordance exists, improving access beyond keyboard: `src/components/bookmark-card.ts:336`, `src/components/bookmark-card.ts:342`.

## Overhaul Recommendations

## Target Architecture

1. `src/features/undo-manager.ts`
- Command-based engine with explicit transaction contexts.
- Support nested groups via depth counter or stack of groups.

2. `runInUndoGroup(fn)`
- Helper that guarantees close/abort with `try/finally`.
- Replaces manual `beginGroup()`/`endGroup()` calls.

3. Failure-safe stack semantics
- On undo/redo failure, restore item to original stack and surface controlled error state.
- Provide optional per-command compensation hook.

4. Command metadata
- Add label/type/source metadata for debugging and future history UI.

## Migration Plan (phased)

### Phase 1: Correctness fixes
- Make undo/redo stack operations exception-safe (restore popped items on failure).
- Add centralized error reporting and user-visible failure feedback.

### Phase 2: Grouping hardening
- Implement nested transactions.
- Replace existing `beginGroup()` call-sites with safe wrapper helper.

### Phase 3: Async reliability
- Define policy for partial failures in grouped async commands.
- Add optional compensating actions for networked mutations.

### Phase 4: Observability and tests
- Add unit tests for failure cases, nested groups, and stack invariants.
- Add integration tests for undo/redo over sync mutations and drag flows.

## Concrete Technical Rules To Adopt

- Never pop history entries without restoration path on execution failure.
- Grouping API must be nesting-safe.
- Group open/close must be scoped via helper (`try/finally` internally).
- Async command failures must be surfaced and tracked, not silently dropped.
- Keyboard and UI invocations should route through one guarded `executeUndo`/`executeRedo`.

## Suggested Priority Backlog

1. Patch `undo.ts` failure handling so entries are never lost on error.
2. Add `runInUndoGroup` helper and migrate current group call-sites.
3. Add tests for thrown command handlers and mid-group failure behavior.
4. Add lightweight command metadata and structured logging.

## Bottom Line

The undo/redo system is good enough for normal paths, but **not resilient under failure**. A focused overhaul should prioritize stack integrity and transaction safety before adding new grouped/complex interactions.
