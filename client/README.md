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
| `src/maps.ts` | Placeholder maps as character grids, plus NPCs, objects, exits and scripted scene starts. |
| `src/world.ts` | The explorable world (Phaser 3): tap-to-move with pathfinding, arrow keys/WASD, interaction, scene changes, tale tint. |
| `src/story.ts` | Runs ink knots through the dialogue box and turns tags into actions (slips, runes, items, puzzles, scenes). |
| `src/ui/` | HTML overlay: dialogue with tappable words, slip box, word cards, rune bench, title cards. |
| `src/art.ts` | Placeholder pixel art drawn in code (no asset files, no licences to track). Replaced in the art stage. |
| `public/data/slice.json` | Word data for every word in the dialogue and maps. Made by `pipeline-v2/proto_export.py`. |
| `story-lint.txt` | Made by the same script: unknown tokens and words above A2, for the dialogue review. |

## Dialogue workflow

1. Edit `src/story/main.ink`.
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
