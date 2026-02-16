import { getCategories, getLayoutItems } from '../data/store';
import type { Category, TabGroup, LayoutItem } from '../types';
import { getIconUrl, FALLBACK_ICON } from '../utils/icons';
import { escapeHtml } from '../utils/escape-html';
import { getCardGap, getCardSize, getShowCardNames, getShowNameOnHover, getBtnSize, getMobileColumns } from '../features/preferences';
import { handleCardMouseMove, handleCardMouseLeave, initLongPress, consumeLongPressGuard } from './bookmark-card';
import {
  handleDragStart,
  handleDragEnd,
  handleDragOver,
  handleDrop,
  handleGridDragOver,
  handleGridDrop,
  handleGridDragLeave,
  handleCategoryDragOver,
  handleCategoryDragLeave,
  handleCategoryDrop,
  executeCategoryDrop,
  handleCategoryHeaderDragStart,
  handleCategoryHeaderDragEnd,
  handleTabGroupHeaderDragStart,
  handleLayoutDragOver,
  handleLayoutDrop,
  handleTabUngroupDragStart,
  handleTabUngroupDragEnd,
  handleTabReorderDragOver,
  handleTabReorderDragLeave,
  handleTabReorderDrop,
  isDraggingLayoutItem,
  getDragBookmarkState,
} from '../features/drag-drop';

// Track active tab per group (not persisted — defaults to first tab)
const activeTabPerGroup = new Map<string, string>();

// Guard: attach container-level drag listeners only once
let containerListenersAttached = false;

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
  switchFn: (catId: string) => void
): void {
  groupEl.querySelectorAll<HTMLElement>('.tab-bar-mobile .tab').forEach((tab) => {
    tab.addEventListener('click', () => switchFn(tab.dataset.tabCategoryId!));
  });
}

function initTabSwipe(
  contentEl: HTMLElement,
  categories: Category[],
  getActive: () => string,
  switchFn: (catId: string) => void
): void {
  let startX = 0;
  let startY = 0;
  let tracking = false;

  contentEl.addEventListener('pointerdown', (e: PointerEvent) => {
    startX = e.clientX;
    startY = e.clientY;
    tracking = true;
  });

  contentEl.addEventListener('pointermove', (e: PointerEvent) => {
    if (!tracking) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    // Vertical scroll intent — cancel swipe tracking
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 15) {
      tracking = false;
      return;
    }
    // Horizontal swipe threshold
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      tracking = false;
      const activeId = getActive();
      const idx = categories.findIndex((c) => c.id === activeId);
      if (idx === -1) return;
      const len = categories.length;
      const nextIdx = dx < 0
        ? (idx + 1) % len   // swipe left → next
        : (idx - 1 + len) % len; // swipe right → prev
      switchFn(categories[nextIdx].id);
    }
  });

  contentEl.addEventListener('pointerup', () => { tracking = false; });
  contentEl.addEventListener('pointercancel', () => { tracking = false; });
}

function renderBookmarksGrid(category: Category, currentCardSize: number, showCardNames: boolean): string {
  const mobile = window.matchMedia('(max-width: 768px)').matches;
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
             draggable="true"
             data-bookmark-id="${escapeHtml(bookmark.id)}"
             data-category-id="${escapeHtml(category.id)}"
             data-index="${index}"
             data-url="${escapeHtml(bookmark.url)}"
             ${nameOnHover ? `title="${escapeHtml(bookmark.title)}"` : ''}>
          <button class="edit-btn" data-action="edit-bookmark" data-category-id="${escapeHtml(category.id)}" data-bookmark-id="${escapeHtml(bookmark.id)}">✎</button>
          <button class="delete-btn" data-action="delete-bookmark" data-category-id="${escapeHtml(category.id)}" data-bookmark-id="${escapeHtml(bookmark.id)}">×</button>
          <img class="bookmark-icon" src="${escapeHtml(getIconUrl(bookmark))}" alt="${escapeHtml(bookmark.title)}">
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
      // Google's default globe is 16x16 even at sz=64 — replace with our fallback
      if (img.naturalWidth <= 16 && img.naturalHeight <= 16 && !img.src.startsWith('data:')) {
        img.src = FALLBACK_ICON;
      }
    }, { once: true });
  });

  const bookmarkCards = el.querySelectorAll<HTMLElement>('.bookmark-card:not(.add-bookmark)');
  bookmarkCards.forEach((card) => {
    card.addEventListener('dragstart', handleDragStart as EventListener);
    card.addEventListener('dragend', handleDragEnd as EventListener);
    card.addEventListener('dragover', handleDragOver as EventListener);
    card.addEventListener('drop', ((e: DragEvent) => handleDrop(e, renderCategories)) as EventListener);
    card.addEventListener('mousemove', handleCardMouseMove as EventListener);
    card.addEventListener('mouseleave', handleCardMouseLeave as EventListener);
    initLongPress(card);

    card.addEventListener('click', (e) => {
      if (consumeLongPressGuard()) return;
      const target = e.target as HTMLElement;
      if (target.closest('[data-action]')) return;
      const url = card.dataset.url;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    });
  });

  // Grid-level drag handlers for continuous drop zones (covers gaps between cards)
  const grids = el.querySelectorAll<HTMLElement>('.bookmarks-grid');
  grids.forEach((grid) => {
    grid.addEventListener('dragover', handleGridDragOver as EventListener);
    grid.addEventListener('drop', ((e: DragEvent) => handleGridDrop(e, renderCategories)) as EventListener);
    grid.addEventListener('dragleave', handleGridDragLeave as EventListener);
  });
}

function renderSingleCategory(category: Category, currentCardSize: number, showCardNames: boolean): HTMLElement {
  const categoryEl = document.createElement('div');
  categoryEl.className = 'category';
  categoryEl.dataset.categoryId = category.id;
  categoryEl.innerHTML = `
    <div class="category-header" draggable="true">
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

  // Bookmark → category drop
  categoryEl.addEventListener('dragover', handleCategoryDragOver as EventListener);
  categoryEl.addEventListener('dragleave', handleCategoryDragLeave as EventListener);
  categoryEl.addEventListener('drop', ((e: DragEvent) => handleCategoryDrop(e, renderCategories)) as EventListener);

  // Category header drag (reorder)
  const header = categoryEl.querySelector('.category-header') as HTMLElement;
  header.addEventListener('dragstart', handleCategoryHeaderDragStart as EventListener);
  header.addEventListener('dragend', handleCategoryHeaderDragEnd as EventListener);

  return categoryEl;
}

function renderMobileTabGroup(group: TabGroup, currentCardSize: number, showCardNames: boolean): HTMLElement {
  const groupEl = document.createElement('div');
  groupEl.className = 'tab-group tab-group-mobile';
  groupEl.dataset.groupId = group.id;

  const activeTabId = getActiveTabId(group);
  const rotated = rotateToActive(group.categories, activeTabId);

  groupEl.innerHTML = `
    <div class="tab-group-header">
      <div class="tab-bar tab-bar-mobile">
        ${rotated
          .map(
            (cat) => `
          <div class="tab ${cat.id === activeTabId ? 'tab-active' : ''}"
               role="button"
               tabindex="0"
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
    // Re-render tab bar with new rotation
    const bar = groupEl.querySelector('.tab-bar-mobile')!;
    const newRotated = rotateToActive(group.categories, catId);
    bar.innerHTML = newRotated
      .map(
        (cat) => `
      <div class="tab ${cat.id === catId ? 'tab-active' : ''}"
           role="button"
           tabindex="0"
           data-tab-category-id="${escapeHtml(cat.id)}"
           data-group-id="${escapeHtml(group.id)}">
        ${escapeHtml(cat.name)}
      </div>
    `,
      )
      .join('');
    // Toggle panels
    groupEl.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('tab-panel-active'));
    groupEl.querySelector(`[data-tab-panel-id="${catId}"]`)?.classList.add('tab-panel-active');
    // Re-wire tab clicks
    wireTabClicks(groupEl, switchToTab);
  }

  wireTabClicks(groupEl, switchToTab);

  const contentEl = groupEl.querySelector('.tab-content') as HTMLElement;
  initTabSwipe(contentEl, group.categories, () => getActiveTabId(group), switchToTab);

  wireBookmarkCards(groupEl);

  return groupEl;
}

function renderTabGroup(group: TabGroup, currentCardSize: number, showCardNames: boolean): HTMLElement {
  const groupEl = document.createElement('div');
  groupEl.className = 'tab-group';
  groupEl.dataset.groupId = group.id;

  const activeTabId = getActiveTabId(group);

  groupEl.innerHTML = `
    <div class="tab-group-header" draggable="true">
      <div class="category-drag-handle" title="Drag to reorder">⠿</div>
      <div class="tab-bar">
        ${group.categories
          .map(
            (cat) => `
          <div class="tab ${cat.id === activeTabId ? 'tab-active' : ''}"
               role="button"
               tabindex="0"
               draggable="true"
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
             data-tab-panel-id="${escapeHtml(cat.id)}">
          ${renderBookmarksGrid(cat, currentCardSize, showCardNames)}
        </div>
      `,
        )
        .join('')}
    </div>
  `;

  // Hover-to-switch timer for bookmark drags (one per group)
  let hoverTimer: number | null = null;

  function clearHoverState(): void {
    if (hoverTimer !== null) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    groupEl.querySelectorAll('.tab').forEach((t) => t.classList.remove('tab-drag-hover'));
  }

  function switchToTab(catId: string): void {
    activeTabPerGroup.set(group.id, catId);
    groupEl.querySelectorAll('.tab').forEach((t) => t.classList.remove('tab-active'));
    groupEl.querySelector(`[data-tab-category-id="${catId}"]`)?.classList.add('tab-active');
    groupEl.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('tab-panel-active'));
    groupEl.querySelector(`[data-tab-panel-id="${catId}"]`)?.classList.add('tab-panel-active');
  }

  // Wire tab clicks and drag-out-to-ungroup
  groupEl.querySelectorAll<HTMLElement>('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const catId = tab.dataset.tabCategoryId!;
      switchToTab(catId);
    });

    // Drag tab out of group to ungroup, or reorder within group
    tab.addEventListener('dragstart', (e: DragEvent) => {
      e.stopPropagation(); // Don't trigger group header drag
      handleTabUngroupDragStart(e, tab.dataset.tabCategoryId!);
    });
    tab.addEventListener('dragend', () => {
      handleTabUngroupDragEnd();
      clearHoverState();
    });

    // Tab reorder within group
    tab.addEventListener('dragover', handleTabReorderDragOver as EventListener);
    tab.addEventListener('dragleave', handleTabReorderDragLeave as EventListener);
    tab.addEventListener('drop', ((e: DragEvent) => {
      handleTabReorderDrop(e, group.categories);
    }) as EventListener);

    // Allow bookmark drops directly on tabs (places bookmark at end of that category)
    tab.addEventListener('dragover', ((e: DragEvent) => {
      if (!getDragBookmarkState()) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer!.dropEffect = 'move';
    }) as EventListener);

    // Bookmark drag → tab hover-to-switch
    tab.addEventListener('dragenter', ((e: DragEvent) => {
      const dragState = getDragBookmarkState();
      if (!dragState) return; // Not a bookmark drag — ignore
      if (tab.classList.contains('tab-active')) return; // Already active

      e.preventDefault();
      clearHoverState();
      tab.classList.add('tab-drag-hover');

      const catId = tab.dataset.tabCategoryId!;
      hoverTimer = window.setTimeout(() => {
        tab.classList.remove('tab-drag-hover');
        switchToTab(catId);
        hoverTimer = null;
      }, 400);
    }) as EventListener);

    tab.addEventListener('dragleave', ((e: DragEvent) => {
      if (!getDragBookmarkState()) return;
      const related = e.relatedTarget as Node | null;
      if (related && tab.contains(related)) return; // Child element flicker
      tab.classList.remove('tab-drag-hover');
      if (hoverTimer !== null) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
      }
    }) as EventListener);

    tab.addEventListener('drop', ((e: DragEvent) => {
      const dragState = getDragBookmarkState();
      if (!dragState) return; // Not a bookmark drag — let tab reorder handler run
      clearHoverState();
      const catId = tab.dataset.tabCategoryId!;
      switchToTab(catId);
      executeCategoryDrop(e, catId, renderCategories);
    }) as EventListener);
  });

  // Clean up hover state when any drag ends (Esc, drop outside, etc.)
  groupEl.addEventListener('dragend', () => clearHoverState(), true);

  // Wire bookmark cards in all panels
  wireBookmarkCards(groupEl);

  // Category-level drop (bookmark → tab group)
  // IMPORTANT: These handlers must NOT mutate the event object (e.g. via Object.assign)
  // because the event bubbles to the container's layout drag handler which reads e.currentTarget.
  groupEl.querySelectorAll<HTMLElement>('.tab-panel').forEach((panel) => {
    const catId = panel.dataset.tabPanelId!;

    panel.addEventListener('dragover', ((e: DragEvent) => {
      // Skip layout drags — let them bubble to container cleanly
      if (isDraggingLayoutItem()) return;
      // Inline the category dragover logic without mutating the event
      const dragState = getDragBookmarkState();
      if (!dragState) return;
      if (catId === dragState.categoryId) return;
      e.preventDefault();
      panel.classList.add('drop-target');
    }) as EventListener);

    panel.addEventListener('dragleave', ((e: DragEvent) => {
      const relatedTarget = e.relatedTarget as Node | null;
      if (relatedTarget && panel.contains(relatedTarget)) return;
      panel.classList.remove('drop-target');
    }) as EventListener);

    panel.addEventListener('drop', ((e: DragEvent) => {
      // Skip layout drags — let them bubble to container cleanly
      if (isDraggingLayoutItem()) return;
      panel.classList.remove('drop-target');
      executeCategoryDrop(e, catId, renderCategories);
    }) as EventListener);
  });

  // Group header drag (reorder groups)
  const header = groupEl.querySelector('.tab-group-header') as HTMLElement;
  header.addEventListener('dragstart', handleTabGroupHeaderDragStart as EventListener);
  header.addEventListener('dragend', handleCategoryHeaderDragEnd as EventListener);

  return groupEl;
}

export function renderCategories(): void {
  const container = document.getElementById('categories-container')!;
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

  const isMobile = window.matchMedia('(max-width: 768px)').matches;

  items.forEach((item) => {
    if (item.type === 'category') {
      container.appendChild(renderSingleCategory(item.category, currentCardSize, showCardNames));
    } else if (isMobile) {
      container.appendChild(renderMobileTabGroup(item.group, currentCardSize, showCardNames));
    } else {
      container.appendChild(renderTabGroup(item.group, currentCardSize, showCardNames));
    }
  });

  // Document-level layout drag handlers — extend drop zone beyond the container
  // (allows dropping when cursor is above the container, e.g. in header area)
  if (!containerListenersAttached) {
    document.addEventListener('dragover', handleLayoutDragOver as EventListener);
    document.addEventListener('drop', ((e: DragEvent) => handleLayoutDrop(e, renderCategories)) as EventListener);
    containerListenersAttached = true;
  }

  // After initial render, suppress fadeSlide animation on subsequent re-renders
  // (prevents visual disruption when Convex subscription updates the DOM)
  requestAnimationFrame(() => {
    container.classList.add('loaded');
  });
}
