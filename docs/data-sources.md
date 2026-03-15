# urwort — Data Sources Reference

> Complete inventory of all data sources, their available fields, licensing,
> and what we extract vs. what remains untapped.
>
> This document is the single reference for schema design decisions.

---

## Table of Contents

1. [Source Overview](#1-source-overview)
2. [Source 1: FreeDict](#2-source-1-freedict)
3. [Source 2: Kaikki.org (Wiktionary)](#3-source-2-kaikkiorg-wiktionary)
4. [Source 3: DWDS](#4-source-3-dwds)
5. [Source 4: OpenThesaurus](#5-source-4-openthesaurus)
6. [Source 5: UniMorph](#6-source-5-unimorph)
7. [Source 6: IPA-dict](#7-source-6-ipa-dict)
8. [Source 7: Leipzig Corpora Collection](#8-source-7-leipzig-corpora-collection)
9. [Source 8: CEFR Word Lists](#9-source-8-cefr-word-lists)
10. [Source 9: Wikidata Lexemes](#10-source-9-wikidata-lexemes)
11. [Complete Field Inventory Matrix](#11-complete-field-inventory-matrix)
12. [Source Priority & Merge Strategy](#12-source-priority--merge-strategy)
13. [Licensing Summary](#13-licensing-summary)

---

## 1. Source Overview

| Source | Type | Coverage | License | Integration |
|--------|------|----------|---------|-------------|
| FreeDict | Bulk (local) | ~44k DE headwords | GPL v2+ | Build-time |
| Kaikki.org | Bulk + API | ~500k+ DE entries | CC BY-SA 3.0 | Build-time (bulk) + Runtime (API) |
| DWDS | API only | ~300k lemmas | Free non-commercial | Runtime |
| OpenThesaurus | Bulk + API | ~150k+ synsets | LGPL | Build-time (bulk) + Runtime (API) |
| UniMorph | Bulk (local) | ~4M inflection rows | CC BY-SA | Build-time |
| IPA-dict | Bulk (local) | ~130k IPA entries | MIT | Build-time |
| Leipzig Corpora | Bulk (local) | Millions of sentences | CC BY-NC | Build-time |
| CEFR Word Lists | Bulk (local) | ~5k-15k tagged words | Various/Open | Build-time |
| Wikidata Lexemes | API / Bulk | Growing coverage | CC0 | Runtime (future) |

---

## 2. Source 1: FreeDict

### Overview

- **Full name**: FreeDict German-English / English-German Dictionary
- **Origin**: Ding dictionary (TU Chemnitz), converted via ding2tei-haskell
- **Format**: StarDict compiled binary (`.idx.gz` + `.dict.dz`)
- **License**: GPL v2+ / AGPL v3+ (see `raw-data/freedict/deu-eng/COPYING`)
- **Word count**: 517,534 index entries → ~44k unique headwords after dedup
- **Local path**: `raw-data/freedict/deu-eng/`, `raw-data/freedict/eng-deu/`
- **Website**: https://freedict.org/ / https://dict.tu-chemnitz.de/

### Raw Data Format

Each entry is an HTML fragment stored in StarDict binary format:

```html
<font color="green">male, noun</font>
<span lang="en">house</span>
<span lang="en">home</span>
<div class="example">
  <span lang="de">Das Haus ist groß.</span>
  <span lang="en">The house is big.</span>
</div>
```

### Fields Available

| Field | Status | How Extracted | Notes |
|-------|--------|--------------|-------|
| Headword | ✅ Extracted | StarDict index key | Case-sensitive |
| POS | ✅ Extracted (rough) | Regex on `<font color="green">` text | Maps "noun", "verb", "adjective", etc. |
| Gender | ✅ Extracted (rough) | Regex for "masculine"/"feminine"/"neuter" in POS string | Only for nouns |
| Translations (EN) | ✅ Extracted | `<span lang="en">` content | Up to 6 per entry |
| Bilingual examples | ✅ Extracted | `<div class="example">` with lang-tagged spans | Up to 3 per entry |
| Sense count | ✅ Extracted | Counted during merge | Flat count only |
| Usage labels | ⚠️ Available, not extracted | Embedded in text: `[coll.]`, `[formal]`, `[tech.]` | Could regex-parse |
| Subject domain | ⚠️ Available, not extracted | Tags: `[med.]`, `[jur.]`, `[comp.]` in translation strings | Could regex-parse |
| Regional variants | ⚠️ Available, not extracted | Tags: `[Ös.]` (Austrian), `[Schw.]` (Swiss) | In translation text |
| Distinct numbered senses | ❌ Lost | Ding format uses `\|` separators — merged flat by build script | |
| Compound markers | ❌ Lost | Present in Ding source, absent from StarDict | |

### Current Build Output

`tools/build-dict.py` produces:

- **Index row** (Layer 1): `{w, pos, gender, hint}` — ~60 bytes/entry
- **Data row** (Layer 2): `{w, pos, gender, l1: {en, ex}, sources: {freedict: {senses}}}` — ~200-500 bytes/entry

### Strengths & Weaknesses

- **Strength**: Broadest DE↔EN headword coverage among open sources
- **Strength**: Bidirectional (both de→en and en→de)
- **Weakness**: Shallow — no morphology, no etymology, no pronunciation, no structured senses
- **Weakness**: Essentially a bilingual glossary, not a dictionary

---

## 3. Source 2: Kaikki.org (Wiktionary)

### Overview

- **Full name**: Kaikki.org Wiktionary Extraction (via wiktextract)
- **Origin**: English Wiktionary, machine-extracted by Tatu Ylonen's wiktextract tool
- **Format**: JSONL (one JSON object per line, one line per word+POS combo)
- **License**: CC BY-SA 3.0 (Wiktionary license)
- **Coverage**: ~500k+ German entries total (~200k lemmas + ~300k inflected forms)
- **Bulk downloads**: https://kaikki.org/dictionary/German/
- **Per-word API**: `https://kaikki.org/dictionary/German/meaning/{first}/{first2}/{word}.jsonl`
- **Local sample**: `raw-data/kaikki.org-dictionary-German-by-pos-noun.jsonl` (>200MB, nouns only)
- **GitHub**: https://github.com/tatuylonen/wiktextract

### Available Bulk Files

Kaikki provides per-POS dumps and a combined dump for German:

```
kaikki.org-dictionary-German.jsonl            # All entries combined
kaikki.org-dictionary-German-by-pos-noun.jsonl
kaikki.org-dictionary-German-by-pos-verb.jsonl
kaikki.org-dictionary-German-by-pos-adj.jsonl
kaikki.org-dictionary-German-by-pos-adv.jsonl
kaikki.org-dictionary-German-by-pos-prep.jsonl
kaikki.org-dictionary-German-by-pos-conj.jsonl
kaikki.org-dictionary-German-by-pos-pron.jsonl
kaikki.org-dictionary-German-by-pos-det.jsonl
kaikki.org-dictionary-German-by-pos-num.jsonl
kaikki.org-dictionary-German-by-pos-intj.jsonl
kaikki.org-dictionary-German-by-pos-particle.jsonl
kaikki.org-dictionary-German-by-pos-affix.jsonl
kaikki.org-dictionary-German-by-pos-phrase.jsonl
```

### Complete JSON Schema

This is the **full field specification** from wiktextract. Our current `api/kaikki.py`
extracts only ~30% of available fields.

#### Top-Level Fields

| Field | Type | Description | Currently Extracted |
|-------|------|-------------|-------------------|
| `word` | string | Headword | ✅ Yes |
| `pos` | string | Part of speech: "noun", "verb", "adj", "adv", "prep", "conj", "pron", "det", "num", "intj", "particle", "affix", "phrase" | ✅ Yes |
| `lang` | string | Language name: "German" | ❌ No (implicit) |
| `lang_code` | string | Language code: "de" | ❌ No (implicit) |
| `etymology_text` | string | Free-text etymology | ✅ Yes |
| `etymology_number` | int | Disambiguates words with multiple etymologies (1, 2, …) | ✅ Yes |
| `etymology_templates` | array | Structured etymology chain (see below) | ❌ No |
| `head_templates` | array | **Critical**: structured headword info with gender, genitive, plural, auxiliary | ❌ No |
| `senses` | array | Array of sense objects (see below) | ✅ Partial |
| `forms` | array | Inflection table entries (see below) | ✅ Partial |
| `sounds` | array | Pronunciation data (see below) | ✅ Partial |
| `categories` | array | Wiktionary categories: `["German nouns", "German neuter nouns"]` | ❌ No |
| `hyphenation` | string | Syllable division: `"Häu‧ser"` | ❌ No |
| `wikipedia` | array | Wikipedia article links | ❌ No |
| `wikidata` | array | Wikidata Q-IDs for semantic linking | ❌ No |
| `translations` | array | Translations to other languages (from English Wiktionary) | ❌ No |
| `descendants` | array | Words in other languages derived from this word | ❌ No |
| `proverbs` | array | Proverbs containing this word | ❌ No |
| `inflection` | array | Alternative inflection format (some entries) | ❌ No |
| `instances` | array | For proper nouns: instances of | ❌ No |
| `literal_meaning` | string | Literal translation of compound words | ❌ No |

#### `head_templates[]` — Structured Headword Info

This is one of the most valuable un-extracted fields. It contains structured
grammatical information parsed from the Wiktionary headword line.

**Noun example:**
```json
{
  "name": "de-noun",
  "args": {"1": "n", "gen": "Hauses", "pl": "Häuser"},
  "expansion": "Haus n (genitive Hauses, plural Häuser)"
}
```

**Verb example:**
```json
{
  "name": "de-verb",
  "args": {"class": "7", "aux": "sein"},
  "expansion": "laufen (class 7 strong, auxiliary sein)"
}
```

**Adjective example:**
```json
{
  "name": "de-adj",
  "args": {"comp": "schöner", "sup": "schönsten"},
  "expansion": "schön (comparative schöner, superlative am schönsten)"
}
```

**Extractable fields**: gender, genitive singular, plural, verb class (strong/weak),
auxiliary (sein/haben), comparative, superlative.

#### `etymology_templates[]` — Structured Etymology

```json
[
  {"name": "inh", "args": {"1": "de", "2": "gmh", "3": "hūs"}, "expansion": "Middle High German hūs"},
  {"name": "inh", "args": {"1": "de", "2": "goh", "3": "hūs"}, "expansion": "Old High German hūs"},
  {"name": "inh", "args": {"1": "de", "2": "gem-pro", "3": "*hūsą"}, "expansion": "Proto-Germanic *hūsą"}
]
```

Template names: `inh` (inherited), `bor` (borrowed), `der` (derived),
`cog` (cognate), `m` (mention), `compound` (compound word).

#### `senses[]` — Sense Objects

| Field | Type | Description | Currently Extracted |
|-------|------|-------------|-------------------|
| `glosses` | string[] | English definitions/translations | ✅ Yes |
| `raw_glosses` | string[] | Unprocessed gloss text | ✅ Yes |
| `tags` | string[] | Grammatical/semantic tags | ✅ Yes |
| `links` | array | Cross-reference links | ✅ Yes |
| `form_of` | array | **Critical**: links inflected form to lemma: `[{word: "anlaufen"}]` | ❌ No |
| `synonyms` | array | `[{word: "Gebäude"}, {word: "Heim"}]` | ✅ Yes |
| `antonyms` | array | `[{word: "draußen"}]` | ❌ No |
| `related` | array | Related terms | ❌ No |
| `derived` | array | Derived terms (compounds, etc.) | ❌ No |
| `coordinate_terms` | array | Coordinate terms | ❌ No |
| `hypernyms` | array | Broader terms | ❌ No |
| `hyponyms` | array | Narrower terms | ❌ No |
| `holonyms` | array | "Part of" relations | ❌ No |
| `meronyms` | array | "Has part" relations | ❌ No |
| `troponyms` | array | More specific verb relations | ❌ No |
| `examples` | array | `[{text: "Das Haus ist groß.", english: "The house is big."}]` | ❌ No |
| `categories` | string[] | Wiktionary categories | ❌ No |
| `topics` | string[] | Semantic domains: `["architecture", "housing"]` | ❌ No |
| `alt_of` | array | Alternative form links | ❌ No |
| `qualifiers` | string[] | Usage qualifiers (register, region) | ❌ No |

#### `forms[]` — Inflection Table

| Field | Type | Description | Currently Extracted |
|-------|------|-------------|-------------------|
| `form` | string | Inflected word form | ✅ Yes |
| `tags` | string[] | Grammatical tags (see tag list below) | ✅ Yes |
| `source` | string | Which wiktionary section this came from | ❌ No |

**Common tag values for German**:

- **Case**: `nominative`, `genitive`, `dative`, `accusative`
- **Number**: `singular`, `plural`
- **Gender**: `masculine`, `feminine`, `neuter`
- **Person**: `first-person`, `second-person`, `third-person`
- **Tense**: `present`, `past`, `future`
- **Mood**: `indicative`, `subjunctive-i`, `subjunctive-ii`, `imperative`
- **Voice**: `active`, `passive`
- **Aspect**: `participle`, `infinitive`
- **Register**: `formal`, `informal`, `archaic`, `colloquial`
- **Other**: `dependent`, `independent`, `strong`, `weak`, `mixed`, `comparative`, `superlative`

#### `sounds[]` — Pronunciation

| Field | Type | Description | Currently Extracted |
|-------|------|-------------|-------------------|
| `ipa` | string | IPA transcription: `"/haʊ̯s/"` | ✅ Yes |
| `audio` | string | Wikimedia filename: `"De-Haus.ogg"` | ❌ No |
| `ogg_url` | string | Full Wikimedia OGG URL | ✅ Yes |
| `mp3_url` | string | Full Wikimedia MP3 URL | ✅ Yes |
| `rhymes` | string | Rhyme class: `"-aʊ̯s"` | ❌ No |
| `homophones` | string[] | List of homophones | ❌ No |
| `enpr` | string | English pronunciation respelling | ❌ N/A |

### Inflected Form Entries

Many Kaikki entries are **not lemmas** but inflected forms. These are identified by:
- `senses[].form_of` — links to the lemma
- `senses[].tags` containing `"form-of"`

**Example** (`anlaufe.jsonl`):
```json
{
  "word": "anlaufe",
  "pos": "verb",
  "senses": [{
    "form_of": [{"word": "anlaufen"}],
    "glosses": ["inflection of anlaufen:", "first-person singular dependent present"],
    "tags": ["dependent", "first-person", "form-of", "present", "singular"]
  }]
}
```

These entries are essential for building the **form → lemma reverse index** that
enables searching for inflected forms (type "Häusern" → find "Haus").

### Strengths & Weaknesses

- **Strength**: By far the richest open German lexical dataset
- **Strength**: Complete inflection tables for most words
- **Strength**: Structured etymology with language inheritance chains
- **Strength**: Example sentences with English translations
- **Strength**: Semantic network (synonyms, antonyms, hypernyms, derived words)
- **Strength**: Pronunciation with audio
- **Weakness**: Community-maintained — occasional errors or gaps
- **Weakness**: Sense granularity varies (some entries have 1 sense, some have 20+)
- **Weakness**: Large bulk files (>200MB per POS) require significant processing

---

## 4. Source 3: DWDS

### Overview

- **Full name**: Digitales Wörterbuch der deutschen Sprache
- **Organization**: Berlin-Brandenburgische Akademie der Wissenschaften (BBAW)
- **Format**: JSON API
- **License**: Free for non-commercial use; check Terms of Service at https://www.dwds.de/d/api
- **Coverage**: ~300k lemmas — the most authoritative German-German dictionary
- **Base URL**: https://www.dwds.de/

### API Endpoints

#### 4.1 Snippet API (currently used)

- **URL**: `GET https://www.dwds.de/api/wb/snippet/?q={word}`
- **Returns**: Basic word info

```json
[{
  "input": "Haus",
  "lemma": "Haus",
  "wortart": "Substantiv, Neutrum",
  "url": "https://www.dwds.de/wb/Haus",
  "urlxml": "https://www.dwds.de/wb/Haus?format=xml",
  "superlemma": null,
  "homographcount": 0,
  "freq": 5,
  "wortart_parsed": "Substantiv",
  "genus": "Neutrum"
}]
```

| Field | Description | Currently Extracted |
|-------|-------------|-------------------|
| `lemma` | Canonical form | ✅ Yes |
| `wortart` | POS in German (e.g., "Substantiv, Neutrum") | ✅ Yes |
| `url` | DWDS page URL | ✅ Yes |
| `freq` | **Frequency class 1-7** (1 = most common) | ❌ No |
| `genus` | **Explicit gender**: "Maskulinum", "Femininum", "Neutrum" | ❌ No |
| `homographcount` | Number of homographs | ❌ No |
| `urlxml` | URL for XML format | ❌ No |
| `superlemma` | Parent lemma (for prefixed verbs etc.) | ❌ No |

#### 4.2 Full Dictionary Entry API (NOT currently used)

- **URL**: `GET https://www.dwds.de/api/wb/?q={word}`
- **Returns**: Complete dictionary article

Expected response structure:

| Field | Description | Value for urwort |
|-------|-------------|-----------------|
| `lemma` | Canonical form | Already have |
| `wortart` | POS | Already have |
| `aussprache` | Pronunciation / IPA | 🔥 High |
| `worttrennung` | Syllabification: "Haus, Plural: Häu·ser" | 🔥 High |
| `bedeutungen[]` | Numbered definitions with examples and labels | 🔥 High — German-German definitions |
| `etymologie` | Etymology text | Medium (overlaps Kaikki) |
| `verwendungsbeispiele` | Usage examples | Medium (overlaps corpus) |
| `wortbildung` | Word formation: compounds + derivations | 🔥 High |
| `synonyme` | Synonyms | Medium (overlaps OpenThesaurus) |
| `gegenwörter` | Antonyms / contrasting words | Medium |
| `oberbegriffe` | Hypernyms | Medium |
| `unterbegriffe` | Hyponyms | Medium |
| `grammatik` | Grammar: genus, genitive, plural | Medium (overlaps Kaikki) |
| Usage labels | "umgangssprachlich", "gehoben", "veraltend", "regional" | 🔥 High |
| Case government | For verbs: "jmdn. etw. fragen" (accusative patterns) | 🔥 High |

#### 4.3 Corpus API (currently used)

- **URL**: `GET https://www.dwds.de/r/?q={word}&view=json&corpus={kern|public}&limit={n}`
- **Returns**: Real-world sentence examples with metadata

| Field | Description | Currently Extracted |
|-------|-------------|-------------------|
| `ctx_` | Tokenized sentence context | ✅ Yes (reconstructed) |
| `meta_.title` | Source title | ✅ Yes |
| `meta_.date_` | Publication date | ✅ Yes |
| `meta_.author` | Author | ✅ Yes |
| `meta_.newspaper` | Newspaper name | ✅ Yes |
| `meta_.bibl` | Bibliographic reference | ✅ Yes |
| `meta_.textClass` | Text genre classification | ✅ Yes |

Available corpora: `kern` (high-quality formal), `public` (web/blogs),
`zeitungen` (newspapers), `dtaxl` (historical), `dta` (Deutsches Textarchiv).

#### 4.4 Frequency/Statistics API (currently used)

- **URL**: `GET https://www.dwds.de/api/stat/?q={word}`
- **Returns**: Historical frequency time series

```json
[
  {"year": 1600, "f": 0.0},
  {"year": 1900, "f": 180.2},
  {"year": 2000, "f": 245.3}
]
```

| Field | Description | Currently Extracted |
|-------|-------------|-------------------|
| `year` | Year | ✅ Yes |
| `f` | Frequency per million tokens | ✅ Yes |

#### 4.5 Word Profile API (NOT currently used)

- **URL**: `GET https://www.dwds.de/api/wp/?q={word}&format=json`
- **Returns**: Collocations organized by syntactic relation

| Field | Description | Value for urwort |
|-------|-------------|-----------------|
| Collocations by role | Subject ("das Haus steht"), Object ("ein Haus bauen"), Attribute ("altes Haus"), PP-complement ("im Haus") | 🔥 High — "what words go with this word" |
| Statistical significance | Log-likelihood or MI score per collocation | Medium |

#### 4.6 Thesaurus API (NOT currently used)

- **URL**: `GET https://www.dwds.de/api/thes/?q={word}&format=json`
- **Returns**: Synonyms and near-synonyms

| Field | Description | Value for urwort |
|-------|-------------|-----------------|
| Synsets | Groups of synonymous words | Medium (overlaps OpenThesaurus) |

#### 4.7 Autocomplete API (NOT currently used)

- **URL**: `GET https://www.dwds.de/api/complete/?q={prefix}`
- **Returns**: Lemma suggestions for prefix
- **Value**: Could enhance server-side search suggestions

### Strengths & Weaknesses

- **Strength**: The most authoritative German dictionary — academic gold standard
- **Strength**: Rich API surface: definitions, corpus, frequency, collocations, thesaurus
- **Strength**: Real corpus examples from millions of German texts
- **Strength**: Historical frequency data spanning centuries
- **Weakness**: German-German only (no English translations)
- **Weakness**: API-only — no bulk download for offline use
- **Weakness**: Non-commercial license restricts deployment options
- **Weakness**: Rate limiting may require careful request management

---

## 5. Source 4: OpenThesaurus

### Overview

- **Full name**: OpenThesaurus — Deutsches Wörterbuch für Synonyme
- **Website**: https://www.openthesaurus.de
- **License**: LGPL (fully open, redistributable)
- **Coverage**: ~150k+ synonym groups (synsets)
- **Format**: SQL dump (bulk download) + JSON API

### API

```
GET https://www.openthesaurus.de/synonyme/search?q={word}&format=application/json
```

### Data Available

| Field | Description |
|-------|-------------|
| `synsets[]` | Groups of synonymous words |
| `synsets[].terms[]` | Individual synonym entries |
| `synsets[].terms[].term` | The synonym word |
| `synsets[].terms[].level` | Register: `null`, `"colloquial"`, `"formal"`, `"technical"`, `"vulgar"`, `"literary"` |
| `synsets[].categories[]` | Subject domain categories |
| `synsets[].supersynsets[]` | Hypernym synsets (broader meaning) |
| `synsets[].subsynsets[]` | Hyponym synsets (narrower meaning) |
| `similar_terms[]` | Near-synonyms (not exact matches) |

### Bulk Download

Available as a compressed SQL dump (~5MB) from:
`https://www.openthesaurus.de/export/openthesaurus-dump.sql.gz`

### Value for urwort

- **Primary value**: Richest open source of German synonyms with register/level labels
- **Secondary value**: Hypernym/hyponym hierarchy
- **Integration**: Build-time bulk import + runtime API for fresh data

---

## 6. Source 5: UniMorph

### Overview

- **Full name**: UniMorph — Universal Morphological Feature Schema
- **Website**: https://unimorph.github.io
- **GitHub**: https://github.com/unimorph/deu
- **License**: CC BY-SA
- **Coverage**: ~4 million inflection rows for German
- **Format**: TSV (tab-separated values)

### Data Format

```tsv
Haus	Haus	N;NOM;SG
Haus	Hauses	N;GEN;SG
Haus	Hause	N;DAT;SG
Haus	Haus	N;ACC;SG
Haus	Häuser	N;NOM;PL
Haus	Häuser	N;ACC;PL
Haus	Häusern	N;DAT;PL
Haus	Häuser	N;GEN;PL
```

Columns: `lemma\tform\tfeatures` (tab-separated)

### Feature Schema (Universal Dependencies)

Features use a standardized tag set:

- **POS**: `N` (noun), `V` (verb), `ADJ` (adjective)
- **Case**: `NOM`, `GEN`, `DAT`, `ACC`
- **Number**: `SG`, `PL`
- **Person**: `1`, `2`, `3`
- **Tense**: `PRS` (present), `PST` (past)
- **Mood**: `IND` (indicative), `SBJV` (subjunctive), `IMP` (imperative)
- **Voice**: `ACT`, `PASS`
- **Aspect**: `PTCP` (participle), `INF` (infinitive)

### Value for urwort

- **Primary value**: Most complete and reliable inflection tables (manually curated)
- **Secondary value**: Can validate/supplement Kaikki inflection data
- **Integration**: Build-time bulk import into server SQLite `forms` table

---

## 7. Source 6: IPA-dict

### Overview

- **Full name**: IPA-dict — Open IPA Pronunciation Dictionary
- **GitHub**: https://github.com/open-dict-data/ipa-dict
- **License**: MIT
- **Coverage**: ~130k German words with IPA pronunciation
- **Format**: TSV (`word\tIPA`)

### Data Format

```tsv
Haus	/haʊ̯s/
Häuser	/ˈhɔʏ̯zɐ/
laufen	/ˈlaʊ̯fən/
```

### Value for urwort

- **Primary value**: Fill IPA pronunciation gaps where Kaikki lacks data
- **Integration**: Build-time bulk merge (match by headword)
- **Size**: Small, easy to process

---

## 8. Source 7: Leipzig Corpora Collection

### Overview

- **Full name**: Leipzig Corpora Collection / Wortschatz Universität Leipzig
- **Website**: https://wortschatz.uni-leipzig.de
- **License**: CC BY-NC (non-commercial)
- **Coverage**: Millions of German sentences, frequency data for ~10M+ word forms
- **Format**: Tab-separated bulk downloads

### Available Data Files

| File | Contents |
|------|----------|
| `{lang}_words.txt` | Words with frequency rank and absolute count |
| `{lang}_sentences.txt` | Sentence examples (numbered) |
| `{lang}_co_n.txt` | Significant co-occurrences (left/right neighbors) |
| `{lang}_co_s.txt` | Sentence-level co-occurrences |
| `{lang}_inv_w.txt` | Inverse word list (word → sentence IDs) |

### Fields Available

| Field | Description |
|-------|-------------|
| Word frequency rank | Integer rank (1 = most common) |
| Absolute frequency | Raw occurrence count in corpus |
| Frequency class | Log-scaled class similar to DWDS |
| Example sentences | Real-world sentences containing the word |
| Left co-occurrences | Words that commonly appear to the left, with significance score |
| Right co-occurrences | Words that commonly appear to the right, with significance score |
| Sentence co-occurrences | Words that commonly appear in the same sentence |

### Value for urwort

- **Primary value**: Independent frequency data (complements DWDS)
- **Secondary value**: Massive sentence example corpus
- **Tertiary value**: Co-occurrence data for collocations
- **Note**: CC BY-NC license — verify compatibility with your deployment

---

## 9. Source 8: CEFR Word Lists

### Overview

CEFR (Common European Framework of Reference) levels A1–C2 help learners
know which words to prioritize. Multiple open/semi-open sources exist:

| Source | Coverage | Availability |
|--------|----------|-------------|
| Goethe-Institut A1/A2/B1 word lists | ~3,000 words | Published PDFs, community-digitized |
| Profile Deutsch | ~4,000+ words | Commercial reference (not freely usable) |
| Kelly Project (Swedish → adapted) | ~9,000 words | Research data, CC license |
| Community GitHub compilations | Varies | Various licenses |
| Wikipedia: German CEFR vocabulary | ~2,000 words | CC BY-SA |

### Data Format

Typically simple word lists:

```
A1: Haus, Schule, Freund, Arbeit, ...
A2: Gebäude, Nachbar, Erfahrung, ...
B1: Gesellschaft, Umgebung, Beitrag, ...
B2: Auseinandersetzung, Bestandteil, ...
```

### Value for urwort

- 🔥 **High value for a learning app** — lets users filter/prioritize by level
- **Integration**: Build-time tagging: match headwords → assign CEFR level
- **Fallback**: Estimate CEFR from frequency rank when no explicit tag exists

---

## 10. Source 9: Wikidata Lexemes

### Overview

- **Full name**: Wikidata Lexicographical Data
- **Website**: https://www.wikidata.org/wiki/Wikidata:Lexicographical_data
- **License**: CC0 (public domain)
- **Format**: SPARQL API / JSON bulk dumps
- **Coverage**: Growing; German coverage is substantial but incomplete

### Data Available

| Field | Description |
|-------|-------------|
| Lexeme ID | e.g., `L1234` |
| Language | `Q188` (German) |
| Lemma | Canonical form |
| Lexical category | Linked to Wikidata items (Q1084, Q24905, etc.) |
| Forms | Each form linked to grammatical features (Wikidata items) |
| Senses | Each sense linked to a Wikidata item (concept) |

### Value for urwort

- **Primary value**: Semantic grounding — link words to concepts across languages
  - "Haus" → Q3947 → same concept as "house" (English), "maison" (French)
- **Secondary value**: Structured, machine-readable grammatical features
- **Integration**: Future phase — server-side SPARQL queries
- **Note**: Coverage is growing but still incomplete for German

---

## 11. Complete Field Inventory Matrix

What our canonical entry CAN contain, mapped to source:

| Field | FreeDict | Kaikki | DWDS | OpenThes. | UniMorph | Leipzig | IPA-dict | CEFR |
|-------|----------|--------|------|-----------|----------|---------|----------|------|
| **Headword / Lemma** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **POS** | ✅ rough | ✅ | ✅ | — | ✅ | ✅ | — | — |
| **Gender** (m/f/n) | ✅ rough | ✅ `head_templates` | ✅ `genus` | — | — | — | — | — |
| **Translations (EN)** | ✅ primary | ✅ glosses | — | — | — | — | — | — |
| **Definitions (DE)** | — | — | ✅ `bedeutungen` | — | — | — | — | — |
| **IPA pronunciation** | — | ✅ | ✅ `aussprache` | — | — | — | ✅ | — |
| **Audio URL** | — | ✅ Wikimedia | — | — | — | — | — | — |
| **Etymology** | — | ✅ (text + structured) | ✅ | — | — | — | — | — |
| **Inflection table** | — | ✅ `forms[]` | ✅ `grammatik` | — | ✅ complete | — | — | — |
| **Examples (bilingual)** | ✅ | ✅ `senses[].examples` | — | — | — | — | — | — |
| **Examples (monolingual DE)** | — | — | ✅ corpus | — | — | ✅ millions | — | — |
| **Synonyms** | — | ✅ partial | ✅ `synonyme` | ✅ primary | — | — | — | — |
| **Antonyms** | — | ✅ partial | ✅ `gegenwörter` | ✅ | — | — | — | — |
| **Hypernyms** | — | ✅ | ✅ `oberbegriffe` | ✅ | — | — | — | — |
| **Hyponyms** | — | ✅ | ✅ `unterbegriffe` | ✅ | — | — | — | — |
| **Derived words** | — | ✅ `derived` | ✅ `wortbildung` | — | — | — | — | — |
| **Related words** | — | ✅ `related` | — | ✅ `similar` | — | — | — | — |
| **Collocations** | — | — | ✅ Word Profile | — | — | ✅ co-occur | — | — |
| **Frequency score** | — | — | ✅ class 1-7 + series | — | — | ✅ absolute | — | — |
| **Usage labels** | ⚠️ text | ✅ `tags` | ✅ labels | ✅ `level` | — | — | — | — |
| **Subject domain** | ⚠️ text | ✅ `categories/topics` | — | ✅ categories | — | — | — | — |
| **CEFR level** | — | — | — | — | — | — | — | ✅ |
| **Syllabification** | — | ✅ `hyphenation` | ✅ `worttrennung` | — | — | — | — | — |
| **Rhymes** | — | ✅ `sounds[].rhymes` | — | — | — | — | — | — |
| **Homophones** | — | ✅ `sounds[].homophones` | — | — | — | — | — | — |
| **Proverbs / Idioms** | — | ✅ `proverbs` | — | — | — | — | — | — |
| **Wikidata Q-ID** | — | ✅ `wikidata` | — | — | — | — | — | — |
| **Wikipedia link** | — | ✅ `wikipedia` | — | — | — | — | — | — |
| **Compound analysis** | — | ✅ `literal_meaning` | ✅ `wortbildung` | — | — | — | — | — |
| **Case government** | — | ⚠️ via tags | ✅ grammar | — | — | — | — | — |
| **Auxiliary** (sein/haben) | — | ✅ `head_templates` | ✅ | — | — | — | — | — |
| **Verb class** (strong/weak) | — | ✅ `head_templates` | — | — | — | — | — | — |
| **Historical frequency** | — | — | ✅ time series | — | — | — | — | — |

---

## 12. Source Priority & Merge Strategy

When multiple sources provide the same field, we use this hierarchy:

| Field | Best Source | Fallback 1 | Fallback 2 | Rationale |
|-------|-----------|-----------|-----------|-----------|
| English translations | **Kaikki** | FreeDict | — | Kaikki has structured glosses per sense |
| German definitions | **DWDS** | — | — | Only authoritative source for DE-DE |
| POS | **Kaikki** | DWDS | FreeDict | Kaikki uses consistent tag set |
| Gender | **DWDS** `genus` | Kaikki `head_templates` | FreeDict regex | DWDS is most authoritative |
| IPA | **Kaikki** | IPA-dict | DWDS | Wiktionary community maintains IPA well |
| Audio | **Kaikki** | — | — | Only source with Wikimedia audio |
| Etymology | **Kaikki** (text + structured) | DWDS | — | Kaikki has both prose and structured chain |
| Inflections | **UniMorph** | Kaikki `forms[]` | — | UniMorph is manually curated, most complete |
| Synonyms | **OpenThesaurus** | DWDS | Kaikki | OpenThesaurus is purpose-built for this |
| Collocations | **DWDS** Word Profile | Leipzig co-occur | — | DWDS has syntactic role info |
| Frequency | **DWDS** class (1-7) | Leipzig absolute | — | DWDS frequency class is standardized |
| CEFR level | **CEFR lists** | Estimate from freq | — | Direct tag preferred over estimate |
| Corpus examples | **DWDS** kern | Leipzig | Kaikki | DWDS kern is highest quality |
| Subject domain | **Kaikki** topics | OpenThesaurus cats | — | Broadest coverage |
| Usage register | **OpenThesaurus** level | DWDS labels | Kaikki tags | OpenThesaurus has explicit levels |
| Semantic relations | **Kaikki** | DWDS | OpenThesaurus | Broadest coverage of relation types |

### Merge Rules

1. **Non-conflicting fields**: Take from best available source (first non-null in priority order)
2. **List fields** (translations, synonyms, etc.): Union from all sources, deduplicate
3. **Conflicting scalar fields** (e.g., different genders): Prefer higher-priority source, log conflict
4. **Source tracking**: Always record which source provided each piece of data in `sources` JSON

---

## 13. Licensing Summary

| Source | License | Commercial OK? | Redistribution OK? | Attribution Required? |
|--------|---------|---------------|-------------------|---------------------|
| FreeDict | GPL v2+ / AGPL v3+ | ✅ (with source) | ✅ (same license) | ✅ |
| Kaikki / Wiktionary | CC BY-SA 3.0 | ✅ | ✅ (share-alike) | ✅ |
| DWDS | Non-commercial API ToS | ⚠️ Check ToS | ❌ (API responses) | ✅ |
| OpenThesaurus | LGPL | ✅ | ✅ | ✅ |
| UniMorph | CC BY-SA | ✅ | ✅ (share-alike) | ✅ |
| IPA-dict | MIT | ✅ | ✅ | ✅ |
| Leipzig Corpora | CC BY-NC | ❌ | ✅ (non-commercial) | ✅ |
| CEFR Lists | Varies | ⚠️ Check per source | ⚠️ | ⚠️ |
| Wikidata | CC0 | ✅ | ✅ | No |

**Key consideration**: DWDS and Leipzig have non-commercial restrictions.
Our server caches processed data — we're not redistributing raw API responses,
but storing derived/normalized entries. Verify this is within ToS.

---

*Last updated: 2026-03-07*
*Reference for: schema design, build pipeline, API normalizers*
