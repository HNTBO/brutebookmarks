import type { Category } from '../types';
import { getConvexClient } from './convex-client';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const API_BASE = window.location.origin;

// --- State ---
let _categories: Category[] = [];
let _renderCallback: (() => void) | null = null;
let _convexActive = false;

// Raw Convex subscription data
let _rawCategories: any[] | null = null;
let _rawBookmarks: any[] | null = null;
let _migrationChecked = false;

// --- Public getters ---
export function getCategories(): Category[] {
  return _categories;
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

  // Subscribe to bookmarks
  client.onUpdate(api.bookmarks.listAll, {}, (result) => {
    _rawBookmarks = result as any[];
    rebuild();
  });
}

// --- Denormalize Convex data into Category[] ---
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
    }
  }

  // Sort categories by order
  const sortedCats = [..._rawCategories].sort((a, b) => a.order - b.order);

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
  _categories = sortedCats.map((cat) => {
    const rawBookmarks = bookmarksByCategory.get(cat._id as string) ?? [];
    rawBookmarks.sort((a: any, b: any) => a.order - b.order);
    return {
      id: cat._id as string,
      name: cat.name as string,
      order: cat.order as number,
      bookmarks: rawBookmarks.map((b: any) => ({
        id: b._id as string,
        title: b.title as string,
        url: b.url as string,
        iconPath: (b.iconPath as string) ?? null,
        order: b.order as number,
      })),
    };
  });

  // Cache to localStorage for instant restore
  localStorage.setItem('speedDialData', JSON.stringify(_categories));

  rerender();
}

// --- Migration prompt ---
async function promptMigration(legacy: Category[]): Promise<void> {
  if (!confirm('Import your existing bookmarks into Convex for cross-device sync?')) {
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
    alert('Migration failed. Your local data is preserved.');
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
