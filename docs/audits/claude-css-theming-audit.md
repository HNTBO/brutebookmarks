# CSS & Theming System Audit

Comprehensive audit of the CSS custom property (token) system, theme switching, wireframe mode, and styling patterns across Brute Bookmarks.
Conducted 2026-02-19.

---

## Executive Summary

The styling system is built on a well-structured **CSS custom property (token) layer** with two theme palettes (dark default, Solarized Light). The core architecture is sound: tokens in `:root` get overridden in `[data-theme="light"]`, a blocking `theme-init.js` script prevents FOUC, and `theme.ts` handles runtime toggling. The accent color is user-customizable per theme and synced to Convex.

The problems are in the **gaps and inconsistencies**:

1. **`font-weight: 0`** on `.category-title` and `.tab` is an invalid CSS value that browsers silently coerce to `1` (hairline weight) — almost certainly intended to be `700` ("Bolder" per the comment).
2. **Four hardcoded `color: white`** instances bypass the token system entirely, meaning the text stays white in light theme instead of adapting.
3. **Light theme is incomplete** — `--danger`, `--danger-dim`, `--scale-color`, and `--shadow-accent` are not overridden, meaning a bright red danger button and dark-mode scale tint render into the light palette unchanged.
4. **`color-mix()` is used 18 times** with no fallback, dropping support for Safari < 16.2 and Chrome < 111 (March 2023). This is probably fine for this app's audience, but it's undocumented as a baseline requirement.
5. **Wireframe mode is incomplete** — it overrides header, footer, drag handles, and mobile toolbar, but doesn't touch bookmark cards, modals, buttons (`.btn-primary`), action buttons (`.action-btn`, `.clerk-slot-btn`), the welcome gate, or the auth overlay.
6. **Z-index values span five orders of magnitude** (1 to 10001) with no named scale, making stacking context changes risky.

---

## Findings by Severity

### CRITICAL: One finding

#### C1. `font-weight: 0` is invalid CSS (`main.css:460, 1784`)

Two selectors declare `font-weight: 0`, which is not a valid `font-weight` value. The CSS spec defines `font-weight` as a number in the range [1, 1000] or a keyword. `0` is out of range — browsers clamp it to `1`, producing an ultra-thin hairline weight that is almost invisible on most displays.

```css
/* main.css:457-461 */
.category-title {
    font-family: var(--font-display);
    font-size: 1.7rem;
    font-weight: 0; /* Bolder */
    line-height: 1;
```

```css
/* main.css:1781-1785 */
.tab {
    font-family: var(--font-display);
    font-size: 1.7rem;
    font-weight: 0;
    line-height: 1;
```

**Problems:**
- The comment says `/* Bolder */`, strongly suggesting the intended value was `700` (bold) or `800` (extra-bold) — not `0`.
- The rendered text is hairline-thin instead of bold. On low-DPI screens this makes category and tab titles nearly unreadable.
- This is a clear typo/regression, not an intentional design choice.

**Recommendation:** Change both instances to `font-weight: 700` (or `800` if "Bolder" was meant relative to the parent's 400). Verify visually.

---

### HIGH: Token System Gaps

#### H1. Light theme does not override `--danger`, `--danger-dim`, or `--scale-color`

The `:root` block (dark theme) defines these tokens at lines 23-24 and 54:

```css
/* main.css:23-24 — :root (dark) */
--danger: #ff3b30;
--danger-dim: #cc2f26;
```

```css
/* main.css:54 — :root (dark) */
--scale-color: color-mix(in srgb, var(--bg-primary) 80%, var(--accent) 20%);
```

The `[data-theme="light"]` block (lines 69-95) overrides backgrounds, text, accent, borders, shadows, and scrollbar — but **not** `--danger`, `--danger-dim`, or `--scale-color`.

**Problems:**
- `--danger: #ff3b30` (iOS red) is jarring against the warm Solarized Light palette. The light theme should define a Solarized-appropriate danger color (e.g., `#dc322f` — Solarized Red).
- `--danger-dim` inherits the dark-mode value, so hover states on danger buttons look wrong in light theme.
- `--scale-color` uses `color-mix()` with `var(--bg-primary)` and `var(--accent)`, which *does* recompute when those tokens change — so it technically adapts. But the 80%/20% ratio produces a very different visual effect on `#fdf6e3` (cream) vs `#000c17` (near-black). An explicit light-theme override would give better control.

**Files affected:**
- `main.css:69-95` (light theme block — missing overrides)
- `main.css:23-24` (danger tokens used by 11 rules)

**Recommendation:** Add to `[data-theme="light"]`:
```css
--danger: #dc322f;      /* Solarized Red */
--danger-dim: #b5271e;
--scale-color: color-mix(in srgb, var(--bg-primary) 85%, var(--accent) 15%);
```

#### H2. Four hardcoded `color: white` bypass the token system (`main.css:671, 1091, 1601, 2303`)

```css
/* main.css:668-672 — .delete-btn:hover */
.delete-btn:hover {
    background: var(--danger);
    border-color: var(--danger);
    color: white;
}

/* main.css:1089-1092 — .modal-btn.delete:hover */
.modal-btn.delete:hover {
    background: var(--danger);
    color: white;
}

/* main.css:1599-1602 — .long-press-menu-btn-danger:active */
.long-press-menu-btn-danger:active {
    background: var(--danger);
    color: white;
}

/* main.css:2301-2304 — .auth-escape-btn:hover */
.auth-escape-btn:hover {
    background: var(--accent);
    color: #fff;
}
```

**Problems:**
- `white` / `#fff` is correct for text-on-red in dark mode (good contrast), but in light theme with a cream background, the visual weight is wrong — it should use `var(--bg-primary)` (which is `#fdf6e3` in light mode) for consistency with the cutout pattern used elsewhere (`.btn-primary`, `.action-btn`, `.modal-btn.save` all use `color: var(--bg-primary)`).
- `#fff` on line 2303 is functionally identical to `white` on the other three lines — inconsistent spelling for the same intent.
- These are the **only** hardcoded non-token colors in the entire CSS file outside of `:root` and `[data-theme="light"]` definitions.

**Recommendation:** Replace all four with `color: var(--bg-primary)`. This preserves white-on-red in dark mode and adapts to cream-on-red in light mode.

#### H3. Modal and auth overlays use hardcoded `rgba(0,0,0,...)` (`main.css:679, 792, 2280`)

```css
/* main.css:679 */
.modal {
    background: rgba(0, 0, 0, 0.9);
}

/* main.css:792 */
.modal-close:hover {
    background: rgba(0,0,0,0.1);
}

/* main.css:2280 */
.auth-overlay {
    background: rgba(0, 0, 0, 0.95);
}
```

**Problems:**
- A near-black overlay works in dark mode but is oppressive in light mode — a Solarized Light modal might benefit from a lighter scrim (e.g., `rgba(0, 43, 54, 0.85)` using Solarized Base03, or a `color-mix()` from `--bg-primary`).
- `.modal-close:hover` uses `rgba(0,0,0,0.1)` which is invisible on the accent-colored background in dark mode and barely visible in light mode.
- These can't be easily themed because they're not token-driven.

**Recommendation:** Introduce overlay tokens:
```css
--overlay-backdrop: rgba(0, 0, 0, 0.9);
--overlay-subtle: rgba(0, 0, 0, 0.1);
```
Override in light theme. Apply via `background: var(--overlay-backdrop)`.

---

### MEDIUM: Architectural Patterns

#### M1. `border-radius: 6px` on `.auth-escape-btn` breaks brutalist aesthetic (`main.css:2298`)

```css
/* main.css:2289-2300 */
.auth-escape-btn {
    margin-top: var(--space-lg);
    background: none;
    border: 1px solid var(--accent);
    color: var(--accent);
    font-size: 14px;
    cursor: pointer;
    font-family: inherit;
    padding: 8px 20px;
    border-radius: 6px;
    transition: background 0.15s, color 0.15s;
}
```

**Problems:**
- Every other element in the entire app uses `border-radius: 0` (explicitly or by default). The Clerk override rules even force `border-radius: 0 !important` on Clerk's components (lines 1733, 1737, 1742, 2136). The spinner uses `border-radius: 50%` (correct for a circle). The swipe handle pill uses `border-radius: 2px` (minimal rounding for a pill shape).
- A `6px` radius on the auth escape button is the only rounded rectangle in the entire UI. It looks like it came from a different design system.

**Recommendation:** Remove `border-radius: 6px` (let it be 0 like everything else), or replace with a brutalist outline style matching `.btn`.

#### M2. `.settings-section:last-child` positional selector is fragile (`main.css:1131-1143`)

```css
/* main.css:1131-1143 */
.settings-section:last-child .settings-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-sm);
}

.settings-section:last-child .settings-row .btn {
    width: 100%;
}

.settings-section:last-child .settings-row .btn-danger {
    grid-column: 1 / -1;
}
```

The current settings modal HTML (`app.ts:182-232`) has four `.settings-section` elements:
1. Account (id=`settings-account-section`)
2. Display
3. Info
4. **Bookmarks** (the last child — targeted by this selector)

**Problems:**
- If a new settings section is added after "Bookmarks" (e.g., "Advanced", "About"), these grid rules will silently stop applying to the Bookmarks section and instead apply to the new last section — which may not have the same button layout.
- The intent is to target the "Bookmarks" section specifically, not "whatever happens to be last."

**Recommendation:** Add a semantic class (e.g., `.settings-section-bookmarks` or `.settings-grid-layout`) to the Bookmarks section in `app.ts` and target that instead of `:last-child`.

#### M3. Z-index values have no named scale — 15 values across 7 orders of magnitude

| z-index | Element | File:Line |
|---------|---------|-----------|
| 1 | `.upload-overlay` | main.css:1018 |
| 2 | `#clerk-user-button` | main.css:2123 |
| 3 | `.default-avatar-overlay` | main.css:2151 |
| 5 | `.bookmark-card.long-press-active` | main.css:1555 |
| 10 | `.edit-btn`, `.delete-btn` | main.css:627, 659 |
| 10 | `.card-drop-indicator` | main.css:1665 |
| 100 | `.brute-header` (mobile) | main.css:1281 |
| 100 | `.mobile-toolbar` | main.css:1315 |
| 1000 | `body::before` (noise texture) | main.css:143 |
| 1000 | `.modal` | main.css:680 |
| 1001 | `.long-press-menu` | main.css:1561 |
| 10000 | `.drag-proxy` | main.css:1634 |
| 10000 | `.auth-overlay` | main.css:2285 |
| 10001 | `.welcome-gate` | main.css:1899 |

**Problems:**
- The noise texture (`body::before`) at z-index 1000 is the **same** as `.modal`. This works because the noise has `pointer-events: none`, but if either value changes, modals could render behind the noise overlay — a near-invisible bug.
- `.drag-proxy` and `.auth-overlay` share z-index 10000. If a drag is active when the auth overlay appears, the proxy renders at the same level. In practice this is unlikely, but it's a latent conflict.
- The jump from 100 (mobile UI) to 1000 (noise/modals) leaves no room for "above-fixed-UI-but-below-modal" elements (e.g., a toast notification).
- No named tokens — anyone adding a new positioned element has to read through the entire file to pick a z-index that doesn't conflict.

**Recommendation:** Define a z-index scale as CSS custom properties:
```css
--z-card-controls: 10;
--z-fixed-ui: 100;
--z-noise: 500;
--z-modal: 600;
--z-context-menu: 610;
--z-drag-proxy: 700;
--z-auth-overlay: 800;
--z-welcome-gate: 900;
```
Apply everywhere. This compresses the range, makes the stacking order readable, and prevents accidental conflicts.

#### M4. Wireframe mode is incomplete — only covers header, handles, footer, and mobile toolbar

The `[data-wireframe]` selector appears in 13 rules (lines 1505-1514, 1834, 2021-2075) covering:
- `.brute-header` (outlined)
- `.size-controller` (transparent bg)
- `.clerk-slot`, `.action-buttons` (transparent bg)
- `.header-title-box h1` / `h1 em` (accent color, stroke effect)
- `.category-drag-handle` (outlined)
- `.category-edit-btn` (outlined)
- `.footer-contact` (outlined, inverted hover)
- `.mobile-toolbar` and `.mobile-toolbar-btn` (outlined)

**Not covered by wireframe mode:**
- `.bookmark-card` — still solid `var(--bg-card)` background, should be outlined
- `.modal-content`, `.modal-header` — still solid fills
- `.action-btn`, `.clerk-slot-btn` — still filled accent (but their parent `.action-buttons` is transparent, creating floating colored squares)
- `.btn-primary`, `.modal-btn.save` — still filled
- `.welcome-gate` — still solid background
- `.auth-overlay` — still dark overlay
- `.category-header` — the accent-filled bar behind `.category-title` is not addressed
- `.tab-bar`, `.tab.tab-active` — the `color-mix()` backgrounds remain unchanged

**Problems:**
- Wireframe mode is marketed/presented as a visual toggle, but it only transforms about 30% of the UI. The remaining solid-fill elements create an inconsistent half-wireframe look.
- The `.action-btn` buttons float on nothing (their parent is transparent but they're still filled), which is arguably the most visually broken wireframe state.

**Recommendation:** Expand wireframe mode to cover all filled elements. At minimum, add:
```css
[data-wireframe] .action-btn,
[data-wireframe] .clerk-slot-btn {
    background: var(--bg-primary);
    border: 1px solid var(--accent);
    color: var(--accent);
}

[data-wireframe] .bookmark-card {
    background: transparent;
    border: 1px solid var(--border);
}

[data-wireframe] .category-header {
    background: transparent;
    outline: 1px solid var(--accent);
    outline-offset: -1px;
}
```

#### M5. `color-mix()` used 18 times with no browser support documentation or fallback

`color-mix()` is used for: `--accent-dim`, `--accent-glow`, `--scale-color`, `--scrollbar-thumb`, `--scrollbar-thumb-hover` (in both themes), `.category-title` background, `.add-bookmark` border, `.modal-header h2` background, `.upload-overlay` background, mobile header/toolbar backgrounds, `.tab-bar` background, and tab hover/active states.

Browser support: Chrome 111+ (March 2023), Safari 16.2+ (Dec 2022), Firefox 113+ (May 2023).

**Problems:**
- No `@supports` fallback for any `color-mix()` usage. On unsupported browsers, properties using `color-mix()` are silently dropped, causing: no accent glow, no scrollbar theming, transparent backgrounds where semi-opaque was intended, and invisible category titles (transparent background on transparent parent).
- The project does not document a browser baseline anywhere.
- The `color-mix()` calls in `:root` and `[data-theme="light"]` use `var()` references to other tokens — this is valid in modern browsers but was not supported in early `color-mix()` implementations.

**Recommendation:** Document the browser baseline in CLAUDE.md or a separate compatibility note. If older browser support is needed, provide fallback values:
```css
background: var(--bg-primary); /* fallback */
background: color-mix(in srgb, var(--bg-primary) 96%, transparent);
```

#### M6. Transition timing is inconsistent across the codebase — 27 transition declarations use 5 different durations

| Duration | Count | Easing | Used by |
|----------|-------|--------|---------|
| 0.1s | 3 | ease, ease-in | context menu, drag proxy |
| 0.15s | 12 | ease | buttons, handles, controls, toolbar, footer, auth-escape, upload |
| 0.2s | 8 | ease, cubic-bezier | cards, forms, modals, column-picker |
| 0.3s | 3 | ease | card ::before, icon filter, plus-icon |
| varies | 1 | 0.2s ease (container max-width) |

**Problems:**
- There's no explicit "fast" / "normal" / "slow" convention. The split between 0.15s and 0.2s appears arbitrary — buttons use 0.15s, form inputs use 0.2s, but both are "interactive controls."
- The bookmark card uses `transition: all 0.2s cubic-bezier(0.2, 0, 0, 1)` (line 499), which is the only custom easing curve in the file. Every other transition uses `ease`. The cubic-bezier creates a noticeably snappier motion that doesn't match adjacent elements.
- `transition: all` is used in 10 places (lines 257, 287, 346, 499, 595, 788, 824, 869, 976, 1054), which transitions *every* property including layout properties that shouldn't animate (e.g., `display`, `width` if changed by media queries).

**Recommendation:** Define transition tokens:
```css
--transition-fast: 0.1s ease;
--transition-normal: 0.15s ease;
--transition-slow: 0.3s ease;
```
Replace `transition: all` with explicit property lists (e.g., `transition: background var(--transition-normal), border-color var(--transition-normal), transform var(--transition-normal)`).

---

### LOW: Cleanup and Edge Cases

#### L1. `--shadow-lg` uses different formulas in dark vs light theme

```css
/* main.css:59 — :root (dark) */
--shadow-lg: 8px 8px 0 var(--bg-primary);

/* main.css:88 — [data-theme="light"] */
--shadow-lg: 8px 8px 0 rgba(0,0,0,0.02);
```

**Problems:**
- Dark theme `--shadow-lg` uses `var(--bg-primary)` (a solid color) while light theme uses `rgba(0,0,0,0.02)` (nearly invisible). This means `.modal-content` (which uses `box-shadow: var(--shadow-lg)`) has a strong shadow in dark mode and essentially no shadow in light mode.
- `--shadow-sm` and `--shadow-md` both use `rgba(0,0,0,0.8)` in dark and `rgba(0,0,0,0.05)` in light — at least they're consistent with each other. But `--shadow-lg` breaks the pattern by using a token reference in dark and a literal in light.

**Recommendation:** Make `--shadow-lg` follow the same `rgba()` pattern as the other shadows, or document the intentional difference.

#### L2. `.size-handle:hover` box-shadow uses hardcoded `rgba(0,0,0,0.1)` (`main.css:226`)

```css
/* main.css:225-227 */
.size-handle:hover {
    box-shadow: 0 0 0 4px rgba(0,0,0,0.1);
}
```

**Problems:**
- This hover ring is nearly invisible in dark mode (10% black on a near-black background) and very subtle in light mode. It may be intentionally subtle, but it's one of several one-off `rgba()` values that could be a token.

**Recommendation:** Minor — consider replacing with `0 0 0 4px var(--accent-glow)` for accent-tinted feedback, or leave as-is if the subtlety is intentional.

#### L3. Noise texture overlay at z-index 1000 collides with `.modal` z-index (`main.css:143, 680`)

```css
/* main.css:136-144 */
body::before {
    content: '';
    position: fixed;
    inset: 0;
    /* ... noise SVG ... */
    opacity: 0.03;
    pointer-events: none;
    z-index: 1000;
}

/* main.css:674-685 */
.modal {
    /* ... */
    z-index: 1000;
    /* ... */
}
```

**Problems:**
- Same z-index for two different layers. The noise renders on top of the modal due to DOM order (body::before comes before `.modal` in the rendering tree — actually, `::before` is a child of `body`, and `.modal` is also a child, so they compete). In practice the noise's 3% opacity makes it invisible, but this is a stacking context collision.

**Recommendation:** Move noise texture to a lower z-index (e.g., 500) that's above content but below modals. Or define it via the z-index scale recommended in M3.

#### L4. `!important` used 17 times — 11 are Clerk overrides, 6 are internal

Clerk overrides (justified — third-party styles require `!important`):
- Lines 1374-1377: Mobile Clerk avatar
- Lines 1733, 1737, 1742-1744: Clerk popover
- Lines 2134-2137, 2141: Desktop Clerk button

Internal uses:
- Line 1413: `.edit-btn, .delete-btn { display: none !important }` (mobile)
- Line 1650: `.drag-source-active { opacity: 0.3 !important }`
- Line 1818: `.tab.dragging-tab { background: transparent !important }`
- Line 2107: `.mobile-only { display: none !important }` (desktop)

**Problems:**
- The Clerk overrides are unavoidable. The internal uses are mostly for state overrides that need to win against inline styles or complex selectors.
- `.drag-source-active` using `!important` is necessary because card styles set `opacity` via transitions. But it means nothing can ever override this opacity — if a future state needs the source element at a different opacity during drag, it can't.

**Recommendation:** Low priority. The internal `!important` uses are acceptable state-override patterns. Document them with comments explaining why `!important` is necessary in each case.

#### L5. All six `@keyframes` animations are actively used — no dead animations

| Animation | Defined | Used by |
|-----------|---------|---------|
| `fadeSlide` | Line 410 | `.category` (407), `.tab-group` (1755) |
| `modalSlide` | Line 708 | `.modal-content` (704) |
| `modalSlideOut` | Line 715 | `.modal-content.dismissing` (723) |
| `spin` | Line 1211 | `.spinner` (1207) |
| `contextMenuIn` | Line 1571 | `.long-press-menu` (1568) |
| `dropIndicatorPulse` | Line 1747 | `.layout-drop-indicator` (1722) |

**No action needed.** All animations are in use. Noting for completeness.

#### L6. `DM Serif Display` font is loaded but never referenced in CSS

```html
<!-- index.html:22 -->
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

```css
/* main.css:31-32 */
--font-display: 'Outfit', Georgia, serif;
--font-body: 'Outfit', -apple-system, sans-serif;
```

**Problems:**
- `DM Serif Display` is loaded from Google Fonts but never used. Both `--font-display` and `--font-body` reference `Outfit` as primary. This is a wasted network request (~15-30KB of font data).

**Recommendation:** Remove `DM+Serif+Display:ital@0;1&` from the Google Fonts URL, or use it for `--font-display` if a serif display face was the original design intent.

#### L7. Media query breakpoints are mostly consistent but have a 1px gap at 768/769

| Breakpoint | Direction | Used at lines |
|------------|-----------|---------------|
| 1280px | max-width | 98 |
| 1040px | max-width | 105 |
| 768px | max-width | 731, 1274, 1880 |
| 769px | min-width | 2105 |
| 480px | max-width | 2306 |

**Problems:**
- The `768px`/`769px` pair for mobile/desktop is the standard pattern and works correctly — `max-width: 768px` and `min-width: 769px` are complementary with no gap.
- The `1280px` and `1040px` breakpoints only adjust header geometry variables (`--header-button-size`, `--size-zone-width`). They're not used for layout changes, so there's no gap issue.
- The `480px` breakpoint (small mobile) only has welcome-gate sizing rules. There are no intermediate breakpoints (e.g., tablet-landscape at 1024px) for the main grid layout — but the grid uses `auto-fill` with `minmax()`, so it's inherently responsive.

**Recommendation:** Low priority. The breakpoint system is adequate. Consider adding a tablet breakpoint only if specific layout issues emerge at 769-1040px.

#### L8. `--bar-height` is overridden by both JS and CSS media queries, creating a priority conflict

```css
/* main.css:43 — :root */
--bar-height: 44px;

/* main.css:1441-1443 — inside @media (max-width: 768px) */
:root {
    --bar-height: 22px;
}
```

```typescript
// preferences.ts:231
document.documentElement.style.setProperty('--bar-height', `${BARSCALE_PX[currentBarscale]}px`);

// preferences.ts:228 — mobile guard
if (window.matchMedia('(max-width: 768px)').matches) {
    document.documentElement.style.removeProperty('--bar-height');
    return;
}
```

**Problems:**
- On mobile: CSS media query sets `--bar-height: 22px` on `:root`, and `applyBarscaleToDOM()` removes the inline `--bar-height` to let CSS take over. This works correctly.
- On desktop: JS sets `--bar-height` as an inline style on `<html>`, which has higher specificity than the CSS `:root` rule. This also works correctly.
- The potential issue: if a user resizes from desktop to mobile width without reloading, the JS-set inline `--bar-height` (from barscale) will override the CSS media query's `22px` because inline styles beat stylesheet rules. The `applyBarscaleToDOM()` function does check `matchMedia` and removes the property on mobile — but it's only called on barscale change, not on window resize.

**Recommendation:** Add a `matchMedia` listener for the 768px breakpoint that calls `applyBarscaleToDOM()` on change, or use `resize` event debouncing. Low priority — most users don't resize their browser to cross the mobile breakpoint.

---

## Token System Map

### CSS Custom Properties — Complete Inventory

#### Color Tokens (`:root` / dark theme)

| Token | Value (dark) | Value (light) | Overridden? | Used by |
|-------|-------------|---------------|:-----------:|---------|
| `--bg-primary` | `#000c17` | `#fdf6e3` | Yes | Body bg, card shadows, cutout text, overlays |
| `--bg-secondary` | `#0a1621` | `#eee8d5` | Yes | Modal bg, settings bg, icon sections |
| `--bg-card` | `#101c27` | `#fdf6e3` | Yes | Bookmark cards, icon preview |
| `--bg-hover` | `#1a2631` | `#eee8d5` | Yes | Card hover, form label bg, ghost btn hover |
| `--text-primary` | `#fafafa` | `#586e75` | Yes | Body text, headings, form inputs |
| `--text-secondary` | `#888` | `#93a1a1` | Yes | Labels, descriptions, muted headings |
| `--text-muted` | `#555` | `#93a1a1` | Yes | Placeholder text, footer, plus icon |
| `--accent` | `#ff5206` | `#002b36` | Yes | Primary brand color (customizable per theme) |
| `--accent-dim` | `color-mix(--accent, black 20%)` | same formula | Implicit | Primary button hover, upgrade btn hover |
| `--accent-glow` | `color-mix(--accent, transparent 85%)` | same formula | Implicit | Focus rings, drop targets, card hover overlay |
| `--danger` | `#ff3b30` | *not overridden* | **NO** | Delete/danger buttons, error status |
| `--danger-dim` | `#cc2f26` | *not overridden* | **NO** | (Defined but unused in CSS — only in tokens) |
| `--border` | `#2a2a2a` | `#93a1a1` | Yes | General borders, form inputs |
| `--border-strong` | `var(--accent)` | `var(--accent)` | Implicit | Modal border, accent-highlight borders |
| `--scale-color` | `color-mix(bg-primary 80%, accent 20%)` | *not overridden* | **NO** | Size controller bg, button hover |
| `--scrollbar-track` | `var(--bg-primary)` | `var(--bg-primary)` | Implicit | Scrollbar track |
| `--scrollbar-thumb` | `color-mix(bg-primary 70%, white 30%)` | `color-mix(bg-primary 78%, black 22%)` | Yes | Scrollbar thumb |
| `--scrollbar-thumb-hover` | `color-mix(bg-primary 55%, white 45%)` | `color-mix(bg-primary 62%, black 38%)` | Yes | Scrollbar thumb hover |

#### Shadow Tokens

| Token | Value (dark) | Value (light) | Consistent? |
|-------|-------------|---------------|:-----------:|
| `--shadow-sm` | `4px 4px 0 rgba(0,0,0,0.8)` | `4px 4px 0 rgba(0,0,0,0.05)` | Yes |
| `--shadow-md` | `6px 6px 0 rgba(0,0,0,0.8)` | `6px 6px 0 rgba(0,0,0,0.05)` | Yes |
| `--shadow-lg` | `8px 8px 0 var(--bg-primary)` | `8px 8px 0 rgba(0,0,0,0.02)` | **NO** (different formula) |
| `--shadow-accent` | `4px 4px 0 var(--accent)` | *not overridden* | Implicit |

#### Typography Tokens

| Token | Value | Used by |
|-------|-------|---------|
| `--font-display` | `'Outfit', Georgia, serif` | Headings, category titles, tabs, modal headers |
| `--font-body` | `'Outfit', -apple-system, sans-serif` | Body text, buttons, form inputs |

#### Spacing Tokens

| Token | Value | Used by |
|-------|-------|---------|
| `--space-xs` | `4px` | Small gaps, padding |
| `--space-sm` | `8px` | Form padding, button padding |
| `--space-md` | `16px` | Grid gaps, section padding |
| `--space-lg` | `24px` | Category margins, modal padding |
| `--space-xl` | `40px` | Container padding, header margin |
| `--space-2xl` | `64px` | Category bottom margin, welcome gate spacing |

#### Layout Tokens

| Token | Value | Set by | Used by |
|-------|-------|--------|---------|
| `--header-cutout` | `2px` | CSS | Header gap spacing |
| `--header-button-size` | `32px` (desktop), `30px`/`28px` (responsive) | CSS | Action/clerk buttons |
| `--bar-height` | `44px` (desktop), `22px` (mobile) | CSS + JS (barscale) | Category headers, tab bars, handles |
| `--size-zone-width` | `200px` (desktop), responsive | CSS | Size controller width |
| `--header-height` | calc formula | CSS | Header, action buttons, clerk slot |
| `--clerk-column-width` | calc formula | CSS | Clerk slot |
| `--actions-column-width` | calc formula | CSS | Action buttons column |
| `--page-width` | `1600px` default, set by JS | JS (preferences.ts) | `.container` max-width |
| `--btn-size` | `20px` default, set by JS | JS (preferences.ts, categories.ts) | Edit/delete button size |

### Theme Toggle Mechanism

```
User clicks theme toggle
  -> theme.ts:toggleTheme()
    -> currentTheme flips ('dark' <-> 'light')
    -> applyThemeToDOM()
      -> document.documentElement.setAttribute('data-theme', currentTheme)
      -> Updates button icon ('sun' <-> 'moon')
      -> Reads accentColor_{theme} from localStorage
      -> If custom accent exists: sets --accent inline style
      -> If no custom accent: removes --accent inline (CSS default takes over)
    -> applyWireframeForCurrentTheme()
      -> Checks wireframe_{theme} state
      -> Sets/removes data-wireframe attribute
    -> localStorage.setItem('theme', currentTheme)
    -> syncToConvex() (debounced)
    -> pushUndo() for undo/redo support
```

### FOUC Prevention

```
Browser loads index.html
  -> <script src="/theme-init.js"> (synchronous, blocking)
    -> Reads theme from localStorage (defaults to 'dark')
    -> Sets data-theme attribute on <html>
    -> Reads accent color for current theme from localStorage
    -> If accent exists: sets --accent inline style
    -> Reads pageWidth from localStorage
    -> If pageWidth exists: sets --page-width inline style
  -> First paint occurs with correct theme
  -> main.ts loads (async module)
    -> Re-applies theme via theme.ts (redundant but safe)
    -> Subscribes to Convex for cross-device sync
```

### Wireframe Mode Mechanism

```
User toggles wireframe
  -> preferences.ts:toggleWireframe()
    -> Flips wireframe_{currentTheme} boolean
    -> Saves to localStorage (wireframe_dark / wireframe_light)
    -> applyWireframeToDOM()
      -> If active: document.documentElement.setAttribute('data-wireframe', '')
      -> If inactive: document.documentElement.removeAttribute('data-wireframe')
    -> syncToConvex() (debounced)
    -> pushUndo() for undo/redo support

CSS responds via [data-wireframe] selector:
  -> Fills become outlines (header, handles, footer)
  -> Accent backgrounds become transparent with accent borders
  -> Per-theme wireframe state preserved independently
```

---

## Recommended Overhaul Plan

### Phase 1: Bug fixes (immediate)

1. **Fix `font-weight: 0` bug** (C1)
   - Change `font-weight: 0` to `font-weight: 700` at lines 460 and 1784
   - Effort: 2 min, zero risk
   - Verify category titles and tab labels render bold

2. **Replace hardcoded `color: white` / `color: #fff`** (H2)
   - Lines 671, 1091, 1601: `color: white` -> `color: var(--bg-primary)`
   - Line 2303: `color: #fff` -> `color: var(--bg-primary)`
   - Effort: 5 min, zero risk

### Phase 2: Light theme completion (high value)

3. **Add missing light theme overrides** (H1)
   - Add `--danger`, `--danger-dim`, `--scale-color` to `[data-theme="light"]`
   - Effort: 10 min, low risk
   - Test: verify danger buttons and size controller look correct in light mode

4. **Introduce overlay tokens** (H3)
   - Define `--overlay-backdrop` and `--overlay-subtle` in both themes
   - Replace hardcoded `rgba(0,0,0,...)` on `.modal`, `.auth-overlay`, `.modal-close:hover`
   - Effort: 15 min, low risk

### Phase 3: Consistency cleanup (medium value)

5. **Remove `border-radius: 6px` from `.auth-escape-btn`** (M1)
   - Effort: 1 min, zero risk

6. **Replace `.settings-section:last-child` with a semantic class** (M2)
   - Add class in `app.ts`, update selectors in `main.css`
   - Effort: 10 min, zero risk

7. **Define z-index scale as tokens** (M3)
   - Add `--z-*` custom properties to `:root`
   - Replace all 15 hardcoded z-index values
   - Effort: 20 min, low risk (test stacking in all states: modal open, dragging, context menu, welcome gate)

8. **Remove unused `DM Serif Display` font** (L6)
   - Remove from `index.html` Google Fonts URL
   - Effort: 1 min, zero risk

### Phase 4: Wireframe mode completion (medium-high effort)

9. **Expand wireframe mode to cover remaining elements** (M4)
   - Add `[data-wireframe]` rules for: `.action-btn`, `.clerk-slot-btn`, `.bookmark-card`, `.category-header`, `.btn-primary`, `.modal-header`, `.tab-bar`, `.tab.tab-active`
   - Effort: 30-45 min, medium risk (test both themes x wireframe on/off = 4 visual states)

### Phase 5: Polish (lower priority)

10. **Define transition timing tokens** (M6)
    - Add `--transition-fast`, `--transition-normal`, `--transition-slow`
    - Replace explicit durations across 27 declarations
    - Replace `transition: all` with explicit property lists
    - Effort: 30 min, low risk

11. **Document `color-mix()` browser baseline** (M5)
    - Add a note in CLAUDE.md or a compatibility section
    - Effort: 5 min

12. **Add `resize` listener for barscale/mobile handoff** (L8)
    - Effort: 10 min, low risk

### What NOT to change

- **`!important` on Clerk overrides** — Required to override third-party widget styles. No alternative.
- **`!important` on drag/state classes** — These override inline styles and complex selectors by design.
- **`color-mix()` usage** — Modern function with good enough support for this app's audience. Adding fallbacks everywhere would double the code for marginal benefit.
- **Hardcoded `rgba(0,0,0,...)` in shadow tokens** — These are inside `:root` / `[data-theme="light"]` blocks, so they ARE the token values. No need to tokenize further.
- **`.spinner` border-radius: 50%** — Correct for a circular spinner.
- **`.modal-swipe-handle` border-radius: 2px** — Correct for a pill-shaped drag indicator.
- **`.card-drop-indicator` border-radius: 2px** — Correct for a rounded line indicator.
- **`nth-child` animation delays** (lines 417-421) — These are intentionally positional (stagger entrance based on DOM order). A class-based approach would require JS changes for minimal benefit.

---

## Summary

| Priority | Item | Files Affected | Effort |
|----------|------|----------------|--------|
| Critical | C1: Fix `font-weight: 0` | `main.css` (2 lines) | 2 min |
| High | H1: Complete light theme tokens | `main.css` (light block) | 10 min |
| High | H2: Replace hardcoded `white`/`#fff` | `main.css` (4 lines) | 5 min |
| High | H3: Introduce overlay tokens | `main.css` (3 rules + 2 tokens) | 15 min |
| Medium | M1: Remove `border-radius: 6px` | `main.css` (1 line) | 1 min |
| Medium | M2: Replace `:last-child` selector | `main.css` + `app.ts` | 10 min |
| Medium | M3: Z-index token scale | `main.css` (15 values) | 20 min |
| Medium | M4: Complete wireframe mode | `main.css` (~8-10 new rules) | 30-45 min |
| Medium | M5: Document `color-mix()` baseline | CLAUDE.md or docs | 5 min |
| Medium | M6: Transition timing tokens | `main.css` (27 declarations) | 30 min |
| Low | L1: `--shadow-lg` formula inconsistency | `main.css` (1 token) | 2 min |
| Low | L2: Size handle hover ring | `main.css` (1 line) | 1 min |
| Low | L3: Noise/modal z-index collision | `main.css` (1 line) | 1 min |
| Low | L6: Remove unused font | `index.html` (1 line) | 1 min |
| Low | L7: Media queries (no action needed) | — | — |
| Low | L8: Barscale resize listener | `preferences.ts` | 10 min |

Total estimated effort for phases 1-2 (bug fixes + light theme): ~30 minutes.
Phase 3 (consistency): ~30 minutes.
Phase 4 (wireframe completion): ~30-45 minutes.
Phase 5 (polish): ~45 minutes.
