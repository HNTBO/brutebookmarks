export function renderApp(): void {
  const app = document.querySelector<HTMLDivElement>('#app')!;
  app.innerHTML = `
    <!-- Welcome Gate -->
    <div id="welcome-gate" class="welcome-gate">
      <div class="welcome-gate-content">
        <h1 class="welcome-gate-title">Brute <em>Bookmarks</em></h1>
        <p class="welcome-gate-subtitle">Your bookmarks, your way.</p>
        <div class="welcome-gate-options">
          <button id="gate-local-btn" class="welcome-gate-btn gate-btn-local">
            <span class="gate-btn-label">Use Locally</span>
            <span class="gate-btn-desc">No account needed. Stored in this browser.</span>
          </button>
          <button id="gate-sync-btn" class="welcome-gate-btn gate-btn-sync">
            <span class="gate-btn-label">Sign Up / Sign In</span>
            <span class="gate-btn-desc">Sync across devices. Free for founding members. <span id="gate-founding-count"></span></span>
          </button>
        </div>
      </div>
    </div>

    <div class="container">
      <header class="brute-header">
        <div class="header-title-box">
          <h1><span id="brand-brute">Br<span id="brand-u">u</span>te</span><em id="brand-bookmarks">Bookma<span id="brand-r">r</span>k<span class="brand-final-s">s</span></em></h1>
        </div>
        <div class="header-controls">
          <div class="clerk-slot">
            <button class="clerk-slot-btn" id="wireframe-btn" title="Toggle Wireframe"><svg viewBox="0 0 512 512" fill="none" stroke="currentColor" stroke-width="20" stroke-miterlimit="10"><rect x="73.97" y="189.88" width="253" height="253"/><rect x="180.93" y="79.77" width="253" height="253"/><line x1="71.55" y1="186.5" x2="178.18" y2="77.21"/><line x1="326.97" y1="187.88" x2="433.93" y2="79.77"/><line x1="329.5" y1="445.82" x2="436.58" y2="335.19"/><line x1="73.97" y1="440.88" x2="185.9" y2="329.41"/></svg></button>
            <button class="clerk-slot-btn" id="barscale-btn" title="Cycle Bar Scale"><svg viewBox="0 0 512 512" fill="none" stroke="currentColor" stroke-width="20" stroke-miterlimit="10"><rect x="73.17" y="168.41" width="274.22" height="274.22"/><line x1="73.17" y1="443.46" x2="416.23" y2="98.07"/><polygon fill="currentColor" stroke="none" points="380.1 70.67 443.88 134.03 443.66 70.47 380.1 70.67"/></svg></button>
            <div id="clerk-user-button" class="clerk-user-button"><svg class="default-avatar-overlay" viewBox="0 0 512 512" aria-hidden="true"><rect class="avatar-bg" width="512" height="512"/><rect class="avatar-shape" x="189.69" y="97.61" width="132.63" height="113.62"/><rect class="avatar-shape" x="110.55" y="225.59" width="290.89" height="188.81"/></svg></div>
          </div>
          <div class="size-controller" id="size-controller">
            <div class="size-handle" id="size-handle"></div>
          </div>
          <div class="action-buttons">
            <button class="action-btn" id="add-category-btn" title="Add Category">+</button>
            <button class="action-btn" id="theme-toggle-btn" title="Toggle Theme">☀</button>
            <button class="action-btn" id="settings-btn" title="Settings">⚙</button>
          </div>
        </div>
      </header>

      <div id="categories-container">
        <!-- Categories will be rendered here -->
      </div>

      <footer>
        <a href="https://buymeacoffee.com/brutebookmarks" target="_blank" rel="noopener noreferrer" class="footer-contact">Buy Me a Coffee</a>
        <a href="mailto:contact@brutebookmarks.com" class="footer-contact">contact@brutebookmarks.com</a>
        <span class="footer-text">Icons via <a href="https://commons.wikimedia.org" target="_blank" rel="noopener noreferrer">Wikimedia Commons</a> · Emoji by <a href="https://github.com/twitter/twemoji" target="_blank" rel="noopener noreferrer">Twemoji</a> (CC-BY 4.0)</span>
      </footer>
    </div>

    <!-- Mobile Toolbar -->
    <div class="mobile-toolbar">
      <button class="mobile-toolbar-btn" id="mobile-add-btn" title="Add Category">+</button>
      <button class="mobile-toolbar-btn" id="mobile-theme-btn" title="Toggle Theme">☀</button>
      <div class="mobile-toolbar-btn" id="mobile-avatar-btn"><svg class="default-avatar-overlay" viewBox="0 0 512 512" aria-hidden="true"><rect class="avatar-bg" width="512" height="512"/><rect class="avatar-shape" x="189.69" y="97.61" width="132.63" height="113.62"/><rect class="avatar-shape" x="110.55" y="225.59" width="290.89" height="188.81"/></svg></div>
      <button class="mobile-toolbar-btn" id="mobile-wireframe-btn" title="Toggle Wireframe"><svg viewBox="0 0 512 512" fill="none" stroke="currentColor" stroke-width="20" stroke-miterlimit="10"><rect x="73.97" y="189.88" width="253" height="253"/><rect x="180.93" y="79.77" width="253" height="253"/><line x1="71.55" y1="186.5" x2="178.18" y2="77.21"/><line x1="326.97" y1="187.88" x2="433.93" y2="79.77"/><line x1="329.5" y1="445.82" x2="436.58" y2="335.19"/><line x1="73.97" y1="440.88" x2="185.9" y2="329.41"/></svg></button>
      <button class="mobile-toolbar-btn" id="mobile-settings-btn" title="Settings">⚙</button>
    </div>

    <!-- Add/Edit Bookmark Modal -->
    <div id="bookmark-modal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h2 id="bookmark-modal-title">Add Bookmark</h2>
          <button class="modal-close" id="bookmark-modal-close">×</button>
        </div>
        <form id="bookmark-form">
          <div class="modal-body">
            <div class="form-group-inline">
              <label>Name</label>
              <input type="text" id="bookmark-title" required placeholder="Google, YouTube, GitHub...">
            </div>
            <div class="form-group-inline">
              <label>URL</label>
              <input type="url" id="bookmark-url" required placeholder="https://example.com">
            </div>
            <div class="form-group-inline">
              <label>Category</label>
              <select id="bookmark-category-select"></select>
            </div>

            <div class="icon-section">
              <h3>Icon</h3>

              <div class="icon-preview" id="icon-preview">
                <img class="icon-preview-img" id="preview-icon" src="" alt="Icon preview">
                <div class="icon-preview-info">
                  <p id="icon-source">No icon selected</p>
                </div>
              </div>

              <div class="icon-options">
                <button type="button" class="btn btn-small" id="use-favicon-btn">Use Favicon</button>
                <button type="button" class="btn btn-small" id="search-wikimedia-btn">Search Wikimedia</button>
                <button type="button" class="btn btn-small" id="use-emoji-btn">Use Emoji</button>
                <button type="button" class="btn btn-small" id="upload-custom-btn">Upload Custom</button>
              </div>

              <!-- Icon Search -->
              <div id="icon-search-container" class="hidden">
                <div class="icon-search-box">
                  <input type="text" id="icon-search-query" placeholder="Search for logo...">
                  <button type="button" class="btn btn-small btn-primary" id="icon-search-btn">Search</button>
                </div>
                <div id="icon-search-loading" class="loading hidden">
                  <div class="spinner"></div>
                  <p>Searching Wikimedia Commons...</p>
                </div>
                <div id="icon-results" class="icon-results"></div>
              </div>

              <!-- Emoji Search -->
              <div id="emoji-search-container" class="hidden">
                <div class="icon-search-box">
                  <input type="text" id="emoji-search-query" placeholder="Search emoji (home, work, star...)">
                </div>
                <div id="emoji-results" class="icon-results"></div>
              </div>

              <!-- Custom Upload -->
              <div class="upload-area" id="upload-area">
                <p>Drop an image here or click to upload</p>
                <input type="file" id="custom-icon-input" accept="image/*">
              </div>
            </div>

            <input type="hidden" id="bookmark-category-id">
            <input type="hidden" id="bookmark-icon-path">
          </div>

          <div class="modal-actions">
            <button type="button" class="modal-btn cancel" id="bookmark-cancel-btn">Cancel</button>
            <button type="submit" class="modal-btn save">Save Bookmark</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Add/Edit Category Modal -->
    <div id="category-modal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h2 id="category-modal-title">New Category</h2>
          <button class="modal-close" id="category-modal-close">×</button>
        </div>
        <form id="category-form">
          <div class="modal-body">
            <div class="form-group">
              <label>Category Name</label>
              <input type="text" id="category-name" required placeholder="Work, Social, Tools...">
            </div>
            <div class="form-group hidden" id="category-group-section">
              <label>Tab Group</label>
              <select id="category-group-select">
                <option value="">None (standalone)</option>
                <option value="__new__">+ Create new group...</option>
              </select>
            </div>
            <input type="hidden" id="editing-category-id">
          </div>
          <div class="modal-actions">
            <button type="button" class="modal-btn delete hidden" id="delete-category-btn">Delete</button>
            <div class="modal-actions-right">
              <button type="button" class="modal-btn cancel" id="category-cancel-btn">Cancel</button>
              <button type="submit" class="modal-btn save" id="category-save-btn">Create Category</button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- Settings Modal -->
    <div id="settings-modal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h2>Settings</h2>
          <button class="modal-close" id="settings-modal-close">×</button>
        </div>
        <div class="modal-body">
          <div class="settings-section" id="settings-account-section"></div>
          <div class="settings-section">
            <h3>Display</h3>
            <div class="settings-row">
              <label for="show-card-names">Show Card Names</label>
              <input type="checkbox" id="show-card-names" checked>
            </div>
            <div class="settings-row">
              <label for="show-name-on-hover">Show Name on Hover</label>
              <input type="checkbox" id="show-name-on-hover" checked>
            </div>
            <div class="settings-row">
              <label for="autofill-url">Autofill URL from Clipboard</label>
              <input type="checkbox" id="autofill-url">
            </div>
            <div class="settings-row">
              <label for="easter-eggs">Easter Eggs</label>
              <input type="checkbox" id="easter-eggs" checked>
            </div>
            <div class="settings-row">
              <label for="accent-color-picker">Accent Color</label>
              <div class="accent-color-row">
                <input type="color" id="accent-color-picker" class="accent-color-input">
                <button class="btn btn-small" id="reset-accent-btn">Reset</button>
              </div>
            </div>
          </div>
          <div class="settings-section">
            <h3>Info</h3>
            <div class="settings-row">
              <button class="btn" id="help-btn">Feature Overview</button>
            </div>
          </div>
          <div class="settings-section">
            <h3>Bookmarks</h3>
            <div class="settings-row">
              <button class="btn" id="smart-name-btn">Smart Name</button>
              <button class="btn" id="fetch-favicons-btn">Fetch Favicons</button>
              <button class="btn" id="import-data-btn">Import</button>
              <button class="btn" id="export-data-btn">Export</button>
              <button class="btn btn-danger" id="erase-data-btn">Erase</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Help Modal -->
    <div id="help-modal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h2>Feature Overview</h2>
          <button class="modal-close" id="help-modal-close">×</button>
        </div>
        <div class="modal-body help-body">
          <div class="help-section">
            <h3>Bookmarks</h3>
            <ul>
              <li><strong>Add</strong> — Click the + card at the end of any category</li>
              <li><strong>Edit</strong> — Hover near the top-left corner of a card (pen icon)</li>
              <li><strong>Delete</strong> — Hover near the top-right corner (× icon)</li>
              <li><strong>Open</strong> — Click a card to open in a new tab</li>
              <li><strong>Reorder</strong> — Drag and drop cards within or between categories</li>
              <li><strong>Move</strong> — Use the Category dropdown in the edit modal</li>
            </ul>
          </div>
          <div class="help-section">
            <h3>Categories</h3>
            <ul>
              <li><strong>Add</strong> — Click the + button in the header</li>
              <li><strong>Edit/Delete</strong> — Click the pen icon on the category bar</li>
              <li><strong>Reorder</strong> — Drag the ⠿ handle on the category bar</li>
              <li><strong>Tab Groups</strong> — Drag a category onto another to group them as tabs</li>
            </ul>
          </div>
          <div class="help-section">
            <h3>Appearance</h3>
            <ul>
              <li><strong>Card Size & Page Width</strong> — Drag inside the 2D controller zone in the header</li>
              <li><strong>Theme</strong> — ☀/☾ button toggles light/dark mode</li>
              <li><strong>Accent Color</strong> — Color picker in Settings</li>
              <li><strong>Wireframe Mode</strong> — Outlined UI style (cube icon in header)</li>
              <li><strong>Bar Scale</strong> — Cycle category bar height (triangle icon in header)</li>
              <li><strong>Card Names</strong> — Toggle in Settings</li>
            </ul>
          </div>
          <div class="help-section">
            <h3>Data</h3>
            <ul>
              <li><strong>Import</strong> — JSON backups or browser HTML exports</li>
              <li><strong>Export</strong> — Download as JSON</li>
              <li><strong>Smart Name</strong> — Auto-shorten bookmark titles</li>
              <li><strong>Fetch Favicons</strong> — Refresh all bookmark icons</li>
            </ul>
          </div>
          <div class="help-section">
            <h3>Keyboard Shortcuts</h3>
            <ul>
              <li><kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd> — Toggle theme</li>
              <li><kbd>Esc</kbd> — Close any open modal</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- Confirm/Alert Modal (replaces native browser dialogs) -->
    <div id="confirm-modal" class="modal">
      <div class="modal-content">
        <div class="modal-header">
          <h2 id="confirm-modal-title">Confirm</h2>
          <button class="modal-close" id="confirm-modal-close">×</button>
        </div>
        <div class="modal-body">
          <p id="confirm-modal-message"></p>
          <div class="form-group hidden confirm-input-group" id="confirm-modal-input-group">
            <input type="text" id="confirm-modal-input">
          </div>
        </div>
        <div class="modal-actions">
          <div class="modal-actions-right">
            <button class="modal-btn cancel" id="confirm-modal-cancel">Cancel</button>
            <button class="modal-btn save" id="confirm-modal-ok">OK</button>
          </div>
        </div>
      </div>
    </div>
  `;
}
