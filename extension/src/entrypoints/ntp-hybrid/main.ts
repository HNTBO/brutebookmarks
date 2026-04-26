import './style.css';
import { getClient, setAuthToken } from '../../lib/api';
import { getAppUrl } from '../../lib/auth';
import { extensionAuth } from '../../lib/extension-auth';
import type { Bookmark, Category } from '../../lib/types';

const PROBE_TIMEOUT_MS = 750;
const RECENT_SUCCESS_TTL_MS = 5 * 60 * 1000;
const LAST_SUCCESS_KEY = 'bb_ntp_last_app_success';

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

const app = document.getElementById('app') as HTMLElement;

let pageTitle: HTMLElement;
let searchRow: HTMLElement;
let statusView: HTMLElement;
let statusTitle: HTMLElement;
let statusDetail: HTMLElement;
let statusAction: HTMLButtonElement;
let contentView: HTMLElement;
let categoryList: HTMLElement;
let bookmarkGrid: HTMLElement;
let searchInput: HTMLInputElement;
let allCategoriesBtn: HTMLButtonElement;
let refreshBtn: HTMLButtonElement;
let openAppBtn: HTMLButtonElement;

async function init(): Promise<void> {
  app.innerHTML = '';
  await openHostedAppOrFallback();
}

async function openHostedAppOrFallback(): Promise<void> {
  showStatus('Opening BruteBookmarks', 'Checking the hosted app…', false);

  const appUrl = await getAppUrl();
  if (await hasRecentSuccessfulProbe()) {
    window.location.replace(appUrl);
    return;
  }

  if (await probeApp(appUrl)) {
    await browser.storage.local.set({ [LAST_SUCCESS_KEY]: Date.now() });
    window.location.replace(appUrl);
    return;
  }

  await loadNativeFallback();
}

async function hasRecentSuccessfulProbe(): Promise<boolean> {
  const result = await browser.storage.local.get(LAST_SUCCESS_KEY);
  const lastSuccess = result[LAST_SUCCESS_KEY];
  return typeof lastSuccess === 'number' && Date.now() - lastSuccess < RECENT_SUCCESS_TTL_MS;
}

async function probeApp(appUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const url = new URL('/favicon.svg', appUrl).href;
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadNativeFallback(): Promise<void> {
  mountFallbackShell();
  pageTitle.textContent = 'Fallback new tab';
  showStatus('Loading fallback', 'The hosted app did not answer quickly. Loading extension fallback…', false);

  const token = await extensionAuth.getValidConvexToken();
  if (!token) {
    showStatus(
      'Connect BruteBookmarks',
      'Open the app once while signed in to make the native fallback available.',
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
    searchRow.hidden = false;
    hideStatus();
    render();
  } catch (err) {
    console.error('[HybridNewTab] Failed to load fallback bookmarks:', err);
    showStatus('Could not load fallback', 'Refresh or open the app to reconnect.', true);
  }
}

function mountFallbackShell(): void {
  if (app.classList.contains('shell')) return;

  app.className = 'shell';
  app.removeAttribute('aria-label');
  app.innerHTML = `
    <section class="topbar">
      <div>
        <p class="eyebrow">BruteBookmarks</p>
        <h1 id="page-title">Fallback new tab</h1>
      </div>
      <div class="actions">
        <button id="refresh-btn" class="icon-btn" title="Refresh bookmarks" aria-label="Refresh bookmarks">
          <span aria-hidden="true">↻</span>
        </button>
        <button id="open-app-btn" class="secondary-btn">Open app</button>
      </div>
    </section>

    <section class="search-row" id="search-row" hidden>
      <input id="search-input" type="search" autocomplete="off" placeholder="Search bookmarks" />
    </section>

    <section id="status-view" class="status-view">
      <div class="loader"></div>
      <p id="status-title">Loading fallback</p>
      <p id="status-detail">Loading extension fallback…</p>
      <button id="status-action" class="primary-btn" type="button">Open app</button>
    </section>

    <section id="content-view" class="content-view" hidden>
      <aside class="category-rail">
        <button id="all-categories-btn" class="category-pill active" type="button">All</button>
        <div id="category-list"></div>
      </aside>
      <section id="bookmark-grid" class="bookmark-grid" aria-label="Bookmarks"></section>
    </section>
  `;

  pageTitle = document.getElementById('page-title') as HTMLElement;
  searchRow = document.getElementById('search-row') as HTMLElement;
  statusView = document.getElementById('status-view') as HTMLElement;
  statusTitle = document.getElementById('status-title') as HTMLElement;
  statusDetail = document.getElementById('status-detail') as HTMLElement;
  statusAction = document.getElementById('status-action') as HTMLButtonElement;
  contentView = document.getElementById('content-view') as HTMLElement;
  categoryList = document.getElementById('category-list') as HTMLElement;
  bookmarkGrid = document.getElementById('bookmark-grid') as HTMLElement;
  searchInput = document.getElementById('search-input') as HTMLInputElement;
  allCategoriesBtn = document.getElementById('all-categories-btn') as HTMLButtonElement;
  refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement;
  openAppBtn = document.getElementById('open-app-btn') as HTMLButtonElement;

  openAppBtn.addEventListener('click', openApp);
  statusAction.addEventListener('click', openApp);
  refreshBtn.addEventListener('click', () => loadNativeFallback());
  allCategoriesBtn.addEventListener('click', () => {
    state.selectedCategoryId = null;
    render();
  });
  searchInput.addEventListener('input', () => {
    state.query = searchInput.value.trim().toLowerCase();
    renderBookmarks();
  });
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
  searchRow.hidden = true;
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
  await browser.storage.local.set({ [LAST_SUCCESS_KEY]: Date.now() });
  window.location.replace(url);
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
