// Draws the placeholder tiles from src/pixels.ts into public/maps/tiles.png, the tileset the LDtk maps paint with.
// Usage: node scripts/make-tileset.ts   (Node 23.6+ runs TypeScript directly)
// Tile id = index in TILE_NAMES; ids are stored in public/maps/urwort.ldtk, so never reorder, only append.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { TILES, TILE_NAMES, TILESET_COLS } from '../src/pixels.ts';

const T = 16;
const W = TILESET_COLS * T, H = Math.ceil(TILE_NAMES.length / TILESET_COLS) * T;
const rgba = Buffer.alloc(W * H * 4);   // transparent where no tile

TILE_NAMES.forEach(([ch], i) => {
  const ox = (i % TILESET_COLS) * T, oy = Math.floor(i / TILESET_COLS) * T;
  TILES[ch]((x, y, w, h, c) => {
    for (let py = Math.max(0, y); py < Math.min(T, y + h); py++) {
      for (let px = Math.max(0, x); px < Math.min(T, x + w); px++) {
        const o = ((oy + py) * W + ox + px) * 4;
        rgba[o] = (c >> 16) & 255; rgba[o + 1] = (c >> 8) & 255; rgba[o + 2] = c & 255; rgba[o + 3] = 255;
      }
    }
  });
});

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6;   // 8-bit RGBA
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) rgba.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);   // filter byte 0 per row
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);

mkdirSync('public/maps', { recursive: true });
writeFileSync('public/maps/tiles.png', png);
console.log(`tiles.png: ${TILE_NAMES.length} tiles, ${W}x${H}px`);
