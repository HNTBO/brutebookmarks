# V2 Overhaul Plan

Unified execution plan synthesizing all 10 audit documents into a dependency-ordered bead layout.
Created 2026-02-19.

---

## Audit Inventory

| # | Audit | Findings | Most Urgent |
|---|-------|----------|-------------|
| 1 | `claude-interaction-audit.md` | 0C / 3H / 4M / 5L | Size controller, modal backdrop, hover — all legacy mouse/touch |
| 2 | `claude-accessibility-audit.md` | 3C / 4H / 6M / 6L | Cards unreachable by keyboard, no focus traps, no ARIA |
| 3 | `claude-modal-system-audit.md` | 0C / 2H / 5M / 4L | Confirm-modal singleton race, dead animation, orphaned listeners |
| 4 | `claude-css-theming-audit.md` | 1C / 3H / 6M / 8L | `font-weight: 0` bug, hardcoded colors, light theme gaps |
| 5 | `claude-state-data-flow-audit.md` | 0C / 4H / 5M / 6L | `any` typing, tabGroup null-guard, non-null assertions |
| 6 | `claude-error-handling-audit.md` | 2C / 4H / 6M / 5L | No global handler, 16 mutations with zero try/catch |
| 7 | `claude-performance-audit.md` | 2C / 2H / 4M / 5L | Nuclear DOM rebuild, triple render on connection |
| 8 | `claude-extension-bridge-audit.md` | 0C / 3H / 4M / 5L | Origin validation gap, no disconnect message, token expiry |
| 9 | `claude-security-audit.md` | 1C / 3H / 5M / 3L | Unescaped innerHTML in modal, iconPath accepts `javascript:` |
| 10 | `claude-testing-qa-audit.md` | 2C / 4H / 5M / 4L | No npm test scripts, no CI, zero unit tests |

**Totals:** 11 Critical, 32 High, 50 Medium, 51 Low across 10 audits.

---

## Guiding Principles

1. **Security before features.** Fix XSS vectors and validation gaps before any refactoring.
2. **Tests before refactors.** Set up test infrastructure and cover critical pure-logic modules before changing their behavior.
3. **Quick wins first.** Mechanical find-and-replace fixes (pointer events, escapeHtml, isPrimary) ship early for momentum.
4. **Dependencies flow downward.** Each phase builds on the previous. No phase depends on a later one.
5. **Codex review checkpoint.** After this plan is approved and beads are created, Codex reviews the plan. Then implementation begins.

---

## Bead Layout

### Phase 0: Critical Fixes (< 30 min)

Zero-risk, immediate-value fixes. No dependencies.

| Bead ID | Title | Audit Source | Effort | Depends On |
|---------|-------|-------------|--------|------------|
| `beads-001` | Fix `font-weight: 0` bug in CSS | CSS C1 | 5 min | — |
| `beads-002` | Escape `cat.name` in bookmark-modal select | Security C1 | 5 min | — |
| `beads-003` | Escape emoji data attributes in icon-picker | Security M3 | 5 min | — |
| `beads-004` | Add `isPrimary` checks to 3 pointer handlers | Interaction L5 | 5 min | — |

### Phase 1: Security Hardening (2-3 hours)

Fix all remaining injection vectors and validation gaps. Must ship before any refactoring work.

| Bead ID | Title | Audit Source | Effort | Depends On |
|---------|-------|-------------|--------|------------|
| `beads-005` | Add `iconPath` validation to Convex mutations | Security H1 | 30 min | — |
| `beads-006` | Harden JSON import parser (URL schemes + field lengths) | Security H3 | 30 min | — |
| `beads-007` | Add string length limits to Convex mutations | Security M5 | 20 min | — |
| `beads-008` | Validate localStorage JSON.parse with schema checks | Security M1, Error M2 | 30 min | — |
| `beads-009` | Sanitize theme-init.js localStorage reads | Security M4 | 10 min | — |
| `beads-010` | Harden CSP (Vercel headers, base-uri, tighter img-src) | Security H2 | 30 min | — |
| `beads-011` | Fix SSRF redirect bypass in favicons + metadata | Security M2 | 1 hr | — |
| `beads-012` | Add origin validation to extension-bridge.ts | Ext Bridge H1 | 5 min | — |
| `beads-013` | Add global `unhandledrejection` + `window.onerror` handler | Error C1, C2 | 15 min | — |

### Phase 2: Test Infrastructure (3-4 hours)

Set up the test foundation before any behavioral refactors. Tests will be the safety net for Phases 3-7.

| Bead ID | Title | Audit Source | Effort | Depends On |
|---------|-------|-------------|--------|------------|
| `beads-014` | Add npm scripts (typecheck, test, test:e2e, lint) | Testing C1 | 10 min | — |
| `beads-015` | Install Vitest + create vitest.config.ts | Testing C1 | 15 min | `beads-014` |
| `beads-016` | Unit tests for `undo.ts` (stack invariants, groups, errors) | Testing H1 | 1 hr | `beads-015` |
| `beads-017` | Unit tests for `escapeHtml` (XSS prevention) | Testing L2 | 15 min | `beads-015` |
| `beads-018` | Unit tests for `bookmark-parsers.ts` (format detection, parsers) | Testing H4 | 1.5 hr | `beads-015` |
| `beads-019` | Unit tests for `computeMidpoint` (drag-drop ordering) | Testing H3 | 30 min | `beads-015` |
| `beads-020` | Wire existing Playwright E2E tests to npm scripts | Testing M4 | 15 min | `beads-014` |
| `beads-021` | Create CI workflow (.github/workflows/ci.yml) | Testing C2 | 1 hr | `beads-014`, `beads-015`, `beads-020` |

### Phase 3: Interaction Unification (1.5-2 hours)

Migrate all legacy mouse/touch code to pointer events. Mechanical replacements with well-understood scope.

| Bead ID | Title | Audit Source | Effort | Depends On |
|---------|-------|-------------|--------|------------|
| `beads-022` | Migrate modal backdrop dismiss to pointer events (5 instances) | Interaction H2 | 15 min | `beads-020` |
| `beads-023` | Migrate proximity hover to pointer events + pointerType guard | Interaction H3 | 15 min | `beads-020` |
| `beads-024` | Rewrite size controller to pointer events + setPointerCapture | Interaction H1 | 30 min | `beads-020` |
| `beads-025` | Add setPointerCapture to tab swipe | Interaction M4 | 5 min | — |
| `beads-026` | Create `src/utils/interaction-constants.ts` (extract all thresholds) | Interaction M1 | 20 min | — |

### Phase 4: Modal System Overhaul (2-3 hours)

Fix lifecycle bugs, add modal stack concept, clean up dead code. Depends on Phase 3 for backdrop pointer migration.

| Bead ID | Title | Audit Source | Effort | Depends On |
|---------|-------|-------------|--------|------------|
| `beads-027` | Fix confirm-modal singleton concurrency (Promise queue) | Modal H1 | 30 min | — |
| `beads-028` | Create `closeHelpModal()` function + unify close paths | Modal H2 | 15 min | — |
| `beads-029` | Remove dead `.dismissing` CSS + `modalSlideOut` keyframes | Modal M1, CSS | 5 min | — |
| `beads-030` | Escape key closes topmost modal only (not all) | Modal M5 | 20 min | `beads-027` |
| `beads-031` | Add z-index differentiation for modal stacking | Modal M4 | 15 min | `beads-030` |
| `beads-032` | Clean up MutationObservers + popstate listeners (AbortController) | Modal M2, M3 | 30 min | `beads-028` |
| `beads-033` | Fix context menu dismiss listener leak | Interaction L1 | 10 min | — |
| `beads-034` | Guard DragController.init() against double-call | Interaction L2 | 2 min | — |

### Phase 5: State & Error Hardening (3-4 hours)

Type safety, null-guard fixes, error handling for mutations and undo. Depends on test infrastructure for verification.

| Bead ID | Title | Audit Source | Effort | Depends On |
|---------|-------|-------------|--------|------------|
| `beads-035` | Type raw Convex data (replace `any[]` with `Doc<>[]`) | State H1, Testing M1 | 45 min | `beads-016` |
| `beads-036` | Fix tabGroup null-guard in `rebuild()` | State H2 | 15 min | `beads-035` |
| `beads-037` | Replace 16 `getConvexClient()!` with safe accessor | State H3 | 30 min | `beads-035` |
| `beads-038` | Add try/catch to all 16 store mutation helpers | Error H1 | 30 min | `beads-013` |
| `beads-039` | Make undo/redo stack operations exception-safe | Error H2, State H4 | 30 min | `beads-016` |
| `beads-040` | Make seed failure visible to user (styledAlert) | Error H3 | 10 min | `beads-038` |
| `beads-041` | Add try/catch to drag-drop mutation calls | Error H4 | 20 min | `beads-038` |
| `beads-042` | Replace error-string parsing with capability flag | State M1, Error M1 | 20 min | `beads-037` |

### Phase 6: CSS / Theming Cleanup (1-2 hours)

Token fixes, light theme gaps, hardcoded colors. No behavioral dependencies.

| Bead ID | Title | Audit Source | Effort | Depends On |
|---------|-------|-------------|--------|------------|
| `beads-043` | Add light theme overrides for `--danger`, `--danger-dim`, `--scale-color` | CSS H1 | 15 min | — |
| `beads-044` | Replace hardcoded `color: white` / `#fff` with tokens | CSS H2 | 15 min | — |
| `beads-045` | Replace hardcoded `rgba(0,0,0,...)` modal overlays with tokens | CSS H3 | 15 min | — |
| `beads-046` | Remove `border-radius: 6px` from auth-escape-btn | CSS M1 | 2 min | — |
| `beads-047` | Replace `.settings-section:last-child` with explicit class | CSS M2 | 5 min | — |
| `beads-048` | Create z-index token scale | CSS M3 | 15 min | `beads-031` |
| `beads-049` | Create transition duration tokens | CSS M6 | 10 min | — |

### Phase 7: Performance Quick Wins (2-3 hours)

Debounce, batching, and caching fixes. Depends on state hardening for safe refactoring of rebuild().

| Bead ID | Title | Audit Source | Effort | Depends On |
|---------|-------|-------------|--------|------------|
| `beads-050` | Debounce `rebuild()` to coalesce triple subscription fire | Perf C2 | 30 min | `beads-036` |
| `beads-051` | Debounce localStorage write in rebuild | Perf H2 | 15 min | `beads-050` |
| `beads-052` | Cache `window.matchMedia` results (module-level) | Perf M1 | 15 min | — |
| `beads-053` | Batch layout reads in `handleCardPointerMove` | Perf M2 | 20 min | `beads-023` |
| `beads-054` | Replace SVG feTurbulence noise with pre-rendered PNG | Perf M3 | 15 min | — |
| `beads-055` | Gate auto-scroll RAF loop on edge proximity | Perf M4 | 15 min | — |

### Phase 8: Extension Bridge Hardening (1-2 hours)

Token lifecycle, protocol formalization, dead code cleanup.

| Bead ID | Title | Audit Source | Effort | Depends On |
|---------|-------|-------------|--------|------------|
| `beads-056` | Add idempotency guards to bridge init functions | Ext Bridge H2 | 5 min | `beads-012` |
| `beads-057` | Wire `BB_EXT_DISCONNECT` on Clerk sign-out | Ext Bridge H3, M4 | 20 min | `beads-056` |
| `beads-058` | Add JWT expiry check to `isConnected()` | Ext Bridge L4 | 15 min | — |
| `beads-059` | Fix object spread in content script bookmark relay | Ext Bridge M3 | 5 min | — |
| `beads-060` | Create shared bridge message types with version field | Ext Bridge M1 | 30 min | `beads-059` |
| `beads-061` | Centralize TOKEN_KEY + remove dead exports | Ext Bridge L5 | 5 min | — |
| `beads-062` | Strip localhost from extension match patterns in prod | Ext Bridge M2, Security L1 | 15 min | — |

### Phase 9: Accessibility Foundation (3-4 hours)

High-impact a11y improvements. Depends on modal overhaul (Phase 4) for focus management.

| Bead ID | Title | Audit Source | Effort | Depends On |
|---------|-------|-------------|--------|------------|
| `beads-063` | Add `:focus-visible` styles to all interactive elements | A11y M5 | 30 min | — |
| `beads-064` | Add `role="dialog"`, `aria-modal`, `aria-labelledby` to all modals | A11y M4 | 20 min | `beads-032` |
| `beads-065` | Add focus trap to all modals | A11y C2 | 1 hr | `beads-064` |
| `beads-066` | Make bookmark cards keyboard-navigable (tabindex, role, Enter) | A11y C1 | 1 hr | `beads-063` |
| `beads-067` | Add `aria-label` to all icon-only buttons | A11y H3 | 15 min | — |
| `beads-068` | Implement proper `tablist`/`tab`/`tabpanel` ARIA pattern | A11y H1 | 30 min | `beads-066` |
| `beads-069` | Add `for` attributes to all form labels | A11y H2 | 15 min | — |
| `beads-070` | Make edit/delete buttons keyboard-accessible (not just hover) | A11y H4 | 30 min | `beads-066` |

### Phase 10: Test Expansion (4-6 hours)

Full test coverage. Depends on all behavioral changes being complete.

| Bead ID | Title | Audit Source | Effort | Depends On |
|---------|-------|-------------|--------|------------|
| `beads-071` | Extract and test `rebuild()` as pure function | Testing H2 | 2 hr | `beads-050` |
| `beads-072` | Migrate security-check.py to TypeScript Playwright | Testing M5 | 1 hr | `beads-021` |
| `beads-073` | E2E tests for import/export round-trip | Testing M3 | 2 hr | `beads-021` |
| `beads-074` | E2E tests for drag reorder results | Testing H3 | 1.5 hr | `beads-021` |
| `beads-075` | Extension bridge message validation tests | Testing M2 | 1 hr | `beads-060` |

---

## Dependency Graph

```
Phase 0 (Critical Fixes) ─── No dependencies
  beads-001  font-weight: 0
  beads-002  escape cat.name
  beads-003  escape emoji data
  beads-004  isPrimary checks

Phase 1 (Security) ─── No dependencies
  beads-005  iconPath validation
  beads-006  import parser hardening
  beads-007  string length limits
  beads-008  localStorage validation
  beads-009  theme-init sanitize
  beads-010  CSP hardening
  beads-011  SSRF redirect fix
  beads-012  extension origin validation
  beads-013  global error handler

Phase 2 (Test Infrastructure)
  beads-014  npm scripts ──────────────────────┐
  beads-015  Vitest setup ← 014               │
  beads-016  undo tests ← 015                 │
  beads-017  escapeHtml tests ← 015           │
  beads-018  parser tests ← 015               │
  beads-019  midpoint tests ← 015             │
  beads-020  wire Playwright ← 014            │
  beads-021  CI workflow ← 014, 015, 020 ─────┘

Phase 3 (Interaction) ← Phase 2 (E2E tests available)
  beads-022  modal backdrop → pointer ← 020
  beads-023  hover → pointer ← 020
  beads-024  size controller → pointer ← 020
  beads-025  tab swipe capture
  beads-026  interaction constants

Phase 4 (Modals) ← Phase 3 (backdrop already migrated)
  beads-027  confirm-modal queue
  beads-028  help modal close fn
  beads-029  dead CSS removal
  beads-030  Escape = topmost only ← 027
  beads-031  z-index differentiation ← 030
  beads-032  cleanup observers ← 028
  beads-033  context menu leak fix
  beads-034  DragController init guard

Phase 5 (State & Error) ← Phase 2 (undo tests as safety net)
  beads-035  type Convex data ← 016
  beads-036  tabGroup null-guard ← 035
  beads-037  safe Convex accessor ← 035
  beads-038  mutation try/catch ← 013
  beads-039  undo exception safety ← 016
  beads-040  seed failure UX ← 038
  beads-041  drag-drop try/catch ← 038
  beads-042  capability flag ← 037

Phase 6 (CSS) ─── No hard dependencies
  beads-043  light theme gaps
  beads-044  hardcoded white → token
  beads-045  overlay → token
  beads-046  border-radius remove
  beads-047  settings selector fix
  beads-048  z-index tokens ← 031
  beads-049  transition tokens

Phase 7 (Performance) ← Phase 5 (rebuild is safe to touch)
  beads-050  debounce rebuild ← 036
  beads-051  debounce localStorage ← 050
  beads-052  cache matchMedia
  beads-053  batch layout reads ← 023
  beads-054  PNG noise texture
  beads-055  gate auto-scroll RAF

Phase 8 (Extension) ← Phase 1 (origin fix done)
  beads-056  bridge init guards ← 012
  beads-057  disconnect on sign-out ← 056
  beads-058  JWT expiry check
  beads-059  explicit bookmark relay
  beads-060  shared message types ← 059
  beads-061  centralize TOKEN_KEY
  beads-062  strip localhost in prod

Phase 9 (Accessibility) ← Phase 4 (modal lifecycle clean)
  beads-063  focus-visible styles
  beads-064  modal ARIA roles ← 032
  beads-065  modal focus traps ← 064
  beads-066  card keyboard nav ← 063
  beads-067  icon-only aria-label
  beads-068  tablist ARIA ← 066
  beads-069  form labels
  beads-070  edit/delete keyboard ← 066

Phase 10 (Test Expansion) ← All behavioral changes complete
  beads-071  rebuild pure function tests ← 050
  beads-072  migrate security check ← 021
  beads-073  import/export E2E ← 021
  beads-074  drag reorder E2E ← 021
  beads-075  bridge message tests ← 060
```

---

## Parallel Execution Opportunities

Several phases can run concurrently:

```
Time →

     Phase 0 ──→ Phase 1 ──→ Phase 2 ──┬──→ Phase 3 ──→ Phase 4 ──→ Phase 9
                                        │
                                        ├──→ Phase 5 ──→ Phase 7
                                        │
                                        └──→ Phase 8

     Phase 6 can run any time (no behavioral dependencies)

     Phase 10 runs last (depends on all behavioral changes)
```

**Parallel tracks after Phase 2:**
- **Track A:** Interaction → Modals → Accessibility (the UX/a11y path)
- **Track B:** State → Performance (the data path)
- **Track C:** Extension bridge (independent)
- **Track D:** CSS cleanup (independent, can run any time)

---

## Effort Summary

| Phase | Beads | Estimated Effort |
|-------|------:|:----------------:|
| 0. Critical Fixes | 4 | 20 min |
| 1. Security | 9 | 2.5 hr |
| 2. Test Infrastructure | 8 | 4 hr |
| 3. Interaction | 5 | 1.5 hr |
| 4. Modal System | 8 | 1.5 hr |
| 5. State & Error | 8 | 3 hr |
| 6. CSS / Theming | 7 | 1.5 hr |
| 7. Performance | 6 | 2 hr |
| 8. Extension Bridge | 7 | 1.5 hr |
| 9. Accessibility | 8 | 4 hr |
| 10. Test Expansion | 5 | 7.5 hr |
| **Total** | **75** | **~29 hours** |

### Recommended Priority Cut

If time is limited, **Phases 0-5** deliver the highest value:

| What you get | Beads | Time |
|---|---|---|
| All security fixes | 13 | 2.75 hr |
| Test infrastructure + critical unit tests | 8 | 4 hr |
| Unified pointer events | 5 | 1.5 hr |
| Clean modal system | 8 | 1.5 hr |
| Type-safe state + error handling | 8 | 3 hr |
| **Subtotal (Phases 0-5)** | **42** | **~13 hours** |

This covers every Critical and High finding across all 10 audits. Phases 6-10 are cleanup, polish, and expansion.

---

## What NOT to change

Carried forward from individual audits — these are explicitly correct and should NOT be refactored:

- **`modal-swipe-dismiss.ts`** touch-only approach (documented reason: pointercancel on scrollable)
- **`icon-picker.ts` drag/drop** events (HTML5 file drop API, correct)
- **`click` event handlers** everywhere (high-level, fires from mouse/touch/keyboard)
- **`keydown` handlers** (already correct)
- **`dragstart` preventDefault** on cards/handles (correct native drag suppression)
- **Convex mutation atomicity** (guaranteed by runtime, don't add client-side compensation)
- **`requestId` correlation pattern** in extension bridge (good engineering, don't over-engineer)

---

## Next Steps

1. **Codex reviews this plan** — validates priorities, dependencies, and identifies gaps
2. **Finalize the plan** — integrate Codex feedback
3. **Create real beads** — `bd create` for each bead, `bd dep add` for dependencies
4. **Execute Phase 0-5 first** — the high-value core
5. **Ship and test** — verify on production
6. **Execute Phases 6-10** — cleanup and expansion
