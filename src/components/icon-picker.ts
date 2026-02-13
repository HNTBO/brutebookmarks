import { styledAlert } from './modals/confirm-modal';
import { getConvexClient } from '../data/convex-client';
import { api } from '../../convex/_generated/api';
import { EMOJI_DATA } from '../data/emoji-data';
import { escapeHtml } from '../utils/escape-html';

let selectedIconUrl: string | null = null;
let selectedIconPath: string | null = null;
let emojiSearchTimeout: ReturnType<typeof setTimeout>;

const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/';

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
  } catch {
    styledAlert('Invalid URL');
  }
}

export function toggleIconSearch(): void {
  const container = document.getElementById('icon-search-container')!;
  const emojiContainer = document.getElementById('emoji-search-container')!;

  emojiContainer.style.display = 'none';
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
    styledAlert('Please enter a search term');
    return;
  }

  const loadingEl = document.getElementById('icon-search-loading')!;
  const resultsEl = document.getElementById('icon-results')!;

  loadingEl.style.display = 'block';
  resultsEl.innerHTML = '';

  try {
    const client = getConvexClient();
    if (!client) {
      loadingEl.style.display = 'none';
      resultsEl.innerHTML =
        '<p style="color: var(--danger); padding: 20px; text-align: center; grid-column: 1/-1;">Not connected</p>';
      return;
    }

    const data = await client.action(api.icons.searchWikimedia, { query });

    loadingEl.style.display = 'none';

    if (data.icons && data.icons.length > 0) {
      resultsEl.innerHTML = data.icons
        .map(
          (icon: { thumbUrl: string; title: string }, index: number) => `
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
        '<p style="color: var(--text-muted); padding: 20px; text-align: center; grid-column: 1/-1;">No icons found</p>';
    }
  } catch (error) {
    console.error('Error searching icons:', error);
    loadingEl.style.display = 'none';
    resultsEl.innerHTML =
      '<p style="color: var(--danger); padding: 20px; text-align: center; grid-column: 1/-1;">Search failed</p>';
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
        '<p style="color: var(--text-muted); padding: 20px; text-align: center; grid-column: 1/-1;">No emojis found</p>';
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
