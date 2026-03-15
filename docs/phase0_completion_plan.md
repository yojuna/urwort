# URWORT — Phase 0 Completion & Debt Cleanup Plan

_Working reference for completing Phase 0 and resolving all technical debt._

_Supersedes: Section 13 ("Remaining Work") of `phase0_implementation_plan.md`._

_Based on: Full code review of `build-db.py`, `export-ontology.py`, `schema.sql`, `deploy-pages.yml`, `phase0_implementation_plan.md`, and the live site at yojuna.github.io/urwort._

March 2026

---

## 0. Current State Assessment

### What's Working

| Component | Status | Quality |
|-----------|--------|---------|
| 3D world with root islands + word pillars | ✅ Live | Good — navigable, spatial, 60fps desktop / 45-60fps mobile |
| Word cards (tap → info overlay) | ✅ Live | Functional — lemma, POS, CEFR, IPA, definition, root info |
| Island cards (tap → root overview + word list) | ✅ Live | Functional — clickable word list with fly-to |
| MapControls + WASD + fly-to navigation | ✅ Live | Good — battle-tested, works on mobile |
| Data pipeline (FreeDict + Kaikki + IPA + CEFR → SQLite) | ✅ Working | Solid — 1,100 lines, well-structured, handles edge cases |
| Ontology export (SQLite + Kaikki → ontology.json) | ✅ Working | **Shallow** — see critique below |
| GitHub Pages CI/CD | ✅ Working | Clean — pages-deploy branch trigger, correct base path handling |
| Docker dev environment | ✅ Working | Good — single docker compose up |
| TypeScript + Vite + Three.js scaffold | ✅ Working | Clean — 1,500 lines, one runtime dependency |

### What's Missing (Success Criteria)

| # | Criterion | Gap |
|---|-----------|-----|
| 2 | Morphological decomposition display | **Data not exported + UI not built** |
| 3 | Etymology chain view | **Data collapsed to single stage + UI not built** |
| 4 | Search bar | **Not started** |
| 7 | Source citations visible | **Not exported + UI not built** |
| — | Data quality spot-check | **Cannot assess until data is enriched** |

### The Core Problem

The ontology export (`export-ontology.py`) is the bottleneck. It extracts roots and clusters words, but the output is **structurally too thin** to power the missing UI features:

1. **Etymology is flattened.** `extract_root()` picks the deepest ancestor and discards the chain. Kaikki's `etymology_templates[]` contains every `inh` (inherited) stage — the full NHG → MHG → OHG → PGmc → PIE chain — but only one stage reaches the JSON output.

2. **No morphological segments.** The `Wort` type has no `segments` field (prefix/root/suffix breakdown). The data to construct this exists (Kaikki `head_templates`, known German affix patterns, `derived[]` relationships) but isn't extracted.

3. **No source URLs.** Every word comes from FreeDict/Kaikki (recorded in `entries.sources`) and has templateable source links (`https://dwds.de/wb/{lemma}`, `https://de.wiktionary.org/wiki/{lemma}`) but these aren't included in the export.

4. **Definitions are thin.** The `definition_en` field takes the first FreeDict translation. The `entries` table has richer `senses[].glosses` from Kaikki with multiple nuanced meanings that aren't being surfaced.

5. **Root clustering rate is low.** 82 multi-word clusters from 635 words = ~13% meaningful clustering. Many words with parseable `etymology_text` don't have structured `etymology_templates[]` but could be clustered via regex on the free text.

**The implication:** We can't build the etymology chain UI or morphological decomposition UI until the data pipeline produces that data. Data enrichment must come first.

---

## 1. Work Plan: Ordered by Dependency

### Sprint Structure

```
Week 1: Data enrichment (export-ontology.py rewrite)
  ↓ produces enriched ontology.json
Week 2: UI features that consume the enriched data
  ↓ morphological display, etymology view, source links, search
Week 3: Debt cleanup + polish + quality validation
  ↓ performance, code structure, data spot-check
```

All three weeks can overlap if two people work in parallel (data person + UI person), but the dependency arrow is strict: enriched data must exist before UI can render it.

---

## 2. Week 1: Data Enrichment

### 2.1 Enrich `export-ontology.py` — Etymology Chains

**Problem:** `extract_root()` returns one stage. We need the full chain.

**Current code (lines 118-166):** Walks `etymology_templates[]`, finds the deepest `inh`/`der` template, returns `{form, lang, lang_name, proto_form}`.

**Required change:** Collect ALL `inh`/`inh+`/`der`/`bor` templates as an ordered chain. Also extract `cog` (cognate) templates separately. Return both.

**New function signature:**

```python
def extract_etymology(templates: list[dict]) -> dict:
    """
    Returns:
    {
        "chain": [
            {"stage": "nhg", "form": "Haus", "lang_name": "Modern German", "is_reconstructed": false},
            {"stage": "mhg", "form": "hūs", "lang_name": "MHG", "is_reconstructed": false},
            {"stage": "ohg", "form": "hūs", "lang_name": "OHG", "is_reconstructed": false},
            {"stage": "pgmc", "form": "*hūsą", "lang_name": "Proto-Germanic", "is_reconstructed": true},
            {"stage": "pie", "form": "*ḱews-", "lang_name": "PIE", "is_reconstructed": true}
        ],
        "cognates": [
            {"language": "English", "form": "house"},
            {"language": "Dutch", "form": "huis"}
        ],
        "borrowing_info": null | {"from_lang": "Latin", "form": "fenestra", "period": "roman_contact"},
        "root": {  // deepest stage, same as current extract_root() output
            "form": "ḱews-", "lang": "ine-pro", "lang_name": "PIE", "proto_form": "*ḱews-"
        }
    }
    """
```

**Implementation approach:**

```python
LANG_CODE_TO_NAME = {
    "ine-pro": "PIE",
    "gem-pro": "Proto-Germanic",
    "gmw-pro": "Proto-West-Germanic",
    "goh": "OHG",
    "gmh": "MHG",
    "la": "Latin",
    "grc": "Ancient Greek",
    "fro": "Old French",
    "fr": "French",
    "en": "English",
    "nl": "Dutch",
    "sv": "Swedish",
    "da": "Danish",
    "got": "Gothic",
}

DEPTH_ORDER = ["ine-pro", "gem-pro", "gmw-pro", "got", "goh", "gmh"]

def extract_etymology(templates: list[dict], lemma: str) -> dict:
    chain = []
    cognates = []
    borrowing = None
    
    for t in templates:
        name = t.get("name", "")
        args = t.get("args", {})
        lang = args.get("2", "")
        form = args.get("3", "")
        if not lang or not form:
            continue
        
        form_clean = form.split(",")[0].strip()
        is_reconstructed = form_clean.startswith("*")
        lang_name = LANG_CODE_TO_NAME.get(lang, lang)
        
        if name in ("inh", "inh+", "der"):
            chain.append({
                "stage": lang,
                "form": form_clean,
                "lang_name": lang_name,
                "is_reconstructed": is_reconstructed,
            })
        elif name == "bor":
            borrowing = {
                "from_lang": lang_name,
                "form": form_clean,
                "lang_code": lang,
            }
            chain.append({
                "stage": lang,
                "form": form_clean,
                "lang_name": lang_name,
                "is_reconstructed": is_reconstructed,
            })
        elif name == "cog":
            cognates.append({
                "language": lang_name,
                "form": form_clean,
            })
    
    # Sort chain: deepest ancestor first
    chain.sort(key=lambda s: DEPTH_ORDER.index(s["stage"]) 
               if s["stage"] in DEPTH_ORDER else len(DEPTH_ORDER))
    
    # Prepend NHG (the word itself) as the newest stage
    chain.append({"stage": "nhg", "form": lemma, "lang_name": "Modern German", "is_reconstructed": False})
    
    # Reverse: show NHG first, deepest last (for display: newest → oldest)
    # Actually keep oldest-first for data; UI decides display order.
    
    # Extract deepest root (same as old extract_root behaviour)
    root = None
    if chain:
        deepest = chain[0]  # oldest ancestor after sort
        root = {
            "form": deepest["form"].lstrip("*").strip(),
            "proto_form": deepest["form"],
            "lang": deepest["stage"],
            "lang_name": deepest["lang_name"],
        }
    
    return {
        "chain": chain,
        "cognates": cognates[:6],
        "borrowing_info": borrowing,
        "root": root,
    }
```

**Effort:** 2-3 hours (modify extract logic + update cluster builder + update JSON output schema).

**Validation:** After running, spot-check 10 words: Haus, Wasser, Schule, fahren, Fenster (loanword), verstehen, Kinder, Arbeit, Freund, schreiben. Each should have 2+ stages in its etymology chain.

### 2.2 Enrich `export-ontology.py` — Morphological Segments

**Problem:** No prefix/root/suffix breakdown in the Wort data.

**Approach for Phase 0:** Use a simple pattern-matching decomposer, not a full morphological analyser. This is good enough for ~70% of A1-A2 words.

```python
# Known German prefix inventory (separable + inseparable)
INSEPARABLE_PREFIXES = ["be", "emp", "ent", "er", "ge", "miss", "ver", "zer", "hinter"]
SEPARABLE_PREFIXES = ["ab", "an", "auf", "aus", "bei", "durch", "ein", "mit", 
                       "nach", "über", "um", "unter", "vor", "weg", "zu", "zurück"]

# Known German suffix inventory (with grammatical info)
SUFFIXES = {
    "ung": {"pos_effect": "NOUN", "gender": "f"},
    "heit": {"pos_effect": "NOUN", "gender": "f"},
    "keit": {"pos_effect": "NOUN", "gender": "f"},
    "schaft": {"pos_effect": "NOUN", "gender": "f"},
    "nis": {"pos_effect": "NOUN", "gender": "n"},
    "tum": {"pos_effect": "NOUN", "gender": "n"},
    "ling": {"pos_effect": "NOUN", "gender": "m"},
    "chen": {"pos_effect": "NOUN", "gender": "n"},
    "lein": {"pos_effect": "NOUN", "gender": "n"},
    "er": {"pos_effect": "NOUN", "gender": "m"},
    "in": {"pos_effect": "NOUN", "gender": "f"},
    "lich": {"pos_effect": "ADJ"},
    "ig": {"pos_effect": "ADJ"},
    "isch": {"pos_effect": "ADJ"},
    "bar": {"pos_effect": "ADJ"},
    "sam": {"pos_effect": "ADJ"},
    "haft": {"pos_effect": "ADJ"},
    "los": {"pos_effect": "ADJ"},
    "voll": {"pos_effect": "ADJ"},
}

def decompose_morphology(lemma: str, pos: str, root_form: str | None) -> list[dict] | None:
    """
    Attempt to decompose a word into prefix + root + suffix segments.
    Returns list of segments or None if decomposition isn't confident.
    
    Each segment: {"form": "ver", "type": "prefix"|"root"|"suffix", "function": "..."}
    """
    word = lemma.lower()
    segments = []
    
    # Step 1: Check for known prefix
    prefix_found = None
    for p in sorted(INSEPARABLE_PREFIXES + SEPARABLE_PREFIXES, key=len, reverse=True):
        if word.startswith(p) and len(word) > len(p) + 2:
            prefix_found = p
            word = word[len(p):]
            sep = "separable" if p in SEPARABLE_PREFIXES else "inseparable"
            segments.append({"form": p, "type": "prefix", "function": sep})
            break
    
    # Step 2: Check for known suffix
    suffix_found = None
    # Don't strip suffix from very short remaining stems
    if len(word) > 4:
        for s in sorted(SUFFIXES.keys(), key=len, reverse=True):
            if word.endswith(s) and len(word) > len(s) + 2:
                suffix_found = s
                word = word[:-len(s)]
                info = SUFFIXES[s]
                segments.append({"form": s, "type": "suffix", 
                               "function": f"→ {info['pos_effect']}"})
                break
    
    # Step 3: Whatever remains is the root/stem
    if word:
        # If we have a known root form from etymology, try to match
        root_label = "root"
        if root_form and root_form.lower() in word.lower():
            root_label = "root"
        elif not prefix_found and not suffix_found:
            # No decomposition found — word is a simple root
            return [{"form": lemma, "type": "root", "function": ""}]
        
        # Insert root in the middle (after prefix, before suffix)
        root_seg = {"form": word, "type": "root", "function": ""}
        if prefix_found:
            segments.insert(1, root_seg)
        else:
            segments.insert(0, root_seg)
    
    # Only return if we actually decomposed something
    if prefix_found or suffix_found:
        return segments
    
    # Return the whole word as root
    return [{"form": lemma, "type": "root", "function": ""}]
```

**Effort:** 3-4 hours (implement decomposer + integrate into export + manual review of 50 test cases).

**Known limitations:** This is a heuristic decomposer, not a linguistic one. It will make errors on irregular formations, historical derivations where the prefix is no longer transparent, and words where the "prefix" is actually part of the stem. For Phase 0, we mark all decompositions as `"verified": false` and accept ~70% accuracy. Phase 1 replaces this with a proper morphological analyser (SMOR/DEMorphy) or manual verification.

### 2.3 Enrich `export-ontology.py` — Source URLs

**Problem:** No source citations in the JSON output.

**Implementation:** Trivial. Add to each Wort:

```python
"source_urls": {
    "wiktionary": f"https://de.wiktionary.org/wiki/{urllib.parse.quote(lemma)}",
    "dwds": f"https://www.dwds.de/wb/{urllib.parse.quote(lemma)}",
}
```

Add to each Wurzel:

```python
"source_urls": {
    "dwds_etymology": f"https://www.dwds.de/wb/etymwb/{urllib.parse.quote(basic_word_lemma)}",
}
```

**Effort:** 30 minutes.

### 2.4 Enrich `export-ontology.py` — Richer Definitions

**Problem:** `definition_en` takes only the first FreeDict translation.

**Fix:** Pull from `entries.senses` (Kaikki glosses) which has structured, nuanced definitions. Use the first 2-3 glosses from the first sense, joined with "; ".

Also add `definition_de` from `entries.definitions_de` where available.

```python
# In load_vocabulary(), also SELECT senses, definitions_de
# Then:
senses = json.loads(r["senses"]) if r["senses"] else []
if senses and senses[0].get("glosses"):
    definition_en = "; ".join(senses[0]["glosses"][:3])
else:
    # Fall back to first translation
    trans = json.loads(r["translations"]) if r["translations"] else []
    definition_en = trans[0] if trans else ""

defs_de = json.loads(r["definitions_de"]) if r["definitions_de"] else []
definition_de = defs_de[0].get("text", "") if defs_de else ""
```

**Effort:** 1 hour.

### 2.5 Improve Root Clustering — Etymology Text Fallback

**Problem:** 87% of words end up in single-word clusters because they lack structured `etymology_templates[]`.

**Fix:** Before the stem-prefix fallback (Phase C in `build_root_clusters`), add a regex pass over `etymology_text` to extract historical forms:

```python
# Patterns like "From Middle High German loufen, from Old High German hloufan"
MHG_RE = re.compile(r'Middle High German\s+(\w+)', re.I)
OHG_RE = re.compile(r'Old High German\s+(\w+)', re.I)
PGMC_RE = re.compile(r'Proto-Germanic\s+\*?(\w+)', re.I)

def extract_root_from_text(etymology_text: str) -> dict | None:
    """Fallback: parse etymology from free text when templates are missing."""
    # Try deepest first
    for pattern, lang, lang_name in [
        (PGMC_RE, "gem-pro", "Proto-Germanic"),
        (OHG_RE, "goh", "OHG"),
        (MHG_RE, "gmh", "MHG"),
    ]:
        m = pattern.search(etymology_text)
        if m:
            form = m.group(1).strip("*,. ")
            return {
                "form": form,
                "proto_form": f"*{form}" if lang in ("gem-pro", "ine-pro") else form,
                "lang": lang,
                "lang_name": lang_name,
            }
    return None
```

Call this in `build_root_clusters()` for words where `extract_root(templates)` returned None:

```python
root_info = extract_root(templates)
if root_info is None and entry["etymology_text"]:
    root_info = extract_root_from_text(entry["etymology_text"])
```

**Expected impact:** Should cluster an additional 50-100 words that have etymology text but no structured templates.

**Effort:** 1-2 hours.

### 2.6 Update TypeScript Types

The `Wurzel` and `Wort` interfaces need new fields:

```typescript
interface Wurzel {
  id: string;
  form: string;
  meaning_de: string;
  meaning_en: string;
  origin_lang: string;
  proto_form?: string;
  // NEW
  etymology_chain: EtymologyStage[];
  cognates: Cognate[];
  borrowing_info?: BorrowingInfo;
  source_urls: Record<string, string>;
}

interface EtymologyStage {
  stage: string;        // "pie", "pgmc", "ohg", "mhg", "nhg"
  form: string;
  lang_name: string;
  is_reconstructed: boolean;
}

interface Cognate {
  language: string;
  form: string;
}

interface BorrowingInfo {
  from_lang: string;
  form: string;
  lang_code: string;
}

interface Wort {
  id: string;
  lemma: string;
  pos: string;
  ipa?: string;
  frequency?: number;
  cefr_level?: string;
  definition_de?: string;
  definition_en?: string;
  // NEW
  segments?: MorphSegment[];
  source_urls: Record<string, string>;
}

interface MorphSegment {
  form: string;
  type: "prefix" | "root" | "suffix";
  function: string;
}
```

**Effort:** 30 minutes.

### 2.7 Week 1 Validation

After all data enrichment is done, run the pipeline and validate:

```bash
python3 tools/export-ontology.py
# Then check:
python3 -c "
import json
with open('game/public/ontology.json') as f:
    data = json.load(f)
    
# Count etymology chains with 2+ stages
chains = [c for c in data['clusters'] 
          if len(c['wurzel'].get('etymology_chain', [])) >= 2]
print(f'Clusters with etymology chain: {len(chains)}/{len(data[\"clusters\"])}')

# Count words with morphological segments
segmented = sum(1 for c in data['clusters'] 
                for w in c['words'] if w.get('segments') and len(w['segments']) > 1)
total_words = sum(len(c['words']) for c in data['clusters'])
print(f'Words with decomposition: {segmented}/{total_words}')

# Count words with source URLs
sourced = sum(1 for c in data['clusters']
              for w in c['words'] if w.get('source_urls'))
print(f'Words with source URLs: {sourced}/{total_words}')

# Multi-word cluster rate
multi = len([c for c in data['clusters'] if len(c['words']) >= 2])
print(f'Multi-word clusters: {multi}/{len(data[\"clusters\"])}')
"
```

**Targets:**
- Etymology chains with 2+ stages: > 100 clusters (up from 0)
- Words with morphological decomposition: > 300 (of ~600)
- Words with source URLs: 100% (all 600+)
- Multi-word clusters: > 120 (up from 82)

---

## 3. Week 2: UI Features

All of these depend on the enriched data from Week 1.

### 3.1 Etymology Chain View (Success Criterion #3)

**Where:** `ui/word-card.ts` → new method `showEtymologyChain()` or extension of `showIsland()`.

**Design:** Vertical timeline, newest (NHG) at top, oldest (PIE) at bottom. Each stage is a row:

```
Haus          Modern German
  ↓
hūs           Middle High German
  ↓
hūs           Old High German
  ↓
*hūsą         Proto-Germanic  ★
  ↓
*ḱews-        PIE  ★

★ = reconstructed (shown in italics)

Cognates: 🇬🇧 house · 🇳🇱 huis · 🇸🇪 hus
```

**Implementation:**
- Read `wurzel.etymology_chain` from cluster data
- Render as HTML inside the existing card system
- Each stage is a `<div>` with form (large) + lang_name (small, grey)
- Arrow/line connector between stages (CSS `border-left` or SVG line)
- Reconstructed forms in italics with `*` preserved
- Cognates as a horizontal list at the bottom
- Source link at bottom: "Source: DWDS Etymology" → opens URL

**Trigger:** Tap the root monument / island base → show island card with etymology chain expanded. Or add a "Show etymology" button on the island card that toggles the chain view.

**Effort:** 3-4 hours.

### 3.2 Morphological Decomposition Display (Success Criterion #2)

**Where:** `ui/word-card.ts` → extend `showWord()`.

**Design:** The word is shown split into coloured segments:

```
 ver  |  steh  |  en
 ───    ─────    ──
prefix  root    suffix
blue    green   amber
```

**Implementation:**
- Read `wort.segments` from word data
- Render as a row of `<span>` elements, each with a background colour:
  - `prefix` → `#577590` (blue-grey) with white text
  - `root` → `#2D6A4F` (deep green) with white text  
  - `suffix` → `#CA8A04` (amber) with white text
- Below each segment, small label text showing type + function
- Segments animate: start as one solid word, split apart over 300ms (CSS transition on gap/margin)
- If no segments data (decomposition failed), show the word as a single "root" segment

**Effort:** 2-3 hours.

### 3.3 Search Bar (Success Criterion #4)

**Where:** New file `ui/SearchBar.ts` (or inline in `main.ts` for Phase 0).

**Implementation:**

```typescript
class SearchBar {
  private input: HTMLInputElement;
  private dropdown: HTMLDivElement;
  private index: Map<string, {clusterId: number, wortId: string}>;
  
  constructor(container: HTMLElement, ontologyData: OntologyData) {
    // Build search index: normalised lemma → cluster + word reference
    this.index = new Map();
    for (const [i, cluster] of ontologyData.clusters.entries()) {
      for (const word of cluster.words) {
        const key = this.normalise(word.lemma);
        this.index.set(key, { clusterId: i, wortId: word.id });
      }
    }
    
    // Create HTML elements
    this.input = document.createElement('input');
    // ... styling, positioning, event listeners
  }
  
  private normalise(s: string): string {
    return s.toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss');
  }
  
  search(query: string): SearchResult[] {
    const norm = this.normalise(query);
    const results: SearchResult[] = [];
    for (const [key, ref] of this.index) {
      if (key.startsWith(norm) || key.includes(norm)) {
        results.push(ref);
        if (results.length >= 8) break;
      }
    }
    return results;
  }
}
```

**Interaction flow:**
1. Tap search icon (magnifying glass, top-right) → input appears
2. Type query → dropdown shows up to 8 matching lemmas
3. Tap result → camera flies to that island, word card opens
4. Search bar dismisses

**Umlaut transliteration:** Must handle `ue` → `ü`, `ae` → `ä`, `oe` → `ö`, `ss` → `ß` bidirectionally. Users without German keyboard need to find Haus by typing "haus", Häuser by typing "haeuser".

**Effort:** 3-4 hours.

### 3.4 Source Citation Links (Success Criterion #7)

**Where:** `ui/word-card.ts` → extend both `showWord()` and `showIsland()`.

**Implementation:** At the bottom of every card, add a "Sources" section:

```html
<div class="sources">
  <a href="https://de.wiktionary.org/wiki/Haus" target="_blank" rel="noopener">Wiktionary</a>
  · 
  <a href="https://www.dwds.de/wb/Haus" target="_blank" rel="noopener">DWDS</a>
</div>
```

Read URLs from `wort.source_urls` or `wurzel.source_urls`. Style as small text, muted colour, with external link icon.

**Effort:** 1 hour.

---

## 4. Week 3: Technical Debt Cleanup

### 4.1 Code Architecture Debt

| Debt Item | Current State | Fix | Effort |
|-----------|--------------|-----|--------|
| `main.ts` is a god-module (210 lines) | All init + interaction + render loop in one file | Extract `InteractionManager` class handling raycasting, tap detection, card wiring | 2h |
| No `OntologyStore` class | Ontology data accessed as raw JSON throughout | Create `OntologyStore` with `searchLemma()`, `getCluster()`, `getWort()` methods. Used by SearchBar and InteractionManager | 2h |
| No `EntityFactory` | Island/bridge creation mixed with layout | Extract `EntityFactory` for POS-specific mesh creation (prep for Phase 1 visual variety) | 1h |
| Raycasting in main.ts | ~40 lines of pointer handling inline | Move to InteractionManager | Included above |

### 4.2 Data Pipeline Debt

| Debt Item | Current State | Fix | Effort |
|-----------|--------------|-----|--------|
| `export-ontology.py` has no validation step | Output JSON is not validated against a schema | Add `validate_ontology()` function that checks: all wurzel IDs unique, all wort IDs unique, all links reference existing IDs, etymology chains have ≥1 stage, source_urls present | 1h |
| No source manifest | Raw data versions not recorded | Create `tools/source-manifest.yaml` with URLs + checksums for all raw data files | 30min |
| `schema.sql` has no ontology tables | Ontology exists only in JSON, not in SQLite | **Defer to Phase 1.** Document as planned debt. For Phase 0, JSON is sufficient. | 0h now |
| `json_patch` SQLite function used in Kaikki upsert | Custom function defined somewhere in build-db.py (not visible in reviewed code) | Verify it exists and works. If missing, the Kaikki merge may silently drop source tracking. | 30min |
| Single-word clusters bloat the JSON | 251 clusters with only 1 word add ~60KB to ontology.json | Currently the loader filters these client-side (`minClusterSize: 2`). Consider filtering in the export instead to reduce file size. | 30min |

### 4.3 Rendering / Performance Debt

| Debt Item | Current State | Fix | Effort |
|-----------|--------------|-----|--------|
| Canvas texture per word label | 600+ individual 512×256 canvases | **Phase 0 acceptable.** Document as Phase 1 debt: switch to CSS2DRenderer or shared texture atlas. | 0h now |
| No render-on-demand | Renders every frame even when static | Add dirty flag: only render when camera moves, animation active, or card state changes. Save significant battery on mobile. | 1-2h |
| No instanced rendering | 600+ individual box meshes for word pillars | Convert to InstancedMesh with per-instance colour. One draw call instead of 600. | 1-2h |
| Bundle size 517KB | Three.js is the bulk; target was 300KB | Tree-shake Three.js imports. Currently may be importing the entire library. Check that only used modules are bundled. Vite should handle this with proper imports. | 1h |
| No POS-specific meshes | All words are identical grey pillars | Add shape variation: nouns=cubes, verbs=octahedra, adjectives=low-poly spheres, adverbs=tetrahedra. Quick visual improvement. | 1-2h |

### 4.4 UX Polish Debt

| Debt Item | Current State | Fix | Effort |
|-----------|--------------|-----|--------|
| No hover effects | Objects don't react to mouse proximity | Add scale-up (1.0→1.15) + emissive increase on raycast hover. Use `pointermove` event. | 1h |
| No terrain variation | Flat blue-grey ground plane | Add Perlin noise vertex displacement + height-based vertex colours (green hills). Simple but makes the world feel more natural. | 2h |
| No path markers between root and words | Derivation paths not visible | Add instanced small spheres along lines from monument to word pillars. | 1h |
| Card has no animation for segment split | Segments will just appear | Add CSS transition: segments start merged, gap grows over 300ms. | 30min |

---

## 5. Updated ontology.json Schema (After Enrichment)

```json
{
  "version": 2,
  "build_date": "2026-03-20",
  "source_manifest": {
    "kaikki_version": "2026-01",
    "freedict_version": "2024-01",
    "cefr_source": "goethe_a1a2_community"
  },
  "stats": {
    "total_clusters": 350,
    "multi_word_clusters": 125,
    "total_words": 640,
    "total_compounds": 52,
    "words_with_etymology_chain": 180,
    "words_with_decomposition": 320,
    "words_with_source_urls": 640
  },
  "clusters": [
    {
      "wurzel": {
        "id": "r-0",
        "form": "fahr",
        "meaning_de": "",
        "meaning_en": "to drive, to travel",
        "origin_lang": "Proto-Germanic",
        "proto_form": "*faraną",
        "etymology_chain": [
          {"stage": "gem-pro", "form": "*faraną", "lang_name": "Proto-Germanic", "is_reconstructed": true},
          {"stage": "goh", "form": "faran", "lang_name": "OHG", "is_reconstructed": false},
          {"stage": "gmh", "form": "varn", "lang_name": "MHG", "is_reconstructed": false},
          {"stage": "nhg", "form": "fahren", "lang_name": "Modern German", "is_reconstructed": false}
        ],
        "cognates": [
          {"language": "English", "form": "fare"},
          {"language": "Dutch", "form": "varen"}
        ],
        "borrowing_info": null,
        "source_urls": {
          "dwds_etymology": "https://www.dwds.de/wb/etymwb/fahren"
        }
      },
      "words": [
        {
          "id": "fahren|VERB",
          "lemma": "fahren",
          "pos": "VERB",
          "ipa": "/ˈfaːʁən/",
          "cefr_level": "A1",
          "definition_en": "to drive; to travel; to go (by vehicle)",
          "definition_de": "sich mit einem Fahrzeug fortbewegen",
          "segments": [
            {"form": "fahr", "type": "root", "function": ""},
            {"form": "en", "type": "suffix", "function": "infinitive"}
          ],
          "source_urls": {
            "wiktionary": "https://de.wiktionary.org/wiki/fahren",
            "dwds": "https://www.dwds.de/wb/fahren"
          }
        },
        {
          "id": "Erfahrung|NOUN",
          "lemma": "Erfahrung",
          "pos": "NOUN",
          "ipa": "/ɛɐ̯ˈfaːʁʊŋ/",
          "cefr_level": "A2",
          "definition_en": "experience",
          "definition_de": "Kenntnis, die durch eigenes Erleben gewonnen wird",
          "segments": [
            {"form": "er", "type": "prefix", "function": "inseparable"},
            {"form": "fahr", "type": "root", "function": ""},
            {"form": "ung", "type": "suffix", "function": "→ NOUN"}
          ],
          "source_urls": {
            "wiktionary": "https://de.wiktionary.org/wiki/Erfahrung",
            "dwds": "https://www.dwds.de/wb/Erfahrung"
          }
        }
      ],
      "links": [...],
      "compounds": [...]
    }
  ]
}
```

---

## 6. Updated Success Criteria Checklist

After completing Weeks 1-3:

- [x] 3D world with root islands and word-objects at 30+ fps on mobile
- [ ] **Morphological decomposition:** colour-coded prefix/root/suffix segments on word card _(Week 1 data + Week 2 UI)_
- [ ] **Etymology chain:** vertical timeline (NHG → ... → PIE) on island view _(Week 1 data + Week 2 UI)_
- [ ] **Search bar:** type a word, camera flies to it, card opens _(Week 2)_
- [x] Navigation feels like exploration
- [x] 600+ lexemes present with definitions
- [ ] **Source citations** visible on every card _(Week 1 data + Week 2 UI)_
- [x] Performance: 60fps desktop, 30+ fps mobile, load < 3s
- [x] Docker: `docker compose up` works
- [ ] **Data quality:** spot-check 50 entries, ≤5 errors _(Week 3)_
- [ ] **Code structure:** main.ts < 100 lines, InteractionManager + OntologyStore extracted _(Week 3)_
- [ ] **Hover effects** on word objects _(Week 3)_
- [ ] **POS-specific meshes** _(Week 3)_

---

## 7. What We Explicitly Defer to Phase 1

These are NOT debt — they are planned scope exclusions documented here so they don't creep in:

1. **Wave Function Collapse world generation** — Grid is sufficient for 600 words
2. **Force-directed layout** — Deferred to Phase 0.5 or Phase 1
3. **Biome terrain variation** — One terrain type for Phase 0
4. **Audio** (pronunciation, ambient) — Phase 1-2
5. **Exercises / practice mechanics** — Phase 1
6. **SRS / spaced repetition** — Phase 1-2
7. **PWA / offline / service worker** — Phase 2
8. **User accounts / contributions** — Phase 3
9. **Attestation passages** — Phase 1
10. **Oracle AI companion** — Phase 1+ (Tier 1 template engine in Phase 1, on-device LLM in Phase 2+)
11. **Ontology tables in SQLite** — Phase 1 (when we need graph queries for 2,000+ words)
12. **CSS2DRenderer / texture atlases** — Phase 1 (when word count exceeds 1,000)
13. **Dialect variants** — Phase 3+
14. **Graph database (Neo4j)** — Phase 2+ (if SQLite graph queries become too slow)

---

## 8. After Phase 0: Discussion Topics for Next Session

Once the success criteria are met, the next conversation should address:

1. **Spatial graph layout** — How to replace the grid with a layout that encodes semantic and etymological relationships spatially. Force-directed? Hyperbolic? Treemap? What algorithm produces a landscape that "feels like geography"?

2. **Large-scale data rendering** — With 2,000+ words in Phase 1, how do we handle LOD, chunked loading, visibility culling? The current "all objects in scene at startup" approach won't scale.

3. **Alternative spatial metaphors** — Is the island/monument metaphor the best one? Could we explore: underground cave systems for etymology depth, tree canopies for derivation families, rivers connecting semantic fields, vertical towers where you ascend through CEFR levels?

4. **Terrain as data** — Can the terrain itself encode information? Height = frequency, colour = semantic field, texture = historical stratum? The ground you walk on should tell you something.

5. **The Oracle (Tier 1)** — Template engine design: what templates, what slots, what data drives them. This is implementable in Phase 1 with zero ML.

---

_Last updated: 2026-03-15_
_Reference for: Phase 0 completion sprint_
