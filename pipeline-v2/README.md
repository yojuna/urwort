# pipeline-v2: word families from open sources (experiment, 2026-10-03)

Rebuilds urwort's data model as a layered graph with typed, sourced links. Present-day (synchronic)
word families form the surface world, and history (diachronic) is a separate layer underneath,
following the distinction in Augst (2009, *Wortfamilienwörterbuch*) and Splett (2009).

```bash
./download.sh                     # ~4.5 GB into ../raw-data/v2 (gitignored); sources and licenses in sources.yaml
uv venv .venv && uv pip install --python .venv/bin/python wordfreq
.venv/bin/python ingest.py        # ~1 min  -> out/lex.db   (Wiktionary en+de, DErivBase, MorphyNet)
.venv/bin/python build.py         # ~10 s   -> out/graph.db (lexemes, typed edges, families, history)
.venv/bin/python analyze.py       # report  -> out/report.json, out/samples.tsv (review sample)
```

## Method

- **Lexicon**: 185k content lemmas (nouns, verbs, adjectives, adverbs) from German and English Wiktionary.
- **Links** (base → derived), each with its sources:
  | source | what | license |
  |---|---|---|
  | DErivBase 2.0 | 267 grammar-based derivation rules, shortest rule path per pair | CC BY-SA 3.0 |
  | German Wiktionary *Herkunft* | the linked words in "strukturell:" / first line: Ableitung, Kompositum, Partikel als Verbzusatz | CC BY-SA |
  | English Wiktionary | `af`/`prefix`/`suffix`/`compound`/`confix` templates; `inh`/`der`/`dercat`/`cog` for history | CC BY-SA |
  | MorphyNet | base/derived/affix triples | CC BY-SA 3.0 |
- **Families** = connected components over derivation links only. Compounds and causative pairs
  (*legen/liegen*, DErivBase `dVV11/12`) are **bridges** between families, not members.
  - Links with 2+ sources merge freely. A single-source link may attach a word, but can never merge two
    existing families, because one wrong link fuses whole families (*Anfuhr → anführen* fused *fahren* and *führen*).
  - MorphyNet alone never links (noisy: *fahren → durchführen*, *ein → einjährig*).
  - Particles (*an, auf, aus, fest-…*) are affixes on verbs and never a family base.
- **History**: Wiktionary chains (Middle/Old High German, Proto-West-Germanic, Proto-Germanic,
  Proto-Indo-European), category-level claims (`dercat`), and cognates. Proto-Indo-European counts as
  rigorous only when both Wiktionary editions give it.

## Results

| | old game data | v2, same 1,351 words | v2, top 5,000 lemmas (wordfreq) |
|---|---|---|---|
| words in a multi-word family | 27% | **81%** | **74%** |
| families | 1,138 | 816 | 2,237 |
| median family size (whole lexicon) | n/a | 7 | 5 |
| families with a Germanic chain (any depth) | n/a | 68% | 48% |
| … to Proto-Germanic explicitly | n/a | 43% | 29% |
| … with an English cognate | n/a | 41% | 27% |
| borrowed (Latin, French, English…) | n/a | 23% | 30% |
| Proto-Indo-European: English Wiktionary / both editions | n/a | 17% / 2% | 10% / 1% |

Families are built over the whole lexicon, so they grow as the player's level rises. At top-5000,
1,580 families still show a single word *within* the scope while having more members beyond it.

**Precision**: hand-review of a random sample (`out/samples.tsv`, seed 42, judged 2026-10-03):

| links | correct |
|---|---|
| derivation, 1 source (60) | 57 (95%): *Berg→bergen*, *Benz→Benzin*, *Link→Linker* wrong |
| derivation, 2+ sources (60) | 60 (100%) |
| compound head, after the template fix (40) | 34 (85%); all 13 two-source compounds correct |

The old clusters disagreed with v2 on 105 word pairs. These are mostly the expected cases: *gewinnen/wohnen/Wunsch*
(now three surface families sharing Proto-Indo-European *\*wenh₁-*), *Schalter/Schauspieler/schade*
(a letter match), *überall/übernehmen* (a shared prefix), and function words.

## Known gaps / next steps

1. **History depth**: English Wiktionary often stops at Proto-West-Germanic in the word's entry; the
   rest of the chain is on the *Reconstruction:* pages (Proto-West-Germanic, Proto-Germanic,
   Proto-Indo-European). Ingest those to follow chains and get cognates per proto-form.
2. **Proto-Indo-European rigor**: only 1% has two-source agreement. We need a further citable source for
   checking only (the user decided non-commercial sources are check-only): e.g. Kroonen 2013 / LIV citations on the
   Wiktionary reconstruction pages, or Pfeifer via links.
3. **Single-source German Wiktionary compounds** mistake a definition for an origin (*Samt* ← *Seidengewebe*).
   Restrict them to the "strukturell:" text or require a second source.
4. **Transparency** per link (how obvious the meaning connection is: *stehen → verstehen* is low):
   DErivBase v2 probabilities plus embeddings.
5. **Levels**: commercial-safe CEFR estimate (frequency + family + affix difficulty) calibrated against
   DAFlex (BY-NC-SA, check only).

## Game data (export.py)

```bash
.venv/bin/python export.py --n 5000 --game   # -> out/urwort-v4.json (copied to data/) + game/public/ontology.json
```

- **v4** (`data/urwort-v4.json`): canonical data for the redesign. It holds families (root, members, history
  chain with per-stage sources, PIE with status, loan origin, cognates), words (rank, base, segments, IPA, audio,
  glosses), and bridges (compounds with head/modifiers and confidence; causative pairs).
- **v3** (`game/public/ontology.json`): the same data in the current client's format, so the existing game runs on it.
  It deliberately leaves out CEFR, because the old levels had no traceable source. A commercial-safe level estimate is still to do.
- **History rules**: chains follow the word's entry, then the Proto-West-Germanic and Proto-Germanic reconstruction pages.
  Medieval stages are confirmed against German Wiktionary when possible. PIE is shown only with both editions
  (50 families); 472 single-source PIE candidates are kept in v4 but hidden. Loans proposed from proto-languages are
  hypotheses and are rejected. Stages Wiktionary marks `unc` carry `origin_uncertain`.

Export of 2026-10-03 (top 5,000): 5,116 words, 3,547 families (747 with 2+ words at this level),
317 bridges, 1,188 words with segments. 945 families have a Germanic chain and 854 a loan origin.
Verified: `npm run build` passes, and the page loads 5,116 words with no console errors in headless Chromium.
