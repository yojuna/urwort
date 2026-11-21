// Placeholder character sprites, drawn in code from src/pixels.ts. Map tiles come from public/maps/tiles.png
// (scripts/make-tileset.ts), which the LDtk maps paint with. Replaced in the art stage.
import Phaser from 'phaser';
import { person, type Px } from './pixels';

export function makeTextures(scene: Phaser.Scene) {
  const draw = (key: string, fn: (p: Px) => void) => {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    fn((x, y, w, h, c) => { g.fillStyle(c, key.startsWith('npc') || key === 'player' ? (c === 0 ? 0.25 : 1) : 1); g.fillRect(x, y + 2, w, h); });
    g.generateTexture(key, 16, 18);
    g.destroy();
  };
  draw('player', (p) => person(p, 0x4f6b3f));
  draw('marker', (p) => { p(6, 0, 4, 4, 0xe8c547); });
}

export function npcTexture(scene: Phaser.Scene, color: number, small = false): string {
  const key = `npc_${color.toString(16)}_${small ? 's' : 'n'}`;
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    person((x, y, w, h, c) => { g.fillStyle(c, c === 0 ? 0.25 : 1); g.fillRect(x, y + 2, w, h); }, color, small ? { hat: 0xa8423a, small } : {});
    g.generateTexture(key, 16, 18);
    g.destroy();
  }
  return key;
}

