import './style.css';
import { getClient, setAuthToken } from '../../lib/api';
import { getAppUrl } from '../../lib/auth';
import { extensionAuth } from '../../lib/extension-auth';
import type { Bookmark, Category } from '../../lib/types';

interface TabGroup {
  _id: string;
  name: string;
  order: number;
}

interface ViewModel {
  categories: Category[];
  bookmarks: Bookmark[];
  selectedCategoryId: string | null;
  query: string;
}

const state: ViewModel = {
  categories: [],
  bookmarks: [],
  selectedCategoryId: null,
  query: '',
};

const statusView = document.getElementById('status-view') as HTMLElement;
const statusTitle = document.getElementById('status-title') as HTMLElement;
const statusDetail = document.getElementById('status-detail') as HTMLElement;
const statusAction = document.getElementById('status-action') as HTMLButtonElement;
const contentView = document.getElementById('content-view') as HTMLElement;
const categoryList = document.getElementById('category-list') as HTMLElement;
const bookmarkGrid = document.getElementById('bookmark-grid') as HTMLElement;
const searchInput = document.getElementById('search-input') as HTMLInputElement;
const allCategoriesBtn = document.getElementById('all-categories-btn') as HTMLButtonElement;
const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
const openAppBtn = document.getElementById('open-app-btn') as HTMLButtonElement;

async function init(): Promise<void> {
  openAppBtn.addEventListener('click', openApp);
  statusAction.addEventListener('click', openApp);
  refreshBtn.addEventListener('click', () => load());
  allCategoriesBtn.addEventListener('click', () => {
    state.selectedCategoryId = null;
    render();
  });
  searchInput.addEventListener('input', () => {
    state.query = searchInput.value.trim().toLowerCase();
    renderBookmarks();
  });

  await load();
}

async function load(): Promise<void> {
  showStatus('Loading bookmarks', 'Checking extension auth…', false);

  const token = await extensionAuth.getValidConvexToken();
  if (!token) {
    showStatus(
      'Connect BruteBookmarks',
      'Sign in once from the app to make this native new-tab page available across browser sessions.',
      true,
    );
    return;
  }

  setAuthToken(token);

  try {
    const [categories, bookmarks] = await Promise.all([fetchCategories(), fetchBookmarks()]);
    state.categories = categories;
    state.bookmarks = bookmarks;
    state.selectedCategoryId = null;
    hideStatus();
    render();
  } catch (err) {
    console.error('[NativeNewTab] Failed to load bookmarks:', err);
    showStatus('Could not load bookmarks', 'Refresh or open the app to reconnect.', true);
  }
}

async function fetchCategories(): Promise<Category[]> {
  const client = getClient();
  const [categories, tabGroups] = await Promise.all([
    client.query('categories:list' as any, {}) as Promise<Category[]>,
    client.query('tabGroups:list' as any, {}) as Promise<TabGroup[]>,
  ]);

  return orderCategories(categories, tabGroups);
}

async function fetchBookmarks(): Promise<Bookmark[]> {
  const client = getClient();
  return await client.query('bookmarks:listAll' as any, {}) as Bookmark[];
}

function orderCategories(categories: Category[], tabGroups: TabGroup[]): Category[] {
  const groupMap = new Map<string, { order: number; categories: Category[] }>();
  for (const group of tabGroups) {
    groupMap.set(group._id, { order: group.order, categories: [] });
  }

  const ungrouped: Category[] = [];
  for (const category of categories) {
    if (category.groupId && groupMap.has(category.groupId)) {
      groupMap.get(category.groupId)!.categories.push(category);
    } else {
      ungrouped.push(category);
    }
  }

  for (const group of groupMap.values()) {
    group.categories.sort((a, b) => a.order - b.order);
  }

  const ordered = [
    ...ungrouped.map((category) => ({ order: category.order, categories: [category] })),
    ...Array.from(groupMap.values())
      .filter((group) => group.categories.length > 0)
      .map((group) => ({ order: group.order, categories: group.categories })),
  ];

  return ordered.sort((a, b) => a.order - b.order).flatMap((item) => item.categories);
}

function render(): void {
  renderCategories();
  renderBookmarks();
}

function renderCategories(): void {
  allCategoriesBtn.classList.toggle('active', state.selectedCategoryId === null);
  categoryList.innerHTML = '';

  for (const category of state.categories) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'category-pill';
    button.classList.toggle('active', category._id === state.selectedCategoryId);
    button.textContent = category.name;
    button.addEventListener('click', () => {
      state.selectedCategoryId = category._id;
      render();
    });
    categoryList.appendChild(button);
  }
}

function renderBookmarks(): void {
  bookmarkGrid.innerHTML = '';

  const filtered = state.bookmarks
    .filter((bookmark) => !state.selectedCategoryId || bookmark.categoryId === state.selectedCategoryId)
    .filter((bookmark) => {
      if (!state.query) return true;
      return `${bookmark.title} ${bookmark.url}`.toLowerCase().includes(state.query);
    })
    .sort((a, b) => a.order - b.order);

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = state.query ? 'No matching bookmarks.' : 'No bookmarks in this view.';
    bookmarkGrid.appendChild(empty);
    return;
  }

  for (const bookmark of filtered) {
    const card = document.createElement('a');
    card.className = 'bookmark-card';
    card.href = bookmark.url;
    card.innerHTML = `
      <span class="favicon">${getInitial(bookmark.title)}</span>
      <span class="bookmark-text">
        <strong>${escapeHtml(bookmark.title)}</strong>
        <small>${escapeHtml(formatUrl(bookmark.url))}</small>
      </span>
    `;
    bookmarkGrid.appendChild(card);
  }
}

function showStatus(title: string, detail: string, showAction: boolean): void {
  contentView.hidden = true;
  statusView.hidden = false;
  statusTitle.textContent = title;
  statusDetail.textContent = detail;
  statusAction.hidden = !showAction;
}

function hideStatus(): void {
  statusView.hidden = true;
  contentView.hidden = false;
}

async function openApp(): Promise<void> {
  const url = await getAppUrl();
  await browser.tabs.update({ url });
}

function getInitial(title: string): string {
  return title.trim().charAt(0).toUpperCase() || 'B';
}

function formatUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return rawUrl;
  }
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', init);
