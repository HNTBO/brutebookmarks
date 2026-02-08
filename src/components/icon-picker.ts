const API_BASE = window.location.origin;

let selectedIconUrl: string | null = null;
let selectedIconPath: string | null = null;
let emojiSearchTimeout: ReturnType<typeof setTimeout>;

export function getSelectedIconPath(): string | null {
  return selectedIconPath;
}

export function setSelectedIconPath(path: string | null): void {
  selectedIconPath = path;
}

export function resetIconPicker(): void {
  selectedIconUrl = null;
  selectedIconPath = null;
}

export function handleUrlChange(): void {
  const url = (document.getElementById('bookmark-url') as HTMLInputElement).value;
  if (url && !selectedIconPath) {
    try {
      const domain = new URL(url).hostname;
      (document.getElementById('preview-icon') as HTMLImageElement).src =
        `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
      document.getElementById('icon-source')!.textContent = 'Suggested favicon';
    } catch {}
  }
}

export async function useFavicon(): Promise<void> {
  const url = (document.getElementById('bookmark-url') as HTMLInputElement).value;
  if (!url) {
    alert('Please enter a URL first');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/get-favicon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const data = await response.json();
    if (data.success) {
      selectedIconPath = data.iconPath;
      (document.getElementById('preview-icon') as HTMLImageElement).src = data.iconPath;
      document.getElementById('icon-source')!.textContent = data.cached ? 'Favicon (cached)' : 'Favicon (downloaded)';
      (document.getElementById('bookmark-icon-path') as HTMLInputElement).value = data.iconPath;
    }
  } catch (error) {
    console.error('Error fetching favicon:', error);
    alert('Failed to fetch favicon');
  }
}

export function toggleIconSearch(): void {
  const container = document.getElementById('icon-search-container')!;
  container.style.display = container.style.display === 'none' ? 'block' : 'none';

  if (container.style.display === 'block') {
    const title = (document.getElementById('bookmark-title') as HTMLInputElement).value;
    const url = (document.getElementById('bookmark-url') as HTMLInputElement).value;
    let searchQuery = title;

    if (!searchQuery && url) {
      try {
        searchQuery = new URL(url).hostname.split('.')[0];
      } catch {}
    }

    if (searchQuery) {
      (document.getElementById('icon-search-query') as HTMLInputElement).value = searchQuery;
    }
  }
}

export async function searchIcons(): Promise<void> {
  const query = (document.getElementById('icon-search-query') as HTMLInputElement).value;
  if (!query) {
    alert('Please enter a search term');
    return;
  }

  const loadingEl = document.getElementById('icon-search-loading')!;
  const resultsEl = document.getElementById('icon-results')!;

  loadingEl.style.display = 'block';
  resultsEl.innerHTML = '';

  try {
    const response = await fetch(`${API_BASE}/api/search-icons?query=${encodeURIComponent(query)}`);
    const data = await response.json();

    loadingEl.style.display = 'none';

    if (data.icons && data.icons.length > 0) {
      resultsEl.innerHTML = data.icons
        .map(
          (icon: { thumbUrl: string; title: string }, index: number) => `
        <div class="icon-result" data-icon-index="${index}" data-icon-url="${icon.thumbUrl}" data-icon-title="${icon.title}">
          <img src="${icon.thumbUrl}" alt="${icon.title}">
        </div>
      `,
        )
        .join('');

      resultsEl.querySelectorAll('.icon-result').forEach((el) => {
        el.addEventListener('click', () => {
          const url = (el as HTMLElement).dataset.iconUrl!;
          const title = (el as HTMLElement).dataset.iconTitle!;
          const index = parseInt((el as HTMLElement).dataset.iconIndex!);
          selectWikimediaIcon(url, title, index);
        });
      });
    } else {
      resultsEl.innerHTML =
        '<p style="color: var(--text-muted); padding: 20px; text-align: center; grid-column: 1/-1;">No icons found</p>';
    }
  } catch (error) {
    console.error('Error searching icons:', error);
    loadingEl.style.display = 'none';
    resultsEl.innerHTML =
      '<p style="color: var(--danger); padding: 20px; text-align: center; grid-column: 1/-1;">Search failed</p>';
  }
}

async function selectWikimediaIcon(url: string, title: string, index: number): Promise<void> {
  document.querySelectorAll('.icon-result').forEach((el) => el.classList.remove('selected'));
  document.querySelectorAll('.icon-result')[index]?.classList.add('selected');
  document.getElementById('icon-source')!.textContent = 'Downloading...';

  try {
    const response = await fetch(`${API_BASE}/api/download-icon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, source: 'wikimedia' }),
    });

    const data = await response.json();
    if (data.success) {
      selectedIconPath = data.iconPath;
      (document.getElementById('preview-icon') as HTMLImageElement).src = data.iconPath;
      document.getElementById('icon-source')!.textContent = `Wikimedia: ${title.substring(0, 25)}...`;
      (document.getElementById('bookmark-icon-path') as HTMLInputElement).value = data.iconPath;
    }
  } catch (error) {
    console.error('Error downloading icon:', error);
    alert('Failed to download icon');
  }
}

export function toggleEmojiSearch(): void {
  const container = document.getElementById('emoji-search-container')!;
  const iconContainer = document.getElementById('icon-search-container')!;

  iconContainer.style.display = 'none';
  container.style.display = container.style.display === 'none' ? 'block' : 'none';
}

export function searchEmojis(): void {
  const query = (document.getElementById('emoji-search-query') as HTMLInputElement).value;
  if (!query || query.length < 2) {
    document.getElementById('emoji-results')!.innerHTML = '';
    return;
  }

  clearTimeout(emojiSearchTimeout);
  emojiSearchTimeout = setTimeout(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/search-emojis?query=${encodeURIComponent(query)}`);
      const data = await response.json();

      const resultsEl = document.getElementById('emoji-results')!;

      if (data.emojis && data.emojis.length > 0) {
        resultsEl.innerHTML = data.emojis
          .map(
            (emoji: { code: string; keyword: string; thumbUrl: string }, index: number) => `
          <div class="icon-result" data-emoji-index="${index}" data-emoji-code="${emoji.code}" data-emoji-keyword="${emoji.keyword}">
            <img src="${emoji.thumbUrl}" alt="${emoji.keyword}">
          </div>
        `,
          )
          .join('');

        resultsEl.querySelectorAll('.icon-result').forEach((el) => {
          el.addEventListener('click', () => {
            const code = (el as HTMLElement).dataset.emojiCode!;
            const keyword = (el as HTMLElement).dataset.emojiKeyword!;
            const index = parseInt((el as HTMLElement).dataset.emojiIndex!);
            selectEmoji(code, keyword, index);
          });
        });
      } else {
        resultsEl.innerHTML =
          '<p style="color: var(--text-muted); padding: 20px; text-align: center; grid-column: 1/-1;">No emojis found</p>';
      }
    } catch (error) {
      console.error('Error searching emojis:', error);
    }
  }, 300);
}

async function selectEmoji(code: string, keyword: string, index: number): Promise<void> {
  document.querySelectorAll('#emoji-results .icon-result').forEach((el) => el.classList.remove('selected'));
  document.querySelectorAll('#emoji-results .icon-result')[index]?.classList.add('selected');
  document.getElementById('icon-source')!.textContent = 'Downloading emoji...';

  try {
    const response = await fetch(`${API_BASE}/api/download-emoji`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    const data = await response.json();
    if (data.success) {
      selectedIconPath = data.iconPath;
      (document.getElementById('preview-icon') as HTMLImageElement).src = data.iconPath;
      document.getElementById('icon-source')!.textContent = `Emoji: ${keyword}`;
      (document.getElementById('bookmark-icon-path') as HTMLInputElement).value = data.iconPath;
    }
  } catch (error) {
    console.error('Error downloading emoji:', error);
    alert('Failed to download emoji');
  }
}

export async function uploadCustomIcon(file: File): Promise<void> {
  const formData = new FormData();
  formData.append('icon', file);

  document.getElementById('icon-source')!.textContent = 'Uploading...';

  try {
    const response = await fetch(`${API_BASE}/api/upload-icon`, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    if (data.success) {
      selectedIconPath = data.iconPath;
      (document.getElementById('preview-icon') as HTMLImageElement).src = data.iconPath;
      document.getElementById('icon-source')!.textContent = `Custom: ${file.name}`;
      (document.getElementById('bookmark-icon-path') as HTMLInputElement).value = data.iconPath;
    }
  } catch (error) {
    console.error('Error uploading icon:', error);
    alert('Failed to upload icon');
  }
}

export function initUploadArea(): void {
  const uploadArea = document.getElementById('upload-area')!;
  const customInput = document.getElementById('custom-icon-input') as HTMLInputElement;

  uploadArea.addEventListener('click', () => customInput.click());

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const file = e.dataTransfer?.files[0];
    if (file && file.type.startsWith('image/')) {
      uploadCustomIcon(file);
    }
  });

  customInput.addEventListener('change', () => {
    const file = customInput.files?.[0];
    if (file) uploadCustomIcon(file);
  });
}
