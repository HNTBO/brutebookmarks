import { getCategories, getLayoutItems } from '../data/store';
import type { Category, TabGroup } from '../types';
import { getIconUrl, FALLBACK_ICON } from '../utils/icons';
import { escapeHtml } from '../utils/escape-html';
import { getCardGap, getCardSize, getShowCardNames, getShowNameOnHover, getBtnSize, getMobileColumns } from '../features/preferences';
import { handleCardPointerMove, handleCardPointerLeave, initLongPress, initAddCardLongPress, consumeLongPressGuard } from './bookmark-card';
import { dragController, initDragListeners } from '../features/drag-drop';
import { TAB_SWIPE_THRESHOLD, TAB_SWIPE_VERTICAL_CANCEL } from '../utils/interaction-constants';
import { attachDragTracking } from '../utils/pointer-tracker';

// Cached media query for mobile breakpoint (lazy-init for Node test compat)
let _mobileQuery: MediaQueryList | null = null;
function mobileQuery(): MediaQueryList {
  if (!_mobileQuery) _mobileQuery = window.matchMedia('(max-width: 768px)');
  return _mobileQuery;
}

// Track active tab per group (not persisted — defaults to first tab)
const activeTabPerGroup = new Map<string, string>();

/** Set the active tab for a group (called by drag-drop to persist tab switch through re-renders). */
export function setActiveTab(groupId: string, categoryId: string): void {
  activeTabPerGroup.set(groupId, categoryId);
}

// Guard: init drag listeners only once
let dragListenersInitialized = false;

function getActiveTabId(group: TabGroup): string {
  const stored = activeTabPerGroup.get(group.id);
  if (stored && group.categories.some((c) => c.id === stored)) return stored;
  return group.categories[0]?.id ?? '';
}

function rotateToActive(categories: Category[], activeId: string): Category[] {
  const idx = categories.findIndex((c) => c.id === activeId);
  if (idx <= 0) return [...categories];
  return [...categories.slice(idx), ...categories.slice(0, idx)];
}

function wireTabClicks(
  groupEl: HTMLElement,
  switchFn: (catId: string, direction?: 'forward' | 'backward') => void
): void {
  groupEl.querySelectorAll<HTMLElement>('.tab-bar-mobile .tab').forEach((tab) => {
    tab.addEventListener('click', () => switchFn(tab.dataset.tabCategoryId!));
    tab.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        switchFn(tab.dataset.tabCategoryId!);
      }
    });
  });
}

function initTabSwipe(
  contentEl: HTMLElement,
  categories: Category[],
  getActive: () => string,
  switchFn: (catId: string, direction?: 'forward' | 'backward') => void
): void {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  contentEl.addEventListener('pointerdown', (e: PointerEvent) => {
    if (!e.isPrimary) return;
    // Don't start swipe tracking if a drag is in progress
    if (dragController.active) return;
    startX = e.clientX;
    startY = e.clientY;
    tracking = true;
    // Capture pointer so swipe tracking continues even if pointer leaves
    // the content area. Skip if starting on a bookmark card — its
    // initLongPress will capture instead, and events still bubble up.
    if (!(e.target as HTMLElement).closest('.bookmark-card')) {
      try { contentEl.setPointerCapture(e.pointerId); } catch { /* ignored */ }
    }
  });

  contentEl.addEventListener('pointermove', (e: PointerEvent) => {
    if (!e.isPrimary || !tracking) return;
    if (dragController.active) { tracking = false; return; }
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    // Vertical scroll intent — cancel swipe tracking and release capture
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > TAB_SWIPE_VERTICAL_CANCEL) {
      tracking = false;
      try { contentEl.releasePointerCapture(e.pointerId); } catch { /* ignored */ }
      return;
    }
    // Horizontal swipe threshold
    if (Math.abs(dx) > TAB_SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      tracking = false;
      try { contentEl.releasePointerCapture(e.pointerId); } catch { /* ignored */ }
      const activeId = getActive();
      const idx = categories.findIndex((c) => c.id === activeId);
      if (idx === -1) return;
      const len = categories.length;
      const nextIdx = dx < 0
        ? (idx + 1) % len   // swipe left → next
        : (idx - 1 + len) % len; // swipe right → prev
      switchFn(categories[nextIdx].id, dx < 0 ? 'forward' : 'backward');
    }
  });

  contentEl.addEventListener('pointerup', (e: PointerEvent) => {
    tracking = false;
    try { contentEl.releasePointerCapture(e.pointerId); } catch { /* ignored */ }
  });
  contentEl.addEventListener('pointercancel', (e: PointerEvent) => {
    tracking = false;
    try { contentEl.releasePointerCapture(e.pointerId); } catch { /* ignored */ }
  });
}

function renderBookmarksGrid(category: Category, currentCardSize: number, showCardNames: boolean): string {
  const mobile = mobileQuery().matches;
  const gap = mobile ? getCardGap(60) : getCardGap(currentCardSize);
  const cols = mobile ? `repeat(${getMobileColumns()}, 1fr)` : `repeat(auto-fill, minmax(${currentCardSize}px, 1fr))`;
  const nameOnHover = getShowNameOnHover();
  const btnSize = getBtnSize(currentCardSize);
  return `
    <div class="bookmarks-grid" data-category-id="${escapeHtml(category.id)}" style="grid-template-columns: ${cols}; gap: ${gap}px; --btn-size: ${btnSize}px;">
      ${category.bookmarks
        .map(
          (bookmark, index) => `
        <div class="bookmark-card ${!showCardNames ? 'hide-title' : ''}"
             tabindex="0"
             role="link"
             data-bookmark-id="${escapeHtml(bookmark.id)}"
             data-category-id="${escapeHtml(category.id)}"
             data-index="${index}"
             data-url="${escapeHtml(bookmark.url)}"
             ${nameOnHover ? `title="${escapeHtml(bookmark.title)}"` : ''}>
          <button class="edit-btn" data-action="edit-bookmark" data-category-id="${escapeHtml(category.id)}" data-bookmark-id="${escapeHtml(bookmark.id)}">✎</button>
          <button class="delete-btn" data-action="delete-bookmark" data-category-id="${escapeHtml(category.id)}" data-bookmark-id="${escapeHtml(bookmark.id)}">×</button>
          <img class="bookmark-icon" src="${escapeHtml(getIconUrl(bookmark))}" alt="${escapeHtml(bookmark.title)}" draggable="false" ${!bookmark.iconPath ? 'data-auto-icon' : ''}>
          <div class="bookmark-title">${escapeHtml(bookmark.title)}</div>
        </div>
      `,
        )
        .join('')}
      <div class="bookmark-card add-bookmark" data-action="add-bookmark" data-category-id="${escapeHtml(category.id)}">
        <div class="plus-icon">+</div>
        <div class="add-bookmark-text">Add</div>
      </div>
    </div>
  `;
}

function wireBookmarkCards(el: HTMLElement): void {
  // Fallback icon for broken images (replaces inline onerror)
  el.querySelectorAll<HTMLImageElement>('.bookmark-icon').forEach((img) => {
    img.addEventListener('error', () => { img.src = FALLBACK_ICON; }, { once: true });
    img.addEventListener('load', () => {
      // Google S2 returns a 16x16 globe for unknown domains — replace with our fallback.
      // Only check auto-generated icons (no explicit iconPath); trust resolver-set icons.
      if (img.hasAttribute('data-auto-icon') && img.naturalWidth <= 16 && img.naturalHeight <= 16) {
        img.src = FALLBACK_ICON;
      }
    }, { once: true });
  });

  const bookmarkCards = el.querySelectorAll<HTMLElement>('.bookmark-card:not(.add-bookmark)');
  bookmarkCards.forEach((card) => {
    // Pointer events: long-press (mobile) / immediate drag (desktop) handled in initLongPress
    card.addEventListener('pointermove', handleCardPointerMove);
    card.addEventListener('pointerleave', handleCardPointerLeave);
    // Prevent native browser drag (img/link) from stealing pointer events
    card.addEventListener('dragstart', (e) => e.preventDefault());
    initLongPress(card);

    card.addEventListener('click', (e) => {
      if (consumeLongPressGuard()) return;
      const target = e.target as HTMLElement;
      if (target.closest('[data-action]')) return;
      const url = card.dataset.url;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    });

    card.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const url = card.dataset.url;
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
      }
    });
  });

  // Long-press "+" card → undo/redo menu (mobile only)
  const isMobile = mobileQuery().matches;
  if (isMobile) {
    el.querySelectorAll<HTMLElement>('.bookmark-card.add-bookmark').forEach((addCard) => {
      initAddCardLongPress(addCard);
    });
  }
}

/** Wire pointer-based drag on a drag handle (category/tab-group header). */
function initHandleDrag(
  handle: HTMLElement,
  getDragData: () => { kind: 'category' | 'tabGroup'; id: string },
): void {
  attachDragTracking({
    element: handle,
    preventDragStart: true,
    onThresholdExceeded: (e) => {
      if (!dragController.active) {
        dragController.startDrag(e, getDragData(), handle);
      }
    },
  });
}

/** Wire pointer-based drag on a tab (for reorder/ungroup). */
function initTabDrag(tab: HTMLElement): void {
  attachDragTracking({
    element: tab,
    onThresholdExceeded: (e) => {
      if (!dragController.active) {
        dragController.startDrag(e, { kind: 'category', id: tab.dataset.tabCategoryId! }, tab);
      }
    },
  });
}

function renderSingleCategory(category: Category, currentCardSize: number, showCardNames: boolean): HTMLElement {
  const categoryEl = document.createElement('div');
  categoryEl.className = 'category';
  categoryEl.dataset.categoryId = category.id;
  categoryEl.innerHTML = `
    <div class="category-header">
      <div class="category-drag-handle" title="Drag to reorder">⠿</div>
      <div class="tab-bar">
        <div class="category-title">
          ${escapeHtml(category.name)}
        </div>
      </div>
      <button class="category-edit-btn" data-category-id="${escapeHtml(category.id)}" title="Edit category">✎</button>
    </div>
    ${renderBookmarksGrid(category, currentCardSize, showCardNames)}
  `;

  wireBookmarkCards(categoryEl);

  // Category header drag — handle + title are both drag zones
  const dragData = () => ({ kind: 'category' as const, id: category.id });
  const handle = categoryEl.querySelector('.category-drag-handle') as HTMLElement;
  const title = categoryEl.querySelector('.category-title') as HTMLElement;
  initHandleDrag(handle, dragData);
  if (title) initHandleDrag(title, dragData);

  return categoryEl;
}

function renderMobileTabGroup(group: TabGroup, currentCardSize: number, showCardNames: boolean): HTMLElement {
  const groupEl = document.createElement('div');
  groupEl.className = 'tab-group tab-group-mobile';
  groupEl.dataset.groupId = group.id;

  const activeTabId = getActiveTabId(group);
  const rotated = rotateToActive(group.categories, activeTabId);

  function tabsHtml(cats: Category[], activeCatId: string): string {
    return cats
      .map(
        (cat) => `
      <div class="tab ${cat.id === activeCatId ? 'tab-active' : ''}"
           role="tab"
           aria-selected="${cat.id === activeCatId}"
           tabindex="${cat.id === activeCatId ? '0' : '-1'}"
           data-tab-category-id="${escapeHtml(cat.id)}"
           data-group-id="${escapeHtml(group.id)}">
        ${escapeHtml(cat.name)}
      </div>
    `,
      )
      .join('');
  }

  groupEl.innerHTML = `
    <div class="tab-group-header">
      <div class="category-drag-handle" title="Drag to reorder">⠿</div>
      <div class="tab-bar tab-bar-mobile" role="tablist">
        <div class="tab-ribbon">${tabsHtml(rotated, activeTabId)}</div>
      </div>
      <button class="category-edit-btn" data-group-id="${escapeHtml(group.id)}" data-action="edit-group" title="Edit group">✎</button>
    </div>
    <div class="tab-content">
      ${group.categories
        .map(
          (cat) => `
        <div class="tab-panel ${cat.id === activeTabId ? 'tab-panel-active' : ''}"
             role="tabpanel"
             data-tab-panel-id="${escapeHtml(cat.id)}">
          ${renderBookmarksGrid(cat, currentCardSize, showCardNames)}
        </div>
      `,
        )
        .join('')}
    </div>
  `;

  let sliding = false;

  function wireTabDrags(): void {
    groupEl.querySelectorAll<HTMLElement>('.tab-bar-mobile .tab').forEach((tab) => {
      initTabDrag(tab);
    });
  }

  function rebuildRibbon(catId: string): void {
    const ribbon = groupEl.querySelector('.tab-ribbon') as HTMLElement;
    const newRotated = rotateToActive(group.categories, catId);
    ribbon.style.transition = 'none';
    ribbon.style.transform = 'translateX(0)';
    ribbon.innerHTML = tabsHtml(newRotated, catId);
    wireTabClicks(groupEl, switchToTab);
    wireTabDrags();
  }

  function switchToTab(catId: string, direction?: 'forward' | 'backward'): void {
    const currentActiveId = activeTabPerGroup.get(group.id) || group.categories[0]?.id;
    if (catId === currentActiveId) return;
    if (sliding) return;

    activeTabPerGroup.set(group.id, catId);
    try { navigator.vibrate?.(10); } catch { /* ignored */ }

    // Toggle panels immediately
    groupEl.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('tab-panel-active'));
    groupEl.querySelector(`[data-tab-panel-id="${catId}"]`)?.classList.add('tab-panel-active');

    const ribbon = groupEl.querySelector('.tab-ribbon') as HTMLElement;
    if (!ribbon) { rebuildRibbon(catId); return; }

    const dir = direction || 'forward';
    sliding = true;

    if (dir === 'forward') {
      const tabs = Array.from(ribbon.children) as HTMLElement[];
      // Clone departing tabs and append to the end (continuous wrap)
      let offset = 0;
      for (const tab of tabs) {
        if (tab.dataset.tabCategoryId === catId) break;
        offset += tab.offsetWidth;
        const clone = tab.cloneNode(true) as HTMLElement;
        clone.classList.remove('tab-active');
        ribbon.appendChild(clone);
      }
      // Swap active class immediately (no flash at rebuild)
      ribbon.querySelector('.tab-active')?.classList.remove('tab-active');
      ribbon.querySelector(`[data-tab-category-id="${catId}"]`)?.classList.add('tab-active');
      // Slide left
      ribbon.style.transition = 'transform 0.25s ease';
      ribbon.style.transform = `translateX(${-offset}px)`;
      ribbon.addEventListener('transitionend', () => {
        rebuildRibbon(catId);
        sliding = false;
      }, { once: true });
      setTimeout(() => { if (sliding) { rebuildRibbon(catId); sliding = false; } }, 300);
    } else {
      // Slide right: rebuild first, then animate from offset to 0
      rebuildRibbon(catId);
      const firstTab = ribbon.children[0] as HTMLElement;
      const firstWidth = firstTab.offsetWidth;
      ribbon.style.transition = 'none';
      ribbon.style.transform = `translateX(${-firstWidth}px)`;
      // Force layout so the browser registers the starting position
      void ribbon.offsetWidth;
      ribbon.style.transition = 'transform 0.25s ease';
      ribbon.style.transform = 'translateX(0)';
      ribbon.addEventListener('transitionend', () => { sliding = false; }, { once: true });
      setTimeout(() => { sliding = false; }, 300);
    }
  }

  wireTabClicks(groupEl, switchToTab);
  wireTabDrags();

  const contentEl = groupEl.querySelector('.tab-content') as HTMLElement;
  initTabSwipe(contentEl, group.categories, () => getActiveTabId(group), switchToTab);

  wireBookmarkCards(groupEl);

  // Drag handle for the group header
  const handle = groupEl.querySelector('.category-drag-handle') as HTMLElement;
  initHandleDrag(handle, () => ({ kind: 'tabGroup', id: group.id }));

  return groupEl;
}

function renderTabGroup(group: TabGroup, currentCardSize: number, showCardNames: boolean): HTMLElement {
  const groupEl = document.createElement('div');
  groupEl.className = 'tab-group';
  groupEl.dataset.groupId = group.id;

  const activeTabId = getActiveTabId(group);

  groupEl.innerHTML = `
    <div class="tab-group-header">
      <div class="category-drag-handle" title="Drag to reorder">⠿</div>
      <div class="tab-bar" role="tablist">
        ${group.categories
          .map(
            (cat) => `
          <div class="tab ${cat.id === activeTabId ? 'tab-active' : ''}"
               role="tab"
               aria-selected="${cat.id === activeTabId}"
               tabindex="${cat.id === activeTabId ? '0' : '-1'}"
               data-tab-category-id="${escapeHtml(cat.id)}"
               data-group-id="${escapeHtml(group.id)}">
            ${escapeHtml(cat.name)}
          </div>
        `,
          )
          .join('')}
      </div>
      <button class="category-edit-btn" data-group-id="${escapeHtml(group.id)}" data-action="edit-group" title="Edit group">✎</button>
    </div>
    <div class="tab-content">
      ${group.categories
        .map(
          (cat) => `
        <div class="tab-panel ${cat.id === activeTabId ? 'tab-panel-active' : ''}"
             role="tabpanel"
             data-tab-panel-id="${escapeHtml(cat.id)}">
          ${renderBookmarksGrid(cat, currentCardSize, showCardNames)}
        </div>
      `,
        )
        .join('')}
    </div>
  `;

  function switchToTab(catId: string): void {
    activeTabPerGroup.set(group.id, catId);
    groupEl.querySelectorAll('.tab').forEach((t) => t.classList.remove('tab-active'));
    groupEl.querySelector(`[data-tab-category-id="${catId}"]`)?.classList.add('tab-active');
    groupEl.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('tab-panel-active'));
    groupEl.querySelector(`[data-tab-panel-id="${catId}"]`)?.classList.add('tab-panel-active');
  }

  // Wire tab clicks, keyboard activation, and pointer-based drag for reorder/ungroup
  groupEl.querySelectorAll<HTMLElement>('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      switchToTab(tab.dataset.tabCategoryId!);
    });
    tab.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        switchToTab(tab.dataset.tabCategoryId!);
      }
    });
    initTabDrag(tab);
  });

  // Wire bookmark cards in all panels
  wireBookmarkCards(groupEl);

  // Group header drag handle
  const handle = groupEl.querySelector('.category-drag-handle') as HTMLElement;
  initHandleDrag(handle, () => ({ kind: 'tabGroup', id: group.id }));

  return groupEl;
}

export function renderCategories(): void {
  const container = document.getElementById('categories-container')!;
  container.classList.remove('startup-loading');
  container.innerHTML = '';

  const layoutItems = getLayoutItems();
  const categories = getCategories();

  if (categories.length === 0 && layoutItems.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No categories yet</h3>
        <p>Click "+ Category" to get started</p>
      </div>
    `;
    return;
  }

  const currentCardSize = getCardSize();
  const showCardNames = getShowCardNames();

  // If we have layout items (Convex mode), use them
  const items = layoutItems.length > 0 ? layoutItems : categories.map((c) => ({ type: 'category' as const, category: c }));

  const isMobile = mobileQuery().matches;

  items.forEach((item) => {
    if (item.type === 'category') {
      container.appendChild(renderSingleCategory(item.category, currentCardSize, showCardNames));
    } else if (isMobile) {
      container.appendChild(renderMobileTabGroup(item.group, currentCardSize, showCardNames));
    } else {
      container.appendChild(renderTabGroup(item.group, currentCardSize, showCardNames));
    }
  });

  // Initialize drag controller once
  if (!dragListenersInitialized) {
    initDragListeners(renderCategories);
    dragListenersInitialized = true;
  }

  // After initial render, suppress fadeSlide animation on subsequent re-renders
  // (prevents visual disruption when Convex subscription updates the DOM)
  requestAnimationFrame(() => {
    container.classList.add('loaded');
  });
}

export function renderStartupShell(): void {
  const container = document.getElementById('categories-container');
  if (!container) return;
  container.classList.remove('loaded');
  container.classList.add('startup-loading');
  container.innerHTML = `
    <div class="startup-shell-group">
      <div class="startup-shell-bar"></div>
      <div class="startup-shell-grid">
        <div class="startup-shell-card"></div>
        <div class="startup-shell-card"></div>
        <div class="startup-shell-card"></div>
        <div class="startup-shell-card"></div>
      </div>
    </div>
    <div class="startup-shell-group">
      <div class="startup-shell-bar"></div>
      <div class="startup-shell-grid">
        <div class="startup-shell-card"></div>
        <div class="startup-shell-card"></div>
        <div class="startup-shell-card"></div>
      </div>
    </div>
  `;
}
