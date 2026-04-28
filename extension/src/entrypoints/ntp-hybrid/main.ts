import './style.css';
import backIconUrl from '../../../../src/assets/back.svg?url';
import { getClient, setAuthToken } from '../../lib/api';
import { getAppUrl } from '../../lib/auth';
import { extensionAuth } from '../../lib/extension-auth';
import type { Bookmark, Category } from '../../lib/types';

const PROBE_TIMEOUT_MS = 750;
const RECENT_SUCCESS_TTL_MS = 5 * 60 * 1000;
const LAST_SUCCESS_KEY = 'bb_ntp_last_app_success';
const FALLBACK_SNAPSHOT_KEY = 'bb_ntp_fallback_snapshot';
const FORCE_FALLBACK = import.meta.env.VITE_FORCE_NTP_FALLBACK === 'true';

interface TabGroup {
  _id: string;
  name: string;
  order: number;
}

interface ViewModel {
  categories: Category[];
  bookmarks: Bookmark[];
  selectedCategoryId: string | null;
}

interface FallbackSnapshot {
  categories: Category[];
  bookmarks: Bookmark[];
  fetchedAt: number;
}

const state: ViewModel = {
  categories: [],
  bookmarks: [],
  selectedCategoryId: null,
};

const app = document.getElementById('app') as HTMLElement;

let pageTitle: HTMLElement;
let statusView: HTMLElement;
let statusTitle: HTMLElement;
let statusDetail: HTMLElement;
let statusAction: HTMLButtonElement;
let contentView: HTMLElement;
let bookmarkGrid: HTMLElement;
let categoryMenu: HTMLElement;
let categoryButton: HTMLButtonElement;
let categoryValue: HTMLElement;
let openAppBtn: HTMLButtonElement;

async function init(): Promise<void> {
  app.innerHTML = '';
  try {
    await openHostedAppOrFallback();
  } catch (err) {
    console.error('[HybridNewTab] Startup failed:', err);
    await loadNativeFallback();
  }
}

async function openHostedAppOrFallback(): Promise<void> {
  if (FORCE_FALLBACK) {
    await loadNativeFallback();
    return;
  }

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
  pageTitle.innerHTML = 'Brute<em>Fallback</em>';
  showStatus('Loading fallback', 'The hosted app did not answer quickly. Loading extension fallback…', false);

  const cachedSnapshot = await readFallbackSnapshot();
  let showingCachedSnapshot = false;
  if (cachedSnapshot) {
    applySnapshot(cachedSnapshot);
    hideStatus();
    render();
    showingCachedSnapshot = true;
  }

  const token = await extensionAuth.getValidConvexToken();
  if (!token) {
    if (showingCachedSnapshot) return;

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
    const snapshot = { categories, bookmarks, fetchedAt: Date.now() };
    await writeFallbackSnapshot(snapshot);
    applySnapshot(snapshot);
    hideStatus();
    render();
  } catch (err) {
    console.error('[HybridNewTab] Failed to load fallback bookmarks:', err);
    if (showingCachedSnapshot) return;

    showStatus('Could not load fallback', 'Refresh or open the app to reconnect.', true);
  }
}

function applySnapshot(snapshot: FallbackSnapshot): void {
  state.categories = snapshot.categories;
  state.bookmarks = snapshot.bookmarks;
  if (
    state.selectedCategoryId &&
    !snapshot.categories.some((category) => category._id === state.selectedCategoryId)
  ) {
    state.selectedCategoryId = null;
  }
}

async function readFallbackSnapshot(): Promise<FallbackSnapshot | null> {
  const result = await browser.storage.local.get(FALLBACK_SNAPSHOT_KEY);
  const snapshot = result[FALLBACK_SNAPSHOT_KEY];

  if (!isFallbackSnapshot(snapshot)) {
    return null;
  }

  return snapshot;
}

async function writeFallbackSnapshot(snapshot: FallbackSnapshot): Promise<void> {
  await browser.storage.local.set({ [FALLBACK_SNAPSHOT_KEY]: snapshot });
}

function isFallbackSnapshot(value: unknown): value is FallbackSnapshot {
  if (!value || typeof value !== 'object') return false;

  const snapshot = value as Partial<FallbackSnapshot>;
  return (
    Array.isArray(snapshot.categories) &&
    Array.isArray(snapshot.bookmarks) &&
    typeof snapshot.fetchedAt === 'number'
  );
}

function mountFallbackShell(): void {
  if (app.classList.contains('shell')) return;

  app.className = 'shell';
  app.removeAttribute('aria-label');
  app.innerHTML = `
    <section class="brute-header">
      <div class="title-box">
        <h1 id="page-title">Brute<em>Fallback</em></h1>
      </div>
      <div class="actions">
        <button id="open-app-btn" class="back-btn" type="button" aria-label="Open BruteBookmarks app">
          <img src="${backIconUrl}" alt="" aria-hidden="true">
        </button>
      </div>
    </section>

    <section id="status-view" class="status-view">
      <div class="loader"></div>
      <p id="status-title">Loading fallback</p>
      <p id="status-detail">Loading extension fallback…</p>
      <button id="status-action" class="primary-btn" type="button">Open app</button>
    </section>

    <section id="content-view" class="content-view" hidden>
      <div id="category-menu" class="category-menu">
        <button id="category-button" class="category-button" type="button" aria-haspopup="listbox" aria-expanded="false">
          <span id="category-value">All</span>
        </button>
        <div id="category-options" class="category-options" role="listbox" hidden></div>
      </div>
      <section id="bookmark-grid" class="bookmark-grid" aria-label="Bookmarks"></section>
    </section>
  `;

  pageTitle = document.getElementById('page-title') as HTMLElement;
  statusView = document.getElementById('status-view') as HTMLElement;
  statusTitle = document.getElementById('status-title') as HTMLElement;
  statusDetail = document.getElementById('status-detail') as HTMLElement;
  statusAction = document.getElementById('status-action') as HTMLButtonElement;
  contentView = document.getElementById('content-view') as HTMLElement;
  bookmarkGrid = document.getElementById('bookmark-grid') as HTMLElement;
  categoryMenu = document.getElementById('category-options') as HTMLElement;
  categoryButton = document.getElementById('category-button') as HTMLButtonElement;
  categoryValue = document.getElementById('category-value') as HTMLElement;
  openAppBtn = document.getElementById('open-app-btn') as HTMLButtonElement;

  openAppBtn.addEventListener('click', openApp);
  statusAction.addEventListener('click', openApp);
  categoryButton.addEventListener('click', toggleCategoryMenu);
  document.addEventListener('click', closeCategoryMenuOnOutsideClick);
  document.addEventListener('keydown', closeCategoryMenuOnEscape);
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
  categoryMenu.innerHTML = '';

  const selectedCategory = state.categories.find((category) => category._id === state.selectedCategoryId);
  categoryValue.textContent = selectedCategory?.name ?? 'All';
  categoryButton.setAttribute('aria-label', `Category: ${categoryValue.textContent}`);

  categoryMenu.appendChild(createCategoryOption(null, 'All'));

  for (const category of state.categories) {
    categoryMenu.appendChild(createCategoryOption(category._id, category.name));
  }
}

function createCategoryOption(categoryId: string | null, name: string): HTMLButtonElement {
  const option = document.createElement('button');
  option.type = 'button';
  option.className = 'category-option';
  option.role = 'option';
  option.textContent = name;
  option.dataset.categoryId = categoryId ?? '';
  option.setAttribute('aria-selected', String(categoryId === state.selectedCategoryId));
  option.addEventListener('click', () => {
    state.selectedCategoryId = categoryId;
    closeCategoryMenu();
    render();
  });
  return option;
}

function toggleCategoryMenu(): void {
  const willOpen = !categoryMenu.hidden;
  categoryMenu.hidden = willOpen;
  categoryButton.setAttribute('aria-expanded', String(!willOpen));
}

function closeCategoryMenu(): void {
  categoryMenu.hidden = true;
  categoryButton.setAttribute('aria-expanded', 'false');
}

function closeCategoryMenuOnOutsideClick(event: MouseEvent): void {
  const target = event.target;
  if (target instanceof Node && !categoryMenu.parentElement?.contains(target)) {
    closeCategoryMenu();
  }
}

function closeCategoryMenuOnEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeCategoryMenu();
  }
}

function renderBookmarks(): void {
  bookmarkGrid.innerHTML = '';

  const filtered = state.bookmarks
    .filter((bookmark) => !state.selectedCategoryId || bookmark.categoryId === state.selectedCategoryId)
    .sort((a, b) => a.order - b.order);

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No bookmarks in this view.';
    bookmarkGrid.appendChild(empty);
    return;
  }

  for (const bookmark of filtered) {
    const card = document.createElement('a');
    card.className = 'bookmark-card';
    card.href = bookmark.url;
    card.innerHTML = `
      <img class="bookmark-icon" src="${escapeHtml(getIconUrl(bookmark))}" alt="" draggable="false">
      <span class="bookmark-title">${escapeHtml(bookmark.title)}</span>
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
  await browser.storage.local.set({ [LAST_SUCCESS_KEY]: Date.now() });
  window.location.replace(url);
}

function getIconUrl(bookmark: Bookmark): string {
  if (bookmark.iconPath) return bookmark.iconPath;

  try {
    const domain = new URL(bookmark.url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return FALLBACK_ICON;
  }
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

const FALLBACK_ICON =
  'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23101c27%22 width=%22100%22 height=%22100%22/><text y=%2265%22 x=%2250%22 text-anchor=%22middle%22 font-size=%2250%22 fill=%22%230AEBFB%22>?</text></svg>';

document.addEventListener('DOMContentLoaded', init);
