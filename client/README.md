# urwort client (prototype 0.1)

The new game client for the Grimm concept (`docs/concept-grimm.md`). It replaces `game/` (Three.js islands),
which stays deployed until this one is ready.

**The slice:** you start in the Grimms' study in Kassel. Jacob sends you to Dortchen Wild at the pharmacy,
and she wants honey from the market before she tells you a tale. Her telling takes you into
*Rumpelstilzchen* (1812). There you learn the runes `-lein`, `ver-`, `-in` and `er-` by using them:
*verwandeln*, *versprechen*, *Königin*, *erraten*. Then you go back to Kassel, and Jacob shows you the 1812 text.

## Run

```bash
npm install
npm run dev        # compiles the ink story, then starts Vite
npm run build      # ink + typecheck + build -> dist/ (relative paths, deployable under any folder)
```

## Structure

| file | what |
|---|---|
| `src/story/main.ink` | All dialogue, in [Ink](https://github.com/inkle/ink). **Draft, AI-written, needs review.** Tags drive the game (see the file header). |
| `public/maps/urwort.ldtk` | All maps, made in [LDtk](https://ldtk.io): one level per scene, with NPCs, objects, exits and scripted starts as entities. See *Editing maps* below. |
| `public/maps/tiles.png` | The placeholder tileset the maps paint with. Made by `npm run tiles` from `src/pixels.ts`. |
| `src/ldtk.ts` | Loads the LDtk project into scenes for `world.ts` (layers, collision, entities, level fields). |
| `src/pixels.ts` | Placeholder pixel art as plain drawing functions (tiles and characters), shared by the game and the tileset script. |
| `src/world.ts` | The explorable world (Phaser 4, 3/4 top-down): tap-to-move with pathfinding, arrow keys/WASD, interaction, scene changes, tale tint. |
| `src/story.ts` | Runs ink knots through the dialogue box and turns tags into actions (slips, runes, items, puzzles, scenes). |
| `src/ui/` | HTML overlay: dialogue with tappable words, slip box, word cards, rune bench, title cards. |
| `src/art.ts` | Character sprites drawn in code from `src/pixels.ts`. Replaced in the art stage. |
| `public/data/slice.json` | Word data for every word in the dialogue and maps. Made by `pipeline-v2/proto_export.py`. |
| `story-lint.txt` | Made by the same script: unknown tokens and words above A2, for the dialogue review. |

## Editing maps (LDtk)

Open `public/maps/urwort.ldtk` in [LDtk](https://ldtk.io/download/) 1.5.3 (desktop app). The world view shows every
level. Save, and `npm run dev` picks up the change on reload. Layers, top to bottom:

| layer | what | in the game |
|---|---|---|
| `Entities` | `Start`, `Npc`, `Obj`, `Exit`; every field has a description in LDtk | NPCs, inspectable things, level changes |
| `Collision` | IntGrid, 1 = solid (shown red, semi-transparent) | where the player cannot walk |
| `Above` | tiles drawn **over** the characters (3/4 view: roof eaves, tree crowns, arches) | depth above all characters |
| `Objects` | walls, furniture, trees | under the characters |
| `Ground` | floors, grass, water | bottom |

- **Level fields:** `tale` (engraving tint) and `onEnter` (ink knot played the first time the level starts).
- **Npc fields:** `id`, `name`, `knot` (ink), `color` (placeholder coat), `small`, and `afterEnter` (the NPC appears
  only after the `onEnter` dialogue and then speaks first, as the Männlein does).
- **Obj fields:** `label` (shown when inspected), `slip` (a word slip, as a lemma), or `knot` instead of the label.
  New labels and slips feed the word data: run `proto_export.py` after editing (see below).
- **Exit fields:** `to` (level identifier), `tx`, `ty` (target tile).
- The straw-to-gold swap in the tale works on tile ids (`straw` → `gold` in the Objects layer), so paint straw with
  the straw tile.
- **Tile ids are stored in the maps.** `src/pixels.ts` lists the tiles in order (`TILE_NAMES`): never reorder, only
  append. After changing the art, run `npm run tiles`.
- LDtk's auto-tiling rules are not used yet; tiles are painted by hand.

## Dialogue workflow

1. Edit `src/story/main.ink` (or labels and slips in the LDtk maps).
2. Run `cd ../pipeline-v2 && .venv/bin/python proto_export.py`. This refreshes the word data and
   `story-lint.txt`, and fails if a rune puzzle has no derivation link backed by 2+ sources.
3. Run `npm run build`. Ink errors fail the build.
4. Run the play-through (below), then review in the browser.

## Automated play-through

`scripts/playthrough.mjs` plays the whole slice in headless Chromium at a phone size. It taps tiles, clicks
through dialogue and tries one wrong rune per puzzle. It saves screenshots and fails on any console error.
It needs Playwright, which is not a project dependency:

```bash
npm run build && npx vite preview --port 4173 &
node scripts/playthrough.mjs http://localhost:4173/ shots/
```

## Known limits

- Placeholder art, generic town (real Kassel comes in the art stage). No sound except word audio.
- Word audio comes from Wikimedia Commons (`.ogg`). Safari on iOS cannot play it, so it needs converting before release.
- The frequency bug in the word data (`pipeline-v2`, case-folded ranks) still affects level estimates.
- One save slot in localStorage.
