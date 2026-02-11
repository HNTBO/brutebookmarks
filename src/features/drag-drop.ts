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
} from '../data/store';
import type { LayoutItem } from '../types';

let draggedElement: HTMLElement | null = null;
let draggedBookmark: { categoryId: string; bookmarkId: string; index: number } | null = null;

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
}

export function handleDragEnd(e: DragEvent): void {
  (e.currentTarget as HTMLElement).classList.remove('dragging');
  document.querySelectorAll('.bookmark-card').forEach((card) => {
    card.classList.remove('drag-over');
  });
  document.querySelectorAll('.category').forEach((cat) => {
    cat.classList.remove('drop-target');
  });
}

export function handleDragOver(e: DragEvent): void {
  e.preventDefault();
  e.dataTransfer!.dropEffect = 'move';
}

export function handleDragLeave(e: DragEvent): void {
  (e.currentTarget as HTMLElement).classList.remove('drag-over');
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
  e.stopPropagation();
  e.preventDefault();

  const targetElement = e.currentTarget as HTMLElement;
  const targetCategoryId = targetElement.dataset.categoryId!;
  const targetBookmarkId = targetElement.dataset.bookmarkId!;

  if (!draggedBookmark || draggedBookmark.bookmarkId === targetBookmarkId) {
    return;
  }

  const categories = getCategories();

  if (isConvexMode()) {
    // Float64 midpoint reorder via Convex
    if (draggedBookmark.categoryId === targetCategoryId) {
      const category = categories.find((c) => c.id === targetCategoryId);
      if (!category) return;

      const targetIndex = category.bookmarks.findIndex((b) => b.id === targetBookmarkId);
      if (targetIndex === -1) return;

      // Local optimistic splice for instant feedback
      const sourceIndex = category.bookmarks.findIndex((b) => b.id === draggedBookmark!.bookmarkId);
      if (sourceIndex !== -1) {
        const [moved] = category.bookmarks.splice(sourceIndex, 1);
        const insertAt = sourceIndex < targetIndex ? targetIndex : targetIndex;
        category.bookmarks.splice(insertAt, 0, moved);
        renderCallback();
      }

      const newOrder = computeMidpoint(category.bookmarks, targetIndex);
      reorderBookmark(draggedBookmark.bookmarkId, newOrder);
    } else {
      const sourceCategory = categories.find((c) => c.id === draggedBookmark!.categoryId);
      const targetCategory = categories.find((c) => c.id === targetCategoryId);
      if (!sourceCategory || !targetCategory) return;

      const targetIndex = targetCategory.bookmarks.findIndex((b) => b.id === targetBookmarkId);
      if (targetIndex === -1) return;

      // Local optimistic splice
      const sourceIndex = sourceCategory.bookmarks.findIndex((b) => b.id === draggedBookmark!.bookmarkId);
      if (sourceIndex !== -1) {
        const [moved] = sourceCategory.bookmarks.splice(sourceIndex, 1);
        targetCategory.bookmarks.splice(targetIndex, 0, moved);
        renderCallback();
      }

      const newOrder = computeMidpoint(targetCategory.bookmarks, targetIndex);
      reorderBookmark(draggedBookmark.bookmarkId, newOrder, targetCategoryId);
    }
  } else {
    // Legacy splice-based reorder
    if (draggedBookmark.categoryId === targetCategoryId) {
      const category = categories.find((c) => c.id === targetCategoryId);
      if (!category) return;

      const sourceIndex = category.bookmarks.findIndex((b) => b.id === draggedBookmark!.bookmarkId);
      const targetIndex = category.bookmarks.findIndex((b) => b.id === targetBookmarkId);

      if (sourceIndex !== -1 && targetIndex !== -1) {
        const [movedBookmark] = category.bookmarks.splice(sourceIndex, 1);
        category.bookmarks.splice(targetIndex, 0, movedBookmark);
        saveData();
        renderCallback();
      }
    } else {
      const sourceCategory = categories.find((c) => c.id === draggedBookmark!.categoryId);
      const targetCategory = categories.find((c) => c.id === targetCategoryId);

      if (!sourceCategory || !targetCategory) return;

      const sourceIndex = sourceCategory.bookmarks.findIndex((b) => b.id === draggedBookmark!.bookmarkId);
      const targetIndex = targetCategory.bookmarks.findIndex((b) => b.id === targetBookmarkId);

      if (sourceIndex !== -1 && targetIndex !== -1) {
        const [movedBookmark] = sourceCategory.bookmarks.splice(sourceIndex, 1);
        targetCategory.bookmarks.splice(targetIndex, 0, movedBookmark);
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

  if (targetCategoryId === draggedBookmark.categoryId) return;

  e.preventDefault();
  e.stopPropagation();

  const categories = getCategories();

  if (isConvexMode()) {
    const sourceCategory = categories.find((c) => c.id === draggedBookmark!.categoryId);
    const targetCategory = categories.find((c) => c.id === targetCategoryId);
    if (!sourceCategory || !targetCategory) return;

    // Local optimistic splice
    const sourceIndex = sourceCategory.bookmarks.findIndex((b) => b.id === draggedBookmark!.bookmarkId);
    if (sourceIndex !== -1) {
      const [moved] = sourceCategory.bookmarks.splice(sourceIndex, 1);
      targetCategory.bookmarks.push(moved);
      renderCallback();
    }

    // Compute order: after last bookmark in target
    const lastOrder = targetCategory.bookmarks.length > 0
      ? Math.max(...targetCategory.bookmarks.map((b) => b.order ?? 0))
      : 0;
    reorderBookmark(draggedBookmark.bookmarkId, lastOrder + 1, targetCategoryId);
  } else {
    const sourceCategory = categories.find((c) => c.id === draggedBookmark!.categoryId);
    const targetCategory = categories.find((c) => c.id === targetCategoryId);

    if (!sourceCategory || !targetCategory) return;

    const sourceIndex = sourceCategory.bookmarks.findIndex((b) => b.id === draggedBookmark!.bookmarkId);

    if (sourceIndex !== -1) {
      const [movedBookmark] = sourceCategory.bookmarks.splice(sourceIndex, 1);
      targetCategory.bookmarks.push(movedBookmark);
      saveData();
      renderCallback();
    }
  }

  (e.currentTarget as HTMLElement).classList.remove('drop-target');
}

// --- Category reorder handlers ---

export function isDraggingLayoutItem(): boolean {
  return draggedLayoutItem !== null;
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

export function handleCategoryHeaderDragEnd(e: DragEvent): void {
  draggedLayoutItem = null;
  document.querySelectorAll('.category').forEach((cat) => {
    cat.classList.remove('dragging-category');
  });
  document.querySelectorAll('.layout-drop-indicator').forEach((el) => el.remove());
}

// Drop zone detection result
type DropZone =
  | { action: 'reorder-before'; targetEl: Element }
  | { action: 'reorder-after' }
  | { action: 'group'; targetCategoryId: string; targetEl: HTMLElement }
  | { action: 'add-to-group'; targetGroupId: string; targetEl: HTMLElement }
  | null;

function detectDropZone(e: DragEvent, container: HTMLElement): DropZone {
  const layoutEls = Array.from(container.querySelectorAll(':scope > .category, :scope > .tab-group'));
  if (layoutEls.length === 0) return null;

  const dragId = draggedLayoutItem!.id;

  for (const item of layoutEls) {
    const rect = item.getBoundingClientRect();
    const el = item as HTMLElement;
    const elId = el.dataset.categoryId || el.dataset.groupId;
    if (elId === dragId) continue;

    if (e.clientY < rect.top || e.clientY > rect.bottom) continue;

    const relativeY = (e.clientY - rect.top) / rect.height;

    // If dragging over a tab-group, add to that group
    if (el.classList.contains('tab-group')) {
      if (relativeY < 0.2) return { action: 'reorder-before', targetEl: item };
      if (relativeY > 0.8) continue; // will be caught as reorder-after by next item or end
      return { action: 'add-to-group', targetGroupId: el.dataset.groupId!, targetEl: el };
    }

    // If dragging over an ungrouped category, use zones
    if (el.classList.contains('category')) {
      if (relativeY < 0.3) return { action: 'reorder-before', targetEl: item };
      if (relativeY > 0.7) continue; // reorder-after
      // Center zone: create group
      return { action: 'group', targetCategoryId: el.dataset.categoryId!, targetEl: el };
    }
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
  }
}

export function handleLayoutDrop(e: DragEvent, renderCallback: () => void): void {
  if (!draggedLayoutItem) return;
  e.preventDefault();

  const container = e.currentTarget as HTMLElement;
  container.querySelectorAll('.layout-drop-indicator').forEach((el) => el.remove());
  container.querySelectorAll('.group-drop-target').forEach((el) => el.classList.remove('group-drop-target'));

  if (!isConvexMode()) return;

  const zone = detectDropZone(e, container);
  if (!zone) { draggedLayoutItem = null; return; }

  if (zone.action === 'group' && draggedLayoutItem.type === 'category') {
    // Create new tab group from two categories
    const name = 'Tab Group';
    createTabGroup(name, [zone.targetCategoryId, draggedLayoutItem.id]);
    draggedLayoutItem = null;
    return;
  }

  if (zone.action === 'add-to-group' && draggedLayoutItem.type === 'category') {
    // Add category to existing tab group
    setCategoryGroup(draggedLayoutItem.id, zone.targetGroupId);
    draggedLayoutItem = null;
    return;
  }

  // Reorder logic
  const items = getLayoutItems();
  const layoutEls = Array.from(container.querySelectorAll(':scope > .category, :scope > .tab-group'));

  let targetIndex = items.length;
  if (zone.action === 'reorder-before') {
    const targetElId = (zone.targetEl as HTMLElement).dataset.categoryId || (zone.targetEl as HTMLElement).dataset.groupId;
    targetIndex = items.findIndex((item) => {
      const id = item.type === 'category' ? item.category.id : item.group.id;
      return id === targetElId;
    });
    if (targetIndex === -1) targetIndex = items.length;
  }

  const sourceIndex = items.findIndex((item) => {
    const id = item.type === 'category' ? item.category.id : item.group.id;
    return id === draggedLayoutItem!.id;
  });
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

  if (draggedLayoutItem.type === 'category') {
    reorderCategory(draggedLayoutItem.id, newOrder);
  } else {
    reorderTabGroup(draggedLayoutItem.id, newOrder);
  }

  renderCallback();
  draggedLayoutItem = null;
}

// --- Tab ungroup: drag a tab out of the tab bar ---
export function handleTabUngroupDragStart(e: DragEvent, categoryId: string): void {
  draggedLayoutItem = { type: 'category', id: categoryId };
  e.dataTransfer!.effectAllowed = 'move';
  e.dataTransfer!.setData('text/plain', '');
}

export function handleTabUngroupDragEnd(): void {
  draggedLayoutItem = null;
  document.querySelectorAll('.dragging-category').forEach((el) => el.classList.remove('dragging-category'));
  document.querySelectorAll('.layout-drop-indicator').forEach((el) => el.remove());
  document.querySelectorAll('.group-drop-target').forEach((el) => el.classList.remove('group-drop-target'));
}
