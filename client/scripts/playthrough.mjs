// Automated play-through of the slice in headless Chromium (phone viewport).
// Usage: node scripts/playthrough.mjs <url> <screenshot dir>
// Taps tiles like a player, clicks through dialogue, solves the rune bench (one wrong rune first).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:4173/';
const out = process.argv[3] ?? 'shots';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

let shot = 0;
const snap = async (name) => page.screenshot({ path: `${out}/${String(++shot).padStart(2, '0')}-${name}.png` });
const sleep = (ms) => page.waitForTimeout(ms);
const scene = () => page.evaluate(() => window.__game.scene.getScene('world').def.id);

// Tap a tile; if it is off-screen, first tap visible tiles along the path until it comes into view.
async function tapTile(tx, ty) {
  for (let i = 0; i < 8; i++) {
    const p = await page.evaluate(([tx, ty]) => {
      const s = window.__game.scene.getScene('world');
      const cam = s.cameras.main;
      const x = (tx * 16 + 8 - cam.worldView.x) * cam.zoom, y = (ty * 16 + 8 - cam.worldView.y) * cam.zoom;
      const visible = x > 4 && y > 70 && x < s.scale.width - 4 && y < s.scale.height - 4;
      if (visible) return { x, y };
      // a visible walkable tile in the target's direction
      const vx = Math.max(cam.worldView.x + 8, Math.min(tx * 16 + 8, cam.worldView.right - 8));
      const vy = Math.max(cam.worldView.y + 40, Math.min(ty * 16 + 8, cam.worldView.bottom - 8));
      let best = null;
      for (let r = 0; r < 6 && !best; r++) for (let dy = -r; dy <= r && !best; dy++) for (let dx = -r; dx <= r; dx++) {
        const gx = Math.floor(vx / 16) + dx, gy = Math.floor(vy / 16) + dy;
        const sx = (gx * 16 + 8 - cam.worldView.x) * cam.zoom, sy = (gy * 16 + 8 - cam.worldView.y) * cam.zoom;
        const onScreen = sx > 4 && sy > 70 && sx < s.scale.width - 4 && sy < s.scale.height - 4;
        if (onScreen && (gx !== s.px || gy !== s.py) && s.walkable(gx, gy) && s.findPath(gx, gy)) { best = [gx, gy]; break; }
      }
      return best ? { walk: true, x: (best[0] * 16 + 8 - cam.worldView.x) * cam.zoom, y: (best[1] * 16 + 8 - cam.worldView.y) * cam.zoom } : null;
    }, [tx, ty]);
    if (!p) throw new Error(`cannot reach tile ${tx},${ty}`);
    await page.mouse.click(p.x, p.y);
    if (!p.walk) return;
    await sleep(2200);
  }
}

// choices: prefer texts in `prefer`, else the first one
const seen = new Set();
async function advance(prefer = [], benchPlan = [], snapAt = {}) {
  let idle = 0;
  while (idle < 12) {
    const sc = await scene().catch(() => '');
    if (sc && !seen.has(sc)) { seen.add(sc); await sleep(500); await snap('scene-' + sc); }
    if (await page.locator('.bench').count()) {
      const r = benchPlan.shift();
      if (snapAt.bench) { await snap(snapAt.bench); snapAt.bench = null; }
      // no plan left: tap the hinted rune (the bench shows a hint after two misses)
      const stone = r ? page.locator('.stone', { hasText: r }).first()
        : (await page.locator('.stone.hint').count()) ? page.locator('.stone.hint').first() : page.locator('.stone').first();
      await stone.click();
      await sleep(400);
      if (snapAt.benchResult) { await snap(snapAt.benchResult); snapAt.benchResult = null; }
      await sleep(1300);
      idle = 0; continue;
    }
    const choices = page.locator('.choice');
    if (await choices.count()) {
      const texts = await choices.allTextContents();
      const i = Math.max(0, texts.findIndex((t) => prefer.some((p) => t.includes(p))));
      if (snapAt.choice) { await snap(snapAt.choice); snapAt.choice = null; }
      await choices.nth(i).click();
      await sleep(250); idle = 0; continue;
    }
    if (await page.locator('.modal-back:not(.bench)').count()) {
      if (snapAt.modal) { await snap(snapAt.modal); snapAt.modal = null; }
      await page.locator('.modal-close').last().click();
      await sleep(250); idle = 0; continue;
    }
    const d = page.locator('.dialogue:not(.hidden)');
    if (await d.count()) {
      if (snapAt.dialogue) { await snap(snapAt.dialogue); snapAt.dialogue = null; }
      await sleep(220);
      await d.click({ position: { x: 20, y: 20 } });
      await sleep(120); idle = 0; continue;
    }
    await sleep(250); idle++;
  }
}

async function waitScene(id) {
  for (let i = 0; i < 40; i++) { if ((await scene().catch(() => '')) === id) { await sleep(700); return; } await sleep(250); }
  await snap("FAIL-" + id);
  console.log('errors so far:', errors);
  (await import('node:fs')).writeFileSync(`${out}/fail-state.json`, await page.evaluate(() => localStorage.getItem('urwort-proto-v1')));
  console.log(await page.evaluate(() => { const s = window.__game.scene.getScene('world'); return JSON.stringify({ px: s.px, py: s.py, moving: s.moving, path: s.path.length, modal: !!document.querySelector('.modal-back'), running: window.__running(), dlg: !!document.querySelector('.dialogue:not(.hidden)') }); }));
  throw new Error(`scene ${id} not reached (at ${await scene()})`);
}

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await waitScene('study');
await snap('study');

await tapTile(5, 3); await sleep(800);
await advance(['Warum'], [], { dialogue: 'jacob-dialogue', choice: 'jacob-choice' });
// tap a word in dialogue: covered by the slip box check below
await tapTile(4, 7); await waitScene('street');
await snap('street');
await tapTile(13, 8); await sleep(2500); await advance();            // Marktfrau before the request
await tapTile(19, 2); await waitScene('pharmacy');
await tapTile(6, 3); await sleep(1500); await advance([], [], { dialogue: 'dortchen' });
await tapTile(4, 7); await waitScene('street');
await tapTile(13, 8); await sleep(2500); await advance();
await tapTile(9, 4); await sleep(1500); await advance();              // Soldat
await tapTile(19, 2); await waitScene('pharmacy');
await tapTile(6, 3); await sleep(1500); await advance();
await sleep(1500); await snap('title-card');
// the tale runs straight through: three chambers, the wedding, the castle, then the forest
await advance(['Halsband', 'Ring', 'Ich verspreche', 'Gold'], ['-lein', 'ver-', 'ver-', 'ver-', '-in'],
  { dialogue: 'chamber1', bench: 'bench1', benchResult: 'bench1-result' });
await waitScene('forest');
await tapTile(10, 3); await sleep(3000);
await advance(['Conrad', 'Heinrich', 'Rumpelstilzchen'], ['-in', 'er-'], { dialogue: 'song', bench: 'bench-erraten', benchResult: 'bench-fizzle' });
await waitScene('pharmacy');
await tapTile(6, 3); await sleep(1500); await advance();
await tapTile(4, 7); await waitScene('street');
await tapTile(4, 2); await waitScene('study');
await tapTile(5, 3); await sleep(1000);
await advance([], [], { modal: 'original-1812' });
await snap('end');
await page.locator('.hud-btn', { hasText: 'Zettel' }).click(); await sleep(300); await snap('slipbox');
await page.locator('.chip', { hasText: 'Männlein' }).first().click(); await sleep(300); await snap('slip-maennlein');
await page.locator('.modal-close').last().click(); await page.locator('.modal-close').last().click();
await page.locator('.hud-btn', { hasText: 'Runen' }).click(); await sleep(300); await snap('runes');

const st = await page.evaluate(() => JSON.parse(localStorage.getItem('urwort-proto-v1')));
console.log(JSON.stringify({ scene: st.scene, slips: st.slips.length, runes: st.runes, items: st.items, flags: Object.keys(st.flags).length }));
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
