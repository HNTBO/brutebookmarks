import { savePreferencesToConvex, isApplyingFromConvex } from '../data/store';
import { collectPreferences, applyWireframeForCurrentTheme } from './preferences';
import { pushUndo, isUndoing } from './undo';

export type ThemeMode = 'dark' | 'light' | 'auto';
export type ResolvedTheme = 'dark' | 'light';

let currentTheme: ThemeMode | null = null;
let systemThemeQuery: MediaQueryList | null = null;
let systemThemeListenerAttached = false;

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'dark' || value === 'light' || value === 'auto';
}

function getSystemThemeQuery(): MediaQueryList {
  if (!systemThemeQuery) {
    systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  }
  return systemThemeQuery;
}

function getSystemTheme(): ResolvedTheme {
  return getSystemThemeQuery().matches ? 'dark' : 'light';
}

function getTheme(): ThemeMode {
  if (currentTheme === null) {
    const stored = localStorage.getItem('theme');
    currentTheme = isThemeMode(stored) ? stored : 'dark';
  }
  return currentTheme;
}

export function getCurrentTheme(): ThemeMode {
  return getTheme();
}

export function getResolvedTheme(): ResolvedTheme {
  const theme = getTheme();
  return theme === 'auto' ? getSystemTheme() : theme;
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

function setThemeDirectly(theme: ThemeMode): void {
  currentTheme = theme;
  applyThemeToDOM();
  localStorage.setItem('theme', currentTheme);
  applyWireframeForCurrentTheme();
  syncToConvex();
}

export function toggleTheme(): void {
  const oldTheme = getTheme();
  currentTheme = oldTheme === 'light' ? 'dark' : oldTheme === 'dark' ? 'auto' : 'light';
  applyThemeToDOM();
  localStorage.setItem('theme', currentTheme);
  // Re-apply wireframe for the new theme (each theme has its own wireframe state)
  applyWireframeForCurrentTheme();
  syncToConvex();
  if (!isUndoing()) {
    const newTheme = currentTheme;
    pushUndo({
      undo: () => setThemeDirectly(oldTheme),
      redo: () => setThemeDirectly(newTheme),
    });
  }
}

/** Apply theme from Convex subscription — updates state + DOM + localStorage, no save back. */
export function applyTheme(theme: ThemeMode, accentDark: string | null, accentLight: string | null): void {
  currentTheme = isThemeMode(theme) ? theme : 'dark';
  localStorage.setItem('theme', currentTheme);

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
  ensureSystemThemeListener();
  const theme = getTheme();
  const resolvedTheme = getResolvedTheme();
  document.documentElement.setAttribute('data-theme', resolvedTheme);
  document.documentElement.setAttribute('data-theme-mode', theme);

  syncThemeButtons();

  const storageKey = `accentColor_${resolvedTheme}`;
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

function ensureSystemThemeListener(): void {
  if (systemThemeListenerAttached) return;
  systemThemeListenerAttached = true;

  getSystemThemeQuery().addEventListener('change', () => {
    if (getTheme() !== 'auto') return;
    applyThemeToDOM();
    applyWireframeForCurrentTheme();
  });
}

function getThemeIcon(theme: ThemeMode): string {
  if (theme === 'light') return '☀';
  if (theme === 'dark') return '☾';
  return '<span class="theme-auto-icon">A</span>';
}

function syncThemeButtons(): void {
  const icon = getThemeIcon(getTheme());
  const label = `Theme: ${getTheme()}`;
  for (const id of ['theme-toggle-btn', 'mobile-theme-btn']) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.innerHTML = icon;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
  }
}

export function updateAccentColor(color: string): void {
  document.documentElement.style.setProperty('--accent', color);
  localStorage.setItem(`accentColor_${getResolvedTheme()}`, color);
  syncToConvex();
}

function parseColorToRgb(input: string): { r: number; g: number; b: number } | null {
  const color = input.trim();

  // #rgb / #rrggbb
  const hexMatch = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  // rgb(...) / rgba(...)
  const rgbMatch = color.match(
    /^rgba?\(\s*([0-9.]+)\s*[, ]\s*([0-9.]+)\s*[, ]\s*([0-9.]+)(?:\s*[,/]\s*[0-9.]+\s*)?\)$/i,
  );
  if (rgbMatch) {
    return {
      r: Math.max(0, Math.min(255, Math.round(parseFloat(rgbMatch[1])))),
      g: Math.max(0, Math.min(255, Math.round(parseFloat(rgbMatch[2])))),
      b: Math.max(0, Math.min(255, Math.round(parseFloat(rgbMatch[3])))),
    };
  }

  return null;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hp >= 0 && hp < 1) {
    r1 = c;
    g1 = x;
  } else if (hp < 2) {
    r1 = x;
    g1 = c;
  } else if (hp < 3) {
    g1 = c;
    b1 = x;
  } else if (hp < 4) {
    g1 = x;
    b1 = c;
  } else if (hp < 5) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  const m = ln - c / 2;
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);

  const toHex = (value: number): string => value.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function randomizeAccentHue(): void {
  const currentAccent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const rgb = parseColorToRgb(currentAccent);
  if (!rgb) return;

  const oldColor = currentAccent;
  const { s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const nextHue = Math.floor(Math.random() * 360);
  const newColor = hslToHex(nextHue, s, l);
  updateAccentColor(newColor);
  if (!isUndoing()) {
    pushUndo({
      undo: () => { updateAccentColor(oldColor); syncPickerToAccent(oldColor); },
      redo: () => { updateAccentColor(newColor); syncPickerToAccent(newColor); },
    });
  }
}

function syncPickerToAccent(color: string): void {
  const picker = document.getElementById('accent-color-picker') as HTMLInputElement | null;
  if (picker) picker.value = color;
}

export function resetAccentColor(): void {
  const storageKey = `accentColor_${getResolvedTheme()}`;
  const oldColor = localStorage.getItem(storageKey);
  localStorage.removeItem(storageKey);
  document.documentElement.style.removeProperty('--accent');

  setTimeout(() => {
    const defaultColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const picker = document.getElementById('accent-color-picker') as HTMLInputElement | null;
    if (picker) picker.value = defaultColor;
  }, 10);
  syncToConvex();
  if (!isUndoing() && oldColor) {
    pushUndo({
      undo: () => { updateAccentColor(oldColor); syncPickerToAccent(oldColor); },
      redo: () => resetAccentColor(),
    });
  }
}

export function syncThemeUI(): void {
  applyThemeToDOM();
  const picker = document.getElementById('accent-color-picker') as HTMLInputElement | null;
  if (picker) {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    picker.value = accent;
  }
}
