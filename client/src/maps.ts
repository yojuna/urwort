// Placeholder maps, one character per 16px tile. Generic town for now; real Kassel comes with the art stage.
//   .  cobble (walk)   ,  grass (walk)   _  wood floor (walk)   c  carpet (walk)
//   #  wall   ^  roof   x  window   B  shelf   =  table/counter   T  tree   ~  water
//   w  well   m  stall   S  straw   g  gold   h  hut wall   D  door (walk)

export interface Obj { x: number; y: number; label: string; slip?: string; knot?: string }
export interface Npc { id: string; x: number; y: number; name: string; color: number; knot: string; small?: boolean }
export interface Exit { x: number; y: number; to: string; tx: number; ty: number }
export interface SceneDef {
  id: string;
  tale?: boolean;            // tale worlds get the engraving tint
  rows: string[];
  start: [number, number];
  npcs: Npc[];
  objs: Obj[];
  exits: Exit[];
  onEnter?: string;          // ink knot played when the scene starts
  spawnAfterEnter?: Npc;     // NPC that appears after the onEnter dialogue
}

const study: SceneDef = {
  id: 'study',
  rows: [
    '##########',
    '#BBBBxBBB#',
    '#________#',
    '#_==___c_#',
    '#_==___c_#',
    '#________#',
    '#________#',
    '####D#####',
  ],
  start: [4, 5],
  npcs: [{ id: 'jacob', x: 5, y: 3, name: 'Jacob', color: 0x3b4a6b, knot: 'jacob' }],
  objs: [
    { x: 2, y: 1, label: 'Ein Regal voller Bücher.', slip: 'Buch' },
    { x: 2, y: 3, label: 'Ein Brief auf dem Tisch.', slip: 'Brief' },
    { x: 5, y: 1, label: 'Durch das Fenster sieht man die Straße.', slip: 'Fenster' },
  ],
  exits: [{ x: 4, y: 7, to: 'street', tx: 4, ty: 3 }],
};

const street: SceneDef = {
  id: 'street',
  rows: [
    '^^^^^^^^^,,,,,,^^^^^^^^^',
    '#########,,,,,,#########',
    '##x#D#x##,,T,,,##x#D#x##',
    '........................',
    '........................',
    ',,..,,,,,,......,,,,..,,',
    ',T..,,mmm,,..,,mmm,,..T,',
    ',,..,,,,,,..w..,,,,,..,,',
    ',,..,,,,,,......,,,,..,,',
    '........................',
    '^^^^^^,,,,,,,,,,,,^^^^^^',
    '######,,T,,,,,,T,,######',
    '##x#D#,,,,,,,,,,,,#x####',
    '......,,,,~~~~,,,,......',
    ',,,,,,,,,,~~~~,,,,,,,,,,',
    'TTTTTTTTTTTTTTTTTTTTTTTT',
  ],
  start: [4, 3],
  npcs: [
    { id: 'marktfrau', x: 13, y: 8, name: 'Marktfrau', color: 0x8a5a44, knot: 'marktfrau' },
    { id: 'soldat', x: 9, y: 4, name: 'Soldat', color: 0x2c4f8f, knot: 'soldat' },
    { id: 'baecker', x: 6, y: 13, name: 'Bäcker', color: 0xc9b38a, knot: 'baecker' },
  ],
  objs: [
    { x: 17, y: 2, label: 'Ein Schild: „Apotheke“.', slip: 'Apotheke' },
    { x: 6, y: 2, label: 'Hier wohnen die Brüder Grimm.', slip: 'Bruder' },
    { x: 2, y: 12, label: 'Ein Schild: „Bäckerei“.', slip: 'Bäckerei' },
    { x: 12, y: 7, label: 'Ein alter Brunnen.', slip: 'Brunnen' },
    { x: 7, y: 6, label: 'Rote Äpfel.', slip: 'Apfel' },
    { x: 16, y: 6, label: 'Frisches Brot.', slip: 'Brot' },
    { x: 11, y: 13, label: 'Wasser.', slip: 'Wasser' },
  ],
  exits: [
    { x: 4, y: 2, to: 'study', tx: 4, ty: 6 },
    { x: 19, y: 2, to: 'pharmacy', tx: 4, ty: 6 },
  ],
};

const pharmacy: SceneDef = {
  id: 'pharmacy',
  rows: [
    '##########',
    '#BBBxxBBB#',
    '#________#',
    '#_====___#',
    '#________#',
    '#________#',
    '#________#',
    '####D#####',
  ],
  start: [4, 6],
  npcs: [{ id: 'dortchen', x: 6, y: 3, name: 'Dortchen', color: 0x7a3b52, knot: 'dortchen' }],
  objs: [
    { x: 2, y: 1, label: 'Viele kleine Flaschen.', slip: 'Flasche' },
    { x: 7, y: 1, label: 'Getrocknete Kräuter.', slip: 'Kraut' },
    { x: 3, y: 3, label: 'Eine Waage auf dem Tisch.', slip: 'Waage' },
  ],
  exits: [{ x: 4, y: 7, to: 'street', tx: 19, ty: 3 }],
};

const chamberRows = (straw: number): string[] => {
  const base = [
    '##########',
    '#SSSS_SSS#',
    '#S______S#',
    '#S______S#',
    '#SS____SS#',
    '#________#',
    '#________#',
    '####D#####',
  ];
  if (straw >= 2) { base[5] = '#S______S#'; }
  if (straw >= 3) { base[2] = '#SS____SS#'; base[6] = '#S______S#'; }
  return base;
};

const chamber = (id: string, straw: number, knot: string, onEnter?: string): SceneDef => ({
  id, tale: true, rows: chamberRows(straw), start: [4, 5], npcs: [],
  objs: [
    { x: 4, y: 7, label: '', knot: 'tuer' },
    { x: 1, y: 2, label: '', knot: 'stroh' },
    { x: 8, y: 2, label: '', knot: 'stroh' },
  ],
  exits: [],
  onEnter,
  spawnAfterEnter: { id: 'maennlein', x: 5, y: 3, name: 'Männlein', color: 0x6b3d1f, knot, small: true },
});

const castle = (id: string, knot: string): SceneDef => ({
  id, tale: true,
  rows: [
    '############',
    '#__cccccc__#',
    '#__cccccc__#',
    '#__cccccc__#',
    '#__cccccc__#',
    '#__________#',
    '#__________#',
    '#####DD#####',
  ],
  start: [5, 5],
  npcs: [{ id: 'koenig', x: 5, y: 1, name: 'König', color: 0x9c2f2f, knot: 'koenig_still' }],
  objs: [],
  exits: [],
  spawnAfterEnter: { id: 'maennlein', x: 7, y: 4, name: 'Männlein', color: 0x6b3d1f, knot, small: true },
});

const forest: SceneDef = {
  id: 'forest', tale: true,
  rows: [
    'TTTTTTTTTTTTTTTTTTTT',
    'TTTTTTThhhTTTTTTTTTT',
    'TTTTTTThDhTTTTTTTTTT',
    'TTTT,,,,,,,,,,TTTTTT',
    'TTT,,,,,,,,,,,,TTTTT',
    'TTTT,,TTTT,,,,TTTTTT',
    'TTTTT,TTTTT,,TTTTTTT',
    'TTTT,,,TTTT,,,TTTTTT',
    'TTT,,T,,,,,,T,,TTTTT',
    'TTT,TTTT,,,TTT,TTTTT',
    'TTTT,,,,,,TTTTTTTTTT',
    'TTTTTTTTT,TTTTTTTTTT',
  ],
  start: [9, 10],
  npcs: [{ id: 'maennlein', x: 10, y: 3, name: 'Männlein', color: 0x6b3d1f, knot: 'haus', small: true }],
  objs: [],
  exits: [],
};

export const SCENES: Record<string, SceneDef> = {
  study, street, pharmacy, forest,
  chamber1: chamber('chamber1', 1, 'maennlein1', 'tale_intro'),
  chamber2: chamber('chamber2', 2, 'maennlein2'),
  chamber3: chamber('chamber3', 3, 'maennlein3'),
  castle: castle('castle', 'kind_fordern'),
  castle2: castle('castle2', 'raten'),
};
