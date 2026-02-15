import type { Bookmark, Category, TabGroup, LayoutItem, UserPreferences } from '../types';
import { getConvexClient } from './convex-client';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { DEFAULT_LAYOUT } from './defaults';
import { styledConfirm, styledAlert } from '../components/modals/confirm-modal';
import { getAppMode } from './local-storage';
import { pushUndo, isUndoing } from '../features/undo';

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

// --- Legacy save (localStorage fallback when Convex is not active) ---
export async function saveData(): Promise<void> {
  if (_convexActive) return; // Convex handles persistence
  localStorage.setItem('speedDialData', JSON.stringify(_categories));
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
        wireframeDark: prefs.wireframeDark,
        wireframeLight: prefs.wireframeLight,
        cardSize: prefs.cardSize,
        pageWidth: prefs.pageWidth,
        showCardNames: prefs.showCardNames,
        autofillUrl: prefs.autofillUrl ?? undefined,
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
      wireframeDark: (result as any).wireframeDark ?? false,
      wireframeLight: (result as any).wireframeLight ?? false,
      cardSize: (result as any).cardSize ?? 90,
      pageWidth: (result as any).pageWidth ?? 100,
      showCardNames: (result as any).showCardNames ?? true,
      autofillUrl: (result as any).autofillUrl ?? false,
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

  // Check migration on first data arrival (only in sync mode)
  if (!_migrationChecked) {
    _migrationChecked = true;
    if (getAppMode() === 'sync' && _rawCategories.length === 0 && _rawBookmarks.length === 0) {
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
  if (!(await styledConfirm('Save your existing bookmarks to the cloud for cross-device sync?', 'Migration'))) {
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

// --- Local seed defaults (for first-time local-only users) ---
export function seedLocalDefaults(): void {
  // Only seed if localStorage is empty
  const savedData = localStorage.getItem('speedDialData');
  if (savedData) {
    const parsed = JSON.parse(savedData);
    if (Array.isArray(parsed) && parsed.length > 0) return;
  }

  // Flatten DEFAULT_LAYOUT into Category[] (no tab groups in local mode)
  let order = 1;
  const categories: Category[] = [];
  for (const item of DEFAULT_LAYOUT) {
    for (const cat of item.categories) {
      categories.push({
        id: 'c' + Date.now() + '-' + order,
        name: cat.name,
        order: order++,
        bookmarks: cat.bookmarks.map((b, i) => ({
          id: 'b' + Date.now() + '-' + i,
          title: b.title,
          url: b.url,
          iconPath: null,
          order: b.order,
        })),
      });
    }
  }

  _categories = categories;
  localStorage.setItem('speedDialData', JSON.stringify(_categories));
  rerender();
}

// --- Mutation helpers ---

export async function createCategory(name: string): Promise<string> {
  let newId: string;
  if (_convexActive) {
    const client = getConvexClient()!;
    newId = await client.mutation(api.categories.create, { name });
  } else {
    newId = 'c' + Date.now();
    _categories.push({ id: newId, name, bookmarks: [] });
    saveData();
    rerender();
  }
  if (!isUndoing()) {
    const ref = { currentId: newId };
    pushUndo({
      undo: () => deleteCategory(ref.currentId),
      redo: async () => { ref.currentId = await createCategory(name); },
    });
  }
  return newId;
}

export async function updateCategory(id: string, name: string): Promise<void> {
  let oldName: string | undefined;
  if (!isUndoing()) {
    const cat = _categories.find((c) => c.id === id);
    if (cat) oldName = cat.name;
  }
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
  if (!isUndoing() && oldName !== undefined) {
    pushUndo({
      undo: () => updateCategory(id, oldName!),
      redo: () => updateCategory(id, name),
    });
  }
}

export async function deleteCategory(id: string): Promise<void> {
  let capturedData: { name: string; bookmarks: Bookmark[] } | undefined;
  if (!isUndoing()) {
    const cat = _categories.find((c) => c.id === id);
    if (cat) {
      capturedData = { name: cat.name, bookmarks: cat.bookmarks.map((b) => ({ ...b })) };
    }
  }
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
  if (!isUndoing() && capturedData) {
    const data = capturedData;
    const ref = { currentId: id };
    pushUndo({
      undo: async () => {
        ref.currentId = await createCategory(data.name);
        for (const bk of data.bookmarks) {
          await createBookmark(ref.currentId, bk.title, bk.url, bk.iconPath);
        }
      },
      redo: () => deleteCategory(ref.currentId),
    });
  }
}

export async function createBookmark(
  categoryId: string,
  title: string,
  url: string,
  iconPath: string | null,
): Promise<string> {
  let newId: string;
  if (_convexActive) {
    const client = getConvexClient()!;
    newId = await client.mutation(api.bookmarks.create, {
      categoryId: categoryId as Id<'categories'>,
      title,
      url,
      iconPath: iconPath ?? undefined,
    });
  } else {
    newId = 'b' + Date.now();
    const cat = _categories.find((c) => c.id === categoryId);
    if (cat) {
      cat.bookmarks.push({ id: newId, title, url, iconPath });
    }
    saveData();
    rerender();
  }
  if (!isUndoing()) {
    const ref = { currentId: newId };
    pushUndo({
      undo: () => deleteBookmarkById(ref.currentId),
      redo: async () => { ref.currentId = await createBookmark(categoryId, title, url, iconPath); },
    });
  }
  return newId;
}

export async function updateBookmark(
  id: string,
  title: string,
  url: string,
  iconPath: string | null,
  categoryId?: string,
): Promise<void> {
  let oldTitle: string | undefined;
  let oldUrl: string | undefined;
  let oldIconPath: string | null = null;
  let oldCategoryId: string | undefined;
  if (!isUndoing()) {
    for (const cat of _categories) {
      const bk = cat.bookmarks.find((b) => b.id === id);
      if (bk) {
        oldTitle = bk.title;
        oldUrl = bk.url;
        oldIconPath = bk.iconPath;
        oldCategoryId = cat.id;
        break;
      }
    }
  }
  if (_convexActive) {
    const client = getConvexClient()!;
    await client.mutation(api.bookmarks.update, {
      id: id as Id<'bookmarks'>,
      title,
      url,
      iconPath: iconPath ?? undefined,
      categoryId: categoryId ? (categoryId as Id<'categories'>) : undefined,
    });
  } else {
    let sourceCat: Category | undefined;
    let bookmark: Bookmark | undefined;
    for (const cat of _categories) {
      const bk = cat.bookmarks.find((b) => b.id === id);
      if (bk) {
        sourceCat = cat;
        bookmark = bk;
        break;
      }
    }
    if (bookmark) {
      bookmark.title = title;
      bookmark.url = url;
      bookmark.iconPath = iconPath;
      // Move to different category if requested
      if (categoryId && sourceCat && categoryId !== sourceCat.id) {
        sourceCat.bookmarks = sourceCat.bookmarks.filter((b) => b.id !== id);
        const targetCat = _categories.find((c) => c.id === categoryId);
        if (targetCat) targetCat.bookmarks.push(bookmark);
      }
    }
    saveData();
    rerender();
  }
  if (!isUndoing() && oldTitle !== undefined) {
    const ot = oldTitle, ou = oldUrl!, oi = oldIconPath, oc = oldCategoryId;
    pushUndo({
      undo: () => updateBookmark(id, ot, ou, oi, oc),
      redo: () => updateBookmark(id, title, url, iconPath, categoryId),
    });
  }
}

export async function deleteBookmarkById(id: string): Promise<void> {
  let capturedCatId: string | undefined;
  let capturedBk: Bookmark | undefined;
  if (!isUndoing()) {
    for (const cat of _categories) {
      const bk = cat.bookmarks.find((b) => b.id === id);
      if (bk) {
        capturedCatId = cat.id;
        capturedBk = { ...bk };
        break;
      }
    }
  }
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
  if (!isUndoing() && capturedBk && capturedCatId) {
    const bk = capturedBk;
    const catId = capturedCatId;
    const ref = { currentId: id };
    pushUndo({
      undo: async () => { ref.currentId = await createBookmark(catId, bk.title, bk.url, bk.iconPath); },
      redo: () => deleteBookmarkById(ref.currentId),
    });
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

export async function setCategoryGroup(categoryId: string, groupId: string | null, order?: number): Promise<void> {
  if (!_convexActive) return;
  const client = getConvexClient()!;
  const baseArgs = {
    id: categoryId as Id<'categories'>,
    groupId: groupId ? (groupId as Id<'tabGroups'>) : undefined,
  };

  try {
    // New backend supports "order" for positioned ungrouping.
    if (order !== undefined) {
      await client.mutation(api.categories.setGroup, { ...baseArgs, order });
    } else {
      await client.mutation(api.categories.setGroup, baseArgs);
    }
  } catch (err) {
    // Backward compatibility: older deployed validator rejects extra "order".
    if (
      order !== undefined &&
      err instanceof Error &&
      err.message.includes("extra field `order`")
    ) {
      await client.mutation(api.categories.setGroup, baseArgs);
      return;
    }
    throw err;
  }
}

export async function mergeTabGroups(sourceId: string, targetId: string): Promise<void> {
  if (!_convexActive) return;
  const client = getConvexClient()!;
  await client.mutation(api.tabGroups.mergeInto, {
    sourceId: sourceId as Id<'tabGroups'>,
    targetId: targetId as Id<'tabGroups'>,
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
