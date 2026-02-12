import { getClient, setAuthToken } from '../../lib/api';
import { getStoredToken, isConnected, getAppUrl } from '../../lib/auth';
import type { Category, Bookmark, PopupView } from '../../lib/types';

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

async function fetchCategories(): Promise<Category[]> {
  const client = getClient();
  const result = await client.query('categories:list' as any, {});
  return (result as Category[]).sort((a, b) => a.order - b.order);
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
    showView('error');
    return;
  }

  try {
    // Fetch data in parallel
    const [categories, bookmarks] = await Promise.all([fetchCategories(), fetchBookmarks()]);
    _cachedCategories = categories;
    _cachedBookmarks = bookmarks;

    if (categories.length === 0) {
      document.getElementById('error-text')!.textContent =
        'No categories yet. Create one in the app first.';
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
    document.getElementById('error-text')!.textContent = 'Connection failed. Try again.';
    showView('error');
  }
}

document.addEventListener('DOMContentLoaded', init);
