import zlib from 'node:zlib';

function parseHexColor(hex: string, fallback: [number, number, number]): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return fallback;
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function mixColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function inRoundedRect(
  x: number,
  y: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  radius: number
): boolean {
  if (x < rx || x > rx + rw || y < ry || y > ry + rh) return false;
  const cx = Math.max(rx + radius, Math.min(x, rx + rw - radius));
  const cy = Math.max(ry + radius, Math.min(y, ry + rh - radius));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

export interface PngIconOptions {
  size: number;
  primaryColor?: string;
  secondaryColor?: string;
  maskable?: boolean;
  roundedBackground?: boolean;
}

/**
 * Pure Node.js RGBA PNG generator for PWA & Android mipmap icons.
 * Renders a crisp receipt + QR code emblem with zero native dependencies.
 */
export function generateChallanPngIcon(options: PngIconOptions): Buffer {
  const {
    size,
    primaryColor = '#0D6E4E',
    secondaryColor = '#059669',
    maskable = false,
    roundedBackground = true,
  } = options;

  const c1 = parseHexColor(primaryColor, [13, 110, 78]);
  const c2 = parseHexColor(secondaryColor, [5, 150, 105]);
  const white: [number, number, number] = [255, 255, 255];
  const ink: [number, number, number] = [30, 41, 59];
  const muted: [number, number, number] = [100, 116, 139];

  const padScale = maskable ? 0.72 : 0.86;
  const raw = Buffer.alloc(size * (1 + size * 4));

  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0;

    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 4;
      const nx = (x + 0.5) / size;
      const ny = (y + 0.5) / size;

      const bgActive =
        maskable || !roundedBackground
          ? true
          : inRoundedRect(nx, ny, 0, 0, 1, 1, 0.22);

      if (!bgActive) {
        raw[px] = 0;
        raw[px + 1] = 0;
        raw[px + 2] = 0;
        raw[px + 3] = 0;
        continue;
      }

      const gradT = Math.min(1, Math.max(0, (nx + ny) * 0.5));
      let [r, g, b] = mixColor(c1, c2, gradT);

      const gx = (nx - 0.5) / padScale + 0.5;
      const gy = (ny - 0.5) / padScale + 0.5;

      const inReceiptBody = inRoundedRect(gx, gy, 0.22, 0.14, 0.56, 0.64, 0.05);
      const zigPeriod = Math.abs(((gx - 0.22) / 0.14) % 1 - 0.5) * 2;
      const zigBottom = 0.74 + zigPeriod * 0.06;
      const inReceiptTail =
        gx >= 0.22 && gx <= 0.78 && gy >= 0.70 && gy <= zigBottom;

      if (inReceiptBody || inReceiptTail) {
        [r, g, b] = white;

        const inLeftOuter = inRoundedRect(gx, gy, 0.30, 0.24, 0.17, 0.17, 0.025);
        const inLeftHole = inRoundedRect(gx, gy, 0.335, 0.275, 0.10, 0.10, 0.012);
        const inLeftCore = inRoundedRect(gx, gy, 0.355, 0.295, 0.06, 0.06, 0.008);
        if ((inLeftOuter && !inLeftHole) || inLeftCore) {
          [r, g, b] = c1;
        }

        const inRightOuter = inRoundedRect(gx, gy, 0.53, 0.24, 0.17, 0.17, 0.025);
        const inRightHole = inRoundedRect(gx, gy, 0.565, 0.275, 0.10, 0.10, 0.012);
        const inRightCore = inRoundedRect(gx, gy, 0.585, 0.295, 0.06, 0.06, 0.008);
        if ((inRightOuter && !inRightHole) || inRightCore) {
          [r, g, b] = c2;
        }

        if (inRoundedRect(gx, gy, 0.30, 0.49, 0.40, 0.05, 0.025)) {
          [r, g, b] = ink;
        } else if (inRoundedRect(gx, gy, 0.30, 0.58, 0.28, 0.045, 0.022)) {
          [r, g, b] = muted;
        } else if (inRoundedRect(gx, gy, 0.30, 0.66, 0.34, 0.045, 0.022)) {
          [r, g, b] = muted;
        }
      }

      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw, { level: 6 });
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}
