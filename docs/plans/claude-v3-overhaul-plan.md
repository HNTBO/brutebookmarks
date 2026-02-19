# V3 Overhaul Plan

Final execution plan integrating Claude audits, Codex audits, and Codex review feedback.
Created 2026-02-19.

**Changes from V2:**
- Dropped 6 beads already implemented (interaction audit work landed before plan was written)
- Added 2 new beads from Codex feedback (sync lifecycle, undo nesting)
- Moved accessibility foundation earlier (Phase 6 → after modal work)
- Relaxed over-strict dependency edges on mechanical/zero-risk fixes
- Recomputed effort totals

---

## Already Completed (removed from plan)

These were in V2 but are already in the current codebase:

| V2 Bead | Work | Evidence |
|---------|------|----------|
| ~~beads-004~~ | isPrimary checks on all pointer handlers | 17+ handlers across `bookmark-card.ts`, `categories.ts`, `header.ts`, `drag-drop.ts` |
| ~~beads-022~~ | Modal backdrop → pointer events | All 5 modals use `pointerdown`/`pointerup` |
| ~~beads-023~~ | Proximity hover → pointer events | `handleCardPointerMove(e: PointerEvent)` + `pointerleave` in `categories.ts:154-155` |
| ~~beads-024~~ | Size controller → pointer + setPointerCapture | `header.ts:95-110` uses pointer events + capture |
| ~~beads-025~~ | Tab swipe pointer capture | `categories.ts:65` has `setPointerCapture` |
| ~~beads-026~~ | Interaction constants file | `src/utils/interaction-constants.ts` exists with all thresholds |

**Bonus:** The `PointerTracker` utility (interaction audit M2) also landed as `src/utils/pointer-tracker.ts` — `attachDragTracking()` with isPrimary, setPointerCapture, touchmove prevention, and threshold detection in one clean abstraction.

---

## Audit Inventory

| # | Audit | Source | Findings |
|---|-------|--------|----------|
| 1 | Interaction | Claude | 0C / 3H / 4M / 5L |
| 2 | Accessibility | Claude | 3C / 4H / 6M / 6L |
| 3 | Modal System | Claude | 0C / 2H / 5M / 4L |
| 4 | CSS / Theming | Claude | 1C / 3H / 6M / 8L |
| 5 | State / Data Flow | Claude + Codex | 0C / 4H / 5M / 6L |
| 6 | Error Handling | Claude | 2C / 4H / 6M / 5L |
| 7 | Performance | Claude | 2C / 2H / 4M / 5L |
| 8 | Extension Bridge | Claude + Codex | 0C / 3H / 4M / 5L |
| 9 | Security | Claude + Codex | 1C / 3H / 5M / 3L |
| 10 | Testing & QA | Claude + Codex | 2C / 4H / 5M / 4L |

---

## Guiding Principles

1. **Security before features.** Fix XSS vectors and validation gaps first.
2. **Tests before risky refactors.** Set up Vitest/CI before touching `rebuild()` or undo internals.
3. **Mechanical fixes proceed in parallel.** Zero-risk CSS/escape/cleanup changes don't wait for test infrastructure.
4. **Accessibility is not polish.** Keyboard nav and focus traps ship with the modal/interaction work, not after.
5. **Sync lifecycle is a first-class concern.** Subscription start/stop/teardown gets its own bead (Codex feedback).

---

## Bead Layout

### Phase 0: Critical Fixes (< 15 min)

Zero-risk, immediate-value. No dependencies on anything.

| Bead | Title | Source | Effort |
|------|-------|--------|--------|
| `001` | Fix `font-weight: 0` bug in `.category-title` and `.tab` | CSS C1 | 5 min |
| `002` | Escape `cat.name` in bookmark-modal `populateCategorySelect` | Security C1 | 5 min |
| `003` | Escape emoji data attributes in icon-picker | Security M3 | 5 min |

### Phase 1: Security Hardening (2.5 hours)

Fix all remaining injection vectors and validation gaps. Ships before any refactoring.

| Bead | Title | Source | Effort | Depends On |
|------|-------|--------|--------|------------|
| `004` | Add `iconPath` validation to Convex mutations (scheme allowlist) | Security H1 | 30 min | — |
| `005` | Harden JSON import parser (URL schemes + field lengths) | Security H3 | 30 min | — |
| `006` | Add string length limits to Convex mutations | Security M5 | 20 min | — |
| `007` | Validate localStorage JSON.parse with schema checks + try/catch | Security M1, Error M2 | 30 min | — |
| `008` | Sanitize theme-init.js localStorage reads (allowlist theme, validate accent) | Security M4 | 10 min | — |
| `009` | Harden CSP (Vercel headers, base-uri, form-action, tighter img-src) | Security H2 | 30 min | — |
| `010` | Fix SSRF redirect bypass (manual redirect following with host validation) | Security M2 | 1 hr | — |
| `011` | Add origin validation to `extension-bridge.ts` listeners | Ext Bridge H1 | 5 min | — |
| `012` | Add global `unhandledrejection` + `window.onerror` handler | Error C1, C2 | 15 min | — |

### Phase 2: Test Infrastructure (3.5 hours)

Set up the safety net. Risky refactors in later phases depend on this. Mechanical fixes (Phases 0, 1, 6) do NOT.

| Bead | Title | Source | Effort | Depends On |
|------|-------|--------|--------|------------|
| `013` | Add npm scripts (typecheck, test, test:e2e) | Testing C1 | 10 min | — |
| `014` | Install Vitest + create vitest.config.ts | Testing C1 | 15 min | `013` |
| `015` | Unit tests for `undo.ts` (stack invariants, groups, errors) | Testing H1 | 1 hr | `014` |
| `016` | Unit tests for `escapeHtml` (XSS prevention layer) | Testing L2 | 15 min | `014` |
| `017` | Unit tests for `bookmark-parsers.ts` (format detection, both parsers) | Testing H4 | 1.5 hr | `014` |
| `018` | Unit tests for `computeMidpoint` (drag-drop ordering math) | Testing H3 | 30 min | `014` |
| `019` | Wire existing Playwright E2E tests to npm scripts | Testing M4 | 15 min | `013` |
| `020` | Create CI workflow (.github/workflows/ci.yml) | Testing C2 | 1 hr | `013`, `014`, `019` |

### Phase 3: Modal System Overhaul (2 hours)

Fix lifecycle bugs, add modal stack concept, clean up dead code.

| Bead | Title | Source | Effort | Depends On |
|------|-------|--------|--------|------------|
| `021` | Fix confirm-modal singleton concurrency (Promise queue) | Modal H1 | 30 min | — |
| `022` | Create `closeHelpModal()` function + unify close paths | Modal H2 | 15 min | — |
| `023` | Remove dead `.dismissing` CSS + `modalSlideOut` keyframes | Modal M1 | 5 min | — |
| `024` | Escape key closes topmost modal only (not dismissAllModals) | Modal M5 | 20 min | `021` |
| `025` | Add z-index differentiation for modal stacking | Modal M4 | 15 min | `024` |
| `026` | Clean up MutationObservers + popstate listeners (AbortController) | Modal M2, M3 | 30 min | `022` |
| `027` | Fix context menu dismiss listener leak | Interaction L1 | 10 min | — |
| `028` | Guard DragController.init() against double-call | Interaction L2 | 2 min | — |

### Phase 4: Accessibility Foundation (3 hours)

Moved up from V2 Phase 9 per Codex feedback. Ships with the modal work since focus traps depend on clean modal lifecycle.

| Bead | Title | Source | Effort | Depends On |
|------|-------|--------|--------|------------|
| `029` | Add `:focus-visible` styles to all interactive elements | A11y M5 | 30 min | — |
| `030` | Add `role="dialog"`, `aria-modal`, `aria-labelledby` to all modals | A11y M4 | 20 min | `026` |
| `031` | Add focus trap to all modals | A11y C2 | 1 hr | `030` |
| `032` | Make bookmark cards keyboard-navigable (tabindex, role, Enter/Space) | A11y C1 | 1 hr | `029` |
| `033` | Add `aria-label` to all icon-only buttons | A11y H3 | 15 min | — |
| `034` | Implement proper `tablist`/`tab`/`tabpanel` ARIA pattern | A11y H1 | 30 min | `032` |
| `035` | Add `for` attributes to all form labels | A11y H2 | 15 min | — |
| `036` | Make edit/delete buttons keyboard-accessible (not hover-only) | A11y H4 | 30 min | `032` |

### Phase 5: State, Sync & Error Hardening (4 hours)

Type safety, sync lifecycle, null-guard fixes, error handling. Undo tests from Phase 2 are the safety net.

| Bead | Title | Source | Effort | Depends On |
|------|-------|--------|--------|------------|
| `037` | Type raw Convex data (replace `any[]` with `Doc<>[]`) | State H1, Testing M1 | 45 min | `015` |
| `038` | Fix tabGroup null-guard in `rebuild()` | State H2 | 15 min | `037` |
| `039` | Replace 16 `getConvexClient()!` with safe accessor + fallback | State H3 | 30 min | `037` |
| `040` | **NEW: Add sync subscription lifecycle (idempotent start/stop + unsubscribe handles)** | Codex feedback, State M4 | 45 min | `037` |
| `041` | Add try/catch to all 16 store mutation helpers | Error H1 | 30 min | `012` |
| `042` | Make undo/redo stack operations exception-safe (restore on failure) | Error H2, State H4 | 30 min | `015` |
| `043` | **NEW: Add nested-safe undo grouping (`runInUndoGroup` with try/finally)** | Codex feedback, Undo audit | 30 min | `042` |
| `044` | Make seed failure visible to user (styledAlert) | Error H3 | 10 min | `041` |
| `045` | Add try/catch to drag-drop mutation calls | Error H4 | 20 min | `041` |
| `046` | Replace error-string parsing with capability flag | State M1, Error M1 | 20 min | `039` |

### Phase 6: CSS / Theming Cleanup (1.5 hours)

No behavioral dependencies. Can run in parallel with any phase.

| Bead | Title | Source | Effort | Depends On |
|------|-------|--------|--------|------------|
| `047` | Add light theme overrides for `--danger`, `--danger-dim`, `--scale-color` | CSS H1 | 15 min | — |
| `048` | Replace hardcoded `color: white` / `#fff` with tokens | CSS H2 | 15 min | — |
| `049` | Replace hardcoded `rgba(0,0,0,...)` modal overlays with tokens | CSS H3 | 15 min | — |
| `050` | Remove `border-radius: 6px` from auth-escape-btn | CSS M1 | 2 min | — |
| `051` | Replace `.settings-section:last-child` with explicit class | CSS M2 | 5 min | — |
| `052` | Create z-index token scale | CSS M3 | 15 min | `025` |
| `053` | Create transition duration tokens | CSS M6 | 10 min | — |

### Phase 7: Performance (2 hours)

Depends on state hardening for safe refactoring of `rebuild()`.

| Bead | Title | Source | Effort | Depends On |
|------|-------|--------|--------|------------|
| `054` | Debounce `rebuild()` to coalesce triple subscription fire | Perf C2 | 30 min | `038`, `040` |
| `055` | Debounce localStorage write in rebuild | Perf H2 | 15 min | `054` |
| `056` | Cache `window.matchMedia` results (module-level) | Perf M1 | 15 min | — |
| `057` | Batch layout reads in `handleCardPointerMove` | Perf M2 | 20 min | — |
| `058` | Replace SVG feTurbulence noise with pre-rendered PNG | Perf M3 | 15 min | — |
| `059` | Gate auto-scroll RAF loop on edge proximity | Perf M4 | 15 min | — |

### Phase 8: Extension Bridge Hardening (1.5 hours)

Token lifecycle, protocol formalization, dead code cleanup.

| Bead | Title | Source | Effort | Depends On |
|------|-------|--------|--------|------------|
| `060` | Add idempotency guards to bridge init functions | Ext Bridge H2 | 5 min | `011` |
| `061` | Wire `BB_EXT_DISCONNECT` on Clerk sign-out | Ext Bridge H3, M4 | 20 min | `060` |
| `062` | Add JWT expiry check to `isConnected()` | Ext Bridge L4 | 15 min | — |
| `063` | Fix object spread in content script bookmark relay | Ext Bridge M3 | 5 min | — |
| `064` | Create shared bridge message types with version field | Ext Bridge M1 | 30 min | `063` |
| `065` | Centralize TOKEN_KEY + remove dead exports | Ext Bridge L5 | 5 min | — |
| `066` | Strip localhost from extension match patterns in prod builds | Ext Bridge M2, Security L1 | 15 min | — |

### Phase 9: Test Expansion (6.5 hours)

Full test coverage. Depends on all behavioral changes being complete.

| Bead | Title | Source | Effort | Depends On |
|------|-------|--------|--------|------------|
| `067` | Extract and test `rebuild()` as pure function | Testing H2 | 2 hr | `054` |
| `068` | Migrate security-check.py to TypeScript Playwright | Testing M5 | 1 hr | `020` |
| `069` | E2E tests for import/export round-trip | Testing M3 | 2 hr | `020` |
| `070` | E2E tests for drag reorder results (actual position, not just proxy) | Testing H3 | 1.5 hr | `020` |
| `071` | Extension bridge message validation tests | Testing M2 | 1 hr | `064` |

---

## Dependency Graph

```
Phase 0 (Critical Fixes) ─── No dependencies, execute immediately
  001  font-weight: 0
  002  escape cat.name
  003  escape emoji

Phase 1 (Security) ─── No dependencies, execute immediately
  004  iconPath validation
  005  import parser
  006  string length limits
  007  localStorage validation
  008  theme-init sanitize
  009  CSP hardening
  010  SSRF redirect fix
  011  extension origin check
  012  global error handler

Phase 6 (CSS) ─── No dependencies, can run any time
  047  light theme gaps
  048  hardcoded white
  049  overlay tokens
  050  border-radius
  051  settings selector
  052  z-index tokens ← 025
  053  transition tokens

Phase 2 (Test Infrastructure) ─── No dependencies for start
  013  npm scripts
  014  Vitest ← 013
  015  undo tests ← 014
  016  escapeHtml tests ← 014
  017  parser tests ← 014
  018  midpoint tests ← 014
  019  wire Playwright ← 013
  020  CI workflow ← 013, 014, 019

Phase 3 (Modals) ─── No dependencies for start
  021  confirm-modal queue
  022  help modal close
  023  dead CSS removal
  024  Escape = topmost ← 021
  025  z-index stack ← 024
  026  observer cleanup ← 022
  027  context menu leak
  028  DragController guard

Phase 4 (Accessibility) ← Phase 3 (modal lifecycle clean)
  029  focus-visible styles
  030  modal ARIA roles ← 026
  031  focus traps ← 030
  032  card keyboard nav ← 029
  033  icon-only labels
  034  tablist ARIA ← 032
  035  form labels
  036  edit/delete keyboard ← 032

Phase 5 (State & Error) ← Phase 2 (undo tests as safety net)
  037  type Convex data ← 015
  038  tabGroup null-guard ← 037
  039  safe Convex accessor ← 037
  040  sync lifecycle ← 037       ← NEW
  041  mutation try/catch ← 012
  042  undo exception safety ← 015
  043  undo nesting safety ← 042  ← NEW
  044  seed failure UX ← 041
  045  drag-drop try/catch ← 041
  046  capability flag ← 039

Phase 7 (Performance) ← Phase 5 (rebuild is safe to touch)
  054  debounce rebuild ← 038, 040
  055  debounce localStorage ← 054
  056  cache matchMedia
  057  batch layout reads
  058  PNG noise texture
  059  gate auto-scroll RAF

Phase 8 (Extension) ← Phase 1 (origin fix)
  060  bridge init guards ← 011
  061  disconnect on sign-out ← 060
  062  JWT expiry check
  063  explicit bookmark relay
  064  shared message types ← 063
  065  centralize TOKEN_KEY
  066  strip localhost

Phase 9 (Test Expansion) ← All behavioral changes
  067  rebuild pure fn tests ← 054
  068  security check migration ← 020
  069  import/export E2E ← 020
  070  drag reorder E2E ← 020
  071  bridge message tests ← 064
```

---

## Parallel Execution Tracks

```
Time →

  Phase 0 ──┐
  Phase 1 ──┤ (all immediate, no deps)
  Phase 6 ──┘

  Phase 2 ──────────────────→ Phase 5 ──→ Phase 7
                                  │
  Phase 3 ──→ Phase 4            │
       │                         │
       └── (z-index) ──→ Phase 6:052

  Phase 1:011 ──→ Phase 8

  Phase 9 runs last (all behavioral changes complete)
```

**Four independent tracks after kickoff:**
- **Track A (UX):** Modals → Accessibility
- **Track B (Data):** Test infra → State/Error → Performance
- **Track C (Extension):** Security origin fix → Bridge hardening
- **Track D (Visual):** CSS cleanup (runs any time)

---

## Effort Summary

| Phase | Beads | Estimated Effort |
|-------|------:|:----------------:|
| 0. Critical Fixes | 3 | 15 min |
| 1. Security | 9 | 2.5 hr |
| 2. Test Infrastructure | 8 | 3.5 hr |
| 3. Modal System | 8 | 1.75 hr |
| 4. Accessibility | 8 | 3 hr |
| 5. State, Sync & Error | 10 | 4 hr |
| 6. CSS / Theming | 7 | 1.25 hr |
| 7. Performance | 6 | 2 hr |
| 8. Extension Bridge | 7 | 1.5 hr |
| 9. Test Expansion | 5 | 7.5 hr |
| **Total** | **71** | **~27 hours** |

### vs V2

| Metric | V2 | V3 | Delta |
|--------|---:|---:|------:|
| Beads | 75 | 71 | -4 (6 removed, 2 added) |
| Effort | ~29 hr | ~27 hr | -2 hr |
| Phases | 11 | 10 | -1 (interaction phase collapsed) |

### Priority Cut (Phases 0-5)

If time is limited, Phases 0-5 cover every Critical and High finding:

| What you get | Beads | Time |
|---|---|---|
| All security fixes | 12 | 2.75 hr |
| Test infrastructure + critical unit tests | 8 | 3.5 hr |
| Clean modal system | 8 | 1.75 hr |
| Keyboard nav + focus traps + ARIA | 8 | 3 hr |
| Type-safe state + sync lifecycle + error handling | 10 | 4 hr |
| **Subtotal (Phases 0-5)** | **46** | **~15 hours** |

---

## What NOT to change

- `modal-swipe-dismiss.ts` touch-only approach (documented: pointercancel on scrollable)
- `icon-picker.ts` HTML5 drag/drop events (OS file drop API, correct)
- `click` event handlers (high-level, fires from mouse/touch/keyboard)
- `keydown` handlers (already correct)
- `dragstart` preventDefault on cards/handles (correct native drag suppression)
- Convex mutation atomicity (guaranteed by runtime)
- `requestId` correlation pattern in extension bridge (good engineering)
- `pointer-tracker.ts` / `interaction-constants.ts` (just landed, correct)

---

## What Changed From V2 (Codex Feedback Integration)

| Codex Finding | Action Taken |
|---|---|
| 4 beads already implemented (modal backdrop, size controller, tab swipe, constants) | Dropped `beads-022/024/025/026` + documented in "Already Completed" |
| Hover → pointer also done | Dropped `beads-023` (verified: `handleCardPointerMove` exists) |
| isPrimary also done | Dropped `beads-004` (verified: 17+ handlers have checks) |
| PointerTracker utility also done | Noted in "Already Completed" as bonus |
| Phase dependencies too strict | Relaxed: Phases 0/1/6 have zero dependencies; mechanical fixes don't wait for tests |
| A11y scheduled too late | Moved from Phase 9 → Phase 4 (immediately after modal work) |
| Sync lifecycle underrepresented | Added `bead-040`: idempotent subscription start/stop + unsubscribe handles |
| Undo nesting not covered | Added `bead-043`: `runInUndoGroup` helper with try/finally + nesting safety |
| Security severity calibration | Acknowledged: `iconPath` in `<img src>` is defense-in-depth, not active exploit. Kept in plan but not inflated. |
| 8 epics vs 75 beads | Kept bead-level granularity for implementation tracking. Phases serve as epic-level grouping. |

---

## Next Steps

1. **Approve this plan** — user sign-off
2. **Create real beads** — `bd create` for each, `bd dep add` for dependencies
3. **Execute Phases 0-1 immediately** — zero-dep security fixes
4. **Execute Phases 2-5 in parallel tracks** — test infra + modals + a11y + state
5. **Execute Phases 6-8** — CSS, performance, extension
6. **Execute Phase 9** — test expansion after all behavioral changes
