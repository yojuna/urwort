# Coverage spike: our word data in the Grimm tales (2026-10-31)

Corpus: Wikisource per-tale texts, KHM first edition (1812 vol. 1 + 1815 vol. 2) and 1857, 356 tales
(`raw-data/grimm/wikisource/khm/`). Script: `pipeline-v2/tales_coverage.py` (lookup lemmatiser:
UniMorph forms → our lexicon, 1812 spellings rewritten only when unknown). Outputs in
`pipeline-v2/out/tales/` (coverage.json with up to 3 quotations per word, richness.json).

## Results

| | |
|---|---|
| in-scope words (top 5,000 slice) that occur in the tales | **2,161 of 5,115 (42%)** |
| multi-word families with at least one member in the tales | **561 of 762 (74%)** |
| words with a real quotation for a word slip | 2,161 |
| in-scope share of recognised content tokens, typical tale | 58–68% |

## What it means for the design

1. **The tales cover the families well, but rarely show a family's derived words together.**
   Even the richest first-edition tales have only 2–3 families with three or more members in the
   text (*halten: behalten, erhalten*; *sprechen: versprechen*; *leben: lebendig*). The tale gives
   the root, and the affix-rune puzzles must generate the derived words from the data, not from the
   tale. Separable verbs ("stand … auf") are undercounted by the lookup, so the true count is a bit higher.
2. **Quotations are plentiful**: 2,161 words get real 1812/1857 sentences for word slips.
3. **The Low German tales** (*Von den Fischer un siine Fru*, *Van den Machandel Boom*) barely match
   (72 and 91 families): our lexicon is standard German. The sound-shift lens needs a Low German
   word list or hand-made pairs for those tales.
4. **The frequency bug shows up here too**: function words (*da, aber, in*) count as "content",
   because of the case-folded ranks. Fix before using these numbers for levels.

## Well-known first-edition tales

| KHM | tale (1812/15 title) | tokens | families | verified PIE families | notes |
|---|---|---|---|---|---|
| 55 | Rumpelstilzchen | 511 | 101 | 14 | short; power of a name; spinning, mills |
| 15 | Hänsel und Gretel | 1,961 | 237 | 31 | own mother in 1812; famine, forest |
| 21 | Aschenputtel | 2,771 | 307 | 33 | Marburg storyteller hook (Schellenberg) |
| 26 | Rothkäppchen | 1,140 | 199 | 28 | |
| 12 | Rapunzel | 891 | 182 | 18 | edition changes well documented |
| 53 | Sneewittchen | 2,444 | 269 | 35 | own mother in 1812 |
| 19 | Von den Fischer un siine Fru | 1,924 | 72 | 6 | Low German (Runge) |

## Recommendation for the vertical slice

**Rumpelstilzchen (1812).** It is short (511 words), so a full tale world is achievable. Its theme is
the game's premise: knowing the true name gives power over it, and spinning straw into gold is a
transformation, which is what affix runes do. It carries mills, spinning and the miller's daughter's
social position as culture. Runner-up: **Hänsel und Gretel (1812)**, for famine and forest history and
the edition change (mother → stepmother in 1840) as a frame commission.
