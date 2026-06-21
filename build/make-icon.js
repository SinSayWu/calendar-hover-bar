// Generates build/icon.png (256x256) — a classic calendar icon (rounded body,
// header band, two binder rings, a day grid with one highlighted "today" cell),
// rendered semi-transparent. No image libraries needed.
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const S = 256;
const ALPHA = 0.8; // overall translucency (0..1)
const buf = Buffer.alloc(S * S * 4);

const bodyFill = [245, 247, 252];
const header = [110, 168, 254];
const ring = [88, 126, 206];
const cell = [201, 213, 236];
const today = [110, 168, 254];

function roundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const rx0 = x0 + r, ry0 = y0 + r, rx1 = x1 - r, ry1 = y1 - r;
  if (x < rx0 && y < ry0) return Math.hypot(x - rx0, y - ry0) <= r;
  if (x > rx1 && y < ry0) return Math.hypot(x - rx1, y - ry0) <= r;
  if (x < rx0 && y > ry1) return Math.hypot(x - rx0, y - ry1) <= r;
  if (x > rx1 && y > ry1) return Math.hypot(x - rx1, y - ry1) <= r;
  return true;
}

// Geometry
const bL = 30, bR = 226, bT = 52, bB = 224, bRad = 34;
const headerBottom = bT + 46;
// Day grid (3x3)
const gx0 = 50, gy0 = 116, cw = 44, ch = 20, gapX = 12, gapY = 15;
function gridCell(x, y) {
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cx0 = gx0 + c * (cw + gapX), cy0 = gy0 + r * (ch + gapY);
      if (x >= cx0 && x < cx0 + cw && y >= cy0 && y < cy0 + ch) {
        return (r === 1 && c === 1) ? 'today' : 'cell';
      }
    }
  }
  return null;
}

function colorAt(x, y) {
  if (roundRect(x, y, bL, bT, bR, bB, bRad)) {
    if (y <= headerBottom) return header;
    const g = gridCell(x, y);
    if (g === 'today') return today;
    if (g === 'cell') return cell;
    return bodyFill;
  }
  // Binder rings poke above the body
  if (roundRect(x, y, 80, 30, 96, 74, 7) || roundRect(x, y, 160, 30, 176, 74, 7)) return ring;
  return null;
}

const a = Math.round(255 * ALPHA);
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const col = colorAt(x, y);
    if (col) { buf[i] = col[0]; buf[i + 1] = col[1]; buf[i + 2] = col[2]; buf[i + 3] = a; }
    else buf[i + 3] = 0;
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([t, data])) >>> 0, 0);
  return Buffer.concat([len, t, data, crc]);
}
const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
const png = Buffer.concat([
  sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
]);
fs.writeFileSync(path.join(__dirname, 'icon.png'), png);
console.log('wrote build/icon.png', png.length, 'bytes');
