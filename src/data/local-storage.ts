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
