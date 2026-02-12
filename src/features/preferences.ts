import type { UserPreferences } from '../types';
import { savePreferencesToConvex } from '../data/store';
import { getCurrentTheme, getAccentColorDark, getAccentColorLight } from './theme';

let currentCardSize = parseInt(localStorage.getItem('cardSize') || '90');
let currentPageWidth = parseInt(localStorage.getItem('pageWidth') || '100');
let showCardNames = localStorage.getItem('showCardNames') !== 'false';
let autofillUrl = localStorage.getItem('autofillUrl') === 'true';

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

/** Collect all current preferences into one object (used by savePreferencesToConvex). */
export function collectPreferences(): UserPreferences {
  return {
    theme: getCurrentTheme() as 'dark' | 'light',
    accentColorDark: getAccentColorDark(),
    accentColorLight: getAccentColorLight(),
    cardSize: currentCardSize,
    pageWidth: currentPageWidth,
    showCardNames,
    autofillUrl,
  };
}

function syncToConvex(): void {
  savePreferencesToConvex(collectPreferences);
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
  showCardNames = show;
  localStorage.setItem('showCardNames', String(showCardNames));
  renderCallback();
  syncToConvex();
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

  currentCardSize = prefs.cardSize;
  currentPageWidth = prefs.pageWidth;
  showCardNames = prefs.showCardNames;
  autofillUrl = prefs.autofillUrl;

  localStorage.setItem('cardSize', String(currentCardSize));
  localStorage.setItem('pageWidth', String(currentPageWidth));
  localStorage.setItem('showCardNames', String(showCardNames));
  localStorage.setItem('autofillUrl', String(autofillUrl));

  if (cardChanged) applyCardSizeToDOM();
  if (widthChanged) applyPageWidthToDOM();
  if (namesChanged) renderCallback();

  syncPreferencesUI();
}

function applyCardSizeToDOM(): void {
  const t = (currentCardSize - 60) / 60;
  const gap = Math.round(8 + t * 16);

  document.querySelectorAll<HTMLElement>('.bookmarks-grid').forEach((grid) => {
    grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${currentCardSize}px, 1fr))`;
    grid.style.gap = `${gap}px`;
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
}
