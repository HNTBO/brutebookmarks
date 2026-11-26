import './lucide-picker.css';

type Catalog = typeof import('../data/lucide-catalog');
const uriPrefix = 'data:image/svg+xml,';
const pageSize = 12;
const initialColor = '#3985b8';

export function readLucideIcon(path: string | null | undefined) {
  if (!path?.startsWith(uriPrefix)) return null;
  // Only read our own header. Never insert markup from a stored image into the page.
  const match = /^%3Csvg%20data-bb-lucide%3D%22([a-z0-9-]+)%22%20stroke%3D%22%23([0-9a-f]{6})%22/i.exec(path.slice(uriPrefix.length, 200));
  return match ? { name: match[1], color: '#' + match[2].toLowerCase() } : null;
}

export const lucidePickerMarkup = `
  <div id="lucide-picker" class="hidden">
    <div class="lucide-tools">
      <input type="search" id="lucide-query" aria-label="Search Lucide icons" placeholder="Search Lucide icons…">
      <div class="lucide-color">
        <input type="color" id="lucide-color" aria-label="Icon color" title="Choose icon color">
        <input type="text" id="lucide-hex" aria-label="Hex icon color" title="Six-digit hex color" maxlength="7" spellcheck="false" autocomplete="off">
      </div>
    </div>
    <div id="lucide-results" role="radiogroup" aria-label="Lucide icons"></div>
    <div class="lucide-pages">
      <span id="lucide-status" role="status"></span>
      <button type="button" id="lucide-prev" aria-label="Previous icons" title="Previous icons">‹</button>
      <button type="button" id="lucide-next" aria-label="Next icons" title="Next icons">›</button>
    </div>
    <div id="lucide-previews" class="hidden" role="group" aria-label="Bookmark color previews">
      <div data-preview-theme="light"><span class="lucide-sample"></span>Light</div>
      <div data-preview-theme="dark"><span class="lucide-sample"></span>Dark</div>
    </div>
    <p id="lucide-contrast-warning" role="status"></p>
  </div>`;

const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const button = (id: string) => document.getElementById(id) as HTMLButtonElement;
let catalog: Catalog | undefined;
let generation = 0;
let page = 0;
let matches: string[] = [];
let selectedName: string | null = null;
let onPick: (path: string, name: string) => void;

// CSS grayscale mixes sRGB channels before they are linearized for contrast.
function luminance(hex: string, grayscale = 0): number {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const weights = [0.2126, 0.7152, 0.0722];
  const gray = channels.reduce((sum, channel, i) => sum + channel * weights[i], 0);
  return channels.reduce((sum, channel, i) => {
    const value = channel + grayscale * (gray - channel);
    const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    return sum + weights[i] * linear;
  }, 0);
}

function updatePreviews() {
  const previews = document.getElementById('lucide-previews')!;
  const warning = document.getElementById('lucide-contrast-warning')!;
  if (!catalog || !selectedName || !catalog.hasIcon(selectedName)) {
    previews.classList.add('hidden');
    warning.textContent = '';
    return;
  }

  previews.classList.remove('hidden');
  const color = input('lucide-color').value;
  const svg = catalog.iconSvg(selectedName, color);
  const styles = getComputedStyle(previews);
  const foreground = luminance(color, Number(styles.getPropertyValue('--bookmark-icon-grayscale')));
  const lowContrast: string[] = [];
  for (const sample of previews.querySelectorAll<HTMLElement>('[data-preview-theme]')) {
    const theme = sample.dataset.previewTheme!;
    sample.querySelector('.lucide-sample')!.innerHTML = svg;
    const background = luminance(styles.getPropertyValue('--bg-card-' + theme).trim());
    const ratio = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    if (ratio < 3) lowContrast.push(theme);
  }
  const message = lowContrast.length ? `Low contrast on the ${lowContrast.join(' and ')} background. You can still use this color.` : '';
  if (warning.textContent !== message) warning.textContent = message;
}

function applySelection() {
  updatePreviews();
  if (!catalog || !selectedName || !catalog.hasIcon(selectedName)) return;
  const svg = catalog.iconSvg(selectedName, input('lucide-color').value, true);
  onPick(uriPrefix + encodeURIComponent(svg), selectedName);
}

function renderPage() {
  const results = document.getElementById('lucide-results')!;
  const start = page * pageSize;
  results.replaceChildren();
  for (const name of matches.slice(start, start + pageSize)) {
    const label = document.createElement('label');
    label.title = name;
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'lucide-icon';
    radio.value = name;
    radio.checked = name === selectedName;
    radio.setAttribute('aria-label', name);
    label.innerHTML = catalog!.iconSvg(name, 'currentColor');
    label.prepend(radio);
    results.append(label);
  }
  document.getElementById('lucide-status')!.textContent = matches.length
    ? `${start + 1}–${Math.min(start + pageSize, matches.length)} of ${matches.length.toLocaleString()} icons`
    : 'No matching icons';
  button('lucide-prev').disabled = page === 0;
  button('lucide-next').disabled = start + pageSize >= matches.length;
}

function search() {
  if (!catalog) return;
  page = 0;
  matches = catalog.searchIcons(input('lucide-query').value);
  renderPage();
}

export function hideLucidePicker() {
  generation++;
  document.getElementById('lucide-picker')!.classList.add('hidden');
  button('use-lucide-btn').setAttribute('aria-expanded', 'false');
}

export async function showLucidePicker(path: string | null) {
  const current = ++generation;
  const saved = readLucideIcon(path);
  selectedName = saved?.name ?? null;
  input('lucide-query').value = '';
  input('lucide-hex').value = input('lucide-color').value = saved?.color ?? initialColor;
  document.getElementById('lucide-picker')!.classList.remove('hidden');
  button('use-lucide-btn').setAttribute('aria-expanded', 'true');
  if (document.activeElement === button('use-lucide-btn')) input('lucide-query').focus();
  if (!catalog) {
    document.getElementById('lucide-status')!.textContent = 'Loading icons…';
    button('lucide-next').disabled = button('lucide-prev').disabled = true;
    input('lucide-hex').disabled = input('lucide-color').disabled = true;
    try {
      catalog = await import('../data/lucide-catalog');
    } catch {
      if (current === generation) document.getElementById('lucide-status')!.textContent = 'Couldn’t load icons. Open Lucide to try again.';
      return;
    }
    if (current !== generation) return;
  }
  input('lucide-hex').disabled = input('lucide-color').disabled = false;
  updatePreviews();
  search();
  if (selectedName && !input('lucide-query').value && matches.includes(selectedName)) {
    page = Math.floor(matches.indexOf(selectedName) / pageSize);
    renderPage();
  }
}

export function initLucidePicker(pick: typeof onPick) {
  onPick = pick;
  const query = input('lucide-query');
  const color = input('lucide-color');
  const hex = input('lucide-hex');
  const results = document.getElementById('lucide-results')!;
  results.addEventListener('change', event => {
    selectedName = (event.target as HTMLInputElement).value;
    applySelection();
  });
  results.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      event.target.click();
    }
  });
  query.addEventListener('input', search);
  query.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown' && event.key !== 'Enter') return;
    event.preventDefault();
    const first = results.querySelector('input');
    first?.focus();
    if (event.key === 'Enter') first?.click();
  });
  color.addEventListener('input', () => {
    hex.value = color.value;
    applySelection();
  });
  hex.addEventListener('input', () => {
    if (/^#?[0-9a-f]{6}$/i.test(hex.value)) {
      color.value = '#' + hex.value.replace('#', '');
      applySelection();
    }
  });
  hex.addEventListener('blur', () => { hex.value = color.value; });
  button('lucide-prev').addEventListener('click', () => { page--; renderPage(); });
  button('lucide-next').addEventListener('click', () => { page++; renderPage(); });
}
