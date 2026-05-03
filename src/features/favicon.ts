import type { ResolvedTheme } from './theme';

const FAVICON_PATH =
  'M91.246,28.988l0,70.023l-27.246,-28.009l-27.246,28.009l0,-70.023l54.493,0Z';

let lastFaviconKey = '';

function getSvgIconLink(): HTMLLinkElement | null {
  return document.querySelector<HTMLLinkElement>('link[rel~="icon"][type="image/svg+xml"]');
}

function escapeSvgAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function encodeSvg(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function updateAccentFavicon(theme: ResolvedTheme): void {
  const link = getSvgIconLink();
  if (!link) return;

  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue('--accent').trim();
  const background = styles.getPropertyValue('--bg-primary').trim();
  if (!accent || !background) return;

  const key = `${theme}:${background}:${accent}`;
  if (key === lastFaviconKey) return;
  lastFaviconKey = key;

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">',
    `<rect x="6" y="6" width="116" height="116" fill="${escapeSvgAttribute(background)}"/>`,
    `<path d="${FAVICON_PATH}" fill="${escapeSvgAttribute(accent)}"/>`,
    '</svg>',
  ].join('');

  link.href = encodeSvg(svg);
}
