# Testing and QA Audit (Coverage + Quality Gates)

Date: 2026-02-19

## Scope

This audit covers current testing and quality gate posture, with focus on:
- automated test coverage breadth
- quality scripts and developer workflows
- CI readiness and regression detection risk
- practical roadmap for targeted, high-signal audits and checks

Primary files reviewed:
- `package.json`
- `extension/package.json`
- `tests/security-check.py`
- repository structure (`tests/`, `.github/`)
- high-risk runtime modules (`src/features/drag-drop.ts`, `src/data/store.ts`, `src/features/undo.ts`, extension bridge files)

## Executive Summary

The project currently has **very limited automated QA coverage** relative to interaction and sync complexity. There is one useful security smoke script, but no standardized unit/integration/E2E test layers and no first-class quality gates in npm scripts.

Main risk: regressions in interaction, sync, undo, and extension messaging can ship without automated detection.

## Findings (ranked)

### 1. No standard test/lint scripts in primary package manifests (High)

Evidence:
- Root scripts include only `dev`, `build`, `preview`: `package.json`.
- Extension scripts include build/dev/zip only: `extension/package.json`.

Impact:
- No shared command for local/CI quality checks.
- Inconsistent verification practices across contributors.

### 2. Automated tests are effectively a single security smoke script (High)

Evidence:
- `tests/` currently contains only `tests/security-check.py`.
- No unit/integration suites for runtime modules.

Impact:
- Core behavior regressions are likely to escape detection.
- Refactors are expensive due to low confidence.

### 3. No CI workflow configuration detected (High)

Evidence:
- No `.github/workflows` files present.

Impact:
- No automatic enforcement of build/test checks on pull requests.
- Quality depends on manual discipline.

### 4. Existing script is valuable but narrow and environment-coupled (Medium)

Evidence:
- `tests/security-check.py` targets `http://localhost:5173` and assumes running dev server: `tests/security-check.py:28`, `tests/security-check.py:29`.
- Focus is CSP/link/script checks and visual/basic UI checks, not behavioral interaction/sync correctness.

Impact:
- Useful as a smoke check, but not enough as regression suite.

### 5. Highest-risk systems currently lack dedicated regression coverage (High)

Evidence:
- Complex interaction runtime: `src/features/drag-drop.ts`.
- Complex sync/migration runtime: `src/data/store.ts`.
- Undo/redo execution engine: `src/features/undo.ts`.
- Extension auth/bookmark bridge: `src/utils/extension-bridge.ts`, `src/auth/clerk.ts`, extension entrypoints.

Impact:
- Bugs in these areas can be user-visible and difficult to reproduce.

## What Is Already Strong

- TypeScript strict mode is enabled in primary app and Convex config (`tsconfig.json`, `convex/tsconfig.json`).
- Security smoke script demonstrates good intent and catches a useful class of issues.
- Architecture is modular enough to support targeted test entry points without large rewrites.

## Overhaul Recommendations

## Target QA Architecture

1. Layer 1: Fast unit tests
- Pure logic modules (parsers, converters, ordering helpers, message validators, undo stack invariants).

2. Layer 2: Integration tests (DOM + app runtime)
- Interaction flows, modal close routes, undo/redo behavior, store rebuild and migration gating.

3. Layer 3: E2E tests
- Sync-mode bootstrap, auth handoff, extension-assisted import flow, mobile interaction smoke paths.

4. Layer 4: Security smoke
- Keep and evolve `tests/security-check.py` (or migrate to unified test runner).

## Migration Plan (phased)

### Phase 1: Quality gate baseline
- Add standard scripts to root and extension manifests:
  - `typecheck`
  - `test`
  - `test:e2e` (if split)
  - `lint` (if adopted)
- Document one canonical local verification command.

### Phase 2: High-risk coverage first
- Add targeted tests for:
  - `src/features/undo.ts` stack invariants and failure behavior
  - `src/data/store.ts` migration and rebuild gating
  - interaction critical flows in `src/features/drag-drop.ts`
  - extension bridge message validation paths

### Phase 3: CI enforcement
- Add CI workflow to run build + typecheck + core tests on PRs.
- Add optional nightly/merge-gate E2E profile.

### Phase 4: Reliability metrics
- Track flaky tests and stabilize.
- Define minimum regression suite required before major interaction/sync refactors.

## Concrete Technical Rules To Adopt

- Every critical feature change must include or update at least one automated test.
- No merge without passing `build`, `typecheck`, and core test suite.
- High-risk modules (interaction, sync, undo, extension bridge) require integration coverage.
- Security smoke checks should run in CI, not only locally.
- Keep tests deterministic; avoid dependency on manual local setup where possible.

## Suggested Priority Backlog

1. Add baseline scripts (`typecheck`, `test`, `test:e2e`) to package manifests.
2. Add CI workflow for build/typecheck/tests.
3. Write first targeted suites for undo and store migration/sync.
4. Add bridge message validation tests and drag/drop regression smoke tests.

## Bottom Line

QA coverage is currently the weakest system-level area. A targeted test overhaul focused on interaction, sync, undo, and extension bridge will give the highest return and make future audits/refactors materially safer.
