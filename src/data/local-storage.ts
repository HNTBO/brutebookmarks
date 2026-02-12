export type AppMode = 'local' | 'sync';

const APP_MODE_KEY = 'appMode';

export function getAppMode(): AppMode | null {
  const raw = localStorage.getItem(APP_MODE_KEY);
  if (raw === 'local' || raw === 'sync') return raw;
  return null;
}

export function setAppMode(mode: AppMode): void {
  localStorage.setItem(APP_MODE_KEY, mode);
}

export function getItem<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

export function setItem(key: string, value: unknown): void {
  localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
}

export function removeItem(key: string): void {
  localStorage.removeItem(key);
}
