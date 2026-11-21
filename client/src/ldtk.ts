// Loads the maps from public/maps/urwort.ldtk (made in the LDtk editor, https://ldtk.io) into scenes for world.ts.
// Reads only what the game uses; the full format is at https://ldtk.io/json.
//   layers   Ground, Objects (under the characters), Above (over them: 3/4 view), Collision (IntGrid, 1 = solid)
//   entities Start, Npc, Obj, Exit (fields documented in the LDtk project itself)
//   level fields: tale (engraving tint), onEnter (ink knot played the first time)

export interface Obj { x: number; y: number; label: string; slip?: string; knot?: string }
export interface Npc { id: string; x: number; y: number; name: string; color: number; knot: string; small?: boolean }
export interface Exit { x: number; y: number; to: string; tx: number; ty: number }
export interface Tile { x: number; y: number; t: number }
export interface SceneDef {
  id: string;
  tale?: boolean;
  w: number;
  h: number;
  ground: Tile[];
  objects: Tile[];
  above: Tile[];
  solid: Uint8Array;         // w*h, 1 = cannot walk
  start: [number, number];
  npcs: Npc[];
  objs: Obj[];
  exits: Exit[];
  onEnter?: string;          // ink knot played when the scene starts
  spawnAfterEnter?: Npc;     // NPC that appears after the onEnter dialogue
}

type Value = string | number | boolean | null;
interface Field { __identifier: string; __value: Value }
interface Entity { __identifier: string; __grid: [number, number]; fieldInstances: Field[] }
interface Layer {
  __identifier: string; __cWid: number; __gridSize: number;
  gridTiles: { px: [number, number]; t: number }[];
  intGridCsv: number[];
  entityInstances: Entity[];
}
interface Level { identifier: string; pxWid: number; pxHei: number; fieldInstances: Field[]; layerInstances: Layer[] | null }
interface Project { levels: Level[]; defaultGridSize: number }

export const SCENES: Record<string, SceneDef> = {};

const fields = (fs: Field[]) => Object.fromEntries(fs.map((f) => [f.__identifier, f.__value]));
const str = (v: Value) => (typeof v === 'string' && v !== '' ? v : undefined);

function scene(lv: Level, grid: number): SceneDef {
  const lf = fields(lv.fieldInstances);
  const w = lv.pxWid / grid, h = lv.pxHei / grid;
  const def: SceneDef = {
    id: lv.identifier, tale: lf.tale === true, w, h, ground: [], objects: [], above: [],
    solid: new Uint8Array(w * h), start: [0, 0], npcs: [], objs: [], exits: [], onEnter: str(lf.onEnter),
  };
  for (const layer of lv.layerInstances ?? []) {
    const g = layer.__gridSize;
    const tiles = layer.gridTiles.map((t) => ({ x: t.px[0] / g, y: t.px[1] / g, t: t.t }));
    if (layer.__identifier === 'Ground') def.ground = tiles;
    else if (layer.__identifier === 'Objects') def.objects = tiles;
    else if (layer.__identifier === 'Above') def.above = tiles;
    else if (layer.__identifier === 'Collision') layer.intGridCsv.forEach((v, i) => { def.solid[i] = v === 1 ? 1 : 0; });
    else if (layer.__identifier === 'Entities') {
      for (const e of layer.entityInstances) {
        const [x, y] = e.__grid, f = fields(e.fieldInstances);
        if (e.__identifier === 'Start') def.start = [x, y];
        else if (e.__identifier === 'Exit') def.exits.push({ x, y, to: String(f.to), tx: Number(f.tx), ty: Number(f.ty) });
        else if (e.__identifier === 'Obj') def.objs.push({ x, y, label: str(f.label) ?? '', slip: str(f.slip), knot: str(f.knot) });
        else if (e.__identifier === 'Npc') {
          const n: Npc = { id: String(f.id), x, y, name: String(f.name), knot: String(f.knot),
            color: parseInt(String(f.color).slice(1), 16), small: f.small === true };
          if (f.afterEnter === true) def.spawnAfterEnter = n; else def.npcs.push(n);
        }
      }
    }
  }
  return def;
}

export async function loadMaps(url = './maps/urwort.ldtk') {
  const project: Project = await (await fetch(url)).json();
  for (const lv of project.levels) SCENES[lv.identifier] = scene(lv, project.defaultGridSize);
}
