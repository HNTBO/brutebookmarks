import type { Bookmark, Category, TabGroup, LayoutItem, UserPreferences } from '../types';
import { getConvexClient } from './convex-client';
import { api } from '../../convex/_generated/api';
import type { Doc, Id } from '../../convex/_generated/dataModel';
import { DEFAULT_LAYOUT } from './defaults';
import { styledConfirm, styledAlert } from '../components/modals/confirm-modal';
import { getAppMode } from './local-storage';
import { pushUndo, isUndoing } from '../features/undo';

// --- State ---
let _categories: Category[] = [];
let _layoutItems: LayoutItem[] = [];
let _tabGroups: TabGroup[] = [];
let _localTabGroups: { id: string; name: string; order: number }[] = [];
let _renderCallback: (() => void) | null = null;
let _convexActive = false;
let _unsubscribes: (() => void)[] = [];

/** Get Convex client or throw if not initialized. Use in mutation helpers. */
function requireConvexClient() {
  const client = getConvexClient();
  if (!client) throw new Error('[Store] Convex client not initialized');
  return client;
}

// Raw Convex subscription data
let _rawCategories: Doc<'categories'>[] | null = null;
let _rawBookmarks: Doc<'bookmarks'>[] | null = null;
let _rawTabGroups: Doc<'tabGroups'>[] | null = null;
let _migrationChecked = false;

// --- Preferences sync ---
let _prefsCallback: ((prefs: UserPreferences) => void) | null = null;
let _prefsCollector: (() => UserPreferences) | null = null;
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

// --- Rebuild layout from local data (mirrors Convex rebuild logic) ---
function rebuildLocalLayout(): void {
  const groupMap = new Map<string, TabGroup>();
  for (const g of _localTabGroups) {
    groupMap.set(g.id, {
      id: g.id,
      name: g.name,
      order: g.order,
      categories: [],
    });
  }

  const ungrouped: LayoutItem[] = [];
  for (const cat of _categories) {
    if (cat.groupId && groupMap.has(cat.groupId)) {
      groupMap.get(cat.groupId)!.categories.push(cat);
    } else {
      ungrouped.push({ type: 'category', category: cat });
    }
  }

  for (const group of groupMap.values()) {
    group.categories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  const groupItems: LayoutItem[] = Array.from(groupMap.values())
    .filter((g) => g.categories.length > 0)
    .map((g) => ({ type: 'tabGroup', group: g }));

  _layoutItems = [...ungrouped, ...groupItems].sort((a, b) => {
    const orderA = a.type === 'category' ? (a.category.order ?? 0) : a.group.order;
    const orderB = b.type === 'category' ? (b.category.order ?? 0) : b.group.order;
    return orderA - orderB;
  });

  _tabGroups = Array.from(groupMap.values()).sort((a, b) => a.order - b.order);
}

// --- Legacy compat (used by category-modal delete) ---
export function setCategories(data: Category[]): void {
  _categories = data;
}

// --- Initialize from localStorage cache (instant render before Convex arrives) ---
export async function initializeData(): Promise<void> {
  const savedData = localStorage.getItem('speedDialData');
  if (savedData) {
    try {
      const parsed = JSON.parse(savedData);
      _categories = Array.isArray(parsed) ? parsed : [];
    } catch {
      _categories = [];
    }
  } else {
    _categories = [];
  }
  const savedGroups = localStorage.getItem('speedDialTabGroups');
  if (savedGroups) {
    try {
      const parsed = JSON.parse(savedGroups);
      _localTabGroups = Array.isArray(parsed) ? parsed : [];
    } catch {
      _localTabGroups = [];
    }
  } else {
    _localTabGroups = [];
  }
  rebuildLocalLayout();
}

// --- Legacy save (localStorage fallback when Convex is not active) ---
export async function saveData(): Promise<void> {
  if (_convexActive) return; // Convex handles persistence
  localStorage.setItem('speedDialData', JSON.stringify(_categories));
  localStorage.setItem('speedDialTabGroups', JSON.stringify(_localTabGroups));
  rebuildLocalLayout();
}

// --- Preferences callback ---
export function setPreferencesCallback(cb: (prefs: UserPreferences) => void): void {
  _prefsCallback = cb;
}

/** Store a reference to the preferences collector so we can push initial values to Convex. */
export function setPreferencesCollector(fn: () => UserPreferences): void {
  _prefsCollector = fn;
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

/**
 * Flush any pending debounced preference save immediately.
 * Called on mouseup / click in the size controller to ensure
 * card size and page width are persisted before a potential refresh.
 */
export function flushPreferencesToConvex(getPrefs: () => UserPreferences): void {
  if (!_convexActive || _applyingFromConvex) return;
  if (_prefsSaveTimer) {
    clearTimeout(_prefsSaveTimer);
    _prefsSaveTimer = null;
  }
  const client = getConvexClient();
  if (!client) return;
  const prefs = getPrefs();
  client.mutation(api.preferences.set, {
    theme: prefs.theme,
    accentColorDark: prefs.accentColorDark ?? undefined,
    accentColorLight: prefs.accentColorLight ?? undefined,
    wireframeDark: prefs.wireframeDark,
    wireframeLight: prefs.wireframeLight,
    cardSize: prefs.cardSize,
    pageWidth: prefs.pageWidth,
    showCardNames: prefs.showCardNames,
    autofillUrl: prefs.autofillUrl ?? undefined,
  }).catch((err) => console.error('[Store] Failed to flush preferences:', err));
}

/** True when applying preferences from a Convex subscription (prevents save loops). */
export function isApplyingFromConvex(): boolean {
  return _applyingFromConvex;
}

// --- Convex activation ---
export function activateConvex(): void {
  if (_convexActive) return; // idempotent

  const client = getConvexClient();
  if (!client) return;

  _convexActive = true;
  console.log('[Store] Activating Convex subscriptions');

  // Subscribe to categories
  _unsubscribes.push(client.onUpdate(api.categories.list, {}, (result) => {
    _rawCategories = result;
    scheduleRebuild();
  }));

  // Subscribe to tab groups
  _unsubscribes.push(client.onUpdate(api.tabGroups.list, {}, (result) => {
    _rawTabGroups = result;
    scheduleRebuild();
  }));

  // Subscribe to bookmarks
  _unsubscribes.push(client.onUpdate(api.bookmarks.listAll, {}, (result) => {
    _rawBookmarks = result;
    scheduleRebuild();
  }));

  // Subscribe to preferences
  _unsubscribes.push(client.onUpdate(api.preferences.get, {}, (result) => {
    if (!result) {
      // No prefs in Convex yet — push current localStorage values as initial state
      if (_prefsCollector) {
        flushPreferencesToConvex(_prefsCollector);
      }
      return;
    }
    if (!_prefsCallback) return;
    const prefs: UserPreferences = {
      theme: result.theme === 'light' ? 'light' : 'dark',
      accentColorDark: result.accentColorDark ?? null,
      accentColorLight: result.accentColorLight ?? null,
      wireframeDark: result.wireframeDark ?? false,
      wireframeLight: result.wireframeLight ?? false,
      cardSize: result.cardSize ?? 90,
      pageWidth: result.pageWidth ?? 100,
      showCardNames: result.showCardNames ?? true,
      autofillUrl: result.autofillUrl ?? false,
    };
    _applyingFromConvex = true;
    try {
      _prefsCallback(prefs);
    } finally {
      _applyingFromConvex = false;
    }
  }));
}

/** Tear down all Convex subscriptions. */
export function deactivateConvex(): void {
  for (const unsub of _unsubscribes) unsub();
  _unsubscribes = [];
  _convexActive = false;
  _rawCategories = null;
  _rawBookmarks = null;
  _rawTabGroups = null;
  _migrationChecked = false;
}

// --- Debounced rebuild scheduling ---
let _rebuildScheduled = false;
function scheduleRebuild(): void {
  if (_rebuildScheduled) return;
  _rebuildScheduled = true;
  queueMicrotask(() => {
    _rebuildScheduled = false;
    rebuild();
  });
}

// --- Debounced localStorage cache ---
let _localStorageTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedCacheToLocalStorage(): void {
  if (_localStorageTimer) clearTimeout(_localStorageTimer);
  _localStorageTimer = setTimeout(() => {
    localStorage.setItem('speedDialData', JSON.stringify(_categories));
  }, 100);
}

// --- Pure denormalization (extracted for testability) ---

interface RawCategory { _id: string; name: string; order: number; groupId?: string | null; }
interface RawBookmark { _id: string; title: string; url: string; iconPath?: string | null; order: number; categoryId: string; }
interface RawTabGroup { _id: string; name: string; order: number; }

export interface RebuildResult {
  categories: Category[];
  layoutItems: LayoutItem[];
  tabGroups: TabGroup[];
}

/**
 * Pure function: denormalize raw Convex subscription data into app state.
 * Exported for unit testing — called internally by rebuild().
 */
export function denormalize(
  rawCategories: RawCategory[],
  rawBookmarks: RawBookmark[],
  rawTabGroups: RawTabGroup[],
): RebuildResult {
  // Group bookmarks by categoryId
  const bookmarksByCategory = new Map<string, RawBookmark[]>();
  for (const b of rawBookmarks) {
    if (!bookmarksByCategory.has(b.categoryId)) {
      bookmarksByCategory.set(b.categoryId, []);
    }
    bookmarksByCategory.get(b.categoryId)!.push(b);
  }

  // Build denormalized Category[]
  const allCategories: Category[] = [...rawCategories]
    .sort((a, b) => a.order - b.order)
    .map((cat) => {
      const catBookmarks = bookmarksByCategory.get(cat._id) ?? [];
      catBookmarks.sort((a, b) => a.order - b.order);
      return {
        id: cat._id,
        name: cat.name,
        order: cat.order,
        groupId: cat.groupId ?? undefined,
        bookmarks: catBookmarks.map((b) => ({
          id: b._id,
          title: b.title,
          url: b.url,
          iconPath: b.iconPath ?? null,
          order: b.order,
        })),
      };
    });

  // Build LayoutItem[] — merge ungrouped categories and tab groups by order
  const groupMap = new Map<string, TabGroup>();
  for (const g of rawTabGroups) {
    groupMap.set(g._id, {
      id: g._id,
      name: g.name,
      order: g.order,
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

  for (const group of groupMap.values()) {
    group.categories.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  const groupItems: LayoutItem[] = Array.from(groupMap.values())
    .filter((g) => g.categories.length > 0)
    .map((g) => ({ type: 'tabGroup', group: g }));

  const layoutItems = [...ungrouped, ...groupItems].sort((a, b) => {
    const orderA = a.type === 'category' ? (a.category.order ?? 0) : a.group.order;
    const orderB = b.type === 'category' ? (b.category.order ?? 0) : b.group.order;
    return orderA - orderB;
  });

  const tabGroups = Array.from(groupMap.values()).sort((a, b) => a.order - b.order);

  return { categories: allCategories, layoutItems, tabGroups };
}

// --- Denormalize Convex data into Category[] and LayoutItem[] ---
function rebuild(): void {
  if (_rawCategories === null || _rawBookmarks === null || _rawTabGroups === null) return;

  // Check migration on first data arrival (only in sync mode)
  if (!_migrationChecked) {
    _migrationChecked = true;
    if (getAppMode() === 'sync' && _rawCategories.length === 0 && _rawBookmarks.length === 0) {
      const savedData = localStorage.getItem('speedDialData');
      if (savedData) {
        let legacy: Category[];
        try {
          const parsed = JSON.parse(savedData);
          legacy = Array.isArray(parsed) ? parsed : [];
        } catch {
          legacy = [];
        }
        if (legacy.length > 0) {
          promptMigration(legacy);
          return;
        }
      }
      promptSeedDefaults();
      return;
    }
  }

  const result = denormalize(_rawCategories, _rawBookmarks, _rawTabGroups);
  _categories = result.categories;
  _layoutItems = result.layoutItems;
  _tabGroups = result.tabGroups;

  // Cache to localStorage for instant restore (debounced)
  debouncedCacheToLocalStorage();

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
    await styledAlert('Failed to load sample bookmarks. Please try again.', 'Error');
  }
}

// --- Local seed defaults (for first-time local-only users) ---
export function seedLocalDefaults(): void {
  // Only seed if localStorage is empty
  const savedData = localStorage.getItem('speedDialData');
  if (savedData) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(savedData);
    } catch {
      parsed = null;
    }
    if (Array.isArray(parsed) && parsed.length > 0) return;
  }

  let catOrder = 1;
  const categories: Category[] = [];
  const tabGroups: { id: string; name: string; order: number }[] = [];

  for (const item of DEFAULT_LAYOUT) {
    let groupId: string | undefined;
    if (item.type === 'group') {
      groupId = 'g' + Date.now() + '-' + item.order;
      tabGroups.push({ id: groupId, name: item.name, order: item.order });
    }

    for (const cat of item.categories) {
      const ts = Date.now();
      categories.push({
        id: 'c' + ts + '-' + catOrder,
        name: cat.name,
        order: catOrder++,
        groupId,
        bookmarks: cat.bookmarks.map((b, i) => ({
          id: 'b' + ts + '-' + i,
          title: b.title,
          url: b.url,
          iconPath: null,
          order: b.order,
        })),
      });
    }
  }

  _categories = categories;
  _localTabGroups = tabGroups;
  localStorage.setItem('speedDialData', JSON.stringify(_categories));
  localStorage.setItem('speedDialTabGroups', JSON.stringify(_localTabGroups));
  rebuildLocalLayout();
  rerender();
}

// --- Mutation helpers ---

export async function createCategory(name: string): Promise<string> {
  let newId: string;
  if (_convexActive) {
    const client = requireConvexClient();
    try {
      newId = await client.mutation(api.categories.create, { name });
    } catch (err) {
      console.error('[Store] createCategory failed:', err);
      throw err;
    }
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
    const client = requireConvexClient();
    try {
      await client.mutation(api.categories.update, {
        id: id as Id<'categories'>,
        name,
      });
    } catch (err) {
      console.error('[Store] updateCategory failed:', err);
      throw err;
    }
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
    const client = requireConvexClient();
    try {
      await client.mutation(api.categories.remove, {
        id: id as Id<'categories'>,
      });
    } catch (err) {
      console.error('[Store] deleteCategory failed:', err);
      throw err;
    }
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
    const client = requireConvexClient();
    try {
      newId = await client.mutation(api.bookmarks.create, {
        categoryId: categoryId as Id<'categories'>,
        title,
        url,
        iconPath: iconPath ?? undefined,
      });
    } catch (err) {
      console.error('[Store] createBookmark failed:', err);
      throw err;
    }
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
    const client = requireConvexClient();
    try {
      await client.mutation(api.bookmarks.update, {
        id: id as Id<'bookmarks'>,
        title,
        url,
        iconPath: iconPath ?? undefined,
        categoryId: categoryId ? (categoryId as Id<'categories'>) : undefined,
      });
    } catch (err) {
      console.error('[Store] updateBookmark failed:', err);
      throw err;
    }
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
    const client = requireConvexClient();
    try {
      await client.mutation(api.bookmarks.remove, {
        id: id as Id<'bookmarks'>,
      });
    } catch (err) {
      console.error('[Store] deleteBookmarkById failed:', err);
      throw err;
    }
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
    const client = requireConvexClient();
    try {
      await client.mutation(api.categories.reorder, {
        id: id as Id<'categories'>,
        order,
      });
    } catch (err) {
      console.error('[Store] reorderCategory failed:', err);
      throw err;
    }
  } else {
    const cat = _categories.find((c) => c.id === id);
    if (cat) cat.order = order;
    saveData();
    rerender();
  }
}

export async function reorderBookmark(
  id: string,
  order: number,
  categoryId?: string,
): Promise<void> {
  if (_convexActive) {
    const client = requireConvexClient();
    try {
      await client.mutation(api.bookmarks.reorder, {
        id: id as Id<'bookmarks'>,
        order,
        categoryId: categoryId ? (categoryId as Id<'categories'>) : undefined,
      });
    } catch (err) {
      console.error('[Store] reorderBookmark failed:', err);
      throw err;
    }
  }
  // Legacy reorder is handled inline in drag-drop.ts (splice-based)
}

// --- Tab Group mutation helpers ---

export async function createTabGroup(name: string, categoryIds: string[]): Promise<void> {
  if (_convexActive) {
    const client = requireConvexClient();
    try {
      await client.mutation(api.tabGroups.createWithCategories, {
        name,
        categoryIds: categoryIds as Id<'categories'>[],
      });
    } catch (err) {
      console.error('[Store] createTabGroup failed:', err);
      throw err;
    }
  } else {
    const groupId = 'g' + Date.now();
    // Use the first category's order as the group order
    const firstCat = _categories.find((c) => c.id === categoryIds[0]);
    const groupOrder = firstCat?.order ?? _localTabGroups.length + 1;
    _localTabGroups.push({ id: groupId, name, order: groupOrder });
    for (const catId of categoryIds) {
      const cat = _categories.find((c) => c.id === catId);
      if (cat) cat.groupId = groupId;
    }
    saveData();
    rerender();
  }
}

export async function deleteTabGroup(id: string): Promise<void> {
  if (_convexActive) {
    const client = requireConvexClient();
    try {
      await client.mutation(api.tabGroups.remove, {
        id: id as Id<'tabGroups'>,
      });
    } catch (err) {
      console.error('[Store] deleteTabGroup failed:', err);
      throw err;
    }
  } else {
    for (const cat of _categories) {
      if (cat.groupId === id) cat.groupId = undefined;
    }
    _localTabGroups = _localTabGroups.filter((g) => g.id !== id);
    saveData();
    rerender();
  }
}

export async function reorderTabGroup(id: string, order: number): Promise<void> {
  if (_convexActive) {
    const client = requireConvexClient();
    try {
      await client.mutation(api.tabGroups.reorder, {
        id: id as Id<'tabGroups'>,
        order,
      });
    } catch (err) {
      console.error('[Store] reorderTabGroup failed:', err);
      throw err;
    }
  } else {
    const group = _localTabGroups.find((g) => g.id === id);
    if (group) group.order = order;
    saveData();
    rerender();
  }
}

export async function setCategoryGroup(categoryId: string, groupId: string | null, order?: number): Promise<void> {
  if (_convexActive) {
    const client = requireConvexClient();
    const baseArgs = {
      id: categoryId as Id<'categories'>,
      groupId: groupId ? (groupId as Id<'tabGroups'>) : undefined,
    };

    try {
      if (order !== undefined) {
        await client.mutation(api.categories.setGroup, { ...baseArgs, order });
      } else {
        await client.mutation(api.categories.setGroup, baseArgs);
      }
    } catch (err) {
      console.error('[Store] setCategoryGroup failed:', err);
      throw err;
    }
  } else {
    const cat = _categories.find((c) => c.id === categoryId);
    if (cat) {
      cat.groupId = groupId ?? undefined;
      if (order !== undefined) cat.order = order;
    }
    saveData();
    rerender();
  }
}

export async function mergeTabGroups(sourceId: string, targetId: string): Promise<void> {
  if (_convexActive) {
    const client = requireConvexClient();
    try {
      await client.mutation(api.tabGroups.mergeInto, {
        sourceId: sourceId as Id<'tabGroups'>,
        targetId: targetId as Id<'tabGroups'>,
      });
    } catch (err) {
      console.error('[Store] mergeTabGroups failed:', err);
      throw err;
    }
  } else {
    for (const cat of _categories) {
      if (cat.groupId === sourceId) cat.groupId = targetId;
    }
    _localTabGroups = _localTabGroups.filter((g) => g.id !== sourceId);
    saveData();
    rerender();
  }
}

export async function renameTabGroup(id: string, name: string): Promise<void> {
  if (_convexActive) {
    const client = requireConvexClient();
    try {
      await client.mutation(api.tabGroups.update, {
        id: id as Id<'tabGroups'>,
        name,
      });
    } catch (err) {
      console.error('[Store] renameTabGroup failed:', err);
      throw err;
    }
  } else {
    const group = _localTabGroups.find((g) => g.id === id);
    if (group) group.name = name;
    saveData();
    rerender();
  }
}

export async function eraseAllData(): Promise<void> {
  if (_convexActive) {
    const client = requireConvexClient();
    try {
      await client.mutation(api.bookmarks.eraseAll, {});
    } catch (err) {
      console.error('[Store] eraseAllData failed:', err);
      throw err;
    }
  } else {
    _categories = [];
    saveData();
    rerender();
  }
}

export async function importBulk(data: Category[]): Promise<void> {
  if (_convexActive) {
    const client = requireConvexClient();
    const bulkData = data.map((cat) => ({
      name: cat.name,
      bookmarks: cat.bookmarks.map((b) => ({
        title: b.title,
        url: b.url,
        iconPath: b.iconPath ?? undefined,
      })),
    }));
    try {
      await client.mutation(api.bookmarks.importBulk, { data: bulkData });
    } catch (err) {
      console.error('[Store] importBulk failed:', err);
      throw err;
    }
  } else {
    _categories = data;
    saveData();
    rerender();
  }
}
