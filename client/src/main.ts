import Phaser from 'phaser';
import './style.css';
import { loadData } from './data';
import { loadMaps } from './ldtk';
import { World } from './world';
import { hud } from './ui/cards';
import { el, modal } from './ui/dom';
import { reset, state, save } from './state';
import { isRunning } from './story';

function menu() {
  return modal((body, close) => {
    el('h2', '', 'Menü', body);
    el('p', 'muted', 'urwort, Prototyp 0.1. Platzhalter-Grafik; die Dialoge sind Entwürfe.', body);
    const en = el('button', 'wide', state.english ? 'Englisch ausblenden' : 'Englisch zeigen', body);
    en.onclick = () => { state.english = !state.english; save(); close(); };
    const r = el('button', 'wide danger', 'Neu beginnen', body);
    r.onclick = () => { if (confirm('Alles löschen und neu beginnen?')) reset(); };
  });
}

async function boot() {
  await Promise.all([loadData(), loadMaps()]);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    pixelArt: true,
    backgroundColor: '#2b2620',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: [World],
  });
  hud(menu);
  Object.assign(window, { __game: game, __running: isRunning });   // for the automated play-through
}

void boot();
