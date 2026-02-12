export function renderApp(): void {
  const app = document.querySelector<HTMLDivElement>('#app')!;
  app.innerHTML = `
    <!-- Clerk User Button -->
    <div id="clerk-user-button" style="position: fixed; top: var(--space-xl); right: 16px; z-index: 9999;"></div>

    <div class="container">
      <header class="brute-header">
        <div class="header-title-box">
          <h1>Brute <em>Bookmarks</em></h1>
        </div>
        <div class="header-controls">
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
        <span class="footer-text">Brute Bookmarks — <a href="#">v1.0</a></span>
        <a href="mailto:contact@brutebookmarks.com" class="footer-contact">contact@brutebookmarks.com</a>
        <span class="footer-text">Icons via <a href="https://commons.wikimedia.org" target="_blank">Wikimedia Commons</a></span>
      </footer>
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
              <div id="icon-search-container" style="display: none;">
                <div class="icon-search-box">
                  <input type="text" id="icon-search-query" placeholder="Search for logo...">
                  <button type="button" class="btn btn-small btn-primary" id="icon-search-btn">Search</button>
                </div>
                <div id="icon-search-loading" class="loading" style="display: none;">
                  <div class="spinner"></div>
                  <p>Searching Wikimedia Commons...</p>
                </div>
                <div id="icon-results" class="icon-results"></div>
              </div>

              <!-- Emoji Search -->
              <div id="emoji-search-container" style="display: none;">
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
            <div class="form-group" id="category-group-section" style="display: none;">
              <label>Tab Group</label>
              <select id="category-group-select">
                <option value="">None (standalone)</option>
                <option value="__new__">+ Create new group...</option>
              </select>
            </div>
            <input type="hidden" id="editing-category-id">
          </div>
          <div class="modal-actions">
            <button type="button" class="modal-btn delete" id="delete-category-btn" style="display: none;">Delete</button>
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
          <div class="settings-section">
            <h3>Display</h3>
            <div class="settings-row">
              <label for="show-card-names">Show Card Names</label>
              <input type="checkbox" id="show-card-names" checked>
            </div>
            <div class="settings-row">
              <label for="autofill-url">Autofill URL from Clipboard</label>
              <input type="checkbox" id="autofill-url">
            </div>
            <div class="settings-row">
              <label for="accent-color-picker">Accent Color</label>
              <div style="display: flex; gap: 8px; align-items: center;">
                <input type="color" id="accent-color-picker" style="background: none; border: none; width: 32px; height: 32px; cursor: pointer; padding: 0;">
                <button class="btn btn-small" id="reset-accent-btn">Reset</button>
              </div>
            </div>
          </div>
          <div class="settings-section">
            <h3>Bookmarks</h3>
            <div class="settings-row">
              <button class="btn" id="import-data-btn">Import</button>
              <button class="btn" id="export-data-btn">Export</button>
              <button class="btn btn-danger" id="erase-data-btn">Erase</button>
            </div>
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
          <div class="form-group" id="confirm-modal-input-group" style="display: none; margin-top: var(--space-md);">
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
