import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class LocalStorageMock implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

async function loadStore() {
  vi.resetModules();
  return import('../../src/data/store');
}

describe('local reorder persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', new LocalStorageMock());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reorders tab groups in memory before the deferred localStorage flush', async () => {
    localStorage.setItem('speedDialData', JSON.stringify([
      { id: 'c1', name: 'Group 1A', order: 1, groupId: 'g1', bookmarks: [] },
      { id: 'c2', name: 'Group 2A', order: 2, groupId: 'g2', bookmarks: [] },
    ]));
    localStorage.setItem('speedDialTabGroups', JSON.stringify([
      { id: 'g1', name: 'Group One', order: 1 },
      { id: 'g2', name: 'Group Two', order: 2 },
    ]));

    const store = await loadStore();
    await store.initializeData();

    await store.reorderTabGroup('g2', 0.5);

    const layoutItems = store.getLayoutItems();
    expect(layoutItems[0]?.type).toBe('tabGroup');
    if (layoutItems[0]?.type === 'tabGroup') {
      expect(layoutItems[0].group.id).toBe('g2');
    }

    const persistedBeforeFlush = JSON.parse(localStorage.getItem('speedDialTabGroups')!);
    expect(persistedBeforeFlush.find((group: { id: string; order: number }) => group.id === 'g2')?.order).toBe(2);

    vi.advanceTimersByTime(120);

    const persistedAfterFlush = JSON.parse(localStorage.getItem('speedDialTabGroups')!);
    expect(persistedAfterFlush.find((group: { id: string; order: number }) => group.id === 'g2')?.order).toBe(0.5);
  });

  it('flushes deferred category reorders on demand', async () => {
    localStorage.setItem('speedDialData', JSON.stringify([
      { id: 'c1', name: 'First', order: 1, bookmarks: [] },
      { id: 'c2', name: 'Second', order: 2, bookmarks: [] },
    ]));
    localStorage.setItem('speedDialTabGroups', JSON.stringify([]));

    const store = await loadStore();
    await store.initializeData();

    await store.reorderCategory('c2', 0.5);

    const persistedBeforeFlush = JSON.parse(localStorage.getItem('speedDialData')!);
    expect(persistedBeforeFlush.find((category: { id: string; order: number }) => category.id === 'c2')?.order).toBe(2);

    store.flushDeferredLocalPersistence();

    const persistedAfterFlush = JSON.parse(localStorage.getItem('speedDialData')!);
    expect(persistedAfterFlush.find((category: { id: string; order: number }) => category.id === 'c2')?.order).toBe(0.5);
  });

  it('reorders local layout items by index even when existing orders are duplicated', async () => {
    localStorage.setItem('speedDialData', JSON.stringify([
      { id: 'c1', name: 'First', order: 1, bookmarks: [] },
      { id: 'c2', name: 'Second', order: 1, bookmarks: [] },
      { id: 'c3', name: 'Third', order: 1, bookmarks: [] },
    ]));
    localStorage.setItem('speedDialTabGroups', JSON.stringify([]));

    const store = await loadStore();
    await store.initializeData();

    store.reorderLocalLayoutItem('category', 'c3', 0);

    expect(store.getLayoutItems().map((item) => item.type === 'category' ? item.category.id : item.group.id)).toEqual([
      'c3',
      'c1',
      'c2',
    ]);

    store.flushDeferredLocalPersistence();

    const persistedAfterFlush = JSON.parse(localStorage.getItem('speedDialData')!);
    expect(persistedAfterFlush.map((category: { id: string; order: number }) => [category.id, category.order])).toEqual([
      ['c1', 2],
      ['c2', 3],
      ['c3', 1],
    ]);
  });
});
