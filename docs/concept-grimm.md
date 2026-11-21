# urwort: concept (Grimm frame)

Status: draft, 2026-10-31. Replaces the island/3D direction in `game_design.md` as the
game concept. The anti-patterns in `game_design.md` Part I (no streaks, hearts, leaderboards,
notifications or locked ladders) still apply. Historical claims marked *(check)* wait on
`research/grimm/`.

## One line

You are a young assistant to the Brothers Grimm in Hesse around 1810. You travel to storytellers,
collect their tales and words, and step inside the tales, where words are magic. You learn German
by working out what words mean from their roots, not from lessons.

## Goals

1. **A playable game first.** It should be fun as a story game for someone who already likes German.
   The learning happens because the game is about language, not because of drills.
2. **Hidden but logical learning.** Every mechanic needs understanding (of meaning, form or root),
   so it can't be solved by pattern matching. The main skill trained is **inferring an unknown word
   from a known root and affix**. This is the edge over vocabulary-list games (Wagotabi, Newcomer).
3. **Use the data we have.** Families, derivation links, history chains, related words in other
   languages, borrowed words, compounds, Proto-Indo-European roots, forms, levels, audio.
4. **German history and culture, implicitly**, through the frame story and the tales.

Audience: learners with some German (about A2 and up) and etymology fans. Mobile first, 2.5D as a 3/4 top-down pixel-art world.

## Two layers

### 1. The frame: Hesse, c. 1807–1815 (grounded)

- **Setting:** Kassel under French rule (Kingdom of Westphalia, 1807–1813), the end of the Holy Roman
  Empire, the wars of 1813, Romanticism. French at court and in the administration gives a
  reason, inside the story, for French loanwords.
- **The player:** a fictional assistant (name and background chosen by the player, within the
  period). Not one of the Grimms: real people stay real, and we avoid putting words in their
  mouths for the main role.
- **NPCs:** Jacob and Wilhelm as mentors who hand out "commissions"; the storytellers
  (Dorothea Viehmann, the Hassenpflugs, the Wilds, the Haxthausens, Runge's Low German tales)
  *(check biographies)*; townspeople, soldiers, officials, travellers.
- **Play here** is calm and social: travel the region map, listen, ask, write down,
  send results to Kassel. It is the hub between tale worlds.
- **Arc candidates** *(check)*: the first edition of 1812; the lost 1810 manuscript sent to Brentano;
  the end of French rule in 1813; later, Jacob's work on sound laws (Deutsche Grammatik) and,
  as an epilogue, the great dictionary.

### 2. The tale worlds (magic)

- When you have collected enough of a tale (from one or more tellers), you can **enter it**.
  Each tale world is a level: the forest of *Hänsel und Gretel*, Rapunzel's tower, the
  fisherman's sea.
- Tale worlds follow the **1812/1815 first edition**: darker, stranger, closer to the tellers.
  Later editions are a mechanic (see *Editions*).
- The tale's text is the script: narration and key lines come from the real public-domain
  text (in simplified retellings at first, see *Reading level*).

## Mechanics, mapped to data

| Mechanic | Where | What the player does | Data |
|---|---|---|---|
| **Affix runes** (word magic) | tale worlds | Find runes (*ver-, be-, ent-, un-, -ung, -bar, -lich…*) and learn what they do by using them on words: *-bar* makes a door "openable", *ent-* undoes a binding, *-ung* turns an action into a thing you can carry. Puzzles are solved by transforming words. Never explained as grammar. | derivation edges with affix + rule (DErivBase, Wiktionary), word segments, affix inventory |
| **Root inference** | everywhere | NPCs and texts use words you know plus one new word whose meaning follows from a root you know (*halten* → *Verhältnis*). Your guess goes into the notebook and is confirmed when it holds up in later uses. | families, links, per-link sources (only 2-source links used for inference puzzles), levels |
| **Word slips** (notebook) | frame + tales | Every word met becomes a quotation slip in your slip box, with the sentence it came from, like the Grimms' dictionary slips. Slips sort themselves into families. It works as collection, glossary and hidden spaced review. | families, words, quotations from tale texts |
| **Sound-shift lenses** | frame + ruins | Discover sound laws as rules: High German consonant shift (*Water/Wasser, maken/machen, Tid/Zeit*), then the Germanic shift (*pater/Vater/father*). Historically Rask published it first (1818) and Jacob systematised it in 1822, after the frame years, so in-game it is Jacob's work in progress, not a finished law. Each lens lets you read a new kind of text: the Low German teller, the English sailor, the Old High German inscription. | history chains (MHG, OHG, Proto-West-Germanic, Proto-Germanic), related words (en, nl, sv, da) |
| **Ruins and inscriptions** | tale worlds, deep layers | Decode older German (Middle and Old High German) with roots you know and the lenses you hold. The deeper the ruin, the older the language. | history chains with per-stage sources |
| **Travellers** | frame | Traders and soldiers from neighbouring lands speak related languages; you understand them through shared roots. Also the gentle on-ramp for English speakers, never required. | related words per family |
| **Loan quarters** | frame | Latin (church, school, law), French (court, army, fashion), and later English show up where they did historically. | 848 families with a loan origin and source language |
| **Bridges** | region map | Compounds open roads: collecting *Handschuh* links the places of *Hand* and *Schuh*. | 317 compound bridges (head, modifiers, confidence) |
| **Editions** | frame | Compare a tale across 1812 and 1857 and see how Wilhelm reworked it (stepmothers, removed scenes) *(check examples)*. Some commissions ask which version is "true" to the teller. | tale texts per edition, aligned |
| **The Urworte** | end game | The oldest roots, collected across the whole game: the deepest secret of the tale worlds. | 88 Proto-Indo-European roots confirmed by 2+ sources (single-source ones never shown) |
| **Voices** | everywhere | NPC lines and words are spoken where audio exists. | Commons/Lingua Libre audio, IPA |
| **Forms** | later | Inflection in dialogue and inscriptions (cases, plurals, past forms). | UniMorph forms |

## Learning design

- **Small doses:** about 4–6 new words per scene, each used right away (Wagotabi does this well).
- **Just above your level:** NPC speech is built from known words plus one inferable new one. The game
  tracks the known set per player, so every line can be checked against it.
- **No drill screen.** Review means villagers and tales re-using your words, gates you open by
  understanding, and slips that fade until you meet the word again. Nothing is lost if you stop.
- **Reading level:** 1812 German is about B1+ (old spellings like *Thür*, *seyn*, *giebt*). Early on,
  the teller tells a simplified retelling; the original text is a later reward ("read it as written").
  Old spellings become a small history mechanic of their own.
- **English is optional:** related English words help but are never needed. Glosses can be switched off.

## Story and culture

Each tale carries the history around it: famine and the forest, mills and spinning, journeymen and
guilds, the Low German coast, Hameln 1284 (*Deutsche Sagen*) *(check, see research/grimm/history-and-culture.md)*.
Longer threads: French rule and liberation, Romanticism, dialects and standard German.
The later reception (19th-century nationalism, Nazi appropriation, Disney) can be an epilogue or meta
layer for adults, never a lecture.

Sensitivities: some tales and legends contain antisemitic content; real people must be portrayed
accurately (including the myth that the tales came from "simple peasants"); the first editions are
violent. Decide content rules before writing.

## Vertical slice (proof of fun)

- **Frame:** Kassel and one storyteller's house; one commission.
- **Tale:** *Rumpelstilzchen* (1812): short, and its theme (a true name gives power; straw spun into gold) is the game's
  premise. Runner-up: *Hänsel und Gretel* (1812). See `research/grimm/coverage.md`.
- **Mechanics:** affix runes (3–4 affixes), root inference, word slips, one sound-shift lens,
  one small ruin with an older inscription, one traveller.
- **Size:** 60–100 words from 3 strong families. Placeholder pixel art, 3/4 top-down.
- **Test:** is it fun for 15 minutes, and can a player infer new words afterwards?

## Production

- **Stack (decided 2026-11-21):** Phaser 4 + LDtk (maps) + inkjs (dialogue) + an HTML overlay for all text UI,
  TypeScript/Vite PWA. The view is 3/4 top-down (Stardew/Eastward-style depth sorting), not isometric
  (LDtk has no isometric mode) and not HD-2D (that needs a 3D engine). Why: the game is text-heavy, and HTML gives
  crisp German text and accessibility; small bundle for mobile; ink runs natively; headless play-testing works.
  The world renderer stays one module (`client/src/world.ts`), so it could be swapped later without touching
  story, data or UI. Godot was considered and rejected (heavy web export, canvas-only text, weak ink support on web).
  Data from `data/urwort-v4.json` plus a new tale corpus.
- **Dialogue is the bottleneck.** Tale texts give narration; frame dialogue must be written.
  Proposal: AI-drafted lines limited to the player's known words at that point, then human-reviewed.
- **New data work:**
  1. Fix the frequency bug (case-folded ranks) before levels or word choice mean anything.
  2. Tale corpus: 1812/1815 and 1857 texts per tale, linked to our lemmas (coverage, quotations).
  3. Segments for every word in the playable families (now 1,188 words).
  4. Example sentences (Tatoeba, CC BY) and cleaner German definitions.
- **Licences:** tale texts are public domain; Wikisource transcriptions are fine to ship (CC BY-SA). DTA's 1812 edition
  is CC BY-NC, so check-only; its 1857 edition is public domain. Same ship/check rule as `pipeline-v2/RESOURCES.md`.

## Open questions

1. Content rules for violence and antisemitic material in the first editions.
2. ~~How dialogue gets written~~: AI-drafted, reviewed by the user (decided 2026-10-31).
3. ~~Slice tale~~: Rumpelstilzchen 1812, as one slice of many (decided 2026-10-31).
4. Art direction: 3/4 top-down pixel art; Ludwig Richter and Biedermeier palettes as inspiration, made later with our own tools. CC0/generic placeholders until then.
