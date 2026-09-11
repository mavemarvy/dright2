import { deflateSync } from 'node:zlib';

const WIDTH = 1200;
const HEIGHT = 630;

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function clamp(value: number, min = 0, max = 255) {
  return Math.max(min, Math.min(max, value));
}

function mix(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

function insideRoundedRect(x: number, y: number, left: number, top: number, width: number, height: number, radius: number) {
  if (x < left || x >= left + width || y < top || y >= top + height) return false;
  const nearestX = Math.max(left + radius, Math.min(x, left + width - radius));
  const nearestY = Math.max(top + radius, Math.min(y, top + height - radius));
  const dx = x - nearestX;
  const dy = y - nearestY;
  return dx * dx + dy * dy <= radius * radius;
}

function dShape(x: number, y: number, yOffset = 0) {
  const yy = y - yOffset;
  const stem = x >= 475 && x <= 535 && yy >= 205 && yy <= 425;
  const outerEllipse = x >= 510 && (((x - 535) / 150) ** 2 + ((yy - 315) / 112) ** 2 <= 1);
  const innerEllipse = x >= 535 && (((x - 535) / 82) ** 2 + ((yy - 315) / 66) ** 2 <= 1);
  return (stem || outerEllipse) && !innerEllipse;
}

function makePng() {
  const rowSize = WIDTH * 4 + 1;
  const raw = Buffer.alloc(rowSize * HEIGHT);

  const tileLeft = 375;
  const tileTop = 90;
  const tileWidth = 450;
  const tileHeight = 450;

  for (let y = 0; y < HEIGHT; y += 1) {
    const row = y * rowSize;
    raw[row] = 0;

    for (let x = 0; x < WIDTH; x += 1) {
      const offset = row + 1 + x * 4;
      const gy = y / (HEIGHT - 1);
      const gx = x / (WIDTH - 1);
      const radial = Math.max(0, 1 - Math.hypot((x - WIDTH * 0.5) / 720, (y - HEIGHT * 0.4) / 430));

      let r = clamp(7 + 8 * gy + 8 * radial);
      let g = clamp(10 + 11 * gy + 10 * radial);
      let b = clamp(16 + 20 * gy + 18 * radial + 3 * gx);

      if (insideRoundedRect(x, y, tileLeft - 15, tileTop + 16, tileWidth + 30, tileHeight + 30, 100)) {
        r = Math.max(0, r - 6);
        g = Math.max(0, g - 7);
        b = Math.max(0, b - 8);
      }

      if (insideRoundedRect(x, y, tileLeft, tileTop, tileWidth, tileHeight, 94)) {
        const t = (y - tileTop) / tileHeight;
        const sheen = Math.sin((x + y) * 0.045) * 7;
        const silver = clamp(232 - 128 * t + sheen, 78, 244);
        r = silver;
        g = clamp(silver + 2);
        b = clamp(silver + 9);
      }

      if (insideRoundedRect(x, y, tileLeft + 5, tileTop + 5, tileWidth - 10, tileHeight - 10, 89)) {
        const t = (y - tileTop) / tileHeight;
        const dark = clamp(48 - 44 * t);
        r = dark;
        g = clamp(dark + 3);
        b = clamp(dark + 8);

        if (y < tileTop + tileHeight * 0.48) {
          const gloss = Math.max(0, 15 * (1 - (y - tileTop) / (tileHeight * 0.48)));
          r = clamp(r + gloss);
          g = clamp(g + gloss);
          b = clamp(b + gloss);
        }
      }

      if (dShape(x, y, 10)) {
        r = 5;
        g = 7;
        b = 11;
      }

      if (dShape(x, y)) {
        const t = clamp(((x - 470) + (y - 195)) / 430, 0, 1) / 255;
        const brush = Math.sin((x * 0.11) + (y * 0.065)) * 7;
        const c1 = [252, 253, 255];
        const c2 = [96, 110, 130];
        r = clamp(mix(c1[0], c2[0], t) + brush);
        g = clamp(mix(c1[1], c2[1], t) + brush);
        b = clamp(mix(c1[2], c2[2], t) + brush);
      }

      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

let cachedPng: Buffer | null = null;

export default function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }

  if (!cachedPng) cachedPng = makePng();

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Length', String(cachedPng.length));
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).send(cachedPng);
}
