import './styles/main.css';
import { renderApp } from './app';
import { initializeData, setRenderCallback, setPreferencesCallback, activateConvex } from './data/store';
import { renderCategories } from './components/categories';
import { initSizeController } from './components/header';
import { initBookmarkModal, openAddBookmarkModal, openEditBookmarkModal, deleteBookmark } from './components/modals/bookmark-modal';
import { initCategoryModal, openAddCategoryModal, openEditCategoryModal } from './components/modals/category-modal';
import { initSettingsModal, openSettingsModal, closeSettingsModal } from './components/modals/settings-modal';
import { initConfirmModal } from './components/modals/confirm-modal';
import { initUploadArea, useFavicon, toggleIconSearch, searchIcons, toggleEmojiSearch, searchEmojis } from './components/icon-picker';
import { toggleTheme, syncThemeUI, applyTheme } from './features/theme';
import { updateCardSize, updatePageWidth, syncPreferencesUI, getCardSize, getPageWidth, applyPreferences } from './features/preferences';
import { initClerk, getAuthToken } from './auth/clerk';
import { enableAuthFetch } from './auth/auth-fetch';
import { initConvexClient, setConvexAuth } from './data/convex-client';

// Render the HTML shell
renderApp();

// Initialize all modal event listeners
initBookmarkModal();
initCategoryModal();
initSettingsModal();
initConfirmModal();
initUploadArea();

// Wire header action buttons
document.getElementById('add-category-btn')!.addEventListener('click', openAddCategoryModal);
document.getElementById('theme-toggle-btn')!.addEventListener('click', toggleTheme);
document.getElementById('settings-btn')!.addEventListener('click', openSettingsModal);

// Wire icon picker buttons
document.getElementById('use-favicon-btn')!.addEventListener('click', useFavicon);
document.getElementById('search-wikimedia-btn')!.addEventListener('click', toggleIconSearch);
document.getElementById('use-emoji-btn')!.addEventListener('click', toggleEmojiSearch);
document.getElementById('upload-custom-btn')!.addEventListener('click', () => {
  (document.getElementById('custom-icon-input') as HTMLInputElement).click();
});
document.getElementById('icon-search-btn')!.addEventListener('click', searchIcons);
document.getElementById('emoji-search-query')!.addEventListener('input', searchEmojis);

// Delegate click events from dynamically rendered content
document.getElementById('categories-container')!.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;

  // Category edit button
  const categoryEditBtn = target.closest('.category-edit-btn') as HTMLElement | null;
  if (categoryEditBtn) {
    let categoryId = categoryEditBtn.dataset.categoryId;
    if (!categoryId) {
      // Tab group: resolve from the currently active tab
      const activeTab = categoryEditBtn.closest('.tab-group')?.querySelector('.tab-active') as HTMLElement | null;
      categoryId = activeTab?.dataset.tabCategoryId;
    }
    if (categoryId) openEditCategoryModal(categoryId);
    return;
  }

  // Add bookmark button
  const addBookmarkCard = target.closest('[data-action="add-bookmark"]') as HTMLElement | null;
  if (addBookmarkCard) {
    openAddBookmarkModal(addBookmarkCard.dataset.categoryId!);
    return;
  }

  // Edit bookmark button
  const editBookmarkBtn = target.closest('[data-action="edit-bookmark"]') as HTMLElement | null;
  if (editBookmarkBtn) {
    e.stopPropagation();
    openEditBookmarkModal(editBookmarkBtn.dataset.categoryId!, editBookmarkBtn.dataset.bookmarkId!);
    return;
  }

  // Delete bookmark button
  const deleteBookmarkBtn = target.closest('[data-action="delete-bookmark"]') as HTMLElement | null;
  if (deleteBookmarkBtn) {
    e.stopPropagation();
    deleteBookmark(deleteBookmarkBtn.dataset.categoryId!, deleteBookmarkBtn.dataset.bookmarkId!);
    return;
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal.active').forEach((modal) => {
      modal.classList.remove('active');
    });
  }
});

// Initialize app data and render
async function init(): Promise<void> {
  // Wire callbacks so Convex subscriptions can trigger re-renders
  setRenderCallback(renderCategories);
  setPreferencesCallback((prefs) => {
    applyTheme(prefs.theme, prefs.accentColorDark, prefs.accentColorLight);
    applyPreferences(prefs, renderCategories);
  });

  // Load bookmarks first — don't wait for auth
  await initializeData();

  // Sync UI controls with restored preferences
  syncThemeUI();
  syncPreferencesUI();

  // Render categories from localStorage/Express cache
  renderCategories();

  // Apply saved settings
  updateCardSize(getCardSize());
  updatePageWidth(getPageWidth());

  // Initialize the 2D size controller
  initSizeController();

  // Initialize auth in the background — don't block the app
  initClerk().then((clerk) => {
    if (clerk) {
      enableAuthFetch();

      // Wire Convex auth if available
      const convexClient = initConvexClient();
      if (convexClient) {
        setConvexAuth(() => getAuthToken({ template: 'convex' }));
        activateConvex();
      }
    }
  });
}

init();
