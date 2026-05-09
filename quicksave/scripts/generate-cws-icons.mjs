import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const SIZES = [16, 32, 48, 128, 300];
const BACKGROUND = [3, 14, 25, 255];
const ACCENT = [10, 235, 251, 255];
const SOURCE_SIZE = 128;
const ART_RATIO = 96 / 128;
const SUPERSAMPLE = 4;

const GLYPHS = {
  quicksave: [
    [69.22, 76.128],
    [81.852, 76.128],
    [63.999, 99.041],
    [46.146, 76.128],
    [58.778, 76.128],
    [58.778, 28.958],
    [69.219, 28.958],
    [69.22, 76.128],
  ],
  newtab: [
    [58.127, 69.873],
    [28.981, 69.873],
    [28.981, 58.127],
    [58.127, 58.127],
    [58.127, 28.981],
    [69.873, 28.981],
    [69.873, 58.127],
    [99.019, 58.127],
    [99.019, 69.873],
    [69.873, 69.873],
    [69.873, 99.019],
    [58.127, 99.019],
    [58.127, 69.873],
  ],
};

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function setPixel(buffer, width, x, y, color) {
  const offset = (y * width + x) * 4;
  buffer[offset] = color[0];
  buffer[offset + 1] = color[1];
  buffer[offset + 2] = color[2];
  buffer[offset + 3] = color[3];
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function drawPolygon(buffer, width, polygon, color) {
  const minX = Math.max(0, Math.floor(Math.min(...polygon.map(([x]) => x))));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(...polygon.map(([x]) => x))));
  const minY = Math.max(0, Math.floor(Math.min(...polygon.map(([, y]) => y))));
  const maxY = Math.min(width - 1, Math.ceil(Math.max(...polygon.map(([, y]) => y))));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (pointInPolygon(x + 0.5, y + 0.5, polygon)) setPixel(buffer, width, x, y, color);
    }
  }
}

function downsample(high, highSize, size) {
  const out = Buffer.alloc(size * size * 4);
  const factor = highSize / size;
  const samples = factor * factor;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const total = [0, 0, 0, 0];
      for (let sy = 0; sy < factor; sy += 1) {
        for (let sx = 0; sx < factor; sx += 1) {
          const offset = (((y * factor + sy) * highSize) + (x * factor + sx)) * 4;
          total[0] += high[offset];
          total[1] += high[offset + 1];
          total[2] += high[offset + 2];
          total[3] += high[offset + 3];
        }
      }
      const offset = (y * size + x) * 4;
      out[offset] = Math.round(total[0] / samples);
      out[offset + 1] = Math.round(total[1] / samples);
      out[offset + 2] = Math.round(total[2] / samples);
      out[offset + 3] = Math.round(total[3] / samples);
    }
  }
  return out;
}

function transformPoint([x, y], size) {
  const artSize = size * ART_RATIO;
  const pad = (size - artSize) / 2;
  return [pad + (x / SOURCE_SIZE) * artSize, pad + (y / SOURCE_SIZE) * artSize];
}

function renderIcon(glyph, size) {
  const highSize = size * SUPERSAMPLE;
  const high = Buffer.alloc(highSize * highSize * 4);
  const artSize = highSize * ART_RATIO;
  const pad = (highSize - artSize) / 2;

  for (let y = Math.round(pad); y < Math.round(pad + artSize); y += 1) {
    for (let x = Math.round(pad); x < Math.round(pad + artSize); x += 1) {
      setPixel(high, highSize, x, y, BACKGROUND);
    }
  }

  const polygon = GLYPHS[glyph].map((point) => transformPoint(point, highSize));
  drawPolygon(high, highSize, polygon, ACCENT);
  return downsample(high, highSize, size);
}

for (const size of SIZES) {
  const rgba = renderIcon('quicksave', size);
  writeFileSync(join(OUT_DIR, `cws-quicksave-icon-${size}.png`), encodePng(size, size, rgba));
}
