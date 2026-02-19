# Accessibility Audit

Comprehensive audit of WCAG 2.1 compliance, keyboard navigation, screen reader support, and ARIA usage across Brute Bookmarks.
Conducted 2026-02-19.

---

## Executive Summary

The app has **no systematic accessibility layer**. It was built as a visual-first, pointer-driven bookmark manager and accessibility was not part of the initial architecture. The result is an app that is functionally unusable for keyboard-only users and screen reader users:

1. **Bookmark cards are `<div>` elements with click handlers** — no keyboard focus, no activation, no semantic link role. A keyboard user literally cannot open a bookmark.
2. **No focus management in modals** — focus is not trapped, not restored on close, and Tab can reach invisible elements behind the modal backdrop.
3. **No ARIA roles on tabbed interfaces** — tab groups use `role="button"` on tabs but have no `tablist`, `tab`, or `tabpanel` roles, no `aria-selected`, no arrow-key navigation.
4. **No skip navigation** — the header and toolbar have no skip link to jump to main content.
5. **Icon-only buttons lack accessible names** — the header SVG buttons (`wireframe-btn`, `barscale-btn`) have `title` attributes but no `aria-label`, and the mobile toolbar buttons rely on title alone.
6. **Form labels in the bookmark modal are not associated** — `<label>Name</label>` without `for` attribute on 6 form fields.

The settings modal is the one bright spot: its checkboxes all have proper `<label for="...">` associations. But the rest of the app needs a deliberate accessibility pass.

---

## Findings by Severity

### CRITICAL

#### C1. Bookmark cards are not keyboard-accessible

**Files:** `src/components/categories.ts` lines 94-105, `src/components/categories.ts` lines 131-146

Bookmark cards are rendered as `<div>` elements with no `tabindex`, no `role`, and no keyboard event handler. The only way to open a bookmark is via a click handler wired in JavaScript:

```typescript
// categories.ts:139-144 — click handler on card, no keyboard equivalent
card.addEventListener('click', (e) => {
  if (consumeLongPressGuard()) return;
  const target = e.target as HTMLElement;
  if (target.closest('[data-action]')) return;
  const url = card.dataset.url;
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
});
```

The card HTML (categories.ts:95-105):
```html
<div class="bookmark-card"
     data-bookmark-id="..."
     data-category-id="..."
     data-index="0"
     data-url="https://example.com">
  <button class="edit-btn" ...>✎</button>
  <button class="delete-btn" ...>×</button>
  <img class="bookmark-icon" src="..." alt="Google" draggable="false">
  <div class="bookmark-title">Google</div>
</div>
```

**Problems:**
- No `tabindex="0"` — cards are not in the tab order, keyboard users cannot reach them
- No `role="link"` or `<a>` wrapper — screen readers have no idea these are navigational elements
- No `aria-label` — the card's accessible name would be a concatenation of child text nodes ("Edit Delete Google Google"), which is nonsensical
- No `keydown` handler for Enter/Space activation — even if cards were focusable, pressing Enter would do nothing
- The edit and delete buttons inside cards have `pointer-events: none` by default (CSS) and are only revealed on mouse proximity hover — they are completely invisible to keyboard and screen reader users

**Recommendation:** Either wrap each card's content in an `<a href="..." target="_blank">` (semantic, gets keyboard support for free) or add `tabindex="0"`, `role="link"`, `aria-label="${bookmark.title}"`, and a `keydown` handler for Enter. The edit/delete buttons need an alternative activation path for keyboard users (e.g., a visible toolbar on focus, or a keyboard-triggered context menu).

#### C2. Modal focus is not trapped

**Files:** `src/components/modals/bookmark-modal.ts` lines 186-219, `src/components/modals/category-modal.ts` lines 113-134, `src/components/modals/settings-modal.ts` lines 388-490, `src/components/modals/confirm-modal.ts` lines 84-156

All five modals (bookmark, category, settings, help, confirm) are opened by adding the `active` CSS class. None of them implement focus trapping. A keyboard user who opens a modal can Tab through the modal's elements, then continue tabbing into the page behind the opaque backdrop.

```typescript
// bookmark-modal.ts:83 — modal opens with no focus management
document.getElementById('bookmark-modal')!.classList.add('active');
```

```typescript
// confirm-modal.ts:46 — confirm modal does focus the OK button (good), but has no trap
els.confirmBtn.focus();
```

**Problems:**
- No focus trap — Tab/Shift+Tab cycle out of the modal into invisible background content
- No focus set on modal open (except confirm modal which focuses the OK button)
- No focus restoration on close — when a modal closes, focus goes to `<body>` instead of returning to the element that triggered the modal
- `Escape` key is handled globally in `main.ts:170-181` for most modals, and locally in `confirm-modal.ts:123-129` — the global handler does not prevent the event from propagating, so pressing Escape may trigger other side effects

**Recommendation:** Implement a shared `trapFocus(modalElement)` utility that: (1) saves the previously focused element, (2) moves focus to the first focusable element in the modal, (3) intercepts Tab/Shift+Tab to cycle within the modal, (4) restores focus to the saved element on close.

#### C3. No skip navigation link

**Files:** `index.html` lines 31-33, `src/app.ts` lines 5-56

The page structure is: `<div id="app">` containing a header with multiple interactive controls, then the categories container with all bookmark content. There is no skip navigation link.

```html
<!-- index.html:31-33 -->
<body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
</body>
```

```html
<!-- app.ts:24-48 — header comes first with many controls -->
<div class="container">
  <header class="brute-header">
    <!-- title, wireframe btn, barscale btn, avatar, size controller, add/theme/settings buttons -->
  </header>
  <div id="categories-container">
    <!-- Categories will be rendered here -->
  </div>
```

**Problems:**
- Keyboard users must tab through the entire header (7+ interactive elements on desktop) to reach any bookmark content
- On mobile, the header is simpler but the mobile toolbar at the bottom adds another 5 buttons to the tab order
- There is no landmark (`<main>`, `<nav>`) to help screen reader users jump to content

**Recommendation:** Add a visually-hidden skip link as the first child of `<body>`: `<a href="#categories-container" class="skip-nav">Skip to bookmarks</a>`. Also wrap the header in `<nav>` and the categories container in `<main>`.

### HIGH

#### H1. Tab groups have no ARIA tablist/tab/tabpanel semantics

**Files:** `src/components/categories.ts` lines 270-284 (mobile tabs), lines 404-436 (desktop tabs)

Tab groups render tabs as `<div>` elements with `role="button"` and `tabindex="0"`, but the container has no `role="tablist"`, the tabs have no `role="tab"` or `aria-selected`, and the panels have no `role="tabpanel"` or `aria-labelledby`.

```html
<!-- categories.ts:274-280 — tab rendered as role="button" -->
<div class="tab tab-active"
     role="button"
     tabindex="0"
     data-tab-category-id="cat1"
     data-group-id="group1">
  Work
</div>
```

```html
<!-- categories.ts:298-301 — panel with no role -->
<div class="tab-panel tab-panel-active"
     data-tab-panel-id="cat1">
  <!-- bookmarks grid -->
</div>
```

**Problems:**
- `role="button"` on tabs tells screen readers "this is a button" — it should be `role="tab"` inside a `role="tablist"` container
- No `aria-selected="true"` / `aria-selected="false"` to communicate active tab state
- No `role="tabpanel"` on content panels, no `aria-labelledby` linking panel to its tab
- Tab switching is via click only (categories.ts:448-449) — no arrow-key navigation, which is the expected interaction pattern for `role="tablist"` (WCAG pattern: left/right arrow keys cycle tabs)
- Keyboard users can focus tabs (they have `tabindex="0"`) but pressing Enter/Space does nothing — there is no `keydown` handler for keyboard activation

**Recommendation:** Restructure the tab markup:
- Tab bar container: `role="tablist"`
- Each tab: `role="tab"`, `aria-selected="true|false"`, `id="tab-{catId}"`
- Each panel: `role="tabpanel"`, `aria-labelledby="tab-{catId}"`
- Add `keydown` handler: ArrowLeft/ArrowRight to switch tabs, Enter/Space to activate
- Only the active tab should have `tabindex="0"`; inactive tabs should have `tabindex="-1"` (roving tabindex pattern)

#### H2. Form labels not associated with inputs (bookmark modal)

**Files:** `src/app.ts` lines 75-85

The bookmark modal's form fields use `<label>` without `for` attributes, and the inputs are not nested inside the labels:

```html
<!-- app.ts:75-82 — label not associated with input -->
<div class="form-group-inline">
  <label>Name</label>
  <input type="text" id="bookmark-title" required placeholder="Google, YouTube, GitHub...">
</div>
<div class="form-group-inline">
  <label>URL</label>
  <input type="url" id="bookmark-url" required placeholder="https://example.com">
</div>
<div class="form-group-inline">
  <label>Category</label>
  <select id="bookmark-category-select"></select>
</div>
```

Similarly in the category modal (app.ts:150-157):
```html
<div class="form-group">
  <label>Category Name</label>
  <input type="text" id="category-name" required placeholder="Work, Social, Tools...">
</div>
<div class="form-group hidden" id="category-group-section">
  <label>Tab Group</label>
  <select id="category-group-select">
```

And the "Columns" label in settings (app.ts:202):
```html
<label>Columns</label>
<div class="column-picker">
```

**Problems:**
- Screen readers will not announce the label when the input is focused — the user hears "edit text" with no context
- Clicking the label text does not focus the associated input (minor UX issue, but standard behavior users expect)
- 6 form fields affected: bookmark name, URL, category select, category name, tab group select, columns picker

**Recommendation:** Add `for` attributes matching input IDs: `<label for="bookmark-title">Name</label>`, `<label for="bookmark-url">URL</label>`, `<label for="bookmark-category-select">Category</label>`, `<label for="category-name">Category Name</label>`, `<label for="category-group-select">Tab Group</label>`. For the "Columns" label (which controls a group of buttons, not a single input), use `id="columns-label"` on the label and `aria-labelledby="columns-label"` on the column picker container with `role="radiogroup"`.

#### H3. Icon-only buttons lack accessible names

**Files:** `src/app.ts` lines 31-33, 39-41, 59-63

Several buttons use only an SVG icon or a Unicode symbol character as their visible content, with `title` as the only accessible name source:

```html
<!-- app.ts:31 — wireframe button: SVG only, title but no aria-label -->
<button class="clerk-slot-btn" id="wireframe-btn" title="Toggle Wireframe">
  <svg viewBox="0 0 512 512" ...>...</svg>
</button>

<!-- app.ts:32 — barscale button: SVG only -->
<button class="clerk-slot-btn" id="barscale-btn" title="Cycle Bar Scale">
  <svg viewBox="0 0 512 512" ...>...</svg>
</button>

<!-- app.ts:39 — add category: "+" character -->
<button class="action-btn" id="add-category-btn" title="Add Category">+</button>

<!-- app.ts:40 — theme toggle: sun symbol -->
<button class="action-btn" id="theme-toggle-btn" title="Toggle Theme">☀</button>

<!-- app.ts:41 — settings: gear symbol -->
<button class="action-btn" id="settings-btn" title="Settings">⚙</button>
```

Mobile toolbar buttons (app.ts:59-63):
```html
<button class="mobile-toolbar-btn" id="mobile-add-btn" title="Add Category">+</button>
<button class="mobile-toolbar-btn" id="mobile-theme-btn" title="Toggle Theme">☀</button>
<!-- ... -->
<button class="mobile-toolbar-btn" id="mobile-settings-btn" title="Settings">⚙</button>
```

Category edit buttons (categories.ts:245):
```html
<button class="category-edit-btn" data-category-id="..." title="Edit category">✎</button>
```

Bookmark edit/delete buttons (categories.ts:101-102):
```html
<button class="edit-btn" data-action="edit-bookmark" ...>✎</button>
<button class="delete-btn" data-action="delete-bookmark" ...>×</button>
```

**Problems:**
- `title` is not reliably announced by screen readers — many screen readers ignore it, and it requires mouse hover to appear visually
- The SVG buttons (`wireframe-btn`, `barscale-btn`) have no text content at all; a screen reader may announce them as "button" with no further context
- The Unicode symbol buttons (`+`, `☀`, `⚙`, `✎`, `×`) will be read literally: "plus button", "black sun with rays button", "gear button", "lower left pencil button", "multiplication sign button" — confusing and inconsistent
- The edit and delete buttons on bookmark cards have no `aria-label` and no `title`

**Recommendation:** Add `aria-label` to every icon-only button: `aria-label="Add Category"`, `aria-label="Toggle Theme"`, `aria-label="Settings"`, `aria-label="Toggle Wireframe"`, `aria-label="Cycle Bar Scale"`. For bookmark-level edit/delete buttons, include the bookmark name: `aria-label="Edit ${bookmark.title}"`, `aria-label="Delete ${bookmark.title}"`.

#### H4. Edit and delete buttons are invisible to keyboard users

**Files:** `src/styles/main.css` lines 611-671, `src/components/bookmark-card.ts` lines 4-30

The edit and delete buttons on bookmark cards are hidden by default (`opacity: 0; pointer-events: none`) and only revealed via a proximity-hover JavaScript effect that tracks mouse position:

```css
/* main.css:611-629 */
.edit-btn {
    position: absolute;
    top: 4px;
    left: 4px;
    opacity: 0;
    pointer-events: none;
}

.bookmark-card .edit-btn.visible {
    opacity: 1;
    pointer-events: auto;
}
```

```typescript
// bookmark-card.ts:4-30 — proximity hover reveals buttons on mouse/pen only
export function handleCardPointerMove(e: PointerEvent): void {
  if (e.pointerType === 'touch') return;
  const card = e.currentTarget as HTMLElement;
  // ... distance calculation ...
  editBtn.classList.toggle('visible', Math.sqrt(dx * dx + dy * dy) <= proximityRadius);
}
```

**Problems:**
- Keyboard users cannot reveal these buttons — there is no `:focus-within` fallback, no keyboard shortcut, no alternative path
- The buttons have `pointer-events: none` when hidden, so even if a keyboard user somehow focused one, they could not activate it
- The only keyboard alternative is the long-press context menu, which is touch-only (initiated by pointer events with touch detection)
- Screen reader users cannot discover or interact with these buttons at all (they are display-present but pointer-events-disabled, which varies in behavior across screen readers)

**Recommendation:** Add a CSS rule `.bookmark-card:focus-within .edit-btn, .bookmark-card:focus-within .delete-btn { opacity: 1; pointer-events: auto; }` so that when a card receives keyboard focus, its action buttons become visible. Also consider making the buttons tabbable only when the card is focused (add `tabindex="-1"` to buttons, set to `0` on card focus).

### MEDIUM

#### M1. No `<main>` landmark for categories content

**Files:** `src/app.ts` lines 24-55

The page structure has no ARIA landmarks. The categories container is a plain `<div>`:

```html
<!-- app.ts:24 -->
<div class="container">
  <header class="brute-header">...</header>
  <div id="categories-container">
    <!-- Categories will be rendered here -->
  </div>
  <footer>...</footer>
</div>
```

**Problems:**
- Screen reader users cannot use landmark navigation (a common shortcut) to jump between header, main content, and footer
- The `<header>` element is a semantic landmark, and `<footer>` is too, but the main content area between them has no landmark role
- This makes it slow and frustrating for assistive technology users to navigate the page structure

**Recommendation:** Wrap the categories container in `<main>`: `<main id="categories-container">`. Keep the existing `<header>` and `<footer>` elements. This gives screen readers three clear landmarks to navigate between.

#### M2. No `aria-live` region for dynamic content updates

**Files:** `src/components/categories.ts` lines 464-510, `src/components/modals/confirm-modal.ts` lines 37-66

When bookmarks are added, deleted, or reordered, the entire categories container is re-rendered. When operations complete, styled alerts are shown. None of these changes are announced to screen readers:

```typescript
// categories.ts:464-466 — full re-render replaces all content silently
export function renderCategories(): void {
  const container = document.getElementById('categories-container')!;
  container.innerHTML = '';
```

```typescript
// confirm-modal.ts:53-65 — styledAlert shows message, but not as a live region
export function styledAlert(message: string, title = 'Notice'): Promise<void> {
  const els = getElements();
  els.title.textContent = title;
  els.message.textContent = message;
  // ...
  els.modal.classList.add('active');
```

**Problems:**
- When a bookmark is added/deleted, screen readers do not announce the change — the content silently mutates
- Success/error messages (like "Updated favicons for 3 bookmarks") are shown in the confirm modal, but the modal has no `role="alertdialog"` or `aria-live` attribute
- The empty state ("No categories yet") appears/disappears without announcement

**Recommendation:** Add `role="alertdialog"` and `aria-modal="true"` to the confirm modal. Add an `aria-live="polite"` region for status messages (import complete, favicon update count, etc.). Consider `aria-live="assertive"` for destructive confirmations.

#### M3. Modal close buttons lack accessible names

**Files:** `src/app.ts` lines 71, 146, 179, 241, 301

All modal close buttons use the `×` character with no accessible name:

```html
<!-- app.ts:71 — bookmark modal close -->
<button class="modal-close" id="bookmark-modal-close">×</button>

<!-- app.ts:146 — category modal close -->
<button class="modal-close" id="category-modal-close">×</button>

<!-- app.ts:179 — settings modal close -->
<button class="modal-close" id="settings-modal-close">×</button>

<!-- app.ts:241 — help modal close -->
<button class="modal-close" id="help-modal-close">×</button>

<!-- app.ts:301 — confirm modal close -->
<button class="modal-close" id="confirm-modal-close">×</button>
```

**Problems:**
- Screen readers will announce these as "multiplication sign button" or "times button" — not "close"
- No `aria-label="Close"` or `aria-label="Close dialog"` is present

**Recommendation:** Add `aria-label="Close"` to every `.modal-close` button.

#### M4. Modals lack `role="dialog"` and `aria-modal`

**Files:** `src/app.ts` lines 67, 142, 175, 238, 297

All five modal containers are plain `<div>` elements:

```html
<!-- app.ts:67 -->
<div id="bookmark-modal" class="modal">
<!-- app.ts:142 -->
<div id="category-modal" class="modal">
<!-- app.ts:175 -->
<div id="settings-modal" class="modal">
<!-- app.ts:238 -->
<div id="help-modal" class="modal">
<!-- app.ts:297 -->
<div id="confirm-modal" class="modal">
```

**Problems:**
- Screen readers do not know these are dialogs — they are just div elements that become visible
- No `role="dialog"` or `role="alertdialog"` — assistive technology cannot identify the purpose
- No `aria-modal="true"` — screen readers may allow navigation to background content
- No `aria-labelledby` linking the dialog to its title heading

**Recommendation:** Add to each modal: `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` pointing to the modal's `<h2>` title element. For the confirm modal, use `role="alertdialog"` instead.

#### M5. No focus styles for interactive elements

**Files:** `src/styles/main.css` lines 827-831, 873-877

The CSS removes the default `outline` on form inputs when focused:

```css
/* main.css:827-832 */
.form-group input:focus,
.form-group select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-glow);
}

/* main.css:873-877 */
.form-group-inline input:focus,
.form-group-inline select:focus {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--accent);
}
```

Form inputs have a custom focus style (border-color change + box-shadow), which is acceptable. However, **no other interactive elements have any focus style**: buttons (`.action-btn`, `.clerk-slot-btn`, `.modal-close`, `.modal-btn`, `.category-edit-btn`), bookmark cards, tabs, the size controller handle — none have `:focus` or `:focus-visible` CSS rules.

**Problems:**
- There is no `:focus-visible` rule anywhere in the stylesheet
- Keyboard users cannot see which element is currently focused — buttons, tabs, and cards all look identical when focused vs. unfocused
- This makes keyboard navigation effectively impossible even for sighted keyboard users
- The browser default focus ring may show on some elements but is inconsistent across browsers and may be overridden by `outline: none` on the global `*` reset (though the current reset at line 114 does not explicitly suppress outline)

**Recommendation:** Add a global `:focus-visible` rule for keyboard-triggered focus:
```css
:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
}
```
Then add component-specific overrides where the default ring doesn't work visually (e.g., inset rings on cards).

#### M6. Color contrast concerns in light theme

**Files:** `src/styles/main.css` lines 69-95

The light theme uses Solarized-inspired colors:

```css
/* main.css:69-95 */
[data-theme="light"] {
    --text-primary: #586e75;   /* Base01 */
    --text-secondary: #93a1a1; /* Base1 */
    --text-muted: #93a1a1;     /* Base1 */
    --bg-primary: #fdf6e3;     /* Base3 */
    --bg-card: #fdf6e3;        /* Base3 */
}
```

**Problems:**
- `--text-secondary` (#93a1a1) on `--bg-primary` (#fdf6e3): contrast ratio is approximately 3.5:1, which fails WCAG AA for normal text (requires 4.5:1). This color is used for form labels, secondary text, and muted UI elements.
- `--text-muted` is the same value (#93a1a1) — also fails AA for any text below 18pt/14pt bold
- Category edit button opacity starts at 0 and only appears on hover — not a contrast issue per se, but an interactive element that is completely invisible without hover

**Recommendation:** Darken `--text-secondary` and `--text-muted` in light mode to at least #657b83 (Solarized Base00, which gives ~4.9:1 ratio against Base3). Alternatively, audit each usage and ensure large text (18pt+) uses the current value while body text uses a darker variant.

### LOW

#### L1. Heading hierarchy has gaps

**Files:** `src/app.ts` lines 9, 27, 70, 89, 145, 178, 184, 218, 224, 241, 246, 300

The page has two `<h1>` elements (welcome gate and header) and jumps from `<h1>` to `<h3>` inside modals:

```
h1 — "Brute Bookmarks" (welcome gate, line 9)
h1 — "BruteBookmarks" (header, line 27)
  h2 — "Add Bookmark" (bookmark modal, line 70)
    h3 — "Current icon" (icon section, line 89)
  h2 — "New Category" (category modal, line 145)
  h2 — "Settings" (settings modal, line 178)
    h3 — "Display" (line 184)
    h3 — "Info" (line 218)
    h3 — "Bookmarks" (line 224)
  h2 — "Feature Overview" (help modal, line 241)
    h3 — "Bookmarks" (line 246)
    h3 — "Categories" / "Appearance" / "Data" / "Keyboard Shortcuts"
  h2 — "Confirm" (confirm modal, line 300)
```

**Problems:**
- Two `<h1>` elements on the same page — screen reader users expect one `<h1>` that describes the page
- Category names are rendered as plain `<div class="category-title">` (categories.ts:241-243) — they should be headings for their content sections, but there is no heading level for them
- The heading structure within modals is clean (h2 > h3), but the main page content has no heading hierarchy at all

**Recommendation:** Keep one `<h1>` for the brand. Render category names as `<h2>` or `<h3>` elements. Use `aria-level` if visual heading levels need to differ from semantic levels.

#### L2. The "Add" bookmark card is a div, not a button

**Files:** `src/components/categories.ts` lines 109-112

The "add bookmark" card is rendered as a `<div>` with a data attribute for click delegation:

```html
<!-- categories.ts:109-112 -->
<div class="bookmark-card add-bookmark"
     data-action="add-bookmark"
     data-category-id="...">
  <div class="plus-icon">+</div>
  <div class="add-bookmark-text">Add</div>
</div>
```

**Problems:**
- No `tabindex`, no `role="button"`, no keyboard handler — cannot be activated via keyboard
- A `<button>` element would be semantically correct and get keyboard support for free
- Screen readers do not announce this as interactive

**Recommendation:** Change to `<button class="bookmark-card add-bookmark" ...>` or add `role="button"` + `tabindex="0"` + `aria-label="Add bookmark to ${category.name}"`.

#### L3. Drag handle text is decorative but exposed to screen readers

**Files:** `src/components/categories.ts` lines 239, 288

Drag handles use the Braille Pattern Dots character:

```html
<!-- categories.ts:239 -->
<div class="category-drag-handle" title="Drag to reorder">⠿</div>
```

**Problems:**
- Screen readers will announce "Braille Pattern Dots-123456" — meaningless to the user
- The handle is not keyboard-accessible (no tabindex, no role)
- The `title` attribute is the only hint of purpose, but it is not reliable

**Recommendation:** Add `aria-hidden="true"` to the handle text and provide an `aria-label="Reorder"` on the handle element. For keyboard reorder support, this would need a keyboard-accessible alternative (e.g., move-up/move-down buttons or Ctrl+Arrow shortcuts), but that is a larger feature.

#### L4. Hidden file input for icon upload has no accessible label

**Files:** `src/app.ts` line 126

```html
<!-- app.ts:126 -->
<input type="file" id="custom-icon-input" accept="image/*" style="display:none">
```

**Problems:**
- The input is hidden and triggered programmatically, so it is not directly accessed by keyboard users
- However, when the file dialog is opened, screen readers may announce the input without context
- No `aria-label` or associated `<label>` element

**Recommendation:** Add `aria-label="Upload custom icon"` to the hidden file input.

#### L5. Mobile avatar button is a `<div>`, not a `<button>`

**Files:** `src/app.ts` line 61, `src/main.ts` lines 205-216

```html
<!-- app.ts:61 -->
<div class="mobile-toolbar-btn" id="mobile-avatar-btn">
  <svg class="default-avatar-overlay" viewBox="0 0 512 512" aria-hidden="true">...</svg>
</div>
```

```typescript
// main.ts:205-216 — click handler added dynamically, cursor set via JS
function wireAvatarSignIn(): void {
  for (const id of ['clerk-user-button', 'mobile-avatar-btn']) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => { ... });
  }
}
```

**Problems:**
- The mobile avatar is a `<div>`, not a `<button>` — not keyboard-focusable, not announced as interactive
- The desktop avatar container (`clerk-user-button`, app.ts:33) is also a `<div>`
- Both have `aria-hidden="true"` on the SVG but no accessible name on the container
- The cursor is set via JavaScript rather than CSS, and only when in local mode

**Recommendation:** Change both avatar containers to `<button>` elements with `aria-label="User account"` or `aria-label="Sign in"` depending on state.

#### L6. Icon search results have no keyboard selection

**Files:** `src/components/icon-picker.ts` lines 202-209, 271-278

Icon search results (Wikimedia and emoji) are rendered as `<div>` elements with click handlers:

```typescript
// icon-picker.ts:202-209
resultsEl.querySelectorAll('.icon-result').forEach((el) => {
  el.addEventListener('click', () => {
    const thumbUrl = (el as HTMLElement).dataset.iconUrl!;
    // ...
    selectWikimediaIcon(thumbUrl, title, index);
  });
});
```

**Problems:**
- Icon results have no `tabindex`, `role`, or keyboard handler
- A keyboard user in the bookmark modal cannot select an icon from search results
- No `aria-label` on results — screen readers would announce the `<img>` alt text but not indicate the item is selectable

**Recommendation:** Add `role="option"` to each result, `role="listbox"` on the container, `tabindex="0"` on results, and `keydown` handlers for Enter to select and Arrow keys to navigate.

---

## Summary

| Priority | Item | Files Affected | Effort |
|----------|------|----------------|--------|
| Critical | C1: Bookmark cards not keyboard-accessible | `categories.ts` | 30 min |
| Critical | C2: No modal focus trapping | 4 modal files + new utility | 1-2 hrs |
| Critical | C3: No skip navigation link | `app.ts`, `main.css` | 10 min |
| High | H1: Tab groups missing ARIA tablist semantics | `categories.ts` | 1 hr |
| High | H2: Form labels not associated with inputs | `app.ts` | 10 min |
| High | H3: Icon-only buttons lack accessible names | `app.ts`, `categories.ts` | 15 min |
| High | H4: Edit/delete buttons invisible to keyboard | `main.css`, `bookmark-card.ts` | 30 min |
| Medium | M1: No `<main>` landmark | `app.ts` | 5 min |
| Medium | M2: No `aria-live` for dynamic updates | `categories.ts`, `confirm-modal.ts` | 30 min |
| Medium | M3: Modal close buttons lack accessible names | `app.ts` | 5 min |
| Medium | M4: Modals lack `role="dialog"` and `aria-modal` | `app.ts` | 10 min |
| Medium | M5: No focus styles for interactive elements | `main.css` | 20 min |
| Medium | M6: Light theme text contrast below AA | `main.css` | 10 min |
| Low | L1: Heading hierarchy gaps | `app.ts`, `categories.ts` | 15 min |
| Low | L2: Add-bookmark card is a div | `categories.ts` | 10 min |
| Low | L3: Drag handle text exposed to screen readers | `categories.ts` | 5 min |
| Low | L4: Hidden file input has no label | `app.ts` | 2 min |
| Low | L5: Avatar buttons are divs | `app.ts`, `main.ts` | 10 min |
| Low | L6: Icon search results not keyboard-navigable | `icon-picker.ts` | 30 min |

Total estimated effort for Critical + High items (minimum viable accessibility): ~3-4 hours.
Medium items (solid WCAG AA compliance): additional ~1.5 hours.
Low items (polish): additional ~1 hour.
