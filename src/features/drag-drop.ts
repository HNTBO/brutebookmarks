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
  deleteTabGroup,
  mergeTabGroups,
} from '../data/store';
import type { LayoutItem } from '../types';
import { pushUndo, isUndoing } from './undo';

let draggedElement: HTMLElement | null = null;
let draggedBookmark: { categoryId: string; bookmarkId: string; index: number } | null = null;

// Undo helpers for local mode
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

// --- Category / layout item drag state ---
let draggedLayoutItem: { type: 'category' | 'tabGroup'; id: string } | null = null;

export function handleDragStart(e: DragEvent): void {
  const target = e.currentTarget as HTMLElement;
  draggedElement = target;
  draggedBookmark = {
    categoryId: target.dataset.categoryId!,
    bookmarkId: target.dataset.bookmarkId!,
    index: parseInt(target.dataset.index!),
  };
  target.classList.add('dragging');
  e.dataTransfer!.effectAllowed = 'move';
  e.dataTransfer!.setData('text/plain', ''); // Required for Firefox
}

export function handleDragEnd(e: DragEvent): void {
  (e.currentTarget as HTMLElement).classList.remove('dragging');
  draggedElement = null;
  draggedBookmark = null;
  document.querySelectorAll('.bookmark-card').forEach((card) => {
    card.classList.remove('drag-over', 'card-drop-before', 'card-drop-after');
  });
  document.querySelectorAll('.category').forEach((cat) => {
    cat.classList.remove('drop-target');
  });
}

export function handleDragOver(e: DragEvent): void {
  if (draggedLayoutItem) return; // Layout drag — let event bubble to container
  if (!draggedBookmark) return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'move';

  const target = e.currentTarget as HTMLElement;
  const targetBookmarkId = target.dataset.bookmarkId;
  if (!targetBookmarkId || targetBookmarkId === draggedBookmark.bookmarkId) return;

  // Detect left/right half for indicator placement
  const rect = target.getBoundingClientRect();
  const isLeftHalf = e.clientX < rect.left + rect.width / 2;

  // Clean up indicators on all cards in this grid
  const grid = target.closest('.bookmarks-grid');
  if (grid) {
    grid.querySelectorAll('.card-drop-before, .card-drop-after').forEach((el) => {
      el.classList.remove('card-drop-before', 'card-drop-after');
    });
  }

  target.classList.add(isLeftHalf ? 'card-drop-before' : 'card-drop-after');
}

export function handleDragLeave(e: DragEvent): void {
  const target = e.currentTarget as HTMLElement;
  target.classList.remove('drag-over', 'card-drop-before', 'card-drop-after');
}

function computeMidpoint(
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

export function handleDrop(e: DragEvent, renderCallback: () => void): void {
  if (!draggedBookmark) return; // Not a bookmark drag — let event bubble for layout handling

  e.stopPropagation();
  e.preventDefault();

  const targetElement = e.currentTarget as HTMLElement;
  const targetCategoryId = targetElement.dataset.categoryId!;
  const targetBookmarkId = targetElement.dataset.bookmarkId!;

  // Read indicator class BEFORE cleaning up — guarantees drop matches what the user saw
  const dropBefore = targetElement.classList.contains('card-drop-before')
    || (!targetElement.classList.contains('card-drop-after') && e.clientX < targetElement.getBoundingClientRect().left + targetElement.getBoundingClientRect().width / 2);

  // Claim the drag — prevents category-level handler from processing the same drop
  const claimed = { ...draggedBookmark };
  draggedBookmark = null;

  // Clean up indicators
  document.querySelectorAll('.card-drop-before, .card-drop-after').forEach((el) => {
    el.classList.remove('card-drop-before', 'card-drop-after');
  });

  if (claimed.bookmarkId === targetBookmarkId) {
    return;
  }

  const categories = getCategories();

  if (isConvexMode()) {
    if (claimed.categoryId === targetCategoryId) {
      // Same category — reorder
      const category = categories.find((c) => c.id === targetCategoryId);
      if (!category) return;

      const rawTargetIndex = category.bookmarks.findIndex((b) => b.id === targetBookmarkId);
      if (rawTargetIndex === -1) return;
      const sourceIndex = category.bookmarks.findIndex((b) => b.id === claimed.bookmarkId);
      const oldOrder = sourceIndex !== -1 ? (category.bookmarks[sourceIndex].order ?? 0) : 0;

      // Compute insertion index in the list WITHOUT the dragged item
      const filtered = category.bookmarks.filter((b) => b.id !== claimed.bookmarkId);
      const filteredTargetIndex = filtered.findIndex((b) => b.id === targetBookmarkId);
      const insertIndex = dropBefore ? filteredTargetIndex : filteredTargetIndex + 1;
      const newOrder = computeMidpoint(filtered, insertIndex);

      // Optimistic splice for instant feedback
      if (sourceIndex !== -1) {
        const [moved] = category.bookmarks.splice(sourceIndex, 1);
        const adjustedInsert = dropBefore
          ? (sourceIndex < rawTargetIndex ? rawTargetIndex - 1 : rawTargetIndex)
          : (sourceIndex < rawTargetIndex ? rawTargetIndex : rawTargetIndex + 1);
        category.bookmarks.splice(adjustedInsert, 0, moved);
        renderCallback();
      }

      const bkId = claimed.bookmarkId;
      reorderBookmark(bkId, newOrder);
      if (!isUndoing()) {
        pushUndo({
          undo: () => reorderBookmark(bkId, oldOrder),
          redo: () => reorderBookmark(bkId, newOrder),
        });
      }
    } else {
      // Cross-category move
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

      // Optimistic splice
      if (sourceIndex !== -1) {
        const [moved] = sourceCategory.bookmarks.splice(sourceIndex, 1);
        targetCategory.bookmarks.splice(insertIndex, 0, moved);
        renderCallback();
      }

      const bkId = claimed.bookmarkId;
      reorderBookmark(bkId, newOrder, targetCategoryId);
      if (!isUndoing()) {
        pushUndo({
          undo: () => reorderBookmark(bkId, oldOrder, sourceCatId),
          redo: () => reorderBookmark(bkId, newOrder, targetCategoryId),
        });
      }
    }
  } else {
    // Local splice-based reorder
    if (claimed.categoryId === targetCategoryId) {
      const category = categories.find((c) => c.id === targetCategoryId);
      if (!category) return;

      const sourceIndex = category.bookmarks.findIndex((b) => b.id === claimed.bookmarkId);
      const rawTargetIndex = category.bookmarks.findIndex((b) => b.id === targetBookmarkId);

      if (sourceIndex !== -1 && rawTargetIndex !== -1) {
        const beforeIds = category.bookmarks.map((b) => b.id);
        const [movedBookmark] = category.bookmarks.splice(sourceIndex, 1);
        // After splice, compute correct insert position
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

  targetElement.classList.remove('drag-over');
}

export function handleCategoryDragOver(e: DragEvent): void {
  if (!draggedBookmark) return;

  const categoryId = (e.currentTarget as HTMLElement).dataset.categoryId;
  if (categoryId === draggedBookmark.categoryId) return;

  e.preventDefault();
  (e.currentTarget as HTMLElement).classList.add('drop-target');
}

export function handleCategoryDragLeave(e: DragEvent): void {
  const relatedTarget = e.relatedTarget as Node | null;
  if (relatedTarget && (e.currentTarget as HTMLElement).contains(relatedTarget)) {
    return;
  }
  (e.currentTarget as HTMLElement).classList.remove('drop-target');
}

export function handleCategoryDrop(e: DragEvent, renderCallback: () => void): void {
  if (!draggedBookmark) return;

  const targetCategoryId = (e.currentTarget as HTMLElement).dataset.categoryId!;
  (e.currentTarget as HTMLElement).classList.remove('drop-target');
  executeCategoryDrop(e, targetCategoryId, renderCallback);
}

/**
 * Execute a bookmark drop into a category. Separated from handleCategoryDrop so tab-panel
 * handlers can call it directly with a known categoryId, without mutating the event object.
 */
export function executeCategoryDrop(e: DragEvent, targetCategoryId: string, renderCallback: () => void): void {
  if (!draggedBookmark) return;
  if (targetCategoryId === draggedBookmark.categoryId) return;


  e.preventDefault();
  e.stopPropagation();

  const categories = getCategories();

  if (isConvexMode()) {
    const sourceCategory = categories.find((c) => c.id === draggedBookmark!.categoryId);
    const targetCategory = categories.find((c) => c.id === targetCategoryId);
    if (!sourceCategory || !targetCategory) return;

    // Capture before state
    const sourceIndex = sourceCategory.bookmarks.findIndex((b) => b.id === draggedBookmark!.bookmarkId);
    const oldOrder = sourceIndex !== -1 ? (sourceCategory.bookmarks[sourceIndex].order ?? 0) : 0;
    const sourceCatId = draggedBookmark!.categoryId;
    const bkId = draggedBookmark.bookmarkId;

    // Local optimistic splice
    if (sourceIndex !== -1) {
      const [moved] = sourceCategory.bookmarks.splice(sourceIndex, 1);
      targetCategory.bookmarks.push(moved);
      renderCallback();
    }

    // Compute order: after last bookmark in target
    const lastOrder = targetCategory.bookmarks.length > 0
      ? Math.max(...targetCategory.bookmarks.map((b) => b.order ?? 0))
      : 0;
    const newOrder = lastOrder + 1;
    reorderBookmark(bkId, newOrder, targetCategoryId);
    if (!isUndoing()) {
      pushUndo({
        undo: () => reorderBookmark(bkId, oldOrder, sourceCatId),
        redo: () => reorderBookmark(bkId, newOrder, targetCategoryId),
      });
    }
  } else {
    const sourceCategory = categories.find((c) => c.id === draggedBookmark!.categoryId);
    const targetCategory = categories.find((c) => c.id === targetCategoryId);

    if (!sourceCategory || !targetCategory) return;

    const sourceIndex = sourceCategory.bookmarks.findIndex((b) => b.id === draggedBookmark!.bookmarkId);

    if (sourceIndex !== -1) {
      const bkId = draggedBookmark!.bookmarkId;
      const srcCatId = draggedBookmark!.categoryId;
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

// --- Category reorder handlers ---

export function isDraggingLayoutItem(): boolean {
  return draggedLayoutItem !== null;
}

export function getDragBookmarkState(): { categoryId: string; bookmarkId: string } | null {
  return draggedBookmark;
}

export function handleCategoryHeaderDragStart(e: DragEvent): void {
  const header = (e.currentTarget as HTMLElement).closest('.category') as HTMLElement;
  if (!header) return;
  const categoryId = header.dataset.categoryId!;
  draggedLayoutItem = { type: 'category', id: categoryId };
  header.classList.add('dragging-category');
  e.dataTransfer!.effectAllowed = 'move';
  e.dataTransfer!.setData('text/plain', ''); // Required for Firefox
}

export function handleTabGroupHeaderDragStart(e: DragEvent): void {
  const groupEl = (e.currentTarget as HTMLElement).closest('.tab-group') as HTMLElement;
  if (!groupEl) return;
  draggedLayoutItem = { type: 'tabGroup', id: groupEl.dataset.groupId! };
  groupEl.classList.add('dragging-category');
  e.dataTransfer!.effectAllowed = 'move';
  e.dataTransfer!.setData('text/plain', '');
}

export function handleCategoryHeaderDragEnd(e: DragEvent): void {
  draggedLayoutItem = null;
  document.querySelectorAll('.category').forEach((cat) => {
    cat.classList.remove('dragging-category');
  });
  document.querySelectorAll('.tab-group').forEach((g) => {
    g.classList.remove('dragging-category');
  });
  document.querySelectorAll('.layout-drop-indicator').forEach((el) => el.remove());
  document.querySelectorAll('.group-drop-target').forEach((el) => el.classList.remove('group-drop-target'));
}

// Drop zone detection result
type DropZone =
  | { action: 'reorder-before'; targetEl: Element }
  | { action: 'reorder-after' }
  | { action: 'reorder-after-item'; targetEl: Element }
  | { action: 'group'; targetCategoryId: string; targetEl: HTMLElement }
  | { action: 'add-to-group'; targetGroupId: string; targetEl: HTMLElement }
  | { action: 'absorb-category'; targetCategoryId: string; groupId: string; targetEl: HTMLElement }
  | null;

function detectDropZone(e: DragEvent, container: HTMLElement): DropZone {
  const layoutEls = Array.from(container.querySelectorAll(':scope > .category, :scope > .tab-group'));
  if (layoutEls.length === 0) return null;

  const dragId = draggedLayoutItem!.id;
  const dragType = draggedLayoutItem!.type;

  for (const item of layoutEls) {
    const rect = item.getBoundingClientRect();
    const el = item as HTMLElement;
    const elId = el.dataset.categoryId || el.dataset.groupId;
    if (elId === dragId) continue;

    if (e.clientY < rect.top || e.clientY > rect.bottom) continue;

    const relativeY = (e.clientY - rect.top) / rect.height;

    if (el.classList.contains('tab-group')) {
      // Tab group zones: top 30% = before, middle 40% = add/merge, bottom 30% = after
      if (relativeY < 0.3) return { action: 'reorder-before', targetEl: item };
      if (relativeY > 0.7) return { action: 'reorder-after-item', targetEl: item };
      // Center zone: add category or merge groups
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
      // Category zones: top 40% = before, middle 20% = group, bottom 40% = after
      if (relativeY < 0.4) return { action: 'reorder-before', targetEl: item };
      if (relativeY > 0.6) return { action: 'reorder-after-item', targetEl: item };
      // Center zone: create group (only for category-on-category)
      if (dragType === 'category') {
        return { action: 'group', targetCategoryId: el.dataset.categoryId!, targetEl: el };
      }
      // Tab group dragged onto category center — absorb category into group
      if (dragType === 'tabGroup') {
        return { action: 'absorb-category', targetCategoryId: el.dataset.categoryId!, groupId: dragId, targetEl: el };
      }
      return { action: 'reorder-before', targetEl: item };
    }
  }

  // Cursor is in a gap between elements (margin area) or beyond the last element.
  // Find the insertion point by scanning element positions.
  let lastNonDraggedEl: Element | null = null;
  for (const item of layoutEls) {
    const el = item as HTMLElement;
    const elId = el.dataset.categoryId || el.dataset.groupId;
    if (elId === dragId) continue;

    const rect = item.getBoundingClientRect();
    if (e.clientY < rect.top) {
      // Cursor is above this element — insert before it
      return { action: 'reorder-before', targetEl: item };
    }
    lastNonDraggedEl = item;
  }

  // Cursor is below all non-dragged elements
  if (lastNonDraggedEl) {
    return { action: 'reorder-after-item', targetEl: lastNonDraggedEl };
  }

  return { action: 'reorder-after' };
}

export function handleLayoutDragOver(e: DragEvent): void {
  if (!draggedLayoutItem) return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'move';

  const container = e.currentTarget as HTMLElement;
  // Clean up visual feedback
  container.querySelectorAll('.layout-drop-indicator').forEach((el) => el.remove());
  container.querySelectorAll('.group-drop-target').forEach((el) => el.classList.remove('group-drop-target'));

  const zone = detectDropZone(e, container);
  if (!zone) return;

  if (zone.action === 'reorder-before') {
    // Don't show indicator right before or after the dragged item
    const prev = zone.targetEl.previousElementSibling as HTMLElement | null;
    const prevId = prev?.dataset.categoryId || prev?.dataset.groupId;
    if (prevId === draggedLayoutItem.id) return;

    const indicator = document.createElement('div');
    indicator.className = 'layout-drop-indicator';
    container.insertBefore(indicator, zone.targetEl);
  } else if (zone.action === 'reorder-after-item') {
    // Don't show indicator right after the dragged item
    const next = zone.targetEl.nextElementSibling as HTMLElement | null;
    const nextId = next?.dataset.categoryId || next?.dataset.groupId;
    if (nextId === draggedLayoutItem.id) return;
    const targetId = (zone.targetEl as HTMLElement).dataset.categoryId || (zone.targetEl as HTMLElement).dataset.groupId;
    if (targetId === draggedLayoutItem.id) return;

    const indicator = document.createElement('div');
    indicator.className = 'layout-drop-indicator';
    container.insertBefore(indicator, zone.targetEl.nextSibling);
  } else if (zone.action === 'reorder-after') {
    const layoutEls = Array.from(container.querySelectorAll(':scope > .category, :scope > .tab-group'));
    const last = layoutEls[layoutEls.length - 1] as HTMLElement;
    const lastId = last?.dataset.categoryId || last?.dataset.groupId;
    if (lastId === draggedLayoutItem.id) return;

    const indicator = document.createElement('div');
    indicator.className = 'layout-drop-indicator';
    container.appendChild(indicator);
  } else if (zone.action === 'group') {
    zone.targetEl.classList.add('group-drop-target');
  } else if (zone.action === 'add-to-group') {
    zone.targetEl.classList.add('group-drop-target');
  } else if (zone.action === 'absorb-category') {
    zone.targetEl.classList.add('group-drop-target');
  }
}

export function handleLayoutDrop(e: DragEvent, renderCallback: () => void): void {
  if (!draggedLayoutItem) return;
  e.preventDefault();

  const container = e.currentTarget as HTMLElement;
  container.querySelectorAll('.layout-drop-indicator').forEach((el) => el.remove());
  container.querySelectorAll('.group-drop-target').forEach((el) => el.classList.remove('group-drop-target'));

  const zone = detectDropZone(e, container);
  if (!zone) { draggedLayoutItem = null; return; }

  if (zone.action === 'group' && draggedLayoutItem.type === 'category') {
    // Create new tab group from two categories
    const name = 'Tab Group';
    createTabGroup(name, [zone.targetCategoryId, draggedLayoutItem.id]);
    draggedLayoutItem = null;
    return;
  }

  if (zone.action === 'add-to-group') {
    if (draggedLayoutItem.type === 'category') {
      // Add category to existing tab group
      setCategoryGroup(draggedLayoutItem.id, zone.targetGroupId);
    } else if (draggedLayoutItem.type === 'tabGroup') {
      // Merge two tab groups
      mergeTabGroups(draggedLayoutItem.id, zone.targetGroupId);
    }
    draggedLayoutItem = null;
    return;
  }

  if (zone.action === 'absorb-category' && draggedLayoutItem.type === 'tabGroup') {
    // Tab group dragged onto category — add category into the dragged group
    setCategoryGroup(zone.targetCategoryId, draggedLayoutItem.id);
    draggedLayoutItem = null;
    return;
  }

  // Reorder logic — compute target index from zone
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
    return id === draggedLayoutItem!.id;
  });

  // Category is nested inside a tab group — ungroup it with positioned order
  if (sourceIndex === -1 && draggedLayoutItem.type === 'category') {
    // Compute the target order from the layout items
    const orderList = items.map((item) =>
      item.type === 'category' ? (item.category.order ?? 0) : item.group.order
    );
    const prev = targetIndex > 0 ? orderList[targetIndex - 1] : 0;
    const next = targetIndex < orderList.length ? orderList[targetIndex] : prev + 2;
    const newOrder = (prev + next) / 2;
    setCategoryGroup(draggedLayoutItem.id, null, newOrder);
    draggedLayoutItem = null;
    return;
  }
  if (sourceIndex === -1) { draggedLayoutItem = null; return; }
  if (sourceIndex === targetIndex || sourceIndex === targetIndex - 1) { draggedLayoutItem = null; return; }

  // Build order list for midpoint computation
  const orderList = items.map((item) =>
    item.type === 'category' ? (item.category.order ?? 0) : item.group.order
  );

  const withoutDragged = orderList.filter((_, i) => i !== sourceIndex);
  const adjustedTarget = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  const prev = adjustedTarget > 0 ? withoutDragged[adjustedTarget - 1] : 0;
  const next = adjustedTarget < withoutDragged.length
    ? withoutDragged[adjustedTarget]
    : prev + 2;
  const newOrder = (prev + next) / 2;

  const oldOrder = orderList[sourceIndex];
  if (draggedLayoutItem.type === 'category') {
    reorderCategory(draggedLayoutItem.id, newOrder);
  } else {
    reorderTabGroup(draggedLayoutItem.id, newOrder);
  }
  if (!isUndoing()) {
    const itemId = draggedLayoutItem.id;
    const itemType = draggedLayoutItem.type;
    pushUndo({
      undo: () => { if (itemType === 'category') reorderCategory(itemId, oldOrder); else reorderTabGroup(itemId, oldOrder); },
      redo: () => { if (itemType === 'category') reorderCategory(itemId, newOrder); else reorderTabGroup(itemId, newOrder); },
    });
  }

  // No renderCallback() here — Convex subscription will re-render with the correct new order.
  // Calling it now would re-render with stale data (old order) and replay fadeSlide animation.
  draggedLayoutItem = null;
}

// --- Tab ungroup: drag a tab out of the tab bar ---
export function handleTabUngroupDragStart(e: DragEvent, categoryId: string): void {
  // Ensure tab drags can't be misclassified as bookmark drags.
  draggedBookmark = null;
  draggedElement = null;
  draggedLayoutItem = { type: 'category', id: categoryId };
  // Dim the dragged tab
  const tab = document.querySelector(`[data-tab-category-id="${categoryId}"]`) as HTMLElement | null;
  if (tab) tab.classList.add('dragging-tab');
  e.dataTransfer!.effectAllowed = 'move';
  e.dataTransfer!.setData('text/plain', '');
}

export function handleTabUngroupDragEnd(): void {
  draggedLayoutItem = null;
  document.querySelectorAll('.dragging-category').forEach((el) => el.classList.remove('dragging-category'));
  document.querySelectorAll('.dragging-tab').forEach((el) => el.classList.remove('dragging-tab'));
  document.querySelectorAll('.layout-drop-indicator').forEach((el) => el.remove());
  document.querySelectorAll('.group-drop-target').forEach((el) => el.classList.remove('group-drop-target'));
  document.querySelectorAll('.tab-drop-indicator').forEach((el) => el.remove());
}

// --- Tab reorder within a tab group ---

export function handleTabReorderDragOver(e: DragEvent): void {
  if (!draggedLayoutItem || draggedLayoutItem.type !== 'category') return;
  const targetTab = e.currentTarget as HTMLElement;
  const targetCategoryId = targetTab.dataset.tabCategoryId;
  if (!targetCategoryId || targetCategoryId === draggedLayoutItem.id) return;

  // Only show reorder indicators for within-group drags
  const targetGroupId = targetTab.dataset.groupId;
  const categories = getCategories();
  const draggedCat = categories.find((c) => c.id === draggedLayoutItem!.id);
  if (draggedCat?.groupId !== targetGroupId) return; // Let layout handler handle grouping

  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer!.dropEffect = 'move';

  // Clean up existing indicators in this tab-bar
  const tabBar = targetTab.closest('.tab-bar');
  if (tabBar) {
    tabBar.querySelectorAll('.tab-drop-indicator').forEach((el) => el.remove());
  }

  // Determine left/right half for indicator placement
  const rect = targetTab.getBoundingClientRect();
  const isLeftHalf = e.clientX < rect.left + rect.width / 2;

  const indicator = document.createElement('div');
  indicator.className = 'tab-drop-indicator';
  if (isLeftHalf) {
    targetTab.parentNode!.insertBefore(indicator, targetTab);
  } else {
    targetTab.parentNode!.insertBefore(indicator, targetTab.nextSibling);
  }
}

export function handleTabReorderDragLeave(_e: DragEvent): void {
  // Indicators persist until another tab is hovered or drag ends — prevents flicker
}

export function handleTabReorderDrop(
  e: DragEvent,
  groupCategories: { id: string; order?: number }[],
): void {
  if (!draggedLayoutItem || draggedLayoutItem.type !== 'category') return;
  const targetTab = e.currentTarget as HTMLElement;
  const targetCategoryId = targetTab.dataset.tabCategoryId!;

  // Clean up indicators
  const tabBar = targetTab.closest('.tab-bar');
  if (tabBar) {
    tabBar.querySelectorAll('.tab-drop-indicator').forEach((el) => el.remove());
  }

  if (targetCategoryId === draggedLayoutItem.id) return;

  // Only reorder if dragged tab is in this group
  const draggedInGroup = groupCategories.some((c) => c.id === draggedLayoutItem!.id);
  if (!draggedInGroup) return;

  e.preventDefault();
  e.stopPropagation();

  // Determine insertion side from cursor position
  const rect = targetTab.getBoundingClientRect();
  const isLeftHalf = e.clientX < rect.left + rect.width / 2;

  const filtered = groupCategories.filter((c) => c.id !== draggedLayoutItem!.id);
  const targetIndex = filtered.findIndex((c) => c.id === targetCategoryId);
  const insertIndex = isLeftHalf ? targetIndex : targetIndex + 1;
  const newOrder = computeMidpoint(filtered, insertIndex);
  reorderCategory(draggedLayoutItem.id, newOrder);

  draggedLayoutItem = null;
}
