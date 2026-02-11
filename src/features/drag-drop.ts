import { getCategories, saveData, reorderBookmark, isConvexMode } from '../data/store';

let draggedElement: HTMLElement | null = null;
let draggedBookmark: { categoryId: string; bookmarkId: string; index: number } | null = null;

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
