import { styledAlert } from './modals/confirm-modal';
import { escapeHtml } from '../utils/escape-html';
import { isConvexMode } from '../data/store';
import { getConvexClient } from '../data/convex-client';
import { api } from '../../convex/_generated/api';
import { hideLucidePicker, initLucidePicker, readLucideIcon, showLucidePicker } from './lucide-picker';
import { discoveredIcon, loadFavicon, localFavicon } from '../data/favicon-lookup';

let iconChoice = new AbortController();
let timedOutDiscovery: { url: string; result: Promise<string | null>; expires: number } | undefined;

export function cancelPendingIconChoice(): void {
  timedOutDiscovery = undefined;
  iconChoice.abort();
  iconChoice = new AbortController();
  document.getElementById('favicon-status')!.textContent = '';
}
let selectedIconPath: string | null = null;
let selectedImportedFavicon: true | undefined;
let emojiSearchTimeout: ReturnType<typeof setTimeout>;
let emojiSearchGeneration = 0;
let emojiDataPromise: Promise<EmojiEntry[]> | null = null;

const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/';

interface EmojiEntry {
  emoji: string;
  codepoint: string;
  keywords: string[];
}

export type IconSourceType = 'favicon' | 'wikimedia' | 'emoji' | 'lucide' | 'custom' | null;

const BUTTON_ID_BY_TYPE: Record<string, string> = {
  favicon: 'use-favicon-btn',
  wikimedia: 'search-wikimedia-btn',
  emoji: 'use-emoji-btn',
  lucide: 'use-lucide-btn',
  custom: 'upload-custom-btn',
};

export function detectIconType(iconPath: string | null | undefined, importedFavicon?: true): IconSourceType {
  if (!iconPath) return null;
  if (!importedFavicon && readLucideIcon(iconPath)) return 'lucide';
  if (/^data:/i.test(iconPath)) return importedFavicon === true ? 'favicon' : 'custom';
  if (iconPath.includes('google.com/s2/favicons')) return 'favicon';
  if (iconPath.includes('upload.wikimedia.org') || iconPath.includes('commons.wikimedia.org')) return 'wikimedia';
  if (iconPath.includes('twemoji') || iconPath.includes('cdn.jsdelivr.net/gh/twitter/twemoji')) return 'emoji';
  if (/^https?:\/\//i.test(iconPath)) return 'favicon';
  return null;
}

export function setActiveIconButton(type: IconSourceType): void {
  if (type === 'lucide') {
    document.getElementById('icon-search-container')!.classList.add('hidden');
    document.getElementById('emoji-search-container')!.classList.add('hidden');
    void showLucidePicker(selectedIconPath);
  } else {
    hideLucidePicker();
  }
  // Clear all active states
  Object.values(BUTTON_ID_BY_TYPE).forEach((id) => {
    document.getElementById(id)?.classList.remove('active');
  });
  // Set the matching one
  if (type && BUTTON_ID_BY_TYPE[type]) {
    document.getElementById(BUTTON_ID_BY_TYPE[type])?.classList.add('active');
  }
  // Toggle upload-mode on preview (dashed border and click target)
  const iconPreview = document.getElementById('icon-preview');
  if (iconPreview) {
    iconPreview.classList.toggle('upload-mode', type === 'custom');
    // Show/hide the solid upload overlay
    const existing = iconPreview.querySelector('.upload-overlay');
    if (type === 'custom' && !existing) {
      const overlay = document.createElement('div');
      overlay.className = 'upload-overlay';
      const msg = document.createElement('p');
      msg.textContent = 'Drop an image here or click to upload';
      overlay.appendChild(msg);
      iconPreview.appendChild(overlay);
    } else if (type !== 'custom' && existing) {
      existing.remove();
    }
  }
}

export function activateCustomUploadMode(): void {
  cancelPendingIconChoice();
  document.getElementById('icon-search-container')?.classList.add('hidden');
  document.getElementById('emoji-search-container')?.classList.add('hidden');
  setActiveIconButton('custom');
}

export function iconTypeLabel(type: IconSourceType, path?: string): string {
  switch (type) {
    case 'favicon': return 'Favicon';
    case 'wikimedia': return 'Wikimedia';
    case 'emoji': return 'Emoji';
    case 'lucide': return path ? `Lucide · ${readLucideIcon(path)!.name}` : 'Lucide';
    case 'custom': return 'Custom upload';
    default: return 'Suggested favicon';
  }
}

export function getSelectedImportedFavicon(): true | undefined {
  return selectedImportedFavicon;
}

export function setSelectedIconPath(path: string | null, importedFavicon?: true): void {
  cancelPendingIconChoice();
  selectedIconPath = path;
  selectedImportedFavicon = importedFavicon;
}

export function resetIconPicker(): void {
  hideLucidePicker();
  setSelectedIconPath(null);
}

export function initLucideOption(): void {
  const trigger = document.getElementById('use-lucide-btn')!;
  trigger.addEventListener('click', () => {
    if (trigger.getAttribute('aria-expanded') === 'true') hideLucidePicker();
    else {
      document.getElementById('icon-source')!.textContent = selectedIconPath
        ? iconTypeLabel(detectIconType(selectedIconPath, selectedImportedFavicon), selectedIconPath)
        : 'No icon selected';
      handleUrlChange();
      setActiveIconButton('lucide');
    }
  });
  initLucidePicker((path, name) => {
    setSelectedIconPath(path);
    (document.getElementById('preview-icon') as HTMLImageElement).src = path;
    document.getElementById('icon-source')!.textContent = `Lucide · ${name}`;
    (document.getElementById('bookmark-icon-path') as HTMLInputElement).value = path;
  });
}

export function handleUrlChange(): void {
  cancelPendingIconChoice();
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
  hideLucidePicker();
  const previous = timedOutDiscovery;
  cancelPendingIconChoice();
  const { signal } = iconChoice;
  const url = (document.getElementById('bookmark-url') as HTMLInputElement).value;
  if (!url) {
    styledAlert('Please enter a URL first');
    return;
  }
  let domain: string;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    domain = parsed.hostname;
  } catch {
    styledAlert('Invalid URL');
    return;
  }

  const status = document.getElementById('favicon-status')!;
  const offlineMessage = 'You’re offline. Reconnect and try again.';
  if (!navigator.onLine) {
    status.textContent = offlineMessage;
    return;
  }
  status.textContent = 'Finding favicon…';
  let discovery: typeof previous;
  let discovering = false;
  if (isConvexMode()) {
    discovery = previous?.url === url && previous.expires > Date.now() ? previous : {
      url, expires: Date.now() + 60_000,
      result: getConvexClient()!.action(api.favicons.resolveFavicon, { url, forceRefresh: true }).then(discoveredIcon),
    };
    discovering = true;
  }
  const candidate = discovery ? discovery.result.finally(() => { discovering = false; }) : localFavicon(domain);
  const result = await loadFavicon(candidate, signal);
  if (signal.aborted) return;
  if (result.status === 'timeout' && discovering) timedOutDiscovery = discovery;
  if (result.status !== 'found' && !navigator.onLine) {
    status.textContent = offlineMessage;
    return;
  }
  switch (result.status) {
    case 'found':
      setSelectedIconPath(result.url);
      (document.getElementById('preview-icon') as HTMLImageElement).src = result.url;
      (document.getElementById('bookmark-icon-path') as HTMLInputElement).value = result.url;
      document.getElementById('icon-source')!.textContent = 'Favicon';
      setActiveIconButton('favicon');
      status.textContent = 'Favicon selected.';
      break;
    case 'missing': status.textContent = 'No favicon found, or the image could not be loaded.'; break;
    case 'timeout': status.textContent = 'Favicon lookup timed out.'; break;
    case 'error': status.textContent = 'Favicon lookup failed.'; break;
  }
}

export function toggleIconSearch(): void {
  cancelPendingIconChoice();
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

  setSelectedIconPath(thumbUrl);
  (document.getElementById('preview-icon') as HTMLImageElement).src = thumbUrl;
  document.getElementById('icon-source')!.textContent = `Wikimedia: ${title.substring(0, 25)}...`;
  (document.getElementById('bookmark-icon-path') as HTMLInputElement).value = thumbUrl;
}

export function toggleEmojiSearch(): void {
  cancelPendingIconChoice();
  const container = document.getElementById('emoji-search-container')!;
  const iconContainer = document.getElementById('icon-search-container')!;

  iconContainer.classList.add('hidden');
  container.classList.toggle('hidden');
  setActiveIconButton('emoji');

  if (!container.classList.contains('hidden')) {
    void loadEmojiData();
  }
}

async function loadEmojiData(): Promise<EmojiEntry[]> {
  if (!emojiDataPromise) {
    emojiDataPromise = import('../data/emoji-data').then((module) => module.EMOJI_DATA as EmojiEntry[]);
  }
  return emojiDataPromise;
}

export function searchEmojis(): void {
  const query = (document.getElementById('emoji-search-query') as HTMLInputElement).value;
  if (!query || query.length < 2) {
    emojiSearchGeneration++;
    clearTimeout(emojiSearchTimeout);
    document.getElementById('emoji-results')!.innerHTML = '';
    return;
  }

  const generation = ++emojiSearchGeneration;
  clearTimeout(emojiSearchTimeout);
  emojiSearchTimeout = setTimeout(async () => {
    const lowerQuery = query.toLowerCase();
    const emojiData = await loadEmojiData();
    if (generation !== emojiSearchGeneration) return;

    const matches = emojiData.filter((entry) =>
      entry.keywords.some((kw) => kw.includes(lowerQuery) || lowerQuery.includes(kw)),
    ).slice(0, 40);

    const resultsEl = document.getElementById('emoji-results')!;

    if (matches.length > 0) {
      resultsEl.innerHTML = matches
        .map(
          (entry, index) => {
            const svgUrl = `${TWEMOJI_BASE}${entry.codepoint}.svg`;
            return `
          <div class="icon-result" data-emoji-index="${index}" data-emoji-codepoint="${escapeHtml(entry.codepoint)}" data-emoji-keyword="${escapeHtml(entry.keywords[0])}">
            <img src="${svgUrl}" alt="${escapeHtml(entry.emoji)}">
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
  setSelectedIconPath(svgUrl);
  (document.getElementById('preview-icon') as HTMLImageElement).src = svgUrl;
  document.getElementById('icon-source')!.textContent = `Emoji: ${keyword}`;
  (document.getElementById('bookmark-icon-path') as HTMLInputElement).value = svgUrl;
}

export async function uploadCustomIcon(file: File): Promise<void> {
  cancelPendingIconChoice();
  const { signal } = iconChoice;
  document.getElementById('favicon-status')!.textContent = 'Processing image…';

  try {
    const dataUri = await resizeImageToDataUri(file, 128);
    if (signal.aborted) return;
    setSelectedIconPath(dataUri);
    (document.getElementById('preview-icon') as HTMLImageElement).src = dataUri;
    document.getElementById('icon-source')!.textContent = `Custom: ${file.name}`;
    (document.getElementById('bookmark-icon-path') as HTMLInputElement).value = dataUri;
    setActiveIconButton('custom');
  } catch (error) {
    if (signal.aborted) return;
    cancelPendingIconChoice();
    console.error('Error processing icon:', error);
    styledAlert('Failed to process image');
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

  iconPreview.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
    activateCustomUploadMode();
    iconPreview.classList.add('dragover');
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  });

  iconPreview.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    activateCustomUploadMode();
    iconPreview.classList.add('dragover');
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  });

  iconPreview.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    iconPreview.classList.remove('dragover');
  });

  iconPreview.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    void acceptIconDrop(e.dataTransfer, iconPreview);
  });

  document.addEventListener('dragenter', (e) => {
    if (!shouldRouteIconDrag(e, iconPreview)) return;
    e.preventDefault();
    e.stopPropagation();
    activateIconDropTarget(e, iconPreview);
  }, true);

  document.addEventListener('dragover', (e) => {
    if (!shouldRouteIconDrag(e, iconPreview)) return;
    e.preventDefault();
    e.stopPropagation();
    activateIconDropTarget(e, iconPreview);
  }, true);

  document.addEventListener('drop', (e) => {
    if (!shouldRouteIconDrag(e, iconPreview)) return;
    e.preventDefault();
    e.stopPropagation();
    void acceptIconDrop(e.dataTransfer, iconPreview);
  }, true);

  customInput.addEventListener('change', () => {
    const file = customInput.files?.[0];
    if (file) uploadCustomIcon(file);
  });
}

function activateIconDropTarget(event: DragEvent, iconPreview: HTMLElement): void {
  activateCustomUploadMode();
  iconPreview.classList.add('dragover');
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy';
  }
}

async function acceptIconDrop(dataTransfer: DataTransfer | null, iconPreview: HTMLElement): Promise<void> {
  activateCustomUploadMode();
  iconPreview.classList.remove('dragover');
  const file = getDroppedImageFile(dataTransfer);
  if (file) {
    await uploadCustomIcon(file);
  }
}

function getDroppedImageFile(dataTransfer: DataTransfer | null): File | null {
  if (!dataTransfer) return null;

  return Array.from(dataTransfer.files).find((file) =>
    file.type.startsWith('image/'),
  ) ?? null;
}

function shouldRouteIconDrag(event: DragEvent, iconPreview: HTMLElement): boolean {
  if (!document.getElementById('bookmark-modal')?.classList.contains('active')) return false;

  const target = event.target;
  if (target instanceof Node && iconPreview.contains(target)) return true;

  return isPointInsideElement(event, iconPreview);
}

function isPointInsideElement(event: DragEvent, element: HTMLElement): boolean {
  const { clientX, clientY } = event;
  if (clientX === 0 && clientY === 0) return false;

  const rect = element.getBoundingClientRect();
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}
