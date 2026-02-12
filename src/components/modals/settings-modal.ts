import { getCategories, setCategories, saveData, importBulk, eraseAllData, isConvexMode } from '../../data/store';
import { renderCategories } from '../categories';
import { toggleCardNames, getShowCardNames, toggleAutofillUrl, getAutofillUrl } from '../../features/preferences';
import { updateAccentColor, resetAccentColor } from '../../features/theme';
import { styledConfirm, styledAlert } from './confirm-modal';
import { detectFormat, parseNetscapeHTML, parseJSON } from '../../utils/bookmark-parsers';
import type { Category } from '../../types';
import { getAppMode } from '../../data/local-storage';

export function openSettingsModal(): void {
  document.getElementById('settings-modal')!.classList.add('active');
  (document.getElementById('show-card-names') as HTMLInputElement).checked = getShowCardNames();
  (document.getElementById('autofill-url') as HTMLInputElement).checked = getAutofillUrl();
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
      <div class="settings-row" style="flex-direction: column; align-items: stretch; gap: var(--space-sm);">
        <button class="account-upgrade-btn" id="upgrade-sync-btn">Sign Up for Cross-Device Sync</button>
        <span class="account-note">Free for founding members</span>
      </div>
    `;

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

function importData(): void {
  closeSettingsModal();

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

          if (importedData.length === 0) {
            await styledAlert('No bookmarks found in this file.', 'Import');
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
        } catch {
          await styledAlert('Invalid file format', 'Import');
        }
      };
      reader.readAsText(file);
    }
  };
  input.click();
}

async function eraseData(): Promise<void> {
  closeSettingsModal();
  if (await styledConfirm('This will permanently erase all your bookmarks.', 'Erase')) {
    await eraseAllData();
    await styledAlert('All bookmarks erased.', 'Erase');
  }
}

export function initSettingsModal(): void {
  document.getElementById('settings-modal-close')!.addEventListener('click', closeSettingsModal);

  document.getElementById('show-card-names')!.addEventListener('change', (e) => {
    toggleCardNames((e.target as HTMLInputElement).checked, renderCategories);
  });

  document.getElementById('autofill-url')!.addEventListener('change', (e) => {
    toggleAutofillUrl((e.target as HTMLInputElement).checked);
  });

  document.getElementById('accent-color-picker')!.addEventListener('input', (e) => {
    updateAccentColor((e.target as HTMLInputElement).value);
  });

  document.getElementById('reset-accent-btn')!.addEventListener('click', resetAccentColor);
  document.getElementById('export-data-btn')!.addEventListener('click', exportData);
  document.getElementById('import-data-btn')!.addEventListener('click', importData);
  document.getElementById('erase-data-btn')!.addEventListener('click', eraseData);

  // Backdrop close for settings
  let mouseDownOnBackdrop = false;
  const modal = document.getElementById('settings-modal')!;
  modal.addEventListener('mousedown', (e) => {
    mouseDownOnBackdrop = e.target === modal;
  });
  modal.addEventListener('mouseup', (e) => {
    if (mouseDownOnBackdrop && e.target === modal) {
      closeSettingsModal();
    }
    mouseDownOnBackdrop = false;
  });
}
