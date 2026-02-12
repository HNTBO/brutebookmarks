import type { Category, TabGroup, LayoutItem, UserPreferences } from '../types';
import { getConvexClient } from './convex-client';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { DEFAULT_LAYOUT } from './defaults';
import { styledConfirm, styledAlert } from '../components/modals/confirm-modal';

const API_BASE = window.location.origin;

// --- State ---
let _categories: Category[] = [];
let _layoutItems: LayoutItem[] = [];
let _tabGroups: TabGroup[] = [];
let _renderCallback: (() => void) | null = null;
let _convexActive = false;

// Raw Convex subscription data
let _rawCategories: any[] | null = null;
let _rawBookmarks: any[] | null = null;
let _rawTabGroups: any[] | null = null;
let _migrationChecked = false;

// --- Preferences sync ---
let _prefsCallback: ((prefs: UserPreferences) => void) | null = null;
let _prefsSaveTimer: ReturnType<typeof setTimeout> | null = null;
let _applyingFromConvex = false; // guard against save loops

// --- Public getters ---
export function getCategories(): Category[] {
  return _categories;
}

export function getLayoutItems(): LayoutItem[] {
  return _layoutItems;
}

export function getTabGroups(): TabGroup[] {
  return _tabGroups;
}

export function isConvexMode(): boolean {
  return _convexActive;
}

// --- Render callback ---
export function setRenderCallback(cb: () => void): void {
  _renderCallback = cb;
}

function rerender(): void {
  if (_renderCallback) _renderCallback();
}

// --- Legacy compat (used by category-modal delete) ---
export function setCategories(data: Category[]): void {
  _categories = data;
}

// --- Initialize from localStorage cache (instant render before Convex arrives) ---
export async function initializeData(): Promise<void> {
  const savedData = localStorage.getItem('speedDialData');
  if (savedData) {
    _categories = JSON.parse(savedData);
  } else {
    _categories = [];
  }
}

// --- Legacy save (no Convex) ---
export async function saveData(): Promise<void> {
  if (_convexActive) return; // Convex handles persistence
  localStorage.setItem('speedDialData', JSON.stringify(_categories));

  try {
    const response = await fetch(`${API_BASE}/api/data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(_categories),
    });
    if (!response.ok) {
      console.error('Failed to save to server');
    }
  } catch (error) {
    console.error('Error saving to server:', error);
  }
}

// --- Preferences callback ---
export function setPreferencesCallback(cb: (prefs: UserPreferences) => void): void {
  _prefsCallback = cb;
}

/**
 * Called by theme.ts / preferences.ts after any user-initiated preference change.
 * Debounced — collects current state and saves to Convex after 500ms of inactivity.
 */
export function savePreferencesToConvex(getPrefs: () => UserPreferences): void {
  if (!_convexActive || _applyingFromConvex) return;

  if (_prefsSaveTimer) clearTimeout(_prefsSaveTimer);
  _prefsSaveTimer = setTimeout(async () => {
    const client = getConvexClient();
    if (!client) return;
    const prefs = getPrefs();
    try {
      await client.mutation(api.preferences.set, {
        theme: prefs.theme,
        accentColorDark: prefs.accentColorDark ?? undefined,
        accentColorLight: prefs.accentColorLight ?? undefined,
        cardSize: prefs.cardSize,
        pageWidth: prefs.pageWidth,
        showCardNames: prefs.showCardNames,
      });
    } catch (err) {
      console.error('[Store] Failed to save preferences:', err);
    }
  }, 500);
}

/** True when applying preferences from a Convex subscription (prevents save loops). */
export function isApplyingFromConvex(): boolean {
  return _applyingFromConvex;
}

// --- Convex activation ---
export function activateConvex(): void {
  const client = getConvexClient();
  if (!client) return;

  _convexActive = true;
  console.log('[Store] Activating Convex subscriptions');

  // Subscribe to categories
  client.onUpdate(api.categories.list, {}, (result) => {
    _rawCategories = result as any[];
    rebuild();
  });

  // Subscribe to tab groups
  client.onUpdate(api.tabGroups.list, {}, (result) => {
    _rawTabGroups = result as any[];
    rebuild();
  });

  // Subscribe to bookmarks
  client.onUpdate(api.bookmarks.listAll, {}, (result) => {
    _rawBookmarks = result as any[];
    rebuild();
  });

  // Subscribe to preferences
  client.onUpdate(api.preferences.get, {}, (result) => {
    if (!result || !_prefsCallback) return;
    const prefs: UserPreferences = {
      theme: (result as any).theme === 'light' ? 'light' : 'dark',
      accentColorDark: (result as any).accentColorDark ?? null,
      accentColorLight: (result as any).accentColorLight ?? null,
      cardSize: (result as any).cardSize ?? 90,
      pageWidth: (result as any).pageWidth ?? 100,
      showCardNames: (result as any).showCardNames ?? true,
    };
    _applyingFromConvex = true;
    try {
      _prefsCallback(prefs);
    } finally {
      _applyingFromConvex = false;
    }
  });
}

// --- Denormalize Convex data into Category[] and LayoutItem[] ---
function rebuild(): void {
  if (_rawCategories === null || _rawBookmarks === null) return;

  // Check migration on first data arrival
  if (!_migrationChecked) {
    _migrationChecked = true;
    if (_rawCategories.length === 0 && _rawBookmarks.length === 0) {
      const savedData = localStorage.getItem('speedDialData');
      if (savedData) {
        const legacy: Category[] = JSON.parse(savedData);
        if (legacy.length > 0) {
          promptMigration(legacy);
          return;
        }
      }
      // No legacy data either — offer seed defaults
      promptSeedDefaults();
      return;
    }
  }

  // Group bookmarks by categoryId
  const bookmarksByCategory = new Map<string, any[]>();
  for (const b of _rawBookmarks) {
    const catId = b.categoryId as string;
    if (!bookmarksByCategory.has(catId)) {
      bookmarksByCategory.set(catId, []);
    }
    bookmarksByCategory.get(catId)!.push(b);
  }

  // Build denormalized Category[]
  const allCategories: Category[] = [..._rawCategories]
    .sort((a, b) => a.order - b.order)
    .map((cat) => {
      const rawBookmarks = bookmarksByCategory.get(cat._id as string) ?? [];
      rawBookmarks.sort((a: any, b: any) => a.order - b.order);
      return {
        id: cat._id as string,
        name: cat.name as string,
        order: cat.order as number,
        groupId: (cat.groupId as string) ?? undefined,
        bookmarks: rawBookmarks.map((b: any) => ({
          id: b._id as string,
          title: b.title as string,
          url: b.url as string,
          iconPath: (b.iconPath as string) ?? null,
          order: b.order as number,
        })),
      };
    });

  _categories = allCategories;

  // Build LayoutItem[] — merge ungrouped categories and tab groups by order
  const rawGroups = _rawTabGroups ?? [];
  const groupMap = new Map<string, TabGroup>();
  for (const g of rawGroups) {
    groupMap.set(g._id as string, {
      id: g._id as string,
      name: g.name as string,
      order: g.order as number,
      categories: [],
    });
  }

  const ungrouped: LayoutItem[] = [];
  for (const cat of allCategories) {
    if (cat.groupId && groupMap.has(cat.groupId)) {
      groupMap.get(cat.groupId)!.categories.push(cat);
    } else {
      ungrouped.push({ type: 'category', category: cat });
    }
  }

  // Sort categories within each group by order
  for (const group of groupMap.values()) {
    group.categories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  const groupItems: LayoutItem[] = Array.from(groupMap.values())
    .filter((g) => g.categories.length > 0) // hide empty groups
    .map((g) => ({ type: 'tabGroup', group: g }));

  // Merge and sort by order
  _layoutItems = [...ungrouped, ...groupItems].sort((a, b) => {
    const orderA = a.type === 'category' ? (a.category.order ?? 0) : a.group.order;
    const orderB = b.type === 'category' ? (b.category.order ?? 0) : b.group.order;
    return orderA - orderB;
  });

  _tabGroups = Array.from(groupMap.values()).sort((a, b) => a.order - b.order);

  // Cache to localStorage for instant restore
  localStorage.setItem('speedDialData', JSON.stringify(_categories));

  rerender();
}

// --- Migration prompt ---
async function promptMigration(legacy: Category[]): Promise<void> {
  if (!(await styledConfirm('Import your existing bookmarks into Convex for cross-device sync?', 'Migration'))) {
    return;
  }

  const client = getConvexClient();
  if (!client) return;

  try {
    const bulkData = legacy.map((cat) => ({
      name: cat.name,
      bookmarks: cat.bookmarks.map((b) => ({
        title: b.title,
        url: b.url,
        iconPath: b.iconPath ?? undefined,
      })),
    }));

    await client.mutation(api.bookmarks.importBulk, { data: bulkData });
    console.log('[Store] Migration complete');
    // Subscriptions will fire and rebuild automatically
  } catch (error) {
    console.error('[Store] Migration failed:', error);
    await styledAlert('Migration failed. Your local data is preserved.', 'Migration');
  }
}

// --- Seed defaults prompt ---
async function promptSeedDefaults(): Promise<void> {
  if (!(await styledConfirm('Load sample bookmarks to explore the app?', 'Welcome'))) {
    return;
  }

  const client = getConvexClient();
  if (!client) return;

  try {
    await client.mutation(api.seed.seedDefaults, { items: DEFAULT_LAYOUT });
    console.log('[Store] Seed defaults loaded');
    // Subscriptions will fire and rebuild automatically
  } catch (error) {
    console.error('[Store] Seed defaults failed:', error);
  }
}

// --- Mutation helpers ---

export async function createCategory(name: string): Promise<void> {
  if (_convexActive) {
    const client = getConvexClient()!;
    await client.mutation(api.categories.create, { name });
  } else {
    _categories.push({ id: 'c' + Date.now(), name, bookmarks: [] });
    saveData();
    rerender();
  }
}

export async function updateCategory(id: string, name: string): Promise<void> {
  if (_convexActive) {
    const client = getConvexClient()!;
    await client.mutation(api.categories.update, {
      id: id as Id<'categories'>,
      name,
    });
  } else {
    const cat = _categories.find((c) => c.id === id);
    if (cat) cat.name = name;
    saveData();
    rerender();
  }
}

export async function deleteCategory(id: string): Promise<void> {
  if (_convexActive) {
    const client = getConvexClient()!;
    await client.mutation(api.categories.remove, {
      id: id as Id<'categories'>,
    });
  } else {
    _categories = _categories.filter((c) => c.id !== id);
    saveData();
    rerender();
  }
}

export async function createBookmark(
  categoryId: string,
  title: string,
  url: string,
  iconPath: string | null,
): Promise<void> {
  if (_convexActive) {
    const client = getConvexClient()!;
    await client.mutation(api.bookmarks.create, {
      categoryId: categoryId as Id<'categories'>,
      title,
      url,
      iconPath: iconPath ?? undefined,
    });
  } else {
    const cat = _categories.find((c) => c.id === categoryId);
    if (cat) {
      cat.bookmarks.push({ id: 'b' + Date.now(), title, url, iconPath });
    }
    saveData();
    rerender();
  }
}

export async function updateBookmark(
  id: string,
  title: string,
  url: string,
  iconPath: string | null,
): Promise<void> {
  if (_convexActive) {
    const client = getConvexClient()!;
    await client.mutation(api.bookmarks.update, {
      id: id as Id<'bookmarks'>,
      title,
      url,
      iconPath: iconPath ?? undefined,
    });
  } else {
    for (const cat of _categories) {
      const bk = cat.bookmarks.find((b) => b.id === id);
      if (bk) {
        bk.title = title;
        bk.url = url;
        bk.iconPath = iconPath;
        break;
      }
    }
    saveData();
    rerender();
  }
}

export async function deleteBookmarkById(id: string): Promise<void> {
  if (_convexActive) {
    const client = getConvexClient()!;
    await client.mutation(api.bookmarks.remove, {
      id: id as Id<'bookmarks'>,
    });
  } else {
    for (const cat of _categories) {
      const idx = cat.bookmarks.findIndex((b) => b.id === id);
      if (idx !== -1) {
        cat.bookmarks.splice(idx, 1);
        break;
      }
    }
    saveData();
    rerender();
  }
}

export async function reorderCategory(id: string, order: number): Promise<void> {
  if (_convexActive) {
    const client = getConvexClient()!;
    await client.mutation(api.categories.reorder, {
      id: id as Id<'categories'>,
      order,
    });
  }
}

export async function reorderBookmark(
  id: string,
  order: number,
  categoryId?: string,
): Promise<void> {
  if (_convexActive) {
    const client = getConvexClient()!;
    await client.mutation(api.bookmarks.reorder, {
      id: id as Id<'bookmarks'>,
      order,
      categoryId: categoryId ? (categoryId as Id<'categories'>) : undefined,
    });
  }
  // Legacy reorder is handled inline in drag-drop.ts (splice-based)
}

// --- Tab Group mutation helpers ---

export async function createTabGroup(name: string, categoryIds: string[]): Promise<void> {
  if (!_convexActive) return;
  const client = getConvexClient()!;
  await client.mutation(api.tabGroups.createWithCategories, {
    name,
    categoryIds: categoryIds as Id<'categories'>[],
  });
}

export async function deleteTabGroup(id: string): Promise<void> {
  if (!_convexActive) return;
  const client = getConvexClient()!;
  await client.mutation(api.tabGroups.remove, {
    id: id as Id<'tabGroups'>,
  });
}

export async function reorderTabGroup(id: string, order: number): Promise<void> {
  if (!_convexActive) return;
  const client = getConvexClient()!;
  await client.mutation(api.tabGroups.reorder, {
    id: id as Id<'tabGroups'>,
    order,
  });
}

export async function setCategoryGroup(categoryId: string, groupId: string | null): Promise<void> {
  if (!_convexActive) return;
  const client = getConvexClient()!;
  await client.mutation(api.categories.setGroup, {
    id: categoryId as Id<'categories'>,
    groupId: groupId ? (groupId as Id<'tabGroups'>) : undefined,
  });
}

export async function renameTabGroup(id: string, name: string): Promise<void> {
  if (!_convexActive) return;
  const client = getConvexClient()!;
  await client.mutation(api.tabGroups.update, {
    id: id as Id<'tabGroups'>,
    name,
  });
}

export async function eraseAllData(): Promise<void> {
  if (_convexActive) {
    const client = getConvexClient()!;
    await client.mutation(api.bookmarks.eraseAll, {});
  } else {
    _categories = [];
    saveData();
    rerender();
  }
}

export async function importBulk(data: Category[]): Promise<void> {
  if (_convexActive) {
    const client = getConvexClient()!;
    const bulkData = data.map((cat) => ({
      name: cat.name,
      bookmarks: cat.bookmarks.map((b) => ({
        title: b.title,
        url: b.url,
        iconPath: b.iconPath ?? undefined,
      })),
    }));
    await client.mutation(api.bookmarks.importBulk, { data: bulkData });
  } else {
    _categories = data;
    saveData();
    rerender();
  }
}
