// Placeholder pixel art as plain drawing functions (16x16), with no Phaser dependency, so both the game (art.ts)
// and scripts/make-tileset.ts (-> public/maps/tiles.png for LDtk) can use them. Replaced in the art stage.

export type Px = (x: number, y: number, w: number, h: number, c: number) => void;

export const C = {
  cobble: 0x9a8f7e, cobbleDark: 0x7d7262, grass: 0x6f8a4f, grassLight: 0x86a061, wood: 0x8a6440, woodDark: 0x6e4e31,
  plaster: 0xd8c9a8, timber: 0x5a3e2b, roof: 0x8c3b2e, roofDark: 0x6e2c22, glass: 0x7f97a6, carpet: 0x7a2e2e,
  leaf: 0x3f6b3a, leafLight: 0x55834a, trunk: 0x5a3e2b, water: 0x4f7a8f, waterLight: 0x7aa3b3, stone: 0x8e8e88,
  straw: 0xd9c27a, strawDark: 0xb89c52, gold: 0xe8c547, goldLight: 0xfff0a0, hut: 0x4a3324, red: 0xa8423a, white: 0xeee6d2,
};

export const TILES: Record<string, (p: Px) => void> = {
  '.': (p) => { p(0, 0, 16, 16, C.cobble); [[1, 1], [9, 2], [4, 7], [12, 9], [2, 12], [9, 13]].forEach(([x, y]) => p(x, y, 5, 3, C.cobbleDark)); },
  ',': (p) => { p(0, 0, 16, 16, C.grass); [[3, 2], [11, 5], [6, 10], [13, 13], [1, 8]].forEach(([x, y]) => p(x, y, 1, 2, C.grassLight)); },
  '_': (p) => { p(0, 0, 16, 16, C.wood); [3, 8, 13].forEach((y) => p(0, y, 16, 1, C.woodDark)); },
  'c': (p) => { p(0, 0, 16, 16, C.carpet); p(0, 0, 16, 1, C.gold); p(0, 15, 16, 1, C.gold); },
  '#': (p) => { p(0, 0, 16, 16, C.plaster); p(0, 0, 16, 2, C.timber); p(0, 14, 16, 2, C.timber); p(0, 0, 2, 16, C.timber); p(7, 0, 2, 16, C.timber); p(2, 2, 12, 2, C.timber); },
  '^': (p) => { p(0, 0, 16, 16, C.roof); [0, 4, 8, 12].forEach((y, i) => { p(0, y + 3, 16, 1, C.roofDark); p(i % 2 ? 4 : 10, y, 1, 4, C.roofDark); }); },
  'x': (p) => { TILES['#'](p); p(3, 5, 10, 8, C.timber); p(4, 6, 8, 6, C.glass); p(7, 6, 2, 6, C.timber); },
  'B': (p) => { p(0, 0, 16, 16, C.woodDark); [0x8c3b2e, 0x3b4a6b, 0x6b7a3b, 0xa8423a, 0x5a3e2b].forEach((c, i) => { p(1 + i * 3, 2, 2, 5, c); p(1 + ((i + 2) % 5) * 3, 9, 2, 5, c); }); p(0, 7, 16, 1, C.wood); },
  '=': (p) => { p(0, 0, 16, 16, C.wood); p(0, 3, 16, 9, C.woodDark); p(1, 4, 14, 7, 0x9c7650); },
  'T': (p) => { TILES[','](p); p(6, 11, 4, 5, C.trunk); p(2, 1, 12, 11, C.leaf); p(4, 2, 5, 4, C.leafLight); },
  '~': (p) => { p(0, 0, 16, 16, C.water); p(2, 4, 5, 1, C.waterLight); p(9, 10, 5, 1, C.waterLight); },
  'w': (p) => { TILES['.'](p); p(2, 2, 12, 12, C.stone); p(4, 4, 8, 8, 0x2a3a44); },
  'm': (p) => { TILES[','](p); [0, 4, 8, 12].forEach((x, i) => p(x, 1, 4, 6, i % 2 ? C.white : C.red)); p(1, 7, 14, 7, C.wood); p(3, 9, 3, 3, C.red); p(9, 9, 3, 3, 0xd9a03a); },
  'S': (p) => { p(0, 0, 16, 16, C.straw); for (let i = 0; i < 7; i++) p((i * 5) % 15, (i * 7) % 14, 1, 3, C.strawDark); },
  'g': (p) => { p(0, 0, 16, 16, C.gold); p(3, 3, 3, 2, C.goldLight); p(10, 9, 3, 2, C.goldLight); p(6, 12, 2, 2, C.goldLight); },
  'h': (p) => { p(0, 0, 16, 16, C.hut); [3, 8, 13].forEach((y) => p(0, y, 16, 1, 0x33231a)); },
  'D': (p) => { p(0, 0, 16, 16, C.timber); p(3, 2, 10, 14, 0x6e4e31); p(4, 3, 8, 13, C.wood); p(10, 9, 1, 2, C.gold); },
};

export function person(p: Px, coat: number, opts: { hat?: number; small?: boolean } = {}) {
  const o = opts.small ? 3 : 0;
  p(4, 14, 8, 2, 0x000000);                         // shadow (alpha set by caller)
  p(5, 7 + o, 6, 7 - o, coat);                      // coat
  p(5, 13, 2, 3, 0x2b2620); p(9, 13, 2, 3, 0x2b2620); // legs
  p(5, 2 + o, 6, 5, 0xe8c4a0);                      // head
  p(6, 4 + o, 1, 1, 0x2b2620); p(9, 4 + o, 1, 1, 0x2b2620);
  if (opts.hat !== undefined) { p(5, 0 + o, 6, 2, opts.hat); p(7, -2 + o, 2, 2, opts.hat); }
  else p(5, 1 + o, 6, 2, 0x5a3e2b);                 // hair
}

/** Tileset order: tile id = index. Never reorder (the LDtk maps store tile ids); append new tiles at the end. */
export const TILE_NAMES: [string, string][] = [
  ['.', 'cobble'], [',', 'grass'], ['_', 'wood floor'], ['c', 'carpet'], ['#', 'wall'], ['^', 'roof'], ['x', 'window'],
  ['B', 'shelf'], ['=', 'table'], ['T', 'tree'], ['~', 'water'], ['w', 'well'], ['m', 'stall'], ['S', 'straw'],
  ['g', 'gold'], ['h', 'hut wall'], ['D', 'door'],
];
export const TILE_ID: Record<string, number> = Object.fromEntries(TILE_NAMES.map(([ch], i) => [ch, i]));
export const TILESET_COLS = 8;
