import { getClient, setAuthToken } from '../../lib/api';
import { getStoredToken, isConnected, getAppUrl, TOKEN_KEY } from '../../lib/auth';
import type { Category, Bookmark, PopupView } from '../../lib/types';

// --- Theme sync ---

const THEME_CACHE_KEY = 'bb_cached_theme';

interface CachedTheme {
  theme: 'dark' | 'light';
  accentColor: string | null;
  wireframe: boolean;
}

async function applyCachedTheme(): Promise<void> {
  const result = await browser.storage.local.get(THEME_CACHE_KEY);
  const cached = result[THEME_CACHE_KEY] as CachedTheme | undefined;
  if (cached) applyTheme(cached);
}

function applyTheme(t: CachedTheme): void {
  if (t.theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  if (t.accentColor) {
    document.documentElement.style.setProperty('--accent', t.accentColor);
    document.documentElement.style.setProperty('--accent-dim', `color-mix(in srgb, ${t.accentColor}, black 20%)`);
    document.documentElement.style.setProperty('--accent-glow', `color-mix(in srgb, ${t.accentColor}, transparent 85%)`);
    document.documentElement.style.setProperty('--border-strong', t.accentColor);
  }
  if (t.wireframe) {
    document.documentElement.setAttribute('data-wireframe', '');
  } else {
    document.documentElement.removeAttribute('data-wireframe');
  }
}

async function fetchAndCacheTheme(): Promise<void> {
  try {
    const client = getClient();
    const prefs = await client.query('preferences:get' as any, {}) as any;
    if (!prefs) return;

    const theme = (prefs.theme ?? 'dark') as 'dark' | 'light';
    const accentColor = theme === 'dark' ? prefs.accentColorDark : prefs.accentColorLight;
    const wireframe = theme === 'dark' ? !!prefs.wireframeDark : !!prefs.wireframeLight;
    const cached: CachedTheme = { theme, accentColor: accentColor ?? null, wireframe };

    await browser.storage.local.set({ [THEME_CACHE_KEY]: cached });
    applyTheme(cached);
  } catch {
    // Non-critical — keep using cached or defaults
  }
}

// --- DOM helpers ---

function show(id: string): void {
  document.getElementById(id)!.style.display = '';
}

function hide(id: string): void {
  document.getElementById(id)!.style.display = 'none';
}

const ALL_VIEWS = [
  'view-onboarding',
  'view-loading',
  'view-categories',
  'view-success',
  'view-already-saved',
  'view-error',
];

function showView(view: PopupView): void {
  ALL_VIEWS.forEach(hide);
  show(`view-${view}`);
}

// --- Tab info ---

async function getCurrentTab(): Promise<{ url: string; title: string } | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !tab.url.startsWith('http')) return null;
  return { url: tab.url, title: tab.title ?? tab.url };
}

// --- Convex queries ---

interface TabGroup {
  _id: string;
  name: string;
  order: number;
}

async function fetchCategories(): Promise<Category[]> {
  const client = getClient();
  const [categories, tabGroups] = await Promise.all([
    client.query('categories:list' as any, {}) as Promise<Category[]>,
    client.query('tabGroups:list' as any, {}) as Promise<TabGroup[]>,
  ]);

  // Replicate main app visual order: ungrouped categories and tab groups
  // are sorted together by their order values. Categories inside a group
  // appear at the group's position, sorted by their own order within.
  const groupMap = new Map<string, { order: number; categories: Category[] }>();
  for (const g of tabGroups) {
    groupMap.set(g._id, { order: g.order, categories: [] });
  }

  const ungrouped: Category[] = [];
  for (const cat of categories) {
    if (cat.groupId && groupMap.has(cat.groupId)) {
      groupMap.get(cat.groupId)!.categories.push(cat);
    } else {
      ungrouped.push(cat);
    }
  }

  // Sort categories within each group
  for (const g of groupMap.values()) {
    g.categories.sort((a, b) => a.order - b.order);
  }

  // Build flat list in visual order: mix ungrouped + groups, sorted by order
  type Item = { order: number; cats: Category[] };
  const items: Item[] = [
    ...ungrouped.map((c) => ({ order: c.order, cats: [c] })),
    ...Array.from(groupMap.values())
      .filter((g) => g.categories.length > 0)
      .map((g) => ({ order: g.order, cats: g.categories })),
  ];
  items.sort((a, b) => a.order - b.order);

  return items.flatMap((item) => item.cats);
}

async function fetchBookmarks(): Promise<Bookmark[]> {
  const client = getClient();
  const result = await client.query('bookmarks:listAll' as any, {});
  return result as Bookmark[];
}

async function createBookmark(categoryId: string, title: string, url: string): Promise<void> {
  const client = getClient();
  await client.mutation('bookmarks:create' as any, {
    categoryId,
    title,
    url,
  });
}

// --- Check if URL already saved ---

function findExistingBookmark(
  bookmarks: Bookmark[],
  categories: Category[],
  url: string,
): { bookmark: Bookmark; category: Category } | null {
  const normalizedUrl = url.replace(/\/+$/, '').toLowerCase();
  for (const bm of bookmarks) {
    const bmUrl = bm.url.replace(/\/+$/, '').toLowerCase();
    if (bmUrl === normalizedUrl) {
      const cat = categories.find((c) => c._id === bm.categoryId);
      if (cat) return { bookmark: bm, category: cat };
    }
  }
  return null;
}

// --- Render category list ---

function renderCategories(
  categories: Category[],
  bookmarks: Bookmark[],
  onPick: (categoryId: string) => void,
): void {
  const list = document.getElementById('category-list')!;
  list.innerHTML = '';

  for (const cat of categories) {
    const count = bookmarks.filter((b) => b.categoryId === cat._id).length;
    const item = document.createElement('div');
    item.className = 'category-item';
    item.innerHTML = `
      <div class="category-name">${escapeHtml(cat.name)}</div>
      <div class="category-count">${count}</div>
    `;
    item.addEventListener('click', () => onPick(cat._id));
    list.appendChild(item);
  }
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Show success then close ---

function showSuccess(): void {
  showView('success');
  setTimeout(() => window.close(), 1200);
}

// --- Main flow ---

async function init(): Promise<void> {
  // Apply cached theme immediately (before any network calls)
  await applyCachedTheme();

  // Wire open-app button
  document.getElementById('open-app-btn')!.addEventListener('click', async () => {
    const url = await getAppUrl();
    browser.tabs.create({ url });
    window.close();
  });

  // Wire connect button — opens the main app (content script auto-sends token)
  document.getElementById('connect-btn')!.addEventListener('click', async () => {
    const url = await getAppUrl();
    browser.tabs.create({ url });
    window.close();
  });

  // Wire retry button
  document.getElementById('retry-btn')!.addEventListener('click', () => {
    run();
  });

  // Wire reconnect button — opens BB in background tab to refresh token
  document.getElementById('reconnect-btn')!.addEventListener('click', () => {
    reconnect();
  });

  // Wire save-another button
  document.getElementById('save-another-btn')!.addEventListener('click', () => {
    // Force show the category picker
    showCategoryPicker();
  });

  run();
}

let _cachedCategories: Category[] = [];
let _cachedBookmarks: Bookmark[] = [];
let _currentTab: { url: string; title: string } | null = null;

async function showCategoryPicker(): Promise<void> {
  if (!_currentTab) return;

  document.getElementById('page-title')!.textContent = _currentTab.title;
  document.getElementById('page-url')!.textContent = _currentTab.url;

  renderCategories(_cachedCategories, _cachedBookmarks, async (categoryId) => {
    showView('loading');
    try {
      await createBookmark(categoryId, _currentTab!.title, _currentTab!.url);
      showSuccess();
    } catch (err) {
      console.error('[Popup] Save failed:', err);
      document.getElementById('error-text')!.textContent = 'Failed to save bookmark.';
      showView('error');
    }
  });

  showView('categories');
}

function showErrorWithReconnect(message: string): void {
  document.getElementById('error-text')!.textContent = message;
  document.getElementById('reconnect-btn')!.style.display = '';
  document.getElementById('retry-btn')!.style.display = 'none';
  showView('error');
}

async function reconnect(): Promise<void> {
  const reconnectBtn = document.getElementById('reconnect-btn')!;
  reconnectBtn.textContent = 'Reconnecting…';
  reconnectBtn.style.pointerEvents = 'none';
  reconnectBtn.style.opacity = '0.6';

  const url = await getAppUrl();
  const tab = await browser.tabs.create({ url, active: false });

  // Listen for fresh token in storage
  const timeout = setTimeout(() => {
    cleanup();
    reconnectBtn.textContent = 'Reconnect';
    reconnectBtn.style.pointerEvents = '';
    reconnectBtn.style.opacity = '';
    document.getElementById('error-text')!.textContent = 'Reconnect timed out. Is the app open and signed in?';
  }, 15_000);

  function cleanup() {
    browser.storage.onChanged.removeListener(onTokenChanged);
    clearTimeout(timeout);
    if (tab.id) browser.tabs.remove(tab.id).catch(() => {});
  }

  function onTokenChanged(changes: Record<string, Browser.storage.StorageChange>) {
    if (changes[TOKEN_KEY]?.newValue) {
      cleanup();
      // Token refreshed — swap to Retry and auto-retry
      reconnectBtn.style.display = 'none';
      reconnectBtn.textContent = 'Reconnect';
      reconnectBtn.style.pointerEvents = '';
      reconnectBtn.style.opacity = '';
      document.getElementById('retry-btn')!.style.display = '';
      run();
    }
  }

  browser.storage.onChanged.addListener(onTokenChanged);
}

async function run(): Promise<void> {
  showView('loading');

  // Check auth
  const token = await getStoredToken();
  if (!isConnected(token)) {
    showView('onboarding');
    return;
  }

  setAuthToken(token);

  // Get current tab
  _currentTab = await getCurrentTab();
  if (!_currentTab) {
    document.getElementById('error-text')!.textContent = 'Cannot save this page.';
    document.getElementById('reconnect-btn')!.style.display = 'none';
    document.getElementById('retry-btn')!.style.display = 'none';
    showView('error');
    return;
  }

  try {
    // Fetch data in parallel (theme is non-blocking)
    const [categories, bookmarks] = await Promise.all([fetchCategories(), fetchBookmarks()]);
    _cachedCategories = categories;
    _cachedBookmarks = bookmarks;

    // Refresh theme in background (don't block the UI)
    fetchAndCacheTheme();

    if (categories.length === 0) {
      document.getElementById('error-text')!.textContent =
        'No categories yet. Create one in the app first.';
      document.getElementById('reconnect-btn')!.style.display = 'none';
      document.getElementById('retry-btn')!.style.display = '';
      showView('error');
      return;
    }

    // Check if already saved
    const existing = findExistingBookmark(bookmarks, categories, _currentTab.url);
    if (existing) {
      document.getElementById('already-saved-category')!.textContent = existing.category.name;
      showView('already-saved');
      return;
    }

    // Single category → save immediately
    if (categories.length === 1) {
      await createBookmark(categories[0]._id, _currentTab.title, _currentTab.url);
      showSuccess();
      return;
    }

    // Multiple categories → show picker
    await showCategoryPicker();
  } catch (err) {
    console.error('[Popup] Error:', err);
    showErrorWithReconnect('Connection failed.');
  }
}

document.addEventListener('DOMContentLoaded', init);
