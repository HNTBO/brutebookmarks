type ThemeMode = 'dark' | 'light' | 'auto';
type ResolvedTheme = 'dark' | 'light';

export interface ActionIconTheme {
  theme: ThemeMode;
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

export async function updateActionIconForTheme(theme: ActionIconTheme): Promise<void> {
  if (!browser.action?.setIcon) return;

  const resolvedTheme = resolveActionIconTheme(theme.theme);
  const accent =
    (resolvedTheme === 'dark' ? theme.accentColorDark : theme.accentColorLight) ||
    theme.accentColor ||
    (resolvedTheme === 'dark' ? DEFAULT_DARK_ACCENT : DEFAULT_LIGHT_ACCENT);
  const background = resolvedTheme === 'dark' ? DARK_BACKGROUND : LIGHT_BACKGROUND;
  const key = `${resolvedTheme}:${background}:${accent}`;
  if (key === lastIconKey) return;

  const imageData = createActionIconImageData(background, accent);
  if (!imageData) return;

  await browser.action.setIcon({ imageData });
  lastIconKey = key;
}

function createActionIconImageData(
  background: string,
  accent: string,
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

    drawQuickSaveIcon(ctx, size, background, accent);
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

function drawQuickSaveIcon(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  size: number,
  background: string,
  accent: string,
): void {
  const scale = size / 128;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = background;
  ctx.fillRect(6 * scale, 6 * scale, 116 * scale, 116 * scale);

  ctx.fillStyle = accent;
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
