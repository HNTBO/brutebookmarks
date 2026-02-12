import { getCategories, createBookmark, updateBookmark, deleteBookmarkById } from '../../data/store';
import { getIconUrl } from '../../utils/icons';
import { resetIconPicker, setSelectedIconPath, getSelectedIconPath, handleUrlChange } from '../icon-picker';
import { styledConfirm } from './confirm-modal';

let editingBookmarkId: string | null = null;

export function openAddBookmarkModal(categoryId: string): void {
  editingBookmarkId = null;
  document.getElementById('bookmark-modal-title')!.textContent = 'Add Bookmark';
  (document.getElementById('bookmark-title') as HTMLInputElement).value = '';
  (document.getElementById('bookmark-url') as HTMLInputElement).value = '';
  (document.getElementById('bookmark-category-id') as HTMLInputElement).value = categoryId;
  (document.getElementById('bookmark-icon-path') as HTMLInputElement).value = '';
  (document.getElementById('preview-icon') as HTMLImageElement).src = '';
  document.getElementById('icon-source')!.textContent = 'No icon selected';
  document.getElementById('icon-search-container')!.style.display = 'none';
  document.getElementById('icon-results')!.innerHTML = '';
  resetIconPicker();
  document.getElementById('bookmark-modal')!.classList.add('active');
}

export function openEditBookmarkModal(categoryId: string, bookmarkId: string): void {
  editingBookmarkId = bookmarkId;
  const category = getCategories().find((c) => c.id === categoryId);
  if (!category) return;

  const bookmark = category.bookmarks.find((b) => b.id === bookmarkId);
  if (!bookmark) return;

  document.getElementById('bookmark-modal-title')!.textContent = 'Edit Bookmark';
  (document.getElementById('bookmark-title') as HTMLInputElement).value = bookmark.title;
  (document.getElementById('bookmark-url') as HTMLInputElement).value = bookmark.url;
  (document.getElementById('bookmark-category-id') as HTMLInputElement).value = categoryId;
  (document.getElementById('bookmark-icon-path') as HTMLInputElement).value = bookmark.iconPath || '';

  if (bookmark.iconPath) {
    (document.getElementById('preview-icon') as HTMLImageElement).src = bookmark.iconPath;
    document.getElementById('icon-source')!.textContent = 'Current icon';
    setSelectedIconPath(bookmark.iconPath);
  } else {
    (document.getElementById('preview-icon') as HTMLImageElement).src = getIconUrl(bookmark);
    document.getElementById('icon-source')!.textContent = 'Current favicon';
    setSelectedIconPath(null);
  }

  document.getElementById('icon-search-container')!.style.display = 'none';
  document.getElementById('icon-results')!.innerHTML = '';
  document.getElementById('bookmark-modal')!.classList.add('active');
}

export function closeBookmarkModal(): void {
  document.getElementById('bookmark-modal')!.classList.remove('active');
}

async function saveBookmark(event: Event): Promise<void> {
  event.preventDefault();
  const title = (document.getElementById('bookmark-title') as HTMLInputElement).value;
  const url = (document.getElementById('bookmark-url') as HTMLInputElement).value;
  const categoryId = (document.getElementById('bookmark-category-id') as HTMLInputElement).value;
  const iconPath = (document.getElementById('bookmark-icon-path') as HTMLInputElement).value || null;

  if (editingBookmarkId) {
    await updateBookmark(editingBookmarkId, title, url, iconPath);
  } else {
    await createBookmark(categoryId, title, url, iconPath);
  }
  closeBookmarkModal();
}

export async function deleteBookmark(categoryId: string, bookmarkId: string): Promise<void> {
  if (await styledConfirm('Delete this bookmark?', 'Delete Bookmark')) {
    await deleteBookmarkById(bookmarkId);
  }
}

export function initBookmarkModal(): void {
  // Close button
  document.getElementById('bookmark-modal-close')!.addEventListener('click', closeBookmarkModal);
  document.getElementById('bookmark-cancel-btn')!.addEventListener('click', closeBookmarkModal);

  // Form submit
  document.getElementById('bookmark-form')!.addEventListener('submit', saveBookmark);

  // URL change
  document.getElementById('bookmark-url')!.addEventListener('change', handleUrlChange);

  // Backdrop click
  let mouseDownOnBackdrop = false;
  const modal = document.getElementById('bookmark-modal')!;
  modal.addEventListener('mousedown', (e) => {
    mouseDownOnBackdrop = e.target === modal;
  });
  modal.addEventListener('mouseup', (e) => {
    if (mouseDownOnBackdrop && e.target === modal) {
      closeBookmarkModal();
    }
    mouseDownOnBackdrop = false;
  });
}
