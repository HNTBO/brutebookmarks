import { getCategories, setCategories, saveData, importBulk, eraseAllData, isConvexMode, updateBookmark } from '../../data/store';
import { getConvexClient } from '../../data/convex-client';
import { api } from '../../../convex/_generated/api';
import { wireModalSwipeDismiss } from '../../utils/modal-swipe-dismiss';
import { registerModal } from '../../utils/modal-manager';
import { renderCategories } from '../categories';
import { toggleCardNames, getShowCardNames, toggleAutofillUrl, getAutofillUrl, toggleEasterEggs, getEasterEggs, toggleShowNameOnHover, getShowNameOnHover, getMobileColumns, setMobileColumns } from '../../features/preferences';
import { updateAccentColor, resetAccentColor } from '../../features/theme';
import { styledConfirm, styledAlert } from './confirm-modal';
import { detectFormat, parseNetscapeHTML, parseJSON } from '../../utils/bookmark-parsers';
import { isExtensionInstalled, requestBrowserBookmarks } from '../../utils/extension-bridge';
import { convertBrowserBookmarks } from '../../utils/browser-bookmark-converter';
import type { Category } from '../../types';
import { getAppMode } from '../../data/local-storage';
import { getFoundingMemberStats } from '../../data/founding-stats';
import { pushUndo } from '../../features/undo';

let settingsBusy = false;
let accentPickerOldColor: string | null = null;

export function openSettingsModal(): void {
  document.getElementById('settings-modal')!.classList.add('active');
  (document.getElementById('show-card-names') as HTMLInputElement).checked = getShowCardNames();
  (document.getElementById('autofill-url') as HTMLInputElement).checked = getAutofillUrl();
  (document.getElementById('easter-eggs') as HTMLInputElement).checked = getEasterEggs();
  (document.getElementById('show-name-on-hover') as HTMLInputElement).checked = getShowNameOnHover();
  syncColumnPicker();
  populateAccountSection();
}

function populateAccountSection(): void {
  const section = document.getElementById('settings-account-section');
  if (!section) return;

  const mode = getAppMode();

  if (mode === 'local') {
    section.innerHTML = `
      <h3>Account</h3>
      <div class="settings-row">
        <span class="account-status-text">Using locally (this browser only)</span>
      </div>
      <div class="settings-row settings-upgrade-row">
        <button class="account-upgrade-btn" id="upgrade-sync-btn">Sign In for Cross-Device Sync</button>
        <span class="account-note">Free for founding members <span id="settings-founding-count"></span></span>
      </div>
    `;

    // Fetch founding count
    getFoundingMemberStats().then((stats) => {
      const el = document.getElementById('settings-founding-count');
      if (el) el.textContent = `(${stats.count} / ${stats.cap} claimed)`;
    });

    document.getElementById('upgrade-sync-btn')!.addEventListener('click', async () => {
      closeSettingsModal();
      // Dynamic import to avoid circular dependency (main.ts imports settings-modal.ts)
      const { upgradeToSync } = await import('../../main');
      await upgradeToSync();
    });
  } else if (mode === 'sync') {
    section.innerHTML = `
      <h3>Account</h3>
      <div class="account-status">
        <span class="account-status-text">Synced across devices</span>
        <span class="account-badge">Founding Member</span>
      </div>
    `;
  } else {
    section.innerHTML = '';
  }
}

export function closeSettingsModal(): void {
  document.getElementById('settings-modal')!.classList.remove('active');
  (document.activeElement as HTMLElement | null)?.blur();
}

function closeHelpModal(): void {
  document.getElementById('help-modal')!.classList.remove('active');
}

function exportData(): void {
  const dataStr = JSON.stringify(getCategories(), null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'brute-bookmarks-backup.json';
  link.click();
  URL.revokeObjectURL(url);
}

async function importData(): Promise<void> {
  closeSettingsModal();

  const choice = await styledConfirm(
    'Import bookmarks from a file or directly from your browser?',
    'Import',
    'From File',
    'From Browser',
  );

  if (choice === null) return;
  if (choice) {
    importFromFile();
  } else {
    await importFromBrowser();
  }
}

function importFromFile(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.html,.htm';
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const content = event.target!.result as string;
          const format = detectFormat(content);

          let importedData: Category[];

          if (format === 'json') {
            importedData = parseJSON(content);
          } else if (format === 'netscape-html') {
            importedData = parseNetscapeHTML(content);
          } else {
            await styledAlert('Unrecognized file format. Please use a JSON backup or browser HTML export.', 'Import');
            return;
          }

          await executeImport(importedData);
        } catch {
          await styledAlert('Invalid file format', 'Import');
        }
      };
      reader.readAsText(file);
    }
  };
  input.click();
}

async function importFromBrowser(): Promise<void> {
  if (!isExtensionInstalled()) {
    await styledAlert(
      'The Brute Bookmarks browser extension is required to import directly from your browser. Install it and reload this page.',
      'Import',
    );
    return;
  }

  try {
    const tree = await requestBrowserBookmarks();
    const importedData = convertBrowserBookmarks(tree);

    if (importedData.length === 0) {
      await styledAlert('No bookmarks found in your browser.', 'Import');
      return;
    }

    await executeImport(importedData);
  } catch (err) {
    await styledAlert(
      err instanceof Error ? err.message : 'Failed to read browser bookmarks.',
      'Import',
    );
  }
}

async function executeImport(importedData: Category[]): Promise<void> {
  if (importedData.length === 0) {
    await styledAlert('No bookmarks found.', 'Import');
    return;
  }

  const hasData = getCategories().length > 0;

  if (hasData) {
    const choice = await styledConfirm(
      'You have existing bookmarks. Replace them or append?',
      'Import',
      'Replace',
      'Append',
    );
    if (choice === null) return;
    if (choice) await eraseAllData();
  }

  if (isConvexMode()) {
    await importBulk(importedData);
  } else {
    if (!hasData) {
      setCategories(importedData);
    } else {
      setCategories([...getCategories(), ...importedData]);
    }
    saveData();
    renderCategories();
  }

  const totalBookmarks = importedData.reduce((sum, cat) => sum + cat.bookmarks.length, 0);
  await styledAlert(
    `Imported ${importedData.length} categories with ${totalBookmarks} bookmarks.`,
    'Import',
  );
}

async function fetchAllFavicons(): Promise<void> {
  const btn = document.getElementById('fetch-favicons-btn') as HTMLButtonElement;
  const modalContent = document.querySelector('#settings-modal .modal-content') as HTMLElement;
  btn.textContent = 'Finding best favicons...';
  settingsBusy = true;
  modalContent.style.pointerEvents = 'none';
  modalContent.style.opacity = '0.6';

  try {
    const categories = getCategories();

    // Collect all bookmarks with valid URLs
    const allBookmarks: { bookmarkId: string; url: string; title: string; iconPath: string | null }[] = [];
    for (const cat of categories) {
      for (const bk of cat.bookmarks) {
        try {
          new URL(bk.url); // validate
          allBookmarks.push({ bookmarkId: bk.id, url: bk.url, title: bk.title, iconPath: bk.iconPath });
        } catch {
          // Invalid URL — skip
        }
      }
    }

    // Count unique domains for progress
    const uniqueDomains = new Set(allBookmarks.map((bk) => new URL(bk.url).hostname));

    let updated = 0;

    if (isConvexMode()) {
      // Sync mode: use server-side bulk resolver
      btn.textContent = `Finding best favicons... (${uniqueDomains.size} domains)`;
      const client = getConvexClient();
      if (client) {
        const results = await client.action(api.favicons.resolveFaviconBulk, {
          bookmarks: allBookmarks.map((bk) => ({ bookmarkId: bk.bookmarkId, url: bk.url })),
        });

        let applied = 0;
        for (const result of results) {
          const bk = allBookmarks.find((b) => b.bookmarkId === result.bookmarkId);
          if (bk && bk.iconPath !== result.iconUrl) {
            await updateBookmark(bk.bookmarkId, bk.title, bk.url, result.iconUrl);
            updated++;
          }
          applied++;
          btn.textContent = `Updating favicons... (${applied}/${results.length})`;
        }
      }
    } else {
      // Local mode: try cache lookup, fall back to Google S2
      const domains = [...uniqueDomains];
      const cachedMap = new Map<string, string>();
      const convexUrl = import.meta.env.VITE_CONVEX_URL;
      if (convexUrl) {
        btn.textContent = `Checking favicon cache...`;
        try {
          const { ConvexHttpClient } = await import('convex/browser');
          const httpClient = new ConvexHttpClient(convexUrl);
          const cached = await httpClient.query(api.faviconCache.lookupCachedFavicons, { domains });
          for (const entry of cached) {
            cachedMap.set(entry.domain, entry.iconUrl);
          }
        } catch {
          // Cache lookup failed — fall through to Google S2 for all
        }
      }

      let resolved = 0;
      for (const bk of allBookmarks) {
        const domain = new URL(bk.url).hostname;
        const faviconUrl = cachedMap.get(domain) || `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
        if (bk.iconPath !== faviconUrl) {
          await updateBookmark(bk.bookmarkId, bk.title, bk.url, faviconUrl);
          updated++;
        }
        resolved++;
        btn.textContent = `Finding best favicons... (${resolved}/${allBookmarks.length})`;
      }
    }

    modalContent.style.pointerEvents = '';
    modalContent.style.opacity = '';
    settingsBusy = false;
    btn.textContent = 'Fetch Favicons';
    closeSettingsModal();
    await styledAlert(`Updated favicons for ${updated} bookmark${updated !== 1 ? 's' : ''}.`, 'Favicons');
  } catch (e) {
    modalContent.style.pointerEvents = '';
    modalContent.style.opacity = '';
    settingsBusy = false;
    btn.textContent = 'Fetch Favicons';
    throw e;
  }
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'for', 'to', 'in', 'on', 'at', 'by',
  'with', 'and', 'or', 'my', 'your', 'our', 'is', 'it', 'its',
  'this', 'that', 'app', 'home',
]);

const DOMAIN_NOISE = new Set([
  'com', 'org', 'net', 'io', 'co', 'www',
  'html', 'htm', 'php', 'asp', 'aspx', 'jsp',
]);

function computeSmartName(title: string): string {
  // Strip trailing noise after common separators
  const stripped = title.split(/\s[-|—:·]\s/)[0].trim();

  // Expand dot-containing tokens into parts, filtering TLDs and short segments
  const tokens = stripped.split(/\s+/).flatMap(w =>
    w.includes('.') ? w.split('.').filter(p =>
      p.length > 2 && !DOMAIN_NOISE.has(p.toLowerCase())
    ) : [w]
  );

  const meaningful = tokens.filter(w =>
    w.length > 0 &&
    !STOP_WORDS.has(w.toLowerCase()) &&
    !w.includes('=') && !w.includes('/') && !w.includes('#')
  );

  if (meaningful.length === 0) return title;

  const kept = meaningful.slice(0, 2);
  return kept.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

async function smartNameAll(): Promise<void> {
  const btn = document.getElementById('smart-name-btn') as HTMLButtonElement;
  const modalContent = document.querySelector('#settings-modal .modal-content') as HTMLElement;
  btn.textContent = 'Renaming';
  settingsBusy = true;
  modalContent.style.pointerEvents = 'none';
  modalContent.style.opacity = '0.6';

  try {
    const categories = getCategories();
    let updated = 0;

    for (const cat of categories) {
      for (const bk of cat.bookmarks) {
        const smart = computeSmartName(bk.title);
        if (smart !== bk.title) {
          await updateBookmark(bk.id, smart, bk.url, bk.iconPath);
          updated++;
        }
      }
    }

    modalContent.style.pointerEvents = '';
    modalContent.style.opacity = '';
    settingsBusy = false;
    btn.textContent = 'Smart Name';
    closeSettingsModal();
    await styledAlert(`Renamed ${updated} bookmark${updated !== 1 ? 's' : ''}.`, 'Smart Name');
  } catch (e) {
    modalContent.style.pointerEvents = '';
    modalContent.style.opacity = '';
    settingsBusy = false;
    btn.textContent = 'Smart Name';
    throw e;
  }
}

async function eraseData(): Promise<void> {
  closeSettingsModal();
  if (await styledConfirm('This will permanently erase all your bookmarks.', 'Erase')) {
    await eraseAllData();
    await styledAlert('All bookmarks erased.', 'Erase');
  }
}

function syncColumnPicker(): void {
  const cols = getMobileColumns();
  document.querySelectorAll('.column-picker-btn').forEach((btn) => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.columns === String(cols));
  });
}

export function initSettingsModal(): void {
  registerModal('settings-modal', closeSettingsModal);
  registerModal('help-modal', closeHelpModal);

  document.getElementById('settings-modal-close')!.addEventListener('click', closeSettingsModal);

  document.getElementById('show-card-names')!.addEventListener('change', (e) => {
    toggleCardNames((e.target as HTMLInputElement).checked, renderCategories);
  });

  document.getElementById('autofill-url')!.addEventListener('change', (e) => {
    toggleAutofillUrl((e.target as HTMLInputElement).checked);
  });

  document.getElementById('easter-eggs')!.addEventListener('change', (e) => {
    toggleEasterEggs((e.target as HTMLInputElement).checked);
  });

  document.getElementById('show-name-on-hover')!.addEventListener('change', (e) => {
    toggleShowNameOnHover((e.target as HTMLInputElement).checked);
    renderCategories();
  });

  // Column picker
  document.querySelectorAll('.column-picker-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cols = parseInt((btn as HTMLElement).dataset.columns!) as 3 | 4 | 5;
      setMobileColumns(cols);
      syncColumnPicker();
      renderCategories();
    });
  });

  document.getElementById('accent-color-picker')!.addEventListener('input', (e) => {
    if (accentPickerOldColor === null) {
      accentPickerOldColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    }
    updateAccentColor((e.target as HTMLInputElement).value);
  });

  document.getElementById('accent-color-picker')!.addEventListener('change', (e) => {
    const newColor = (e.target as HTMLInputElement).value;
    if (accentPickerOldColor !== null && accentPickerOldColor !== newColor) {
      const oldColor = accentPickerOldColor;
      pushUndo({
        undo: () => {
          updateAccentColor(oldColor);
          const p = document.getElementById('accent-color-picker') as HTMLInputElement | null;
          if (p) p.value = oldColor;
        },
        redo: () => {
          updateAccentColor(newColor);
          const p = document.getElementById('accent-color-picker') as HTMLInputElement | null;
          if (p) p.value = newColor;
        },
      });
    }
    accentPickerOldColor = null;
  });

  document.getElementById('reset-accent-btn')!.addEventListener('click', resetAccentColor);
  document.getElementById('smart-name-btn')!.addEventListener('click', smartNameAll);
  document.getElementById('fetch-favicons-btn')!.addEventListener('click', fetchAllFavicons);
  document.getElementById('export-data-btn')!.addEventListener('click', exportData);
  document.getElementById('import-data-btn')!.addEventListener('click', importData);
  document.getElementById('erase-data-btn')!.addEventListener('click', eraseData);

  // Help modal
  document.getElementById('help-btn')!.addEventListener('click', () => {
    document.getElementById('help-modal')!.classList.add('active');
  });
  document.getElementById('help-modal-close')!.addEventListener('click', closeHelpModal);
  // Backdrop close for help modal (pointer events for mouse/touch/pen parity)
  const helpModal = document.getElementById('help-modal')!;
  let helpPointerDownOnBackdrop = false;
  helpModal.addEventListener('pointerdown', (e) => {
    helpPointerDownOnBackdrop = e.target === helpModal;
  });
  helpModal.addEventListener('pointerup', (e) => {
    if (helpPointerDownOnBackdrop && e.target === helpModal) {
      closeHelpModal();
    }
    helpPointerDownOnBackdrop = false;
  });

  // Backdrop close for settings (pointer events for mouse/touch/pen parity)
  let pointerDownOnBackdrop = false;
  const modal = document.getElementById('settings-modal')!;
  modal.addEventListener('pointerdown', (e) => {
    pointerDownOnBackdrop = e.target === modal;
  });
  modal.addEventListener('pointerup', (e) => {
    if (!settingsBusy && pointerDownOnBackdrop && e.target === modal) {
      closeSettingsModal();
    }
    pointerDownOnBackdrop = false;
  });

  // Mobile swipe-down to dismiss
  wireModalSwipeDismiss('settings-modal', closeSettingsModal);
  wireModalSwipeDismiss('help-modal', closeHelpModal);
}
