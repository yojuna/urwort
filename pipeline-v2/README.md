# pipeline-v2: word families from open sources (experiment, 2026-10-03)

Rebuilds urwort's data model as a layered graph with typed, sourced links. Present-day (synchronic)
word families form the surface world, and history (diachronic) is a separate layer underneath,
following the distinction in Augst (2009, *Wortfamilienwörterbuch*) and Splett (2009).

```bash
./download.sh                     # ~6 GB into ../raw-data/v2 (gitignored); sources and licenses in sources.yaml
uv venv .venv && uv pip install --python .venv/bin/python wordfreq pyarrow
.venv/bin/python ingest.py        # ~1 min  -> out/lex.db   (Wiktionary en+de, DErivBase, MorphyNet)
.venv/bin/python build.py         # ~10 s   -> out/graph.db (lexemes, typed edges, families, history)
.venv/bin/python case_counts.py   # ~2 min  -> out/case_counts.tsv, out/function_words.txt (for freq.py)
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

## Case-aware frequency (2026-11-21)

wordfreq and the subtitle list are case-folded, so *Die* (a semiconductor die) took the article's rank 1, *DAS* rank 3,
*Ich* (the ego) the pronoun's, and capitalised sentence starts (*Haben*, *Können*) ranked as nouns. `freq.py` splits a
folded frequency between spellings, and every script that ranks words uses it (export, enrich, analyze, review_export,
and the dialogue lemmatiser in tales_coverage/proto_export):

- **Function-word twins get nothing.** A capitalised or all-caps lemma whose lowercase twin is an article, pronoun,
  preposition, conjunction, numeral, particle or contraction (German Wiktionary), written lowercase mid-sentence most of
  the time: *Die, Ich, Des, Sie, Für, Zwei*. (38 lemmas; *Acht* and *Elf* go too, as numeral twins.)
- **Everything else gets its share** of mid-sentence (not sentence-initial) occurrences in a case-sensitive sample of
  The German Commons: Wikipedia, Wikibooks, Wikivoyage, Wikinews, Bundestag minutes, political speeches, and narrative
  prose from Wikisource and DiBiLit (25M model tokens each; CC BY-SA / CC BY / CC0; counts only, no text shipped).
  *Macht* 25% / *macht* 75%, *Leben* 71% / *leben* 29%. The narrative sources matter: without them *weinen* lost to
  *Weinen* (dative plural of *Wein*, from Wikivoyage) and fell out of the top 5,000. All-caps spellings count only
  when they are the main spelling (*EU* yes, *SO* no).
- **Level evidence**: subtitle tokens are split between spellings by share; in learner texts (MERLIN, Klexikon) a
  capitalised token that is rare mid-sentence (*Ist* 0.1%) is read as a sentence start, and *haus* → *Haus* only
  for words mostly written capitalised.

Result: 698 of the 5,000 in-scope words changed (out: *Die, DAS, Ich, MIT, Für, Haben, Können*…; in: *Suppe, Kiste,
Blitz, Magie, Reichtum*…); all-caps words in scope 73 → 38; words with no level 405 → 6; *Ring* C2 → A2, *Zettel* C2 → B1,
*Laden* B2 → A2. Agreement with the Goethe lists 32% → 32.6% exact, 76% → 77.5% within one level. validate.py has 2 new
hard checks and 6 regressions for this.

## Enrichment, levels and checks (2026-10-03, second round)

```bash
.venv/bin/python goethe_check.py   # CHECK ONLY: Goethe A1/A2/B1 headwords -> out/goethe-levels.json (never shipped)
.venv/bin/python enrich.py         # IE-CoR, UniMorph forms, level evidence + model -> graph.db tables iecor/forms/level
.venv/bin/python export.py --n 5000 --game
.venv/bin/python validate.py       # 43 checks (structure, provenance/licensing, project rules, regressions); non-zero exit on failure
```

- **Proto-Indo-European**: claims from English Wiktionary, German Wiktionary and IE-CoR are compared by consonant
  skeleton (vowels/ablaut, laryngeals, i/y, u/w, s-mobile normalised). The root is shown only when 2+ independent sources agree
  and IE-CoR's experts don't mark it doubtful. Result: 88 verified (was 50), 7 doubted, 8 genuine conflicts
  (*Nacht*, *sterben*, *fallen*…), 458 single-source (kept, hidden).
- **Forms** (UniMorph): gender, plural, genitive; 3sg present/past and participle; comparative/superlative.
- **Levels**: rule `dib else min(subs2, merlin) +family`, chosen among 13 variants by agreement with the Goethe lists
  (check only): 32% exact, 76% within one level. Inputs are commercial-safe: Deutsch im Blick chapter (1–5 A1, 6–10 A2),
  subtitle frequency per lemma on a doubling scale (1k/2k/4k/8k/16k), first level used in ≥2 MERLIN texts, and a family cap
  (a word is at most one level above its parts; Bauer & Nation 1993). Shown as an *estimated* level, not official CEFR.

## Viewer (graph explorer and review tool)

```bash
.venv/bin/python review_export.py    # full graph -> out/review (wipes the folder)
.venv/bin/python explore_export.py   # game slice + map layout -> out/review/explore.json (run after review_export)
```

Deployed at https://yojuna.github.io/urwort/graph/ from the `pages-deploy` branch: `viewer/{index.html,app.js,explore.js,viewer.css}`
plus `out/review` copied to `game/public/graph/data`. Explore (map, charts, words, affixes) shows the game data; Overview,
Queues and Review cover the whole graph. The Guide tab explains every screen.
