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
import { toggleTheme, syncThemeUI, applyTheme, randomizeAccentHue } from './features/theme';
import { updateCardSize, updatePageWidth, syncPreferencesUI, getCardSize, getPageWidth, applyPreferences, cycleBarscale, toggleWireframe, randomizeBarscale, randomizeWireframe, randomizeXY, getWireframe, initBarscaleAndWireframe, getEasterEggs } from './features/preferences';
import { initClerk, getAuthToken, initExtensionBridge, triggerSignIn } from './auth/clerk';
import { initConvexClient, setConvexAuth, getConvexClient } from './data/convex-client';
import { getAppMode, setAppMode } from './data/local-storage';
import { showWelcomeGate, hideWelcomeGate } from './components/welcome-gate';
import { seedLocalDefaults } from './data/store';

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
document.getElementById('barscale-btn')!.addEventListener('click', cycleBarscale);
document.getElementById('wireframe-btn')!.addEventListener('click', () => {
  toggleWireframe();
  syncWireframeBtnState();
});

// Easter eggs on brand text — responsive (mobile taps full words, desktop taps individual letters)
const isMobileQuery = window.matchMedia('(max-width: 768px)');

function syncWireframeBtnState(): void {
  const isWF = document.documentElement.hasAttribute('data-wireframe');
  document.getElementById('wireframe-btn')?.classList.toggle('wireframe-active', isWF);
  document.getElementById('mobile-wireframe-btn')?.classList.toggle('wireframe-active', isWF);
}

// Desktop easter eggs (u / r letters)
document.getElementById('brand-u')?.addEventListener('click', (e) => {
  if (!getEasterEggs() || isMobileQuery.matches) return;
  e.stopPropagation();
  randomizeAccentHue();
});
document.getElementById('brand-r')?.addEventListener('click', (e) => {
  if (!getEasterEggs() || isMobileQuery.matches) return;
  e.stopPropagation();
  randomizeAccentHue();
  randomizeBarscale();
  randomizeWireframe();
  syncWireframeBtnState();
});

// Mobile easter eggs (full words "Brute" / "Bookmarks")
document.getElementById('brand-brute')?.addEventListener('click', () => {
  if (!getEasterEggs() || !isMobileQuery.matches) return;
  randomizeAccentHue();
});
document.getElementById('brand-bookmarks')?.addEventListener('click', () => {
  if (!getEasterEggs() || !isMobileQuery.matches) return;
  randomizeAccentHue();
  randomizeBarscale();
  randomizeWireframe();
  syncWireframeBtnState();
});

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
  if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    toggleTheme();
    return;
  }

  if (e.key === 'Escape') {
    document.querySelectorAll('.modal.active').forEach((modal) => {
      modal.classList.remove('active');
    });
  }
});

// Wire mobile toolbar buttons
function wireMobileToolbar(): void {
  document.getElementById('mobile-add-btn')?.addEventListener('click', openAddCategoryModal);
  document.getElementById('mobile-theme-btn')?.addEventListener('click', toggleTheme);
  document.getElementById('mobile-settings-btn')?.addEventListener('click', openSettingsModal);
  document.getElementById('mobile-wireframe-btn')?.addEventListener('click', () => {
    toggleWireframe();
    syncWireframeBtnState();
  });
}

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
  initBarscaleAndWireframe();
  if (getWireframe()) {
    syncWireframeBtnState();
  }

  // Render categories from localStorage cache (sync mode skips — waits for Convex)
  if (getAppMode() !== 'sync') {
    renderCategories();
  }

  // Apply saved settings
  updateCardSize(getCardSize());
  updatePageWidth(getPageWidth());

  // Initialize the 2D size controller
  initSizeController();

  // Wire mobile toolbar buttons
  wireMobileToolbar();

  // Check app mode
  const mode = getAppMode();

  if (mode === null) {
    // First visit — show welcome gate
    const choice = await showWelcomeGate();
    setAppMode(choice);
    hideWelcomeGate();

    if (choice === 'local') {
      seedLocalDefaults();
      return;
    }
    // choice === 'sync' — fall through to Clerk init
  } else if (mode === 'local') {
    // Local mode — skip Clerk entirely
    return;
  }

  // Sync mode — initialize auth
  initClerk().then((clerk) => {
    if (!clerk) return;

    const startConvex = () => {
      if (getConvexClient()) return; // Already initialized
      const convexClient = initConvexClient();
      if (convexClient) {
        setConvexAuth(() => getAuthToken({ template: 'convex' }));
        activateConvex();
      }
      initExtensionBridge();
    };

    if (clerk.user) {
      // Already signed in — activate immediately
      startConvex();
    } else {
      // Not signed in — wait for sign-in via overlay
      const unsub = clerk.addListener(({ user }) => {
        if (user && getAppMode() === 'sync') {
          unsub?.();
          startConvex();
        }
      });
    }
  });
}

/**
 * Upgrade from local mode to sync mode.
 * Called from settings modal when a local user wants to sign up.
 */
export async function upgradeToSync(): Promise<void> {
  setAppMode('sync');

  const signedIn = await triggerSignIn();
  if (!signedIn) {
    // User abandoned sign-in — revert to local
    setAppMode('local');
    return;
  }

  // Wire Convex
  const convexClient = initConvexClient();
  if (convexClient) {
    setConvexAuth(() => getAuthToken({ template: 'convex' }));
    activateConvex();
    // rebuild() → promptMigration() in store.ts handles pushing localStorage data to Convex
  }

  initExtensionBridge();
}

init();
