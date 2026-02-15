import { getCategories, createBookmark, updateBookmark, deleteBookmarkById, isConvexMode } from '../../data/store';
import { getConvexClient } from '../../data/convex-client';
import { api } from '../../../convex/_generated/api';
import { getIconUrl } from '../../utils/icons';
import { resetIconPicker, setSelectedIconPath, getSelectedIconPath, handleUrlChange } from '../icon-picker';
import { styledConfirm } from './confirm-modal';
import { getAutofillUrl } from '../../features/preferences';

let editingBookmarkId: string | null = null;
let titleFetchGeneration = 0;

function populateCategorySelect(selectedCategoryId: string): void {
  const select = document.getElementById('bookmark-category-select') as HTMLSelectElement;
  const categories = getCategories();
  select.innerHTML = categories
    .map((cat) => `<option value="${cat.id}" ${cat.id === selectedCategoryId ? 'selected' : ''}>${cat.name}</option>`)
    .join('');
}

async function fetchAndSetTitle(url: string): Promise<void> {
  const titleInput = document.getElementById('bookmark-title') as HTMLInputElement;
  // Never overwrite user-entered title
  if (titleInput.value.trim()) return;

  const generation = ++titleFetchGeneration;
  titleInput.placeholder = 'Fetching title...';

  let title: string | null = null;

  if (isConvexMode()) {
    const client = getConvexClient();
    if (client) {
      try {
        const result = await client.action(api.metadata.fetchPageTitle, { url });
        title = result.title;
      } catch {
        // Silently fail
      }
    }
  }

  // Fallback: capitalize domain name
  if (!title) {
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      const name = hostname.split('.')[0];
      title = name.charAt(0).toUpperCase() + name.slice(1);
    } catch {
      // Invalid URL — do nothing
    }
  }

  // Discard if user typed a title in the meantime, or a newer fetch started
  if (generation !== titleFetchGeneration || titleInput.value.trim()) {
    titleInput.placeholder = 'Title';
    return;
  }

  if (title) {
    titleInput.value = title;
  }
  titleInput.placeholder = 'Title';
}

export async function openAddBookmarkModal(categoryId: string): Promise<void> {
  editingBookmarkId = null;
  document.getElementById('bookmark-modal-title')!.textContent = 'Add Bookmark';
  (document.getElementById('bookmark-title') as HTMLInputElement).value = '';
  (document.getElementById('bookmark-url') as HTMLInputElement).value = '';
  (document.getElementById('bookmark-category-id') as HTMLInputElement).value = categoryId;
  (document.getElementById('bookmark-icon-path') as HTMLInputElement).value = '';
  (document.getElementById('preview-icon') as HTMLImageElement).src = '';
  document.getElementById('icon-source')!.textContent = 'No icon selected';
  document.getElementById('icon-search-container')!.classList.add('hidden');
  document.getElementById('icon-results')!.innerHTML = '';
  resetIconPicker();
  populateCategorySelect(categoryId);
  document.getElementById('bookmark-modal')!.classList.add('active');

  if (getAutofillUrl()) {
    try {
      const text = await navigator.clipboard.readText();
      if (text && /^https?:\/\/.+/i.test(text.trim())) {
        const urlInput = document.getElementById('bookmark-url') as HTMLInputElement;
        urlInput.value = text.trim();
        urlInput.dispatchEvent(new Event('change'));
      }
    } catch {
      // Clipboard access denied or unavailable — silently ignore
    }
  }
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

  document.getElementById('icon-search-container')!.classList.add('hidden');
  document.getElementById('icon-results')!.innerHTML = '';
  populateCategorySelect(categoryId);
  document.getElementById('bookmark-modal')!.classList.add('active');
}

export function closeBookmarkModal(): void {
  document.getElementById('bookmark-modal')!.classList.remove('active');
}

async function saveBookmark(event: Event): Promise<void> {
  event.preventDefault();
  const title = (document.getElementById('bookmark-title') as HTMLInputElement).value;
  const url = (document.getElementById('bookmark-url') as HTMLInputElement).value;
  const originalCategoryId = (document.getElementById('bookmark-category-id') as HTMLInputElement).value;
  const selectedCategoryId = (document.getElementById('bookmark-category-select') as HTMLSelectElement).value;
  const iconPath = (document.getElementById('bookmark-icon-path') as HTMLInputElement).value || null;

  if (editingBookmarkId) {
    const movedCategory = selectedCategoryId !== originalCategoryId ? selectedCategoryId : undefined;
    await updateBookmark(editingBookmarkId, title, url, iconPath, movedCategory);
  } else {
    await createBookmark(selectedCategoryId, title, url, iconPath);
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

  // URL change — favicon + title fetch
  const urlInput = document.getElementById('bookmark-url')!;
  urlInput.addEventListener('change', handleUrlChange);
  urlInput.addEventListener('change', () => {
    const url = (urlInput as HTMLInputElement).value.trim();
    if (url && /^https?:\/\//i.test(url)) {
      fetchAndSetTitle(url);
    }
  });

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
