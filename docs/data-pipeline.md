# urwort — Data Pipeline

How raw dictionary source files become the per-letter JSON chunks served by the app.

---

## Data sources

### FreeDict (primary — in use)

| Dictionary | Direction | Format | License |
|---|---|---|---|
| `deu-eng` | German → English | StarDict (`.dict.dz`, `.idx.gz`, `.ifo`) | GPL-2.0 |
| `eng-deu` | English → German | StarDict (`.dict.dz`, `.idx.gz`, `.ifo`) | GPL-2.0 |

Downloaded from [freedict.org/downloads](https://freedict.org/downloads/).  
Stored locally at `raw-data/freedict/` (gitignored — not committed).

### kaikki.org (planned — not yet integrated)

Wiktionary-derived structured JSON. License: CC-BY-SA 4.0.  
Will supplement FreeDict with richer etymologies and usage examples.

### DWDS (optional reference — future)

German reference dictionary. Restricted license — **not suitable for bulk offline data**.  
May be added as a live API call (Layer 3 deep-dive only) with attribution.

---

## StarDict file format

Each dictionary ships as three files:

| File | Contents |
|---|---|
| `.ifo` | Metadata (word count, format version) |
| `.idx.gz` | Index: `null-terminated word + 4-byte offset + 4-byte size` per entry |
| `.dict.dz` | Compressed dictionary body: HTML fragments, one per index entry |

One headword can have **multiple index entries** — one per sense (e.g. "bank" as a financial institution and "bank" as a riverbank are separate rows). The build script merges them.

---

## Build script

**`tools/build-dict.py`**

```bash
# Full build (both directions)
python3 tools/build-dict.py

# Stats only, no files written
python3 tools/build-dict.py --dry-run

# Quick test — first 2000 headwords per direction
python3 tools/build-dict.py --limit 2000

# One direction only
python3 tools/build-dict.py --direction de-en
```

### Pipeline steps

```
raw-data/freedict/deu-eng/deu-eng.idx.gz   ─┐
raw-data/freedict/deu-eng/deu-eng.dict.dz  ─┤
                                             ├─▶  read_stardict()
raw-data/freedict/eng-deu/eng-deu.idx.gz   ─┤       │
raw-data/freedict/eng-deu/eng-deu.dict.dz  ─┘       │
                                                      ▼
                                              EntryParser (HTMLParser)
                                              extract: pos, gender,
                                              translations, examples
                                                      │
                                                      ▼
                                              parse_pos_gender()
                                              "male, noun, sg" → ("noun","m")
                                                      │
                                                      ▼
                                              merge by headword
                                              (multi-sense dedup)
                                                      │
                                                      ▼
                                              should_skip() filter
                                              (short, numeric, symbolic)
                                                      │
                                                      ▼
                                              chunk_by_letter()
                                              ä→a  ö→o  ü→u  ß→s
                                                      │
                                                      ▼
                                         src/data/de-en/{a..z,misc}.json
                                         src/data/en-de/{a..z,misc}.json
```

### Filtering rules

Headwords are skipped if they:
- are fewer than 2 or more than 60 characters
- start with a quote, digit, or non-word character
- contain `( ) [ ] { } ...`
- produce zero translations after parsing

Translations are capped at **6 per entry**. Examples are capped at **3 per entry**.

### Sense merging

Because FreeDict has one index row per sense, the script accumulates rows for the same headword and merges them:
- `pos` and `gender` — taken from first sense that provides them
- `translations` — deduplicated (case-insensitive), combined across all senses
- `examples` — deduplicated, combined across all senses
- `sources.freedict.senses` — count of original rows merged

---

## Entry schema

Every entry in every chunk file follows this shape:

```json
{
  "id":     "de_haus",
  "w":      "Haus",
  "pos":    "noun",
  "gender": "n",
  "meta": {
    "freq":  null,
    "level": null
  },
  "l1": {
    "en": ["house", "home", "building"],
    "ex": ["Das Haus ist groß. :: The house is big."]
  },
  "sources": {
    "freedict": { "senses": 3 }
  }
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | `"{lang}_{word_lowercase}"` — unique within a direction |
| `w` | string | Headword, original casing |
| `pos` | string | `noun` / `verb` / `adjective` / `adverb` / `preposition` / `conjunction` / `pronoun` / `article` / `""` |
| `gender` | `"m"` / `"f"` / `"n"` / `null` | German nouns only |
| `meta.freq` | `null` | Reserved for future frequency data |
| `meta.level` | `null` | Reserved for CEFR level (A1–C2) |
| `l1.en` | `string[]` | Up to 6 translations |
| `l1.ex` | `string[]` | Up to 3 examples in `"source :: target"` format |
| `sources.freedict.senses` | number | How many raw idx rows were merged |

The `l1` namespace is intentional — future layers (`l2`, `l3`) can hold richer data from additional sources without breaking existing consumers.

---

## Output

```
src/data/
├── de-en/
│   ├── a.json      ~  800 entries
│   ├── b.json      ~  600 entries
│   ├── ...
│   ├── s.json      ~ 3,500 entries  (includes ß words)
│   └── misc.json   ~   50 entries   (symbols, edge cases)
└── en-de/
    ├── a.json
    ├── ...
    └── misc.json
```

Total: ~27,000 DE→EN entries and ~22,000 EN→DE entries across 27 chunks each.  
Typical chunk size: 30–400 KB uncompressed. Served with gzip in production (~70% reduction).

---

## Chunk loading in the app

The app never loads all chunks — only the one matching the first character of the search query.

```
User types "H..." → worker fetches /data/de-en/h.json  (once per session)
User types "ü..."  → ü maps to "u" → worker fetches /data/de-en/u.json
User types "ß..."  → ß maps to "s" → worker fetches /data/de-en/s.json
```

Once fetched, the chunk lives in:
1. The **Service Worker cache** (`urwort-data-v2`) — persists across sessions
2. The **Worker's in-memory `chunkCache`** — instant for the current tab session

---

## Rebuilding the data

If you update the FreeDict source files or change the build script:

```bash
cd /path/to/urwort

# Rebuild everything
python3 tools/build-dict.py

# Verify a sample
python3 -c "
import json
data = json.load(open('src/data/de-en/h.json'))
print(f'{len(data)} entries')
print(json.dumps(data[0], indent=2, ensure_ascii=False))
"
```

After rebuilding, bump `DATA_CACHE` in `sw.js` (e.g. `urwort-data-v3`) so existing clients pick up the new chunks.

---

## Adding a new data source (future)

The `sources` field is a namespace map. To add kaikki.org data:

1. Add a parser in `build-dict.py` that reads kaikki JSON
2. Merge into the same entry structure under `sources.kaikki: { ... }`
3. Extend `l1.en` with additional translations (deduplicated)
4. Optionally add `l2: { etymology: "...", ipa: "..." }` for Layer 2 richness
5. Rebuild chunks and bump cache version

No schema migration needed in the app — existing fields are unchanged, new fields are additive.
