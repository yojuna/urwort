// The explorable world: one Phaser scene that loads any SceneDef from maps.ts.
import Phaser from 'phaser';
import { SCENES, type Npc, type SceneDef } from './maps';
import { SOLID, makeTextures, npcTexture, tileKey } from './art';
import { state, save } from './state';
import { isRunning, play, type StoryHost } from './story';
import { addSlip, titleCard } from './ui/cards';
import { toast } from './ui/dom';

const T = 16;
const STEP_MS = 140;

export class World extends Phaser.Scene implements StoryHost {
  def!: SceneDef;
  rows: string[] = [];
  tiles: Phaser.GameObjects.Image[][] = [];
  player!: Phaser.GameObjects.Image;
  px = 0;
  py = 0;
  npcs: { def: Npc; img: Phaser.GameObjects.Image }[] = [];
  moving = false;
  path: [number, number][] = [];
  onArrive: (() => void) | null = null;
  marker!: Phaser.GameObjects.Image;

  constructor() { super('world'); }

  create(data: { scene?: string; x?: number; y?: number }) {
    makeTextures(this);
    const id = data.scene ?? state.scene;
    this.def = SCENES[id] ?? SCENES.study;
    this.rows = this.def.rows.map((r) => r);
    this.npcs = [];
    this.tiles = [];
    for (let y = 0; y < this.rows.length; y++) {
      this.tiles.push([]);
      for (let x = 0; x < this.rows[y].length; x++) {
        const ch = this.rows[y][x];
        if (ch === 'T' || ch === 'm') this.add.image(x * T + 8, y * T + 8, tileKey(','));
        this.tiles[y].push(this.add.image(x * T + 8, y * T + 8, tileKey(ch)));
      }
    }
    if (state.flags['gold_' + id]) this.gold(true);

    const start = data.x !== undefined ? [data.x, data.y!] : (data.scene ? this.def.start : [state.x, state.y]);
    [this.px, this.py] = start as [number, number];
    for (const n of this.def.npcs) this.spawn(n);
    this.player = this.add.image(this.px * T + 8, this.py * T + 7, 'player').setDepth(this.py + 0.5);
    this.marker = this.add.image(0, 0, 'marker').setVisible(false).setDepth(100);

    const cam = this.cameras.main;
    const w = this.rows[0].length * T, h = this.rows.length * T;
    const fit = () => {
      const zoom = Math.max(2, Math.round(Math.min(this.scale.width / (T * 8), this.scale.height / (T * 10))));
      cam.setZoom(zoom);
      cam.setBounds(Math.min(0, (w - this.scale.width / zoom) / 2), Math.min(0, (h - this.scale.height / zoom) / 2),
        Math.max(w, this.scale.width / zoom), Math.max(h, this.scale.height / zoom));
    };
    fit();
    this.scale.on('resize', fit);
    this.events.once('shutdown', () => this.scale.off('resize', fit));
    cam.startFollow(this.player, true, 0.15, 0.15);
    cam.setBackgroundColor(this.def.tale ? '#1b1712' : '#2b2620');
    if (this.def.tale && cam.postFX) {
      cam.postFX.addColorMatrix().sepia();
      cam.postFX.addVignette(0.5, 0.5, 0.9, 0.35);
    }
    cam.fadeIn(400);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.tap(p));
    const keys = this.input.keyboard?.addKeys('UP,DOWN,LEFT,RIGHT,W,A,S,D,SPACE,ENTER') as Record<string, Phaser.Input.Keyboard.Key> | undefined;
    if (keys) {
      const dirs: [string[], number, number][] = [[['UP', 'W'], 0, -1], [['DOWN', 'S'], 0, 1], [['LEFT', 'A'], -1, 0], [['RIGHT', 'D'], 1, 0]];
      for (const [names, dx, dy] of dirs) for (const n of names) keys[n].on('down', () => this.stepKey(dx, dy));
    }

    state.scene = id;
    state.x = this.px; state.y = this.py;
    save();

    // scripted scene start: intro dialogue, then the NPC who appears, who speaks first in tale scenes
    const entered = 'entered_' + id;
    const after = this.def.spawnAfterEnter;
    const done = state.flags['done_' + id];
    if (!state.flags[entered] && this.def.onEnter) {
      state.flags[entered] = true;
      this.time.delayedCall(600, () => play(this.def.onEnter!, this).then(() => this.appear(after, !done)));
    } else if (after && !done) {
      this.time.delayedCall(500, () => this.appear(after, true));
    }
  }

  appear(n: Npc | undefined, talk: boolean) {
    if (!n || this.scene.isActive() === false) return;
    const img = this.spawn(n);
    img.setAlpha(0);
    this.tweens.add({ targets: img, alpha: 1, duration: 600 });
    if (talk) this.time.delayedCall(700, () => this.talk(n));
  }

  spawn(n: Npc) {
    const img = this.add.image(n.x * T + 8, n.y * T + 7, npcTexture(this, n.color, n.small)).setDepth(n.y + 0.5);
    this.npcs.push({ def: n, img });
    return img;
  }

  walkable(x: number, y: number) {
    const ch = this.rows[y]?.[x];
    if (ch === undefined || SOLID.has(ch)) return false;
    return !this.npcs.some((n) => n.def.x === x && n.def.y === y);
  }

  /** Breadth-first path on the tile grid (maps are tiny). */
  findPath(tx: number, ty: number): [number, number][] | null {
    const key = (x: number, y: number) => y * 1000 + x;
    const prev = new Map<number, number>();
    const q: [number, number][] = [[this.px, this.py]];
    prev.set(key(this.px, this.py), -1);
    while (q.length) {
      const [x, y] = q.shift()!;
      if (x === tx && y === ty) {
        const out: [number, number][] = [];
        let k = key(x, y);
        while (k !== key(this.px, this.py)) { out.unshift([k % 1000, Math.floor(k / 1000)]); k = prev.get(k)!; }
        return out;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!prev.has(key(nx, ny)) && this.walkable(nx, ny)) { prev.set(key(nx, ny), key(x, y)); q.push([nx, ny]); }
      }
    }
    return null;
  }

  tap(p: Phaser.Input.Pointer) {
    if (isRunning() || document.querySelector('.modal-back')) return;
    const tx = Math.floor(p.worldX / T), ty = Math.floor(p.worldY / T);
    const npc = this.npcs.find((n) => n.def.x === tx && n.def.y === ty);
    const obj = this.def.objs.find((o) => o.x === tx && o.y === ty);
    if (npc || obj) {
      this.goNear(tx, ty, () => (npc ? this.talk(npc.def) : this.inspect(obj!)));
      return;
    }
    const path = this.findPath(tx, ty);
    if (path) {
      this.marker.setPosition(tx * T + 8, ty * T + 4).setVisible(true);
      this.walk(path, () => this.marker.setVisible(false));
    }
  }

  /** Walk next to a target tile (or stay if already adjacent), then act. */
  goNear(tx: number, ty: number, then: () => void) {
    if (Math.abs(tx - this.px) + Math.abs(ty - this.py) === 1) { then(); return; }
    let best: [number, number][] | null = null;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1]]) {
      const nx = tx + dx, ny = ty + dy;
      if (Math.abs(dx) + Math.abs(dy) !== 1) continue;
      if (nx === this.px && ny === this.py) { then(); return; }
      if (!this.walkable(nx, ny)) continue;
      const p = this.findPath(nx, ny);
      if (p && (!best || p.length < best.length)) best = p;
    }
    if (best) this.walk(best, then);
    else toast('Da komme ich nicht hin.');
  }

  walk(path: [number, number][], then?: () => void) {
    this.path = path;
    this.onArrive = then ?? null;
    if (!this.moving) this.nextStep();
  }

  nextStep() {
    const step = this.path.shift();
    if (!step) {
      this.moving = false;
      const cb = this.onArrive;
      this.onArrive = null;
      cb?.();
      return;
    }
    this.moving = true;
    const [x, y] = step;
    if (x < this.px) this.player.setFlipX(true); else if (x > this.px) this.player.setFlipX(false);
    this.px = x; this.py = y;
    this.player.setDepth(y + 0.5);
    this.tweens.add({
      targets: this.player, x: x * T + 8, y: y * T + 7, duration: STEP_MS,
      onComplete: () => {
        const exit = this.def.exits.find((e) => e.x === x && e.y === y);
        if (exit) { this.path = []; this.moving = false; this.goto(exit.to, exit.tx, exit.ty); return; }
        state.x = x; state.y = y;
        this.nextStep();
      },
    });
  }

  stepKey(dx: number, dy: number) {
    if (isRunning() || this.moving || document.querySelector('.modal-back')) return;
    const nx = this.px + dx, ny = this.py + dy;
    const npc = this.npcs.find((n) => n.def.x === nx && n.def.y === ny);
    const obj = this.def.objs.find((o) => o.x === nx && o.y === ny);
    if (npc) this.talk(npc.def);
    else if (obj) this.inspect(obj);
    else if (this.walkable(nx, ny)) this.walk([[nx, ny]]);
  }

  talk(n: Npc) {
    void play(n.knot, this).then(() => {
      // a tale scene is done once its NPC has spoken; it does not appear again
      if (this.def.spawnAfterEnter?.id === n.id) { state.flags['done_' + this.def.id] = true; save(); }
    });
  }

  inspect(o: SceneDef['objs'][number]) {
    if (o.knot) { void play(o.knot, this); return; }
    toast(o.label);
    if (o.slip) addSlip(o.slip);
  }

  // ---- StoryHost

  gold(silent = false) {
    for (let y = 0; y < this.rows.length; y++) {
      for (let x = 0; x < this.rows[y].length; x++) {
        if (this.rows[y][x] === 'S') {
          this.rows[y] = this.rows[y].slice(0, x) + 'g' + this.rows[y].slice(x + 1);
          this.tiles[y][x].setTexture(tileKey('g'));
        }
      }
    }
    state.flags['gold_' + this.def.id] = true;
    if (!silent) this.cameras.main.flash(500, 255, 230, 120);
  }

  goto(scene: string, x?: number, y?: number) {
    const cam = this.cameras.main;
    cam.fadeOut(350);
    cam.once('camerafadeoutcomplete', () => this.scene.restart({ scene, x, y }));
  }

  telling() {
    const cam = this.cameras.main;
    cam.fadeOut(1200, 20, 16, 12);
    cam.once('camerafadeoutcomplete', async () => {
      await titleCard('Rumpelstilzchen', 'erzählt von Dortchen Wild · Kassel, 1810');
      this.scene.restart({ scene: 'chamber1' });
    });
  }
}
