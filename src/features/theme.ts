import { savePreferencesToConvex, isApplyingFromConvex } from '../data/store';
import { collectPreferences, applyWireframeForCurrentTheme } from './preferences';
import { pushUndo, isUndoing } from './undo';

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

function setThemeDirectly(theme: string): void {
  currentTheme = theme;
  applyThemeToDOM();
  localStorage.setItem('theme', currentTheme);
  applyWireframeForCurrentTheme();
  syncToConvex();
}

export function toggleTheme(): void {
  const oldTheme = currentTheme;
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
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
  const oldColor = localStorage.getItem(`accentColor_${currentTheme}`);
  localStorage.removeItem(`accentColor_${currentTheme}`);
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
  document.getElementById('theme-toggle-btn')!.innerHTML = currentTheme === 'dark' ? '☀' : '☾';
  const picker = document.getElementById('accent-color-picker') as HTMLInputElement | null;
  if (picker) {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    picker.value = accent;
  }
}
