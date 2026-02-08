let currentTheme = localStorage.getItem('theme') || 'dark';

export function getCurrentTheme(): string {
  return currentTheme;
}

export function toggleTheme(): void {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);
  localStorage.setItem('theme', currentTheme);

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
}

export function resetAccentColor(): void {
  localStorage.removeItem(`accentColor_${currentTheme}`);
  document.documentElement.style.removeProperty('--accent');

  setTimeout(() => {
    const defaultColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    const picker = document.getElementById('accent-color-picker') as HTMLInputElement | null;
    if (picker) picker.value = defaultColor;
  }, 10);
}

export function syncThemeUI(): void {
  document.getElementById('theme-toggle-btn')!.innerHTML = currentTheme === 'dark' ? '☀' : '☾';
  const picker = document.getElementById('accent-color-picker') as HTMLInputElement | null;
  if (picker) {
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    picker.value = accent;
  }
}
