type ThemeMode = 'dark' | 'light' | 'auto';
type ResolvedTheme = 'dark' | 'light';
export type ActionIconGlyph = 'quicksave' | 'newtab';

export interface ActionIconTheme {
  theme: ThemeMode;
  resolvedTheme?: ResolvedTheme;
  accentColor?: string | null;
  accentColorDark: string | null;
  accentColorLight: string | null;
}

const ICON_SIZES = [16, 32, 48, 128] as const;
const DARK_BACKGROUND = '#000c17';
const LIGHT_BACKGROUND = '#fdf6e3';
const DEFAULT_DARK_ACCENT = '#0AEBFB';
const DEFAULT_LIGHT_ACCENT = '#002b36';

let lastIconKey = '';

export function resolveActionIconTheme(theme: ThemeMode): ResolvedTheme {
  if (theme !== 'auto') return theme;
  if (typeof matchMedia === 'undefined') return 'dark';
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getResolvedActionIconTheme(theme: ActionIconTheme): ResolvedTheme {
  if (theme.resolvedTheme === 'dark' || theme.resolvedTheme === 'light') {
    return theme.resolvedTheme;
  }
  return resolveActionIconTheme(theme.theme);
}

export async function updateActionIconForTheme(
  theme: ActionIconTheme,
  glyph: ActionIconGlyph = 'quicksave',
): Promise<void> {
  if (!browser.action?.setIcon) return;

  const resolvedTheme = getResolvedActionIconTheme(theme);
  const accent =
    (resolvedTheme === 'dark' ? theme.accentColorDark : theme.accentColorLight) ||
    theme.accentColor ||
    (resolvedTheme === 'dark' ? DEFAULT_DARK_ACCENT : DEFAULT_LIGHT_ACCENT);
  const background = resolvedTheme === 'dark' ? DARK_BACKGROUND : LIGHT_BACKGROUND;
  const key = `${glyph}:${resolvedTheme}:${background}:${accent}`;
  if (key === lastIconKey) return;

  const imageData = createActionIconImageData(background, accent, glyph);
  if (!imageData) return;

  await browser.action.setIcon({ imageData });
  lastIconKey = key;
}

function createActionIconImageData(
  background: string,
  accent: string,
  glyph: ActionIconGlyph,
): Record<number, ImageData> | null {
  const result: Record<number, ImageData> = {};
  for (const size of ICON_SIZES) {
    const canvas = createCanvas(size);
    if (!canvas) return null;

    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as
      | OffscreenCanvasRenderingContext2D
      | CanvasRenderingContext2D
      | null;
    if (!ctx) return null;

    drawActionIcon(ctx, size, background, accent, glyph);
    result[size] = ctx.getImageData(0, 0, size, size);
  }
  return result;
}

function createCanvas(size: number): OffscreenCanvas | HTMLCanvasElement | null {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(size, size);
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    return canvas;
  }
  return null;
}

function drawActionIcon(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  size: number,
  background: string,
  accent: string,
  glyph: ActionIconGlyph,
): void {
  const scale = size / 128;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = background;
  ctx.fillRect(6 * scale, 6 * scale, 116 * scale, 116 * scale);

  ctx.fillStyle = accent;
  if (glyph === 'newtab') {
    drawNewTabGlyph(ctx, scale);
  } else {
    drawQuickSaveGlyph(ctx, scale);
  }
}

function drawQuickSaveGlyph(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  scale: number,
): void {
  ctx.beginPath();
  ctx.moveTo(69.22 * scale, 76.128 * scale);
  ctx.lineTo(81.852 * scale, 76.128 * scale);
  ctx.lineTo(63.999 * scale, 99.041 * scale);
  ctx.lineTo(46.146 * scale, 76.128 * scale);
  ctx.lineTo(58.778 * scale, 76.128 * scale);
  ctx.lineTo(58.778 * scale, 28.958 * scale);
  ctx.lineTo(69.219 * scale, 28.958 * scale);
  ctx.lineTo(69.22 * scale, 76.128 * scale);
  ctx.closePath();
  ctx.fill();
}

function drawNewTabGlyph(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  scale: number,
): void {
  ctx.beginPath();
  ctx.moveTo(58.127 * scale, 69.873 * scale);
  ctx.lineTo(28.981 * scale, 69.873 * scale);
  ctx.lineTo(28.981 * scale, 58.127 * scale);
  ctx.lineTo(58.127 * scale, 58.127 * scale);
  ctx.lineTo(58.127 * scale, 28.981 * scale);
  ctx.lineTo(69.873 * scale, 28.981 * scale);
  ctx.lineTo(69.873 * scale, 58.127 * scale);
  ctx.lineTo(99.019 * scale, 58.127 * scale);
  ctx.lineTo(99.019 * scale, 69.873 * scale);
  ctx.lineTo(69.873 * scale, 69.873 * scale);
  ctx.lineTo(69.873 * scale, 99.019 * scale);
  ctx.lineTo(58.127 * scale, 99.019 * scale);
  ctx.lineTo(58.127 * scale, 69.873 * scale);
  ctx.closePath();
  ctx.fill();
}
