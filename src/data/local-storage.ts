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
    const parsed = JSON.parse(raw);
    // Type-check primitives: ensure parsed value matches fallback type
    if (fallback !== null && typeof fallback !== 'object' && typeof parsed !== typeof fallback) {
      return fallback;
    }
    return parsed as T;
  } catch {
    // Parse failed — raw is a plain string; only valid if fallback is also a string
    if (typeof fallback === 'string') return raw as unknown as T;
    return fallback;
  }
}

export function setItem(key: string, value: unknown): void {
  localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
}

export function removeItem(key: string): void {
  localStorage.removeItem(key);
}
