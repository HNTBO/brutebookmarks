import { styledAlert } from './modals/confirm-modal';
import { EMOJI_DATA } from '../data/emoji-data';
import { escapeHtml } from '../utils/escape-html';

let selectedIconUrl: string | null = null;
let selectedIconPath: string | null = null;
let emojiSearchTimeout: ReturnType<typeof setTimeout>;

const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/';

export type IconSourceType = 'favicon' | 'wikimedia' | 'emoji' | 'custom' | null;

const BUTTON_ID_BY_TYPE: Record<string, string> = {
  favicon: 'use-favicon-btn',
  wikimedia: 'search-wikimedia-btn',
  emoji: 'use-emoji-btn',
  custom: 'upload-custom-btn',
};

export function detectIconType(iconPath: string | null | undefined): IconSourceType {
  if (!iconPath) return null;
  if (iconPath.includes('google.com/s2/favicons')) return 'favicon';
  if (iconPath.includes('upload.wikimedia.org') || iconPath.includes('commons.wikimedia.org')) return 'wikimedia';
  if (iconPath.includes('twemoji') || iconPath.includes('cdn.jsdelivr.net/gh/twitter/twemoji')) return 'emoji';
  if (iconPath.startsWith('data:')) return 'custom';
  return null;
}

export function setActiveIconButton(type: IconSourceType): void {
  // Clear all active states
  Object.values(BUTTON_ID_BY_TYPE).forEach((id) => {
    document.getElementById(id)?.classList.remove('active');
  });
  // Set the matching one
  if (type && BUTTON_ID_BY_TYPE[type]) {
    document.getElementById(BUTTON_ID_BY_TYPE[type])?.classList.add('active');
  }
  // Toggle upload-mode on preview (dashed border, click/drop target)
  const iconPreview = document.getElementById('icon-preview');
  if (iconPreview) {
    iconPreview.classList.toggle('upload-mode', type === 'custom');
    // Show/hide the upload prompt message
    const existing = iconPreview.querySelector('.upload-prompt');
    if (type === 'custom' && !existing) {
      const msg = document.createElement('p');
      msg.className = 'upload-prompt';
      msg.textContent = 'Drop an image here or click to upload';
      iconPreview.appendChild(msg);
    } else if (type !== 'custom' && existing) {
      existing.remove();
    }
  }
}

export function iconTypeLabel(type: IconSourceType): string {
  switch (type) {
    case 'favicon': return 'Favicon';
    case 'wikimedia': return 'Wikimedia';
    case 'emoji': return 'Emoji';
    case 'custom': return 'Custom upload';
    default: return 'Suggested favicon';
  }
}

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
    styledAlert('Please enter a URL first');
    return;
  }

  try {
    const domain = new URL(url).hostname;
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    selectedIconPath = faviconUrl;
    (document.getElementById('preview-icon') as HTMLImageElement).src = faviconUrl;
    document.getElementById('icon-source')!.textContent = 'Favicon';
    (document.getElementById('bookmark-icon-path') as HTMLInputElement).value = faviconUrl;
    setActiveIconButton('favicon');
  } catch {
    styledAlert('Invalid URL');
  }
}

export function toggleIconSearch(): void {
  const container = document.getElementById('icon-search-container')!;
  const emojiContainer = document.getElementById('emoji-search-container')!;

  emojiContainer.classList.add('hidden');
  container.classList.toggle('hidden');
  setActiveIconButton('wikimedia');

  if (!container.classList.contains('hidden')) {
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
    styledAlert('Please enter a search term');
    return;
  }

  const loadingEl = document.getElementById('icon-search-loading')!;
  const resultsEl = document.getElementById('icon-results')!;

  loadingEl.classList.remove('hidden');
  resultsEl.innerHTML = '';

  try {
    const searchTerm = `${query.trim()} logo`;
    const url =
      `https://commons.wikimedia.org/w/api.php?action=query` +
      `&generator=search&gsrsearch=${encodeURIComponent(searchTerm)}` +
      `&gsrnamespace=6&prop=imageinfo&iiprop=url&iiurlwidth=128` +
      `&format=json&gsrlimit=20&origin=*`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    loadingEl.classList.add('hidden');

    if (!response.ok) {
      resultsEl.innerHTML =
        '<p class="icon-status-message icon-status-error">Search failed</p>';
      return;
    }

    const data = await response.json();
    const pages = data?.query?.pages;

    if (!pages) {
      resultsEl.innerHTML =
        '<p class="icon-status-message">No icons found</p>';
      return;
    }

    const icons: { thumbUrl: string; title: string }[] = [];
    for (const page of Object.values(pages) as any[]) {
      const info = page.imageinfo?.[0];
      if (!info?.thumburl) continue;
      icons.push({
        thumbUrl: info.thumburl,
        title: (page.title || '').replace(/^File:/, '').replace(/\.[^.]+$/, ''),
      });
    }

    if (icons.length > 0) {
      resultsEl.innerHTML = icons
        .map(
          (icon, index) => `
        <div class="icon-result" data-icon-index="${index}" data-icon-url="${escapeHtml(icon.thumbUrl)}" data-icon-title="${escapeHtml(icon.title)}">
          <img src="${escapeHtml(icon.thumbUrl)}" alt="${escapeHtml(icon.title)}">
        </div>
      `,
        )
        .join('');

      resultsEl.querySelectorAll('.icon-result').forEach((el) => {
        el.addEventListener('click', () => {
          const thumbUrl = (el as HTMLElement).dataset.iconUrl!;
          const title = (el as HTMLElement).dataset.iconTitle!;
          const index = parseInt((el as HTMLElement).dataset.iconIndex!);
          selectWikimediaIcon(thumbUrl, title, index);
        });
      });
    } else {
      resultsEl.innerHTML =
        '<p class="icon-status-message">No icons found</p>';
    }
  } catch (error) {
    console.error('Error searching icons:', error);
    loadingEl.classList.add('hidden');
    resultsEl.innerHTML =
      '<p class="icon-status-message icon-status-error">Search failed</p>';
  }
}

function selectWikimediaIcon(thumbUrl: string, title: string, index: number): void {
  document.querySelectorAll('#icon-results .icon-result').forEach((el) => el.classList.remove('selected'));
  document.querySelectorAll('#icon-results .icon-result')[index]?.classList.add('selected');

  selectedIconPath = thumbUrl;
  (document.getElementById('preview-icon') as HTMLImageElement).src = thumbUrl;
  document.getElementById('icon-source')!.textContent = `Wikimedia: ${title.substring(0, 25)}...`;
  (document.getElementById('bookmark-icon-path') as HTMLInputElement).value = thumbUrl;
}

export function toggleEmojiSearch(): void {
  const container = document.getElementById('emoji-search-container')!;
  const iconContainer = document.getElementById('icon-search-container')!;

  iconContainer.classList.add('hidden');
  container.classList.toggle('hidden');
  setActiveIconButton('emoji');
}

export function searchEmojis(): void {
  const query = (document.getElementById('emoji-search-query') as HTMLInputElement).value;
  if (!query || query.length < 2) {
    document.getElementById('emoji-results')!.innerHTML = '';
    return;
  }

  clearTimeout(emojiSearchTimeout);
  emojiSearchTimeout = setTimeout(() => {
    const lowerQuery = query.toLowerCase();
    const matches = EMOJI_DATA.filter((entry) =>
      entry.keywords.some((kw) => kw.includes(lowerQuery)),
    ).slice(0, 40);

    const resultsEl = document.getElementById('emoji-results')!;

    if (matches.length > 0) {
      resultsEl.innerHTML = matches
        .map(
          (entry, index) => {
            const svgUrl = `${TWEMOJI_BASE}${entry.codepoint}.svg`;
            return `
          <div class="icon-result" data-emoji-index="${index}" data-emoji-codepoint="${entry.codepoint}" data-emoji-keyword="${entry.keywords[0]}">
            <img src="${svgUrl}" alt="${entry.emoji}">
          </div>
        `;
          },
        )
        .join('');

      resultsEl.querySelectorAll('.icon-result').forEach((el) => {
        el.addEventListener('click', () => {
          const codepoint = (el as HTMLElement).dataset.emojiCodepoint!;
          const keyword = (el as HTMLElement).dataset.emojiKeyword!;
          const idx = parseInt((el as HTMLElement).dataset.emojiIndex!);
          selectEmoji(codepoint, keyword, idx);
        });
      });
    } else {
      resultsEl.innerHTML =
        '<p class="icon-status-message">No emojis found</p>';
    }
  }, 150);
}

function selectEmoji(codepoint: string, keyword: string, index: number): void {
  document.querySelectorAll('#emoji-results .icon-result').forEach((el) => el.classList.remove('selected'));
  document.querySelectorAll('#emoji-results .icon-result')[index]?.classList.add('selected');

  const svgUrl = `${TWEMOJI_BASE}${codepoint}.svg`;
  selectedIconPath = svgUrl;
  (document.getElementById('preview-icon') as HTMLImageElement).src = svgUrl;
  document.getElementById('icon-source')!.textContent = `Emoji: ${keyword}`;
  (document.getElementById('bookmark-icon-path') as HTMLInputElement).value = svgUrl;
}

export async function uploadCustomIcon(file: File): Promise<void> {
  document.getElementById('icon-source')!.textContent = 'Processing...';

  try {
    const dataUri = await resizeImageToDataUri(file, 128);
    selectedIconPath = dataUri;
    (document.getElementById('preview-icon') as HTMLImageElement).src = dataUri;
    document.getElementById('icon-source')!.textContent = `Custom: ${file.name}`;
    (document.getElementById('bookmark-icon-path') as HTMLInputElement).value = dataUri;
    setActiveIconButton('custom');
  } catch (error) {
    console.error('Error processing icon:', error);
    styledAlert('Failed to process image');
    document.getElementById('icon-source')!.textContent = 'No icon selected';
  }
}

function resizeImageToDataUri(file: File, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;

      // Aspect-fit and center
      const scale = Math.min(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (size - w) / 2;
      const y = (size - h) / 2;

      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, x, y, w, h);

      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };

    img.src = objectUrl;
  });
}

export function initUploadArea(): void {
  const customInput = document.getElementById('custom-icon-input') as HTMLInputElement;
  const iconPreview = document.getElementById('icon-preview')!;

  // Preview area acts as upload trigger when in upload mode
  iconPreview.addEventListener('click', () => {
    if (iconPreview.classList.contains('upload-mode')) {
      customInput.click();
    }
  });

  iconPreview.addEventListener('dragover', (e) => {
    if (iconPreview.classList.contains('upload-mode')) {
      e.preventDefault();
      iconPreview.classList.add('dragover');
    }
  });

  iconPreview.addEventListener('dragleave', () => {
    iconPreview.classList.remove('dragover');
  });

  iconPreview.addEventListener('drop', (e) => {
    if (!iconPreview.classList.contains('upload-mode')) return;
    e.preventDefault();
    iconPreview.classList.remove('dragover');
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
