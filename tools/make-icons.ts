/**
 * Draws the app icons and writes them as PNGs.
 *
 *   node tools/make-icons.ts
 *
 * Everything here — rasteriser and PNG encoder — is written out rather than
 * pulled from a package, so building the icons needs nothing but Node.
 * Rendered at 3x and averaged down, which is enough antialiasing for flat
 * geometry like this.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SS = 3; // supersampling factor

type RGBA = [number, number, number, number];

class Canvas {
  readonly w: number;
  readonly h: number;
  readonly px: Uint8ClampedArray;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = new Uint8ClampedArray(w * h * 4);
  }

  blend(x: number, y: number, [r, g, b, a]: RGBA): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = (y * this.w + x) * 4;
    const src = a / 255;
    const dst = (this.px[i + 3] / 255) * (1 - src);
    const out = src + dst;
    if (out <= 0) return;
    this.px[i] = (r * src + this.px[i] * dst) / out;
    this.px[i + 1] = (g * src + this.px[i + 1] * dst) / out;
    this.px[i + 2] = (b * src + this.px[i + 2] * dst) / out;
    this.px[i + 3] = out * 255;
  }

  rect(x: number, y: number, w: number, h: number, colour: RGBA): void {
    for (let yy = Math.floor(y); yy < Math.ceil(y + h); yy++) {
      for (let xx = Math.floor(x); xx < Math.ceil(x + w); xx++) this.blend(xx, yy, colour);
    }
  }

  /** Rounded rectangle, filled. */
  roundedRect(x: number, y: number, w: number, h: number, r: number, colour: RGBA): void {
    for (let yy = Math.floor(y); yy < Math.ceil(y + h); yy++) {
      for (let xx = Math.floor(x); xx < Math.ceil(x + w); xx++) {
        const dx = Math.max(x + r - xx - 0.5, 0, xx + 0.5 - (x + w - r));
        const dy = Math.max(y + r - yy - 0.5, 0, yy + 0.5 - (y + h - r));
        if (dx * dx + dy * dy <= r * r) this.blend(xx, yy, colour);
      }
    }
  }

  /** Dashed rectangle outline — the visual signature of a killer cage. */
  dashedRect(
    x: number,
    y: number,
    w: number,
    h: number,
    thickness: number,
    dash: number,
    gap: number,
    colour: RGBA,
  ): void {
    const run = (fromX: number, fromY: number, dirX: number, dirY: number, len: number): void => {
      let travelled = 0;
      while (travelled < len) {
        const step = Math.min(dash, len - travelled);
        const sx = fromX + dirX * travelled;
        const sy = fromY + dirY * travelled;
        this.rect(
          dirX ? sx : sx - thickness / 2,
          dirY ? sy : sy - thickness / 2,
          dirX ? step : thickness,
          dirY ? step : thickness,
          colour,
        );
        travelled += dash + gap;
      }
    };
    run(x, y, 1, 0, w);
    run(x, y + h, 1, 0, w);
    run(x, y, 0, 1, h);
    run(x + w, y, 0, 1, h);
  }

  /** Average the supersampled buffer down to the final size. */
  downsample(factor: number): Canvas {
    const out = new Canvas(this.w / factor, this.h / factor);
    for (let y = 0; y < out.h; y++) {
      for (let x = 0; x < out.w; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let sy = 0; sy < factor; sy++) {
          for (let sx = 0; sx < factor; sx++) {
            const i = ((y * factor + sy) * this.w + (x * factor + sx)) * 4;
            r += this.px[i];
            g += this.px[i + 1];
            b += this.px[i + 2];
            a += this.px[i + 3];
          }
        }
        const n = factor * factor;
        const i = (y * out.w + x) * 4;
        out.px[i] = r / n;
        out.px[i + 1] = g / n;
        out.px[i + 2] = b / n;
        out.px[i + 3] = a / n;
      }
    }
    return out;
  }
}

// ------------------------------------------------------------------ PNG out

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(canvas: Canvas): Buffer {
  const stride = canvas.w * 4;
  // Each scanline is prefixed with its filter type; 0 means none.
  const raw = Buffer.alloc((stride + 1) * canvas.h);
  for (let y = 0; y < canvas.h; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(canvas.px.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(canvas.w, 0);
  ihdr.writeUInt32BE(canvas.h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// -------------------------------------------------------------- the artwork

const BG: RGBA = [10, 13, 16, 255];
const CELL: RGBA = [236, 242, 247, 255];
const ACCENT: RGBA = [86, 209, 245, 255];
const CARD: RGBA = [250, 252, 254, 255];
const PIP: RGBA = [216, 74, 74, 255];

/** Filled diamond — the pip that makes a rectangle read as a playing card. */
function diamond(c: Canvas, cx: number, cy: number, r: number, colour: RGBA): void {
  for (let yy = Math.floor(cy - r); yy < Math.ceil(cy + r); yy++) {
    for (let xx = Math.floor(cx - r); xx < Math.ceil(cx + r); xx++) {
      if (Math.abs(xx + 0.5 - cx) + Math.abs(yy + 0.5 - cy) <= r) c.blend(xx, yy, colour);
    }
  }
}

/**
 * A 3x3 block of cells with a playing card dealt over the bottom-right corner
 * — sudoku grid plus card is the whole game in one mark.
 *
 * `pad` is the share of the canvas left as margin: bigger for maskable icons,
 * whose corners get cropped to whatever shape the launcher wants.
 */
function drawIcon(size: number, pad: number, rounded: boolean): Canvas {
  const c = new Canvas(size * SS, size * SS);
  const S = size * SS;

  if (rounded) c.roundedRect(0, 0, S, S, S * 0.22, BG);
  else c.rect(0, 0, S, S, BG);

  const margin = S * pad;
  const grid = S - margin * 2;
  const gap = grid * 0.035;
  const cell = (grid - gap * 2) / 3;

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const x = margin + col * (cell + gap);
      const y = margin + row * (cell + gap);
      // One filled cell as the "entry", the rest plain.
      const filled = row === 0 && col === 0;
      c.roundedRect(x, y, cell, cell, cell * 0.1, filled ? ACCENT : CELL);
    }
  }

  // The dealt card, overlapping the bottom-right of the grid. A dark halo
  // separates it from the cells underneath without needing a stroked border.
  const cw = cell * 1.3;
  const ch = cw * 1.38;
  const cx = margin + grid - cw * 0.94;
  const cy = margin + grid - ch * 0.9;
  const edge = Math.max(2, S * 0.014);
  c.roundedRect(cx - edge, cy - edge, cw + edge * 2, ch + edge * 2, cw * 0.14 + edge, BG);
  c.roundedRect(cx, cy, cw, ch, cw * 0.14, CARD);
  diamond(c, cx + cw / 2, cy + ch / 2, cw * 0.3, PIP);
  // Corner pips, as on a real card.
  diamond(c, cx + cw * 0.18, cy + ch * 0.15, cw * 0.09, PIP);
  diamond(c, cx + cw * 0.82, cy + ch * 0.85, cw * 0.09, PIP);

  return c.downsample(SS);
}

const out = join(process.cwd(), 'public', 'icons');
mkdirSync(out, { recursive: true });

const targets: [string, number, number, boolean][] = [
  // name, size, padding, rounded corners
  ['icon-192.png', 192, 0.14, true],
  ['icon-512.png', 512, 0.14, true],
  // Maskable icons are cropped by the launcher, so keep well inside the safe area.
  ['icon-maskable-512.png', 512, 0.26, false],
  ['apple-touch-icon.png', 180, 0.12, false],
];

for (const [name, size, pad, rounded] of targets) {
  const png = encodePNG(drawIcon(size, pad, rounded));
  writeFileSync(join(out, name), png);
  console.log(`${name.padEnd(24)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} kB`);
}
console.log('\nwrote public/icons/');
