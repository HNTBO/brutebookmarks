import { savePreferencesToConvex, isApplyingFromConvex } from '../data/store';
import { collectPreferences } from './preferences';

let currentTheme = localStorage.getItem('theme') || 'dark';

export function getCurrentTheme(): string {
  return currentTheme;
}

export function getAccentColorDark(): string | null {
  return localStorage.getItem('accentColor_dark');
}

export function getAccentColorLight(): string | null {
  return localStorage.getItem('accentColor_light');
}

function syncToConvex(): void {
  savePreferencesToConvex(collectPreferences);
}

export function toggleTheme(): void {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyThemeToDOM();
  localStorage.setItem('theme', currentTheme);
  syncToConvex();
}

/** Apply theme from Convex subscription — updates state + DOM + localStorage, no save back. */
export function applyTheme(theme: 'dark' | 'light', accentDark: string | null, accentLight: string | null): void {
  currentTheme = theme;
  localStorage.setItem('theme', theme);

  if (accentDark) {
    localStorage.setItem('accentColor_dark', accentDark);
  } else {
    localStorage.removeItem('accentColor_dark');
  }
  if (accentLight) {
    localStorage.setItem('accentColor_light', accentLight);
  } else {
    localStorage.removeItem('accentColor_light');
  }

  applyThemeToDOM();
}

function applyThemeToDOM(): void {
  document.documentElement.setAttribute('data-theme', currentTheme);

  const btn = document.getElementById('theme-toggle-btn')!;
  btn.innerHTML = currentTheme === 'dark' ? '☀' : '☾';

  const storageKey = `accentColor_${currentTheme}`;
  const savedAccent = localStorage.getItem(storageKey);
  const picker = document.getElementById('accent-color-picker') as HTMLInputElement | null;

  if (savedAccent) {
    document.documentElement.style.setProperty('--accent', savedAccent);
    if (picker) picker.value = savedAccent;
  } else {
    document.documentElement.style.removeProperty('--accent');
    if (picker) {
      setTimeout(() => {
        picker.value = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      }, 50);
    }
  }
}

export function updateAccentColor(color: string): void {
  document.documentElement.style.setProperty('--accent', color);
  localStorage.setItem(`accentColor_${currentTheme}`, color);
  syncToConvex();
}

export function resetAccentColor(): void {
  localStorage.removeItem(`accentColor_${currentTheme}`);
  document.documentElement.style.removeProperty('--accent');

  setTimeout(() => {
    const defaultColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const picker = document.getElementById('accent-color-picker') as HTMLInputElement | null;
    if (picker) picker.value = defaultColor;
  }, 10);
  syncToConvex();
}

export function syncThemeUI(): void {
  document.getElementById('theme-toggle-btn')!.innerHTML = currentTheme === 'dark' ? '☀' : '☾';
  const picker = document.getElementById('accent-color-picker') as HTMLInputElement | null;
  if (picker) {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    picker.value = accent;
  }
}
