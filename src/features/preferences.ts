import type { UserPreferences } from '../types';
import { savePreferencesToConvex, flushPreferencesToConvex } from '../data/store';
import { getCurrentTheme, getAccentColorDark, getAccentColorLight } from './theme';
import { pushUndo, isUndoing } from './undo';

let currentCardSize = Math.max(60, Math.min(120, parseInt(localStorage.getItem('cardSize') || '90') || 90));
let currentPageWidth = Math.max(50, Math.min(100, parseInt(localStorage.getItem('pageWidth') || '100') || 100));
let showCardNames = localStorage.getItem('showCardNames') !== 'false';
let autofillUrl = localStorage.getItem('autofillUrl') === 'true';
let easterEggs = localStorage.getItem('easterEggs') !== 'false'; // default on
let showNameOnHover = localStorage.getItem('showNameOnHover') !== 'false'; // default on

// Barscale & wireframe — localStorage only, no Convex sync
type BarscaleSize = 'S' | 'M' | 'L';
const BARSCALE_PX: Record<BarscaleSize, number> = { S: 31, M: 37, L: 44 };
const BARSCALE_CYCLE: BarscaleSize[] = ['S', 'M', 'L'];
let currentBarscale: BarscaleSize = (localStorage.getItem('barscale') as BarscaleSize) || 'L';
// Wireframe per theme — migrate legacy single key on first load
let wireframeDark = localStorage.getItem('wireframe_dark') === 'true'
  || (localStorage.getItem('wireframe_dark') === null && localStorage.getItem('wireframe') === 'true');
let wireframeLight = localStorage.getItem('wireframe_light') === 'true';
// Clean up legacy key
if (localStorage.getItem('wireframe') !== null) {
  localStorage.setItem('wireframe_dark', String(wireframeDark));
  localStorage.setItem('wireframe_light', String(wireframeLight));
  localStorage.removeItem('wireframe');
}

function getCurrentWireframe(): boolean {
  const theme = getCurrentTheme();
  return theme === 'dark' ? wireframeDark : wireframeLight;
}

export function getCardSize(): number {
  return currentCardSize;
}

export function getPageWidth(): number {
  return currentPageWidth;
}

export function getShowCardNames(): boolean {
  return showCardNames;
}

export function getAutofillUrl(): boolean {
  return autofillUrl;
}

export function getEasterEggs(): boolean {
  return easterEggs;
}

export function getShowNameOnHover(): boolean {
  return showNameOnHover;
}

export function toggleShowNameOnHover(enabled: boolean): void {
  showNameOnHover = enabled;
  localStorage.setItem('showNameOnHover', String(showNameOnHover));
}

export function toggleEasterEggs(enabled: boolean): void {
  easterEggs = enabled;
  localStorage.setItem('easterEggs', String(easterEggs));
}

/** Collect all current preferences into one object (used by savePreferencesToConvex). */
export function collectPreferences(): UserPreferences {
  return {
    theme: getCurrentTheme() as 'dark' | 'light',
    accentColorDark: getAccentColorDark(),
    accentColorLight: getAccentColorLight(),
    wireframeDark,
    wireframeLight,
    cardSize: currentCardSize,
    pageWidth: currentPageWidth,
    showCardNames,
    autofillUrl,
  };
}

function syncToConvex(): void {
  savePreferencesToConvex(collectPreferences);
}

/** Flush any pending debounced preference save immediately. */
export function flushSyncToConvex(): void {
  flushPreferencesToConvex(collectPreferences);
}

export function updateCardSize(size: number): void {
  currentCardSize = size;
  applyCardSizeToDOM();
  localStorage.setItem('cardSize', String(currentCardSize));
  syncToConvex();
}

export function updatePageWidth(width: number): void {
  currentPageWidth = width;
  applyPageWidthToDOM();
  localStorage.setItem('pageWidth', String(currentPageWidth));
  syncToConvex();
}

export function toggleCardNames(show: boolean, renderCallback: () => void): void {
  const old = showCardNames;
  showCardNames = show;
  localStorage.setItem('showCardNames', String(showCardNames));
  renderCallback();
  syncToConvex();
  if (!isUndoing()) {
    pushUndo({
      undo: () => toggleCardNames(old, renderCallback),
      redo: () => toggleCardNames(show, renderCallback),
    });
  }
}

export function toggleAutofillUrl(enabled: boolean): void {
  autofillUrl = enabled;
  localStorage.setItem('autofillUrl', String(autofillUrl));
  syncToConvex();
}

/** Apply preferences from Convex subscription — updates state + DOM + localStorage, no save back. */
export function applyPreferences(prefs: UserPreferences, renderCallback: () => void): void {
  const cardChanged = currentCardSize !== prefs.cardSize;
  const widthChanged = currentPageWidth !== prefs.pageWidth;
  const namesChanged = showCardNames !== prefs.showCardNames;
  const wireframeChanged = wireframeDark !== prefs.wireframeDark || wireframeLight !== prefs.wireframeLight;

  currentCardSize = prefs.cardSize;
  currentPageWidth = prefs.pageWidth;
  showCardNames = prefs.showCardNames;
  autofillUrl = prefs.autofillUrl;
  wireframeDark = prefs.wireframeDark;
  wireframeLight = prefs.wireframeLight;

  localStorage.setItem('cardSize', String(currentCardSize));
  localStorage.setItem('pageWidth', String(currentPageWidth));
  localStorage.setItem('showCardNames', String(showCardNames));
  localStorage.setItem('autofillUrl', String(autofillUrl));
  localStorage.setItem('wireframe_dark', String(wireframeDark));
  localStorage.setItem('wireframe_light', String(wireframeLight));

  if (cardChanged) applyCardSizeToDOM();
  if (widthChanged) applyPageWidthToDOM();
  if (wireframeChanged) applyWireframeToDOM();
  if (namesChanged) renderCallback();

  syncPreferencesUI();
}

export function getCardGap(size: number): number {
  const t = (size - 60) / 60;
  return Math.round(8 + t * 16);
}

/** Button size scales with card size (same pattern as .bookmark-icon). */
export function getBtnSize(cardSize: number): number {
  return Math.round(Math.min(28, Math.max(18, cardSize * 0.25)));
}

function applyCardSizeToDOM(): void {
  const mobile = window.matchMedia('(max-width: 768px)').matches;
  const btnSize = getBtnSize(currentCardSize);

  document.querySelectorAll<HTMLElement>('.bookmarks-grid').forEach((grid) => {
    if (mobile) {
      // Let CSS handle the 5-column mobile layout
      grid.style.gridTemplateColumns = '';
      grid.style.gap = '';
    } else {
      const gap = getCardGap(currentCardSize);
      grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${currentCardSize}px, 1fr))`;
      grid.style.gap = `${gap}px`;
    }
    grid.style.setProperty('--btn-size', `${btnSize}px`);
  });
}

function applyPageWidthToDOM(): void {
  document.documentElement.style.setProperty('--page-width', `${800 + (currentPageWidth / 100) * 800}px`);
}

export function syncPreferencesUI(): void {
  const checkbox = document.getElementById('show-card-names') as HTMLInputElement | null;
  if (checkbox) checkbox.checked = showCardNames;
  const autofillCheckbox = document.getElementById('autofill-url') as HTMLInputElement | null;
  if (autofillCheckbox) autofillCheckbox.checked = autofillUrl;
  const easterEggsCheckbox = document.getElementById('easter-eggs') as HTMLInputElement | null;
  if (easterEggsCheckbox) easterEggsCheckbox.checked = easterEggs;
  const hoverCheckbox = document.getElementById('show-name-on-hover') as HTMLInputElement | null;
  if (hoverCheckbox) hoverCheckbox.checked = showNameOnHover;
}

// --- Randomize XY (size controller) ---

export function randomizeXY(): void {
  const newCardSize = Math.round(60 + Math.random() * 60);   // 60–120
  const newPageWidth = Math.round(50 + Math.random() * 50);  // 50–100
  updateCardSize(newCardSize);
  updatePageWidth(newPageWidth);
  // Refresh the size controller handle position
  (window as any).__refreshSizeHandle?.();
}

// --- Barscale ---

export function getBarscale(): BarscaleSize {
  return currentBarscale;
}

function applyBarscaleToDOM(): void {
  if (window.matchMedia('(max-width: 768px)').matches) {
    // Let CSS handle the forced XS barscale on mobile
    document.documentElement.style.removeProperty('--bar-height');
    return;
  }
  document.documentElement.style.setProperty('--bar-height', `${BARSCALE_PX[currentBarscale]}px`);
}

function setBarscaleDirectly(size: BarscaleSize): void {
  currentBarscale = size;
  localStorage.setItem('barscale', currentBarscale);
  applyBarscaleToDOM();
}

export function cycleBarscale(): void {
  const old = currentBarscale;
  const idx = BARSCALE_CYCLE.indexOf(currentBarscale);
  currentBarscale = BARSCALE_CYCLE[(idx + 1) % BARSCALE_CYCLE.length];
  localStorage.setItem('barscale', currentBarscale);
  applyBarscaleToDOM();
  if (!isUndoing()) {
    const newVal = currentBarscale;
    pushUndo({
      undo: () => setBarscaleDirectly(old),
      redo: () => setBarscaleDirectly(newVal),
    });
  }
}

export function randomizeBarscale(): void {
  const old = currentBarscale;
  const others = BARSCALE_CYCLE.filter((s) => s !== currentBarscale);
  currentBarscale = others[Math.floor(Math.random() * others.length)];
  localStorage.setItem('barscale', currentBarscale);
  applyBarscaleToDOM();
  if (!isUndoing()) {
    const newVal = currentBarscale;
    pushUndo({
      undo: () => setBarscaleDirectly(old),
      redo: () => setBarscaleDirectly(newVal),
    });
  }
}

// --- Wireframe ---

export function getWireframe(): boolean {
  return getCurrentWireframe();
}

function applyWireframeToDOM(): void {
  if (getCurrentWireframe()) {
    document.documentElement.setAttribute('data-wireframe', '');
  } else {
    document.documentElement.removeAttribute('data-wireframe');
  }
}

function saveWireframeState(): void {
  localStorage.setItem('wireframe_dark', String(wireframeDark));
  localStorage.setItem('wireframe_light', String(wireframeLight));
  syncToConvex();
}

function setWireframeState(theme: string, val: boolean): void {
  if (theme === 'dark') wireframeDark = val;
  else wireframeLight = val;
  saveWireframeState();
  applyWireframeToDOM();
}

export function toggleWireframe(): void {
  const theme = getCurrentTheme();
  const oldVal = theme === 'dark' ? wireframeDark : wireframeLight;
  if (theme === 'dark') {
    wireframeDark = !wireframeDark;
  } else {
    wireframeLight = !wireframeLight;
  }
  saveWireframeState();
  applyWireframeToDOM();
  if (!isUndoing()) {
    const newVal = !oldVal;
    pushUndo({
      undo: () => setWireframeState(theme, oldVal),
      redo: () => setWireframeState(theme, newVal),
    });
  }
}

export function randomizeWireframe(): void {
  const theme = getCurrentTheme();
  const oldVal = theme === 'dark' ? wireframeDark : wireframeLight;
  const val = Math.random() > 0.5;
  if (theme === 'dark') {
    wireframeDark = val;
  } else {
    wireframeLight = val;
  }
  saveWireframeState();
  applyWireframeToDOM();
  if (!isUndoing()) {
    pushUndo({
      undo: () => setWireframeState(theme, oldVal),
      redo: () => setWireframeState(theme, val),
    });
  }
}

/** Called after theme toggle — re-apply the wireframe state for the new theme. */
export function applyWireframeForCurrentTheme(): void {
  applyWireframeToDOM();
}

// --- Init both ---

export function initBarscaleAndWireframe(): void {
  applyBarscaleToDOM();
  applyWireframeToDOM();
}
