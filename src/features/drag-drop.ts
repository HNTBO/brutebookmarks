import {
  getCategories,
  getLayoutItems,
  saveData,
  reorderBookmark,
  reorderCategory,
  reorderTabGroup,
  isConvexMode,
  createTabGroup,
  setCategoryGroup,
  mergeTabGroups,
} from '../data/store';
import { pushUndo, isUndoing } from './undo';
import { HOVER_SWITCH_DELAY, CLICK_GUARD_TIMEOUT, AUTO_SCROLL_EDGE } from '../utils/interaction-constants';

// ---------------------------------------------------------------------------
// Helpers (kept from original — used by drop execution + undo)
// ---------------------------------------------------------------------------

function restoreLocalOrder(categoryId: string, ids: string[], renderCallback: () => void): void {
  const cat = getCategories().find((c) => c.id === categoryId);
  if (!cat) return;
  const bkMap = new Map(cat.bookmarks.map((b) => [b.id, b]));
  cat.bookmarks = ids.map((id) => bkMap.get(id)).filter(Boolean) as typeof cat.bookmarks;
  saveData();
  renderCallback();
}

function moveBookmarkLocal(
  bkId: string, fromCatId: string, toCatId: string, insertIdx: number, renderCallback: () => void,
): void {
  const cats = getCategories();
  const from = cats.find((c) => c.id === fromCatId);
  const to = cats.find((c) => c.id === toCatId);
  if (!from || !to) return;
  const i = from.bookmarks.findIndex((b) => b.id === bkId);
  if (i === -1) return;
  const [m] = from.bookmarks.splice(i, 1);
  to.bookmarks.splice(Math.min(insertIdx, to.bookmarks.length), 0, m);
  saveData();
  renderCallback();
}

export function computeMidpoint(
  bookmarks: { order?: number }[],
  targetIndex: number,
): number {
  const prev = targetIndex > 0 ? (bookmarks[targetIndex - 1].order ?? targetIndex - 1) : 0;
  const next =
    targetIndex < bookmarks.length
      ? (bookmarks[targetIndex].order ?? targetIndex)
      : (bookmarks.length > 0 ? (bookmarks[bookmarks.length - 1].order ?? bookmarks.length - 1) + 1 : 1);
  return (prev + next) / 2;
}

/** Wrap a fire-and-forget mutation call with error logging. */
function safeMutation(promise: Promise<unknown>): void {
  promise.catch((err) => console.error('[DragDrop] mutation failed:', err));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DragKind = 'bookmark' | 'category' | 'tabGroup';

interface BookmarkDragData {
  kind: 'bookmark';
  categoryId: string;
  bookmarkId: string;
  index: number;
}

interface LayoutDragData {
  kind: 'category' | 'tabGroup';
  id: string;
}

type DragData = BookmarkDragData | LayoutDragData;

type DropZone =
  | { action: 'reorder-before'; targetEl: Element }
  | { action: 'reorder-after' }
  | { action: 'reorder-after-item'; targetEl: Element }
  | { action: 'group'; targetCategoryId: string; targetEl: HTMLElement }
  | { action: 'add-to-group'; targetGroupId: string; targetEl: HTMLElement }
  | { action: 'absorb-category'; targetCategoryId: string; groupId: string; targetEl: HTMLElement }
  | null;

// ---------------------------------------------------------------------------
// DragController — unified pointer-events drag engine
// ---------------------------------------------------------------------------

class DragController {
  // State
  private dragData: DragData | null = null;
  private sourceEl: HTMLElement | null = null;
  private proxy: HTMLElement | null = null;
  private pointerId: number | null = null;
  private renderCallback: (() => void) | null = null;
  private pendingRenderFn: (() => void) | null = null;

  // Pointer tracking
  private startX = 0;
  private startY = 0;
  private currentX = 0;
  private currentY = 0;
  private isDragging = false;

  // Bookmark grid drop state
  private gridDropState: { categoryId: string; bookmarkId: string; before: boolean } | null = null;

  // Auto-scroll
  private scrollRAF: number | null = null;

  // Hover-to-switch timer (bookmark drag over tab)
  private hoverSwitchTimer: number | null = null;
  private hoverSwitchTabId: string | null = null;

  // Click guard — after desktop drag, suppress the next click on the source
  private clickGuardActive = false;
  private initialized = false;

  // Bound handlers for document-level listeners (added/removed per drag)
  private onPointerMoveBound = this.onPointerMove.bind(this);
  private onPointerUpBound = this.onPointerUp.bind(this);
  private onKeyDownBound = this.onKeyDown.bind(this);
  private onTouchMoveBound = this.onTouchMove.bind(this);

  // -------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------

  /** Call once after each render to register the render callback. */
  init(renderCallback: () => void): void {
    this.renderCallback = renderCallback;

    if (this.initialized) return;
    this.initialized = true;

    // Global listeners that persist for the lifetime of the app
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.isDragging) this.cancelDrag();
    });
  }

  /** True while a drag is in progress. */
  get active(): boolean { return this.isDragging; }

  /**
   * Gate external re-renders (Convex subscriptions) through the drag
   * controller. If a drag is active, the render is deferred until after
   * the drag completes so the source element isn't destroyed mid-drag.
   */
  requestRender(renderFn: () => void): void {
    if (this.isDragging) {
      this.pendingRenderFn = renderFn;
      return;
    }
    renderFn();
  }

  /** The current drag data (if dragging). */
  get data(): DragData | null { return this.dragData; }

  /** True if we're dragging a layout item (category or tabGroup). */
  get isDraggingLayout(): boolean {
    return this.isDragging && this.dragData !== null && this.dragData.kind !== 'bookmark';
  }

  /** Bookmark drag state for external consumers (e.g. hover-to-switch). */
  get bookmarkState(): { categoryId: string; bookmarkId: string } | null {
    if (!this.isDragging || !this.dragData || this.dragData.kind !== 'bookmark') return null;
    return { categoryId: this.dragData.categoryId, bookmarkId: this.dragData.bookmarkId };
  }

  // -------------------------------------------------------------------
  // Start drag — called from pointer event handlers
  // -------------------------------------------------------------------

  startDrag(e: PointerEvent, data: DragData, sourceEl: HTMLElement): void {
    if (this.isDragging) return;
    if (!e.isPrimary) return; // reject multi-touch

    this.dragData = data;
    this.sourceEl = sourceEl;
    this.pointerId = e.pointerId;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.currentX = e.clientX;
    this.currentY = e.clientY;
    this.isDragging = true;
    this.gridDropState = null;

    // Capture pointer for reliable tracking outside bounds
    try { sourceEl.setPointerCapture(e.pointerId); } catch { /* ignored */ }

    // Suppress browser scroll/pan during drag
    document.documentElement.style.touchAction = 'none';
    document.body.classList.add('dragging');

    // Haptic feedback
    try { navigator.vibrate?.(30); } catch { /* ignored */ }

    // Mark source
    if (data.kind === 'bookmark') {
      sourceEl.classList.add('drag-source-active');
    } else if (data.kind === 'category') {
      const catEl = sourceEl.closest('.category') as HTMLElement | null;
      const tabEl = document.querySelector(`[data-tab-category-id="${data.id}"]`) as HTMLElement | null;
      if (catEl) catEl.classList.add('dragging-category');
      if (tabEl) tabEl.classList.add('dragging-tab');
    } else if (data.kind === 'tabGroup') {
      const groupEl = sourceEl.closest('.tab-group') as HTMLElement | null;
      if (groupEl) groupEl.classList.add('dragging-category');
    }

    // Create proxy
    this.createProxy(sourceEl, e.clientX, e.clientY);

    // Document-level listeners
    document.addEventListener('pointermove', this.onPointerMoveBound);
    document.addEventListener('pointerup', this.onPointerUpBound);
    document.addEventListener('pointercancel', this.onPointerUpBound);
    document.addEventListener('keydown', this.onKeyDownBound);
    // Non-passive touchmove on document prevents compositor from claiming the
    // touch for scroll mid-drag (touch-action is read at gesture start, so
    // setting it during startDrag is too late — must use preventDefault).
    document.addEventListener('touchmove', this.onTouchMoveBound, { passive: false });

    // Start auto-scroll loop
    this.startAutoScroll();
  }

  cancelDrag(): void {
    if (!this.isDragging) return;
    this.cleanup();
  }

  /** Returns true if a post-drag click guard is active and consumes it. */
  consumeClickGuard(): boolean {
    if (this.clickGuardActive) {
      this.clickGuardActive = false;
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------
  // Proxy lifecycle
  // -------------------------------------------------------------------

  private createProxy(source: HTMLElement, x: number, y: number): void {
    const rect = source.getBoundingClientRect();
    const proxy = source.cloneNode(true) as HTMLElement;
    proxy.className = 'drag-proxy';
    // Copy computed dimensions
    proxy.style.width = `${rect.width}px`;
    proxy.style.height = `${rect.height}px`;
    proxy.style.left = `${x - rect.width / 2}px`;
    proxy.style.top = `${y - rect.height / 2}px`;
    document.body.appendChild(proxy);
    this.proxy = proxy;
  }

  private moveProxy(x: number, y: number): void {
    if (!this.proxy) return;
    const w = parseFloat(this.proxy.style.width);
    const h = parseFloat(this.proxy.style.height);
    this.proxy.style.left = `${x - w / 2}px`;
    this.proxy.style.top = `${y - h / 2}px`;
  }

  private removeProxy(): void {
    if (this.proxy) {
      this.proxy.remove();
      this.proxy = null;
    }
  }

  // -------------------------------------------------------------------
  // Pointer event handlers
  // -------------------------------------------------------------------

  private onPointerMove(e: PointerEvent): void {
    if (!e.isPrimary || !this.isDragging) return;
    e.preventDefault();

    this.currentX = e.clientX;
    this.currentY = e.clientY;

    this.moveProxy(e.clientX, e.clientY);

    // Hit-test based on drag kind
    if (this.dragData!.kind === 'bookmark') {
      this.hitTestBookmark(e.clientX, e.clientY);
      this.hitTestTabHover(e.clientX, e.clientY);
    } else {
      this.hitTestLayout(e.clientX, e.clientY);
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.isDragging) return;

    const x = e.clientX;
    const y = e.clientY;

    if (this.dragData!.kind === 'bookmark') {
      this.executeBookmarkDrop(x, y);
    } else {
      this.executeLayoutDrop(x, y);
    }

    // Click guard for mouse/pen (prevent URL open after drag)
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      this.clickGuardActive = true;
      setTimeout(() => { this.clickGuardActive = false; }, CLICK_GUARD_TIMEOUT);
    }

    this.cleanup();
  }

  private onTouchMove(e: TouchEvent): void {
    if (this.isDragging) e.preventDefault();
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.isDragging) {
      this.cancelDrag();
    }
  }

  // -------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------

  private cleanup(): void {
    this.isDragging = false;

    // Release pointer capture
    if (this.sourceEl && this.pointerId !== null) {
      try { this.sourceEl.releasePointerCapture(this.pointerId); } catch { /* ignored */ }
    }

    // Remove proxy
    this.removeProxy();

    // Remove document listeners
    document.removeEventListener('pointermove', this.onPointerMoveBound);
    document.removeEventListener('pointerup', this.onPointerUpBound);
    document.removeEventListener('pointercancel', this.onPointerUpBound);
    document.removeEventListener('keydown', this.onKeyDownBound);
    document.removeEventListener('touchmove', this.onTouchMoveBound);

    // Restore touch-action
    document.documentElement.style.touchAction = '';
    document.body.classList.remove('dragging');

    // Clean up visual states
    document.querySelectorAll('.drag-source-active').forEach((el) => el.classList.remove('drag-source-active'));
    document.querySelectorAll('.dragging-category').forEach((el) => el.classList.remove('dragging-category'));
    document.querySelectorAll('.dragging-tab').forEach((el) => el.classList.remove('dragging-tab'));
    document.querySelectorAll('.card-drop-indicator').forEach((el) => el.remove());
    document.querySelectorAll('.layout-drop-indicator').forEach((el) => el.remove());
    document.querySelectorAll('.tab-drop-indicator').forEach((el) => el.remove());
    document.querySelectorAll('.group-drop-target').forEach((el) => el.classList.remove('group-drop-target'));
    document.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
    document.querySelectorAll('.tab-drag-hover').forEach((el) => el.classList.remove('tab-drag-hover'));

    // Stop auto-scroll
    this.stopAutoScroll();

    // Clear hover timer
    this.clearHoverSwitch();

    // Reset state
    this.dragData = null;
    this.sourceEl = null;
    this.pointerId = null;
    this.gridDropState = null;

    // Flush any render that was deferred during drag
    if (this.pendingRenderFn) {
      const fn = this.pendingRenderFn;
      this.pendingRenderFn = null;
      fn();
    }
  }

  // -------------------------------------------------------------------
  // Bookmark hit-testing (grid-level)
  // -------------------------------------------------------------------

  private hitTestBookmark(clientX: number, clientY: number): void {
    const bkData = this.dragData as BookmarkDragData;

    // Clean up previous indicators
    document.querySelectorAll('.card-drop-indicator').forEach((el) => el.remove());
    document.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
    this.gridDropState = null;

    // Find the grid under the pointer (proxy has pointer-events: none, so elementFromPoint ignores it)
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return;

    const grid = el.closest('.bookmarks-grid') as HTMLElement | null;
    if (!grid) {
      // Maybe over a category/panel background — show category drop target
      const catEl = el.closest('.category, .tab-panel') as HTMLElement | null;
      if (catEl) {
        const catId = catEl.dataset.categoryId || catEl.dataset.tabPanelId;
        if (catId && catId !== bkData.categoryId) {
          catEl.classList.add('drop-target');
        }
      }
      return;
    }

    const cards = Array.from(grid.querySelectorAll<HTMLElement>('.bookmark-card:not(.add-bookmark)'))
      .filter((c) => c.dataset.bookmarkId !== bkData.bookmarkId);
    if (cards.length === 0) {
      // Empty grid — show category-level drop target
      const catEl = grid.closest('.category, .tab-panel') as HTMLElement | null;
      if (catEl) {
        const catId = catEl.dataset.categoryId || catEl.dataset.tabPanelId;
        if (catId && catId !== bkData.categoryId) {
          catEl.classList.add('drop-target');
        }
      }
      return;
    }

    // Group cards by visual row
    const rows: { top: number; bottom: number; cards: HTMLElement[] }[] = [];
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      const row = rows.find((r) => Math.abs(r.top - rect.top) < rect.height / 2);
      if (row) {
        row.cards.push(card);
        row.bottom = Math.max(row.bottom, rect.bottom);
      } else {
        rows.push({ top: rect.top, bottom: rect.bottom, cards: [card] });
      }
    }
    rows.sort((a, b) => a.top - b.top);

    // Find target row
    let targetRow = rows[0];
    let minRowDist = Infinity;
    for (const row of rows) {
      if (clientY >= row.top && clientY <= row.bottom) {
        targetRow = row;
        minRowDist = 0;
        break;
      }
      const dist = clientY < row.top ? row.top - clientY : clientY - row.bottom;
      if (dist < minRowDist) {
        minRowDist = dist;
        targetRow = row;
      }
    }

    // Sort left-to-right
    targetRow.cards.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);

    // Find nearest card
    let nearestCard: HTMLElement = targetRow.cards[0];
    let nearestDist = Infinity;
    for (const card of targetRow.cards) {
      const rect = card.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const dist = Math.abs(clientX - centerX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestCard = card;
      }
    }

    const cardRect = nearestCard.getBoundingClientRect();
    const before = clientX < cardRect.left + cardRect.width / 2;
    const idx = targetRow.cards.indexOf(nearestCard);

    // Suppress no-op indicator at origin
    if (bkData.categoryId === nearestCard.dataset.categoryId) {
      const cat = getCategories().find((c) => c.id === bkData.categoryId);
      if (cat) {
        const dragIdx = cat.bookmarks.findIndex((b) => b.id === bkData.bookmarkId);
        const targetIdx = cat.bookmarks.findIndex((b) => b.id === nearestCard.dataset.bookmarkId);
        if ((before && targetIdx === dragIdx + 1) || (!before && targetIdx === dragIdx - 1)) {
          return;
        }
      }
    }

    // Position indicator
    const gridRect = grid.getBoundingClientRect();
    const indicator = document.createElement('div');
    indicator.className = 'card-drop-indicator';

    let indicatorX: number;
    if (before) {
      if (idx > 0) {
        const prevRect = targetRow.cards[idx - 1].getBoundingClientRect();
        indicatorX = (prevRect.right + cardRect.left) / 2;
      } else {
        indicatorX = cardRect.left;
      }
    } else {
      if (idx < targetRow.cards.length - 1) {
        const nextRect = targetRow.cards[idx + 1].getBoundingClientRect();
        indicatorX = (cardRect.right + nextRect.left) / 2;
      } else {
        indicatorX = cardRect.right;
      }
    }

    indicator.style.left = `${indicatorX - gridRect.left - 2}px`;
    indicator.style.top = `${cardRect.top - gridRect.top}px`;
    indicator.style.height = `${cardRect.height}px`;
    grid.appendChild(indicator);

    this.gridDropState = {
      categoryId: nearestCard.dataset.categoryId!,
      bookmarkId: nearestCard.dataset.bookmarkId!,
      before,
    };
  }

  // -------------------------------------------------------------------
  // Tab hover-to-switch (bookmark dragged over a tab)
  // -------------------------------------------------------------------

  private hitTestTabHover(clientX: number, clientY: number): void {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) { this.clearHoverSwitch(); return; }

    const tab = el.closest('.tab') as HTMLElement | null;
    if (!tab || tab.classList.contains('tab-active')) {
      this.clearHoverSwitch();
      return;
    }

    const catId = tab.dataset.tabCategoryId;
    if (!catId || catId === this.hoverSwitchTabId) return; // already timing this tab

    this.clearHoverSwitch();
    this.hoverSwitchTabId = catId;
    tab.classList.add('tab-drag-hover');

    this.hoverSwitchTimer = window.setTimeout(() => {
      tab.classList.remove('tab-drag-hover');
      // Simulate tab switch
      const groupEl = tab.closest('.tab-group') as HTMLElement | null;
      if (groupEl) {
        groupEl.querySelectorAll('.tab').forEach((t) => t.classList.remove('tab-active'));
        tab.classList.add('tab-active');
        groupEl.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('tab-panel-active'));
        groupEl.querySelector(`[data-tab-panel-id="${catId}"]`)?.classList.add('tab-panel-active');
      }
      this.hoverSwitchTimer = null;
      this.hoverSwitchTabId = null;
    }, HOVER_SWITCH_DELAY);
  }

  private clearHoverSwitch(): void {
    if (this.hoverSwitchTimer !== null) {
      clearTimeout(this.hoverSwitchTimer);
      this.hoverSwitchTimer = null;
    }
    if (this.hoverSwitchTabId) {
      document.querySelectorAll('.tab-drag-hover').forEach((el) => el.classList.remove('tab-drag-hover'));
      this.hoverSwitchTabId = null;
    }
  }

  // -------------------------------------------------------------------
  // Layout hit-testing (categories + tab groups)
  // -------------------------------------------------------------------

  private hitTestLayout(clientX: number, clientY: number): void {
    const layoutData = this.dragData as LayoutDragData;

    const container = document.getElementById('categories-container');
    if (!container) return;

    // Clean up
    container.querySelectorAll('.layout-drop-indicator').forEach((el) => el.remove());
    container.querySelectorAll('.group-drop-target').forEach((el) => el.classList.remove('group-drop-target'));
    document.querySelectorAll('.tab-drop-indicator').forEach((el) => el.remove());

    // Tab reorder zone: if dragging a category near a tab-group header, show tab indicators
    if (layoutData.kind === 'category') {
      const TOLERANCE = 12;
      const headers = container.querySelectorAll<HTMLElement>('.tab-group-header');
      for (const header of headers) {
        const rect = header.getBoundingClientRect();
        if (clientY >= rect.top - TOLERANCE && clientY <= rect.bottom + TOLERANCE
            && clientX >= rect.left && clientX <= rect.right) {
          const groupEl = header.closest('.tab-group')!;
          const tabs = Array.from(groupEl.querySelectorAll<HTMLElement>('.tab'));
          let nearestTab: HTMLElement | null = null;
          let nearestDist = Infinity;
          for (const tab of tabs) {
            const tabRect = tab.getBoundingClientRect();
            const centerX = tabRect.left + tabRect.width / 2;
            const dist = Math.abs(clientX - centerX);
            if (dist < nearestDist) {
              nearestDist = dist;
              nearestTab = tab;
            }
          }
          if (nearestTab && nearestTab.dataset.tabCategoryId !== layoutData.id) {
            const tabRect = nearestTab.getBoundingClientRect();
            const isLeftHalf = clientX < tabRect.left + tabRect.width / 2;
            const indicator = document.createElement('div');
            indicator.className = 'tab-drop-indicator';
            if (isLeftHalf) {
              nearestTab.parentNode!.insertBefore(indicator, nearestTab);
            } else {
              nearestTab.parentNode!.insertBefore(indicator, nearestTab.nextSibling);
            }
          }
          return;
        }
      }
    }

    const zone = this.detectDropZone(clientX, clientY, container);
    if (!zone) return;

    if (zone.action === 'reorder-before') {
      const prev = zone.targetEl.previousElementSibling as HTMLElement | null;
      const prevId = prev?.dataset.categoryId || prev?.dataset.groupId;
      if (prevId === layoutData.id) return;
      const indicator = document.createElement('div');
      indicator.className = 'layout-drop-indicator';
      container.insertBefore(indicator, zone.targetEl);
    } else if (zone.action === 'reorder-after-item') {
      const next = zone.targetEl.nextElementSibling as HTMLElement | null;
      const nextId = next?.dataset.categoryId || next?.dataset.groupId;
      if (nextId === layoutData.id) return;
      const targetId = (zone.targetEl as HTMLElement).dataset.categoryId || (zone.targetEl as HTMLElement).dataset.groupId;
      if (targetId === layoutData.id) return;
      const indicator = document.createElement('div');
      indicator.className = 'layout-drop-indicator';
      container.insertBefore(indicator, zone.targetEl.nextSibling);
    } else if (zone.action === 'reorder-after') {
      const layoutEls = Array.from(container.querySelectorAll(':scope > .category, :scope > .tab-group'));
      const last = layoutEls[layoutEls.length - 1] as HTMLElement;
      const lastId = last?.dataset.categoryId || last?.dataset.groupId;
      if (lastId === layoutData.id) return;
      const indicator = document.createElement('div');
      indicator.className = 'layout-drop-indicator';
      container.appendChild(indicator);
    } else if (zone.action === 'group' || zone.action === 'add-to-group' || zone.action === 'absorb-category') {
      zone.targetEl.classList.add('group-drop-target');
    }
  }

  private detectDropZone(clientX: number, clientY: number, container: HTMLElement): DropZone {
    const layoutEls = Array.from(container.querySelectorAll(':scope > .category, :scope > .tab-group'));
    if (layoutEls.length === 0) return null;

    const layoutData = this.dragData as LayoutDragData;
    const dragId = layoutData.id;
    const dragType = layoutData.kind;

    for (const item of layoutEls) {
      const rect = item.getBoundingClientRect();
      const el = item as HTMLElement;
      const elId = el.dataset.categoryId || el.dataset.groupId;
      if (elId === dragId) continue;
      if (clientY < rect.top || clientY > rect.bottom) continue;

      const relativeY = (clientY - rect.top) / rect.height;

      if (el.classList.contains('tab-group')) {
        if (relativeY < 0.3) return { action: 'reorder-before', targetEl: item };
        if (relativeY > 0.7) return { action: 'reorder-after-item', targetEl: item };
        const groupId = el.dataset.groupId!;
        if (dragType === 'category') {
          const categories = getCategories();
          const draggedCat = categories.find((c) => c.id === dragId);
          if (draggedCat?.groupId === groupId) return { action: 'reorder-after-item', targetEl: item };
          return { action: 'add-to-group', targetGroupId: groupId, targetEl: el };
        }
        if (dragType === 'tabGroup') {
          return { action: 'add-to-group', targetGroupId: groupId, targetEl: el };
        }
      }

      if (el.classList.contains('category')) {
        if (relativeY < 0.4) return { action: 'reorder-before', targetEl: item };
        if (relativeY > 0.6) return { action: 'reorder-after-item', targetEl: item };
        if (dragType === 'category') {
          return { action: 'group', targetCategoryId: el.dataset.categoryId!, targetEl: el };
        }
        if (dragType === 'tabGroup') {
          return { action: 'absorb-category', targetCategoryId: el.dataset.categoryId!, groupId: dragId, targetEl: el };
        }
        return { action: 'reorder-before', targetEl: item };
      }
    }

    // Gap / beyond last element
    let lastNonDraggedEl: Element | null = null;
    for (const item of layoutEls) {
      const el = item as HTMLElement;
      const elId = el.dataset.categoryId || el.dataset.groupId;
      if (elId === dragId) continue;
      const rect = item.getBoundingClientRect();
      if (clientY < rect.top) return { action: 'reorder-before', targetEl: item };
      lastNonDraggedEl = item;
    }

    if (lastNonDraggedEl) return { action: 'reorder-after-item', targetEl: lastNonDraggedEl };
    return { action: 'reorder-after' };
  }

  // -------------------------------------------------------------------
  // Drop execution — bookmark
  // -------------------------------------------------------------------

  private executeBookmarkDrop(_x: number, _y: number): void {
    const bkData = this.dragData as BookmarkDragData;
    const renderCb = this.renderCallback!;

    if (this.gridDropState) {
      // Drop onto a specific position between cards
      const { categoryId: targetCatId, bookmarkId: targetBkId, before } = this.gridDropState;
      if (bkData.bookmarkId !== targetBkId) {
        performBookmarkDrop(
          { categoryId: bkData.categoryId, bookmarkId: bkData.bookmarkId, index: bkData.index },
          targetCatId, targetBkId, before, renderCb,
        );
      }
      return;
    }

    // Check if over a category drop target (cross-category append)
    const el = document.elementFromPoint(this.currentX, this.currentY);
    if (el) {
      const catEl = el.closest('.category, .tab-panel') as HTMLElement | null;
      if (catEl) {
        const targetCatId = catEl.dataset.categoryId || catEl.dataset.tabPanelId;
        if (targetCatId && targetCatId !== bkData.categoryId) {
          this.executeCategoryAppend(bkData, targetCatId, renderCb);
        }
      }
    }
  }

  /** Append a bookmark to the end of a different category. */
  private executeCategoryAppend(
    bkData: BookmarkDragData,
    targetCategoryId: string,
    renderCallback: () => void,
  ): void {
    const categories = getCategories();

    if (isConvexMode()) {
      const sourceCategory = categories.find((c) => c.id === bkData.categoryId);
      const targetCategory = categories.find((c) => c.id === targetCategoryId);
      if (!sourceCategory || !targetCategory) return;

      const sourceIndex = sourceCategory.bookmarks.findIndex((b) => b.id === bkData.bookmarkId);
      const oldOrder = sourceIndex !== -1 ? (sourceCategory.bookmarks[sourceIndex].order ?? 0) : 0;
      const sourceCatId = bkData.categoryId;
      const bkId = bkData.bookmarkId;

      if (sourceIndex !== -1) {
        const [moved] = sourceCategory.bookmarks.splice(sourceIndex, 1);
        targetCategory.bookmarks.push(moved);
        renderCallback();
      }

      const lastOrder = targetCategory.bookmarks.length > 0
        ? Math.max(...targetCategory.bookmarks.map((b) => b.order ?? 0))
        : 0;
      const newOrder = lastOrder + 1;
      safeMutation(reorderBookmark(bkId, newOrder, targetCategoryId));
      if (!isUndoing()) {
        pushUndo({
          undo: () => reorderBookmark(bkId, oldOrder, sourceCatId),
          redo: () => reorderBookmark(bkId, newOrder, targetCategoryId),
        });
      }
    } else {
      const sourceCategory = categories.find((c) => c.id === bkData.categoryId);
      const targetCategory = categories.find((c) => c.id === targetCategoryId);
      if (!sourceCategory || !targetCategory) return;

      const sourceIndex = sourceCategory.bookmarks.findIndex((b) => b.id === bkData.bookmarkId);
      if (sourceIndex !== -1) {
        const bkId = bkData.bookmarkId;
        const srcCatId = bkData.categoryId;
        const origIdx = sourceIndex;
        const [movedBookmark] = sourceCategory.bookmarks.splice(sourceIndex, 1);
        targetCategory.bookmarks.push(movedBookmark);
        if (!isUndoing()) {
          const tgtCatId = targetCategoryId;
          pushUndo({
            undo: () => moveBookmarkLocal(bkId, tgtCatId, srcCatId, origIdx, renderCallback),
            redo: () => moveBookmarkLocal(bkId, srcCatId, tgtCatId, targetCategory.bookmarks.length - 1, renderCallback),
          });
        }
        saveData();
        renderCallback();
      }
    }
  }

  // -------------------------------------------------------------------
  // Drop execution — layout (category/tabGroup reorder, group, merge)
  // -------------------------------------------------------------------

  private executeLayoutDrop(clientX: number, clientY: number): void {
    const layoutData = this.dragData as LayoutDragData;
    const container = document.getElementById('categories-container');
    if (!container) return;

    // Check tab reorder first: was a tab-drop-indicator visible?
    const tabIndicator = document.querySelector('.tab-drop-indicator');
    if (tabIndicator && layoutData.kind === 'category') {
      this.executeTabDrop(clientX, clientY, layoutData);
      return;
    }

    const zone = this.detectDropZone(clientX, clientY, container);
    if (!zone) return;

    if (zone.action === 'group' && layoutData.kind === 'category') {
      safeMutation(createTabGroup('Tab Group', [zone.targetCategoryId, layoutData.id]));
      return;
    }

    if (zone.action === 'add-to-group') {
      if (layoutData.kind === 'category') {
        safeMutation(setCategoryGroup(layoutData.id, zone.targetGroupId));
      } else if (layoutData.kind === 'tabGroup') {
        safeMutation(mergeTabGroups(layoutData.id, zone.targetGroupId));
      }
      return;
    }

    if (zone.action === 'absorb-category' && layoutData.kind === 'tabGroup') {
      safeMutation(setCategoryGroup(zone.targetCategoryId, layoutData.id));
      return;
    }

    // Reorder
    const items = getLayoutItems();
    let targetIndex = items.length;
    if (zone.action === 'reorder-before') {
      const targetElId = (zone.targetEl as HTMLElement).dataset.categoryId || (zone.targetEl as HTMLElement).dataset.groupId;
      targetIndex = items.findIndex((item) => {
        const id = item.type === 'category' ? item.category.id : item.group.id;
        return id === targetElId;
      });
      if (targetIndex === -1) targetIndex = items.length;
    } else if (zone.action === 'reorder-after-item') {
      const targetElId = (zone.targetEl as HTMLElement).dataset.categoryId || (zone.targetEl as HTMLElement).dataset.groupId;
      const idx = items.findIndex((item) => {
        const id = item.type === 'category' ? item.category.id : item.group.id;
        return id === targetElId;
      });
      targetIndex = idx === -1 ? items.length : idx + 1;
    }

    const sourceIndex = items.findIndex((item) => {
      const id = item.type === 'category' ? item.category.id : item.group.id;
      return id === layoutData.id;
    });

    // Category nested inside a tab group — ungroup with positioned order
    if (sourceIndex === -1 && layoutData.kind === 'category') {
      const orderList = items.map((item) =>
        item.type === 'category' ? (item.category.order ?? 0) : item.group.order
      );
      const prev = targetIndex > 0 ? orderList[targetIndex - 1] : 0;
      const next = targetIndex < orderList.length ? orderList[targetIndex] : prev + 2;
      const newOrder = (prev + next) / 2;
      safeMutation(setCategoryGroup(layoutData.id, null, newOrder));
      return;
    }
    if (sourceIndex === -1) return;
    if (sourceIndex === targetIndex || sourceIndex === targetIndex - 1) return;

    const orderList = items.map((item) =>
      item.type === 'category' ? (item.category.order ?? 0) : item.group.order
    );

    const withoutDragged = orderList.filter((_, i) => i !== sourceIndex);
    const adjustedTarget = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    const prev = adjustedTarget > 0 ? withoutDragged[adjustedTarget - 1] : 0;
    const next = adjustedTarget < withoutDragged.length ? withoutDragged[adjustedTarget] : prev + 2;
    const newOrder = (prev + next) / 2;

    const oldOrder = orderList[sourceIndex];
    if (layoutData.kind === 'category') {
      safeMutation(reorderCategory(layoutData.id, newOrder));
    } else {
      safeMutation(reorderTabGroup(layoutData.id, newOrder));
    }
    if (!isUndoing()) {
      const itemId = layoutData.id;
      const itemType = layoutData.kind;
      pushUndo({
        undo: () => { if (itemType === 'category') reorderCategory(itemId, oldOrder); else reorderTabGroup(itemId, oldOrder); },
        redo: () => { if (itemType === 'category') reorderCategory(itemId, newOrder); else reorderTabGroup(itemId, newOrder); },
      });
    }
  }

  // -------------------------------------------------------------------
  // Tab reorder / cross-group drop
  // -------------------------------------------------------------------

  private executeTabDrop(clientX: number, clientY: number, layoutData: LayoutDragData): void {
    // Find which tab group header the pointer is over
    const container = document.getElementById('categories-container');
    if (!container) return;

    const headers = container.querySelectorAll<HTMLElement>('.tab-group-header');
    for (const header of headers) {
      const rect = header.getBoundingClientRect();
      const TOLERANCE = 12;
      if (clientY >= rect.top - TOLERANCE && clientY <= rect.bottom + TOLERANCE
          && clientX >= rect.left && clientX <= rect.right) {
        const groupEl = header.closest('.tab-group') as HTMLElement;
        if (!groupEl) continue;
        const groupId = groupEl.dataset.groupId!;

        const tabs = Array.from(groupEl.querySelectorAll<HTMLElement>('.tab'));
        let nearestTab: HTMLElement | null = null;
        let nearestDist = Infinity;
        for (const tab of tabs) {
          const tabRect = tab.getBoundingClientRect();
          const centerX = tabRect.left + tabRect.width / 2;
          const dist = Math.abs(clientX - centerX);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestTab = tab;
          }
        }
        if (!nearestTab) return;

        const targetCategoryId = nearestTab.dataset.tabCategoryId!;
        if (targetCategoryId === layoutData.id) return;

        const tabRect = nearestTab.getBoundingClientRect();
        const isLeftHalf = clientX < tabRect.left + tabRect.width / 2;

        // Get group categories for midpoint computation
        const allCategories = getCategories();
        const groupCategories = allCategories
          .filter((c) => c.groupId === groupId)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        const draggedInGroup = groupCategories.some((c) => c.id === layoutData.id);

        if (draggedInGroup) {
          const filtered = groupCategories.filter((c) => c.id !== layoutData.id);
          const targetIndex = filtered.findIndex((c) => c.id === targetCategoryId);
          const insertIndex = isLeftHalf ? targetIndex : targetIndex + 1;
          const newOrder = computeMidpoint(filtered, insertIndex);
          safeMutation(reorderCategory(layoutData.id, newOrder));
        } else {
          const targetIndex = groupCategories.findIndex((c) => c.id === targetCategoryId);
          const insertIndex = isLeftHalf ? targetIndex : targetIndex + 1;
          const newOrder = computeMidpoint(groupCategories, insertIndex);
          safeMutation(setCategoryGroup(layoutData.id, groupId, newOrder));
        }
        return;
      }
    }
  }

  // -------------------------------------------------------------------
  // Auto-scroll
  // -------------------------------------------------------------------

  private startAutoScroll(): void {
    const scroll = () => {
      if (!this.isDragging) return;
      const EDGE = AUTO_SCROLL_EDGE;
      const y = this.currentY;
      const vh = window.innerHeight;

      if (y < EDGE) {
        const speed = ((EDGE - y) / EDGE) * 12;
        window.scrollBy(0, -speed);
      } else if (y > vh - EDGE) {
        const speed = ((y - (vh - EDGE)) / EDGE) * 12;
        window.scrollBy(0, speed);
      }

      this.scrollRAF = requestAnimationFrame(scroll);
    };
    this.scrollRAF = requestAnimationFrame(scroll);
  }

  private stopAutoScroll(): void {
    if (this.scrollRAF !== null) {
      cancelAnimationFrame(this.scrollRAF);
      this.scrollRAF = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Core bookmark drop logic (kept intact from original)
// ---------------------------------------------------------------------------

function performBookmarkDrop(
  claimed: { categoryId: string; bookmarkId: string; index: number },
  targetCategoryId: string,
  targetBookmarkId: string,
  dropBefore: boolean,
  renderCallback: () => void,
): void {
  const categories = getCategories();

  if (isConvexMode()) {
    if (claimed.categoryId === targetCategoryId) {
      const category = categories.find((c) => c.id === targetCategoryId);
      if (!category) return;

      const rawTargetIndex = category.bookmarks.findIndex((b) => b.id === targetBookmarkId);
      if (rawTargetIndex === -1) return;
      const sourceIndex = category.bookmarks.findIndex((b) => b.id === claimed.bookmarkId);
      const oldOrder = sourceIndex !== -1 ? (category.bookmarks[sourceIndex].order ?? 0) : 0;

      const filtered = category.bookmarks.filter((b) => b.id !== claimed.bookmarkId);
      const filteredTargetIndex = filtered.findIndex((b) => b.id === targetBookmarkId);
      const insertIndex = dropBefore ? filteredTargetIndex : filteredTargetIndex + 1;
      const newOrder = computeMidpoint(filtered, insertIndex);

      if (sourceIndex !== -1) {
        const [moved] = category.bookmarks.splice(sourceIndex, 1);
        const adjustedInsert = dropBefore
          ? (sourceIndex < rawTargetIndex ? rawTargetIndex - 1 : rawTargetIndex)
          : (sourceIndex < rawTargetIndex ? rawTargetIndex : rawTargetIndex + 1);
        category.bookmarks.splice(adjustedInsert, 0, moved);
        renderCallback();
      }

      const bkId = claimed.bookmarkId;
      safeMutation(reorderBookmark(bkId, newOrder));
      if (!isUndoing()) {
        pushUndo({
          undo: () => reorderBookmark(bkId, oldOrder),
          redo: () => reorderBookmark(bkId, newOrder),
        });
      }
    } else {
      const sourceCategory = categories.find((c) => c.id === claimed.categoryId);
      const targetCategory = categories.find((c) => c.id === targetCategoryId);
      if (!sourceCategory || !targetCategory) return;

      const targetIndex = targetCategory.bookmarks.findIndex((b) => b.id === targetBookmarkId);
      if (targetIndex === -1) return;
      const sourceIndex = sourceCategory.bookmarks.findIndex((b) => b.id === claimed.bookmarkId);
      const oldOrder = sourceIndex !== -1 ? (sourceCategory.bookmarks[sourceIndex].order ?? 0) : 0;
      const sourceCatId = claimed.categoryId;

      const insertIndex = dropBefore ? targetIndex : targetIndex + 1;
      const newOrder = computeMidpoint(targetCategory.bookmarks, insertIndex);

      if (sourceIndex !== -1) {
        const [moved] = sourceCategory.bookmarks.splice(sourceIndex, 1);
        targetCategory.bookmarks.splice(insertIndex, 0, moved);
        renderCallback();
      }

      const bkId = claimed.bookmarkId;
      safeMutation(reorderBookmark(bkId, newOrder, targetCategoryId));
      if (!isUndoing()) {
        pushUndo({
          undo: () => reorderBookmark(bkId, oldOrder, sourceCatId),
          redo: () => reorderBookmark(bkId, newOrder, targetCategoryId),
        });
      }
    }
  } else {
    if (claimed.categoryId === targetCategoryId) {
      const category = categories.find((c) => c.id === targetCategoryId);
      if (!category) return;

      const sourceIndex = category.bookmarks.findIndex((b) => b.id === claimed.bookmarkId);
      const rawTargetIndex = category.bookmarks.findIndex((b) => b.id === targetBookmarkId);

      if (sourceIndex !== -1 && rawTargetIndex !== -1) {
        const beforeIds = category.bookmarks.map((b) => b.id);
        const [movedBookmark] = category.bookmarks.splice(sourceIndex, 1);
        const adjustedInsert = dropBefore
          ? (sourceIndex < rawTargetIndex ? rawTargetIndex - 1 : rawTargetIndex)
          : (sourceIndex < rawTargetIndex ? rawTargetIndex : rawTargetIndex + 1);
        category.bookmarks.splice(adjustedInsert, 0, movedBookmark);
        if (!isUndoing()) {
          const afterIds = category.bookmarks.map((b) => b.id);
          const catId = targetCategoryId;
          pushUndo({
            undo: () => restoreLocalOrder(catId, beforeIds, renderCallback),
            redo: () => restoreLocalOrder(catId, afterIds, renderCallback),
          });
        }
        saveData();
        renderCallback();
      }
    } else {
      const sourceCategory = categories.find((c) => c.id === claimed.categoryId);
      const targetCategory = categories.find((c) => c.id === targetCategoryId);
      if (!sourceCategory || !targetCategory) return;

      const sourceIndex = sourceCategory.bookmarks.findIndex((b) => b.id === claimed.bookmarkId);
      const targetIndex = targetCategory.bookmarks.findIndex((b) => b.id === targetBookmarkId);

      if (sourceIndex !== -1 && targetIndex !== -1) {
        const bkId = claimed.bookmarkId;
        const srcCatId = claimed.categoryId;
        const origIdx = sourceIndex;
        const insertIndex = dropBefore ? targetIndex : targetIndex + 1;
        const [movedBookmark] = sourceCategory.bookmarks.splice(sourceIndex, 1);
        targetCategory.bookmarks.splice(insertIndex, 0, movedBookmark);
        if (!isUndoing()) {
          const tgtCatId = targetCategoryId;
          pushUndo({
            undo: () => moveBookmarkLocal(bkId, tgtCatId, srcCatId, origIdx, renderCallback),
            redo: () => moveBookmarkLocal(bkId, srcCatId, tgtCatId, insertIndex, renderCallback),
          });
        }
        saveData();
        renderCallback();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton + exports
// ---------------------------------------------------------------------------

export const dragController = new DragController();

/** Call once after first render. */
export function initDragListeners(renderCallback: () => void): void {
  dragController.init(renderCallback);
}
