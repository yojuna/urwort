#!/usr/bin/env python3
"""
tools/export-ontology.py — Export root-word ontology for the Urwort game client.

Reads the SQLite dictionary DB + Kaikki JSONL raw data, extracts root clusters
for A1-A2 content words, and writes a static JSON file that the game loads.

Usage:
    python3 tools/export-ontology.py [--db data/urwort.db] [--out game/public/ontology.json]

Output format: ontology.json v2 — includes etymology chains, source URLs,
richer definitions, and morphological segments (Phase 0).
"""

import argparse
import json
import os
import re
import sqlite3
import sys
import urllib.parse
from collections import defaultdict
from pathlib import Path

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

CEFR_LEVELS = ("A1", "A2")
CONTENT_POS  = ("NOUN", "VERB", "ADJ", "ADV")
KAIKKI_POS_FILES = ("noun", "verb", "adj")  # no adv file from Kaikki

# Language code → human-readable name
LANG_CODE_TO_NAME = {
    "ine-pro": "PIE",
    "gem-pro": "Proto-Germanic",
    "gmw-pro": "Proto-West-Germanic",
    "got":     "Gothic",
    "osx":     "Old Saxon",
    "ang":     "Old English",
    "goh":     "OHG",
    "gmh":     "MHG",
    "nds":     "Low German",
    "non":     "Old Norse",
    "la":      "Latin",
    "grc":     "Ancient Greek",
    "fro":     "Old French",
    "fr":      "French",
    "it":      "Italian",
    "es":      "Spanish",
    "ar":      "Arabic",
    "hu":      "Hungarian",
    "en":      "English",
    "nl":      "Dutch",
    "sv":      "Swedish",
    "da":      "Danish",
    "yi":      "Yiddish",
}

# Sorted oldest → newest; used to sort etymology chains
DEPTH_ORDER = ["ine-pro", "gem-pro", "gmw-pro", "got", "osx", "ang", "goh", "gmh", "nds", "non"]

# Root forms that indicate bad/missing template data — treat as "no root found"
BAD_ROOT_FORMS = {"-", "?", "", "—", "–", ".", ",", "/", "·", "*"}


# ---------------------------------------------------------------------------
# Step 1: Load vocabulary from SQLite (with richer definitions)
# ---------------------------------------------------------------------------

def load_vocabulary(db_path: str) -> dict[str, dict]:
    """Load A1-A2 content words from the dictionary DB."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    rows = conn.execute("""
        SELECT id, lemma, pos, ipa, cefr_level, etymology,
               derived, related, compound_parts,
               translations, senses, definitions_de, frequency_class
        FROM entries
        WHERE cefr_level IN (?, ?)
          AND pos IN ('NOUN', 'VERB', 'ADJ', 'ADV')
        ORDER BY
            CASE cefr_level WHEN 'A1' THEN 0 WHEN 'A2' THEN 1 END,
            COALESCE(frequency_class, 99)
    """, CEFR_LEVELS).fetchall()

    vocab = {}
    for r in rows:
        # --- Richer English definition: prefer Kaikki glosses over FreeDict ---
        definition_en = ""
        senses_data = json.loads(r["senses"]) if r["senses"] else []
        if senses_data:
            # Walk senses to find the first one with real glosses
            for sense in senses_data[:3]:
                glosses = [g for g in sense.get("glosses", [])
                           if g and "form of" not in g.lower()
                           and "inflection of" not in g.lower()]
                if glosses:
                    definition_en = "; ".join(glosses[:2])
                    break

        if not definition_en:
            trans = json.loads(r["translations"]) if r["translations"] else []
            definition_en = trans[0][:100] if trans else ""

        # --- German definition ---
        definition_de = ""
        defs_de = json.loads(r["definitions_de"]) if r["definitions_de"] else []
        if defs_de and isinstance(defs_de[0], dict):
            definition_de = defs_de[0].get("text", "")[:150]

        vocab[r["lemma"]] = {
            "id":              r["id"],
            "lemma":           r["lemma"],
            "pos":             r["pos"],
            "ipa":             r["ipa"],
            "cefr_level":      r["cefr_level"],
            "etymology_text":  r["etymology"] or "",
            "derived":         json.loads(r["derived"])   if r["derived"]   else [],
            "related":         json.loads(r["related"])   if r["related"]   else [],
            "compound_parts":  r["compound_parts"] or "",
            "definition_en":   definition_en,
            "definition_de":   definition_de,
            "frequency_class": r["frequency_class"],
        }

    conn.close()
    print(f"[ontology] Loaded {len(vocab)} A1-A2 content words from DB")
    return vocab


# ---------------------------------------------------------------------------
# Step 2: Load etymology templates from Kaikki JSONL
# ---------------------------------------------------------------------------

def load_kaikki_etymology(raw_data_dir: str) -> dict[str, list[dict]]:
    """Load etymology_templates for all German words from Kaikki JSONL."""
    etym_map: dict[str, list[dict]] = {}

    for pos_file in KAIKKI_POS_FILES:
        path = os.path.join(raw_data_dir, "kaikki",
                            f"kaikki.org-dictionary-German-by-pos-{pos_file}.jsonl")
        if not os.path.exists(path):
            print(f"[ontology] Warning: missing {path}")
            continue

        count = 0
        with open(path, encoding="utf-8") as f:
            for line in f:
                obj = json.loads(line)
                word      = obj.get("word", "")
                templates = obj.get("etymology_templates", [])
                if templates and word and word not in etym_map:
                    etym_map[word] = templates
                    count += 1

        print(f"[ontology] Loaded {count} etymology entries from {os.path.basename(path)}")

    return etym_map


# ---------------------------------------------------------------------------
# Step 3a: Extract FULL etymology chain from structured templates
# ---------------------------------------------------------------------------

def extract_etymology(templates: list[dict], lemma: str) -> dict:
    """
    Build a full etymology chain from Kaikki etymology_templates.

    Returns:
    {
        "chain":         [{stage, form, lang_name, is_reconstructed}, ...],  # oldest first
        "cognates":      [{language, form}, ...],
        "borrowing_info": None | {from_lang, form, lang_code},
        "root":          None | {form, proto_form, lang, lang_name}  # deepest known stage
    }
    """
    chain     = []
    cognates  = []
    borrowing = None

    for t in templates:
        name = t.get("name", "")
        args = t.get("args", {})
        lang = args.get("2", "")
        form = args.get("3", "") or args.get("alt", "")
        if not lang or not form:
            continue

        form_clean = form.split(",")[0].strip()
        if not form_clean or form_clean.strip("*. ") in BAD_ROOT_FORMS:
            continue

        is_reconstructed = form_clean.startswith("*")
        lang_name        = LANG_CODE_TO_NAME.get(lang, lang)

        if name in ("inh", "inh+", "der"):
            chain.append({
                "stage":            lang,
                "form":             form_clean,
                "lang_name":        lang_name,
                "is_reconstructed": is_reconstructed,
            })
        elif name in ("bor", "bor+", "lbor", "slbor"):
            borrowing = {"from_lang": lang_name, "form": form_clean, "lang_code": lang}
            chain.append({
                "stage":            lang,
                "form":             form_clean,
                "lang_name":        lang_name,
                "is_reconstructed": is_reconstructed,
            })
        elif name == "cog":
            cognates.append({"language": lang_name, "form": form_clean})

    # Sort: oldest ancestor first (lowest DEPTH_ORDER index → front)
    def depth_key(s: dict) -> int:
        return DEPTH_ORDER.index(s["stage"]) if s["stage"] in DEPTH_ORDER else len(DEPTH_ORDER)

    chain.sort(key=depth_key)

    # Deduplicate by stage (keep first occurrence — oldest-first sort means we keep oldest)
    seen   = set()
    deduped = []
    for item in chain:
        if item["stage"] not in seen:
            seen.add(item["stage"])
            deduped.append(item)
    chain = deduped

    # Append the Modern German stage (NHG) at the end (newest)
    chain.append({
        "stage":            "nhg",
        "form":             lemma,
        "lang_name":        "Modern German",
        "is_reconstructed": False,
    })

    # Deepest root = first item if chain has more than just NHG
    root = None
    if len(chain) > 1:
        deepest = chain[0]
        root = {
            "form":       deepest["form"].lstrip("*").strip(),
            "proto_form": deepest["form"],
            "lang":       deepest["stage"],
            "lang_name":  deepest["lang_name"],
        }

    return {
        "chain":          chain,
        "cognates":       cognates[:6],
        "borrowing_info": borrowing,
        "root":           root,
    }


# ---------------------------------------------------------------------------
# Step 3b: Etymology TEXT fallback (for words with no/bad templates)
# ---------------------------------------------------------------------------

# English-language patterns (some Kaikki entries describe in English)
_EN_PGMC = re.compile(r'Proto-Germanic\s+\*?([\w\-]+)', re.I)
_EN_OHG  = re.compile(r'Old High German\s+([\w\-]+)',   re.I)
_EN_MHG  = re.compile(r'Middle High German\s+([\w\-]+)', re.I)
_EN_LAT  = re.compile(r'(?:from\s+(?:Medieval\s+)?)?Latin\s+([\w\-]+)', re.I)

# German-language patterns (many Kaikki German entries have German etymology text)
_DE_PGMC = re.compile(r'(?:ur|proto-?)?germanisch\s+\*?([\w\-]+)', re.I)
_DE_OHG  = re.compile(r'althochdeutsch\s+([\w\-]+)',    re.I)
_DE_MHG  = re.compile(r'mittelhochdeutsch\s+([\w\-]+)', re.I)
_DE_LAT  = re.compile(r'(?:mittel)?lateinisch\s+([\w\-]+)', re.I)


def extract_root_from_text(etymology_text: str) -> dict | None:
    """
    Fallback: extract the deepest recoverable root from free-text etymology.
    Tries deepest ancestor first (PGMC before OHG before MHG).
    """
    for pattern, lang, lang_name in [
        (_EN_PGMC, "gem-pro", "Proto-Germanic"),
        (_DE_PGMC, "gem-pro", "Proto-Germanic"),
        (_EN_OHG,  "goh",    "OHG"),
        (_DE_OHG,  "goh",    "OHG"),
        (_EN_MHG,  "gmh",    "MHG"),
        (_DE_MHG,  "gmh",    "MHG"),
        (_EN_LAT,  "la",     "Latin"),
        (_DE_LAT,  "la",     "Latin"),
    ]:
        m = pattern.search(etymology_text)
        if m:
            form = m.group(1).strip("*,. ")
            if form and len(form) > 1 and form not in BAD_ROOT_FORMS:
                proto = f"*{form}" if lang in ("gem-pro", "ine-pro") else form
                return {
                    "form":       form,
                    "proto_form": proto,
                    "lang":       lang,
                    "lang_name":  lang_name,
                }
    return None


# ---------------------------------------------------------------------------
# Step 4: Morphological segment decomposer
# ---------------------------------------------------------------------------

# Prefixes that always stay attached to the verb (cannot be separated)
INSEPARABLE_PREFIXES = ["be", "emp", "ent", "er", "ge", "miss", "ver", "zer",
                        "hinter", "wider", "über", "unter", "durch", "um"]

# Prefixes that form separable verbs (split off in main clauses)
SEPARABLE_PREFIXES = ["ab", "an", "auf", "aus", "bei", "ein", "mit", "nach",
                      "vor", "weg", "zu", "zurück", "fest", "frei", "her",
                      "hin", "los", "ran", "rein", "raus", "rüber", "rum",
                      "runter", "rauf", "hoch"]

# Suffixes organised by the POS of the word they form
# Only applied to words of matching POS to avoid false positives
NOUN_SUFFIXES: dict[str, dict] = {
    "ierung": {"function": "→ NOUN (f)"},
    "schaft": {"function": "→ NOUN (f)"},
    "heit":   {"function": "→ NOUN (f)"},
    "keit":   {"function": "→ NOUN (f)"},
    "ling":   {"function": "→ NOUN (m)"},
    "chen":   {"function": "→ NOUN (n, diminutive)"},
    "lein":   {"function": "→ NOUN (n, diminutive)"},
    "ung":    {"function": "→ NOUN (f)"},
    "nis":    {"function": "→ NOUN"},
    "tum":    {"function": "→ NOUN (n)"},
}

ADJ_SUFFIXES: dict[str, dict] = {
    "isch":  {"function": "→ ADJ"},
    "lich":  {"function": "→ ADJ"},
    "haft":  {"function": "→ ADJ"},
    "sam":   {"function": "→ ADJ"},
    "bar":   {"function": "→ ADJ (capable of)"},
    "voll":  {"function": "→ ADJ (full of)"},
    "los":   {"function": "→ ADJ (without)"},
    "ig":    {"function": "→ ADJ"},
}

VERB_SUFFIXES: dict[str, dict] = {
    "ieren": {"function": "infinitive (foreign-origin)"},
    "eln":   {"function": "infinitive (frequentative)"},
    "ern":   {"function": "infinitive (frequentative)"},
    "en":    {"function": "infinitive"},
    "n":     {"function": "infinitive"},
}

# Words where common suffixes are part of the root, NOT morphological suffixes.
# Without this list, "Wasser" → "wass" + "er", "Fenster" → "fenst" + "er", etc.
_ER_EXCEPTIONS = {
    "wasser", "fenster", "butter", "winter", "sommer", "wetter", "zimmer",
    "hammer", "muster", "alter", "kloster", "lager", "meter", "bier",
    "finger", "mutter", "vater", "bruder", "schwester", "leiter",
    "computer", "theater", "charakter", "semester", "register",
}
_IG_EXCEPTIONS = {
    "könig", "honig", "essig",
}
_ER_NOUN_SUFFIX: dict = {"function": "→ NOUN (m, agent/tool)"}


def decompose_morphology(lemma: str, pos: str) -> list[dict] | None:
    """
    Heuristically decompose a word into morphological segments.

    Returns a list of segment dicts [{form, type, function}, ...]
    or None if decomposition isn't confident.

    Types: "prefix" | "root" | "suffix"
    """
    word     = lemma.lower()
    segments = []

    # ── Step 1: Check for known prefix (longest-match first) ────────────────
    prefix_found: str | None = None
    all_prefixes = sorted(
        INSEPARABLE_PREFIXES + SEPARABLE_PREFIXES, key=len, reverse=True
    )

    for p in all_prefixes:
        # Require at least 2 chars remaining after prefix to avoid over-stripping
        if word.startswith(p) and len(word) > len(p) + 2:
            prefix_found = p
            word = word[len(p):]
            sep  = "separable" if p in SEPARABLE_PREFIXES else "inseparable"
            segments.append({"form": p, "type": "prefix", "function": sep})
            break

    # ── Step 2: Check for known suffix (POS-gated, longest-match first) ─────
    suffix_found: str | None = None

    # Choose the suffix table matching the word's POS
    if pos == "NOUN":
        suffix_tables = [NOUN_SUFFIXES]
        # Also allow -er suffix for nouns (agent: Lehrer, Spieler, etc.)
        # but only if stem ≥ 3 chars and word isn't in exception list
        use_er_noun = (
            word.endswith("er")
            and len(word) > 4
            and lemma.lower() not in _ER_EXCEPTIONS
        )
    elif pos == "ADJ":
        suffix_tables = [ADJ_SUFFIXES]
        use_er_noun   = False
    elif pos == "VERB":
        suffix_tables = [VERB_SUFFIXES]
        use_er_noun   = False
    else:  # ADV or other
        suffix_tables = []
        use_er_noun   = False

    for table in suffix_tables:
        for s in sorted(table.keys(), key=len, reverse=True):
            # Skip -ig on exception words
            if s == "ig" and lemma.lower() in _IG_EXCEPTIONS:
                continue
            # Require stem of at least 2 chars after removing suffix
            if word.endswith(s) and len(word) > len(s) + 1:
                suffix_found = s
                word = word[: -len(s)]
                info = table[s]
                segments.append({
                    "form":     s,
                    "type":     "suffix",
                    "function": info["function"],
                })
                break
        if suffix_found:
            break

    # -er noun suffix (separate because it's conditional on exceptions list)
    if not suffix_found and use_er_noun:
        suffix_found = "er"
        word = word[:-2]
        segments.append({
            "form": "er", "type": "suffix", "function": _ER_NOUN_SUFFIX["function"],
        })

    # ── Step 3: Whatever remains is the root/stem ────────────────────────────
    if word:
        root_seg = {"form": word, "type": "root", "function": ""}
        # Insert root after prefix (index 1) or at front
        insert_at = 1 if prefix_found else 0
        segments.insert(insert_at, root_seg)

    # ── Decision: return decomposition only if we actually split something ───
    if prefix_found or suffix_found:
        return segments

    # Word is a simple root — return single segment
    return [{"form": lemma, "type": "root", "function": ""}]


# ---------------------------------------------------------------------------
# Step 5: Detect compound words
# ---------------------------------------------------------------------------

def detect_compound(lemma: str, templates: list[dict],
                    etymology_text: str) -> list[str] | None:
    """Detect if a word is a compound and return its parts."""
    for t in templates:
        if t.get("name") == "compound":
            args  = t.get("args", {})
            parts = [args.get(str(i), "").strip() for i in range(2, 10)]
            parts = [p for p in parts if p]
            if len(parts) >= 2:
                return parts

    m = re.match(r'^(\w+)\s*\+\s*(\w+)', etymology_text)
    if m:
        return [m.group(1), m.group(2)]

    return None


# ---------------------------------------------------------------------------
# Step 5: Build root clusters
# ---------------------------------------------------------------------------

def build_root_clusters(
    vocab:    dict[str, dict],
    etym_map: dict[str, list[dict]],
) -> list[dict]:
    """
    Group vocabulary words by shared etymological root.

    Phase A: structured template extraction + text fallback
    Phase B: derived-link adoption
    Phase C: stem-prefix grouping for remaining words (best-effort)
    Phase D: build final output clusters
    """

    # ── Phase A ──────────────────────────────────────────────────────────────
    root_key_to_words: dict[str, list[dict]]  = defaultdict(list)
    root_key_to_info:  dict[str, dict]        = {}   # key → {root, etym}
    unrooted:          list[dict]             = []

    for lemma, entry in vocab.items():
        templates = etym_map.get(lemma, [])
        etym      = extract_etymology(templates, lemma)
        root_info = etym["root"]

        # Text fallback: if templates gave no root, try free-text etymology
        if root_info is None and entry["etymology_text"]:
            root_info = extract_root_from_text(entry["etymology_text"])

        compound_parts = detect_compound(lemma, templates, entry["etymology_text"])

        word_data = {
            "id":             entry["id"],
            "lemma":          entry["lemma"],
            "pos":            entry["pos"],
            "ipa":            entry.get("ipa"),
            "cefr_level":     entry["cefr_level"],
            "definition_en":  entry["definition_en"],
            "definition_de":  entry.get("definition_de", ""),
            "frequency_class": entry.get("frequency_class"),
            "compound_parts": compound_parts,
            "segments":       decompose_morphology(lemma, entry["pos"]),
            "source_urls": {
                "wiktionary": (
                    f"https://de.wiktionary.org/wiki/{urllib.parse.quote(lemma)}"
                ),
                "dwds": (
                    f"https://www.dwds.de/wb/{urllib.parse.quote(lemma)}"
                ),
            },
            "_etym": etym,  # internal — stripped before JSON output
        }

        if root_info:
            key = f"{root_info['lang']}:{root_info['form']}"
            root_key_to_words[key].append(word_data)
            if key not in root_key_to_info:
                root_key_to_info[key] = {"root": root_info, "etym": etym}
        else:
            unrooted.append(word_data)

    print(f"[ontology] Phase A — Rooted: "
          f"{sum(len(ws) for ws in root_key_to_words.values())} words "
          f"in {len(root_key_to_words)} root groups")
    print(f"[ontology] Phase A — Unrooted: {len(unrooted)} words")

    # ── Phase B ──────────────────────────────────────────────────────────────
    # Adopt unrooted words whose lemma appears in another word's derived list
    lemma_to_root_key: dict[str, str] = {}
    for key, words in root_key_to_words.items():
        for w in words:
            lemma_to_root_key[w["lemma"]] = key

    adopted        = 0
    still_unrooted = []

    for word in unrooted:
        found = False

        # Check if this word appears in any vocab entry's derived list
        for lemma, entry in vocab.items():
            if lemma == word["lemma"]:
                continue
            if word["lemma"] in entry["derived"] and lemma in lemma_to_root_key:
                key = lemma_to_root_key[lemma]
                root_key_to_words[key].append(word)
                lemma_to_root_key[word["lemma"]] = key
                adopted += 1
                found = True
                break

        # Check if any of this word's derived forms are already rooted
        if not found:
            for d in vocab.get(word["lemma"], {}).get("derived", []):
                if d in lemma_to_root_key:
                    key = lemma_to_root_key[d]
                    root_key_to_words[key].append(word)
                    lemma_to_root_key[word["lemma"]] = key
                    adopted += 1
                    found = True
                    break

        if not found:
            still_unrooted.append(word)

    print(f"[ontology] Phase B — Adopted: {adopted}")
    print(f"[ontology] Phase B — Still unrooted: {len(still_unrooted)}")

    # ── Phase C ──────────────────────────────────────────────────────────────
    # Group remaining words by first 4-letter stem (best-effort, Modern German)
    # Only creates groups of 2+ — genuine singletons become individual clusters.
    stem_groups: dict[str, list[dict]] = defaultdict(list)
    for w in still_unrooted:
        stem = w["lemma"][:4].lower()
        stem_groups[stem].append(w)

    stem_groups_multi  = {s: ws for s, ws in stem_groups.items() if len(ws) >= 2}
    stem_groups_single = {s: ws for s, ws in stem_groups.items() if len(ws) == 1}

    for stem, words in stem_groups_multi.items():
        key = f"nhg:{stem}"
        root_key_to_words[key] = words
        root_key_to_info[key] = {
            "root": {
                "form":       stem,
                "proto_form": None,
                "lang":       "nhg",
                "lang_name":  "Modern German",
            },
            "etym": None,
        }

    for stem, words in stem_groups_single.items():
        w   = words[0]
        key = f"nhg:{w['lemma'].lower()}"
        root_key_to_words[key] = [w]
        root_key_to_info[key] = {
            "root": {
                "form":       w["lemma"].lower()[:5],
                "proto_form": None,
                "lang":       "nhg",
                "lang_name":  "Modern German",
            },
            "etym": None,
        }

    print(f"[ontology] Phase C — Stem groups (2+): {len(stem_groups_multi)}  "
          f"Singles: {len(stem_groups_single)}")

    # ── Phase D ──────────────────────────────────────────────────────────────
    clusters   = []
    cluster_id = 0

    for key, words in sorted(root_key_to_words.items(), key=lambda x: -len(x[1])):
        if not words:
            continue

        info      = root_key_to_info.get(key, {
            "root": {"form": key, "proto_form": None, "lang": "?", "lang_name": "Unknown"},
            "etym": None,
        })
        root_info = info["root"]

        # Pick the most basic word (A1 > A2, then lowest frequency_class)
        basic_word = min(
            words,
            key=lambda w: ({"A1": 0, "A2": 1}.get(w["cefr_level"], 2),
                           w.get("frequency_class") or 99),
        )

        # Pick the richest etymology from the cluster (longest chain)
        best_etym = max(
            (w["_etym"] for w in words),
            key=lambda e: len(e.get("chain", [])),
            default={},
        )

        # Build wurzel
        wurzel = {
            "id":              f"r-{cluster_id}",
            "form":            root_info["form"],
            "meaning_de":      "",
            "meaning_en":      basic_word.get("definition_en", ""),
            "origin_lang":     root_info["lang_name"],
            "proto_form":      root_info.get("proto_form"),
            # New in v2:
            "etymology_chain": best_etym.get("chain", []),
            "cognates":        best_etym.get("cognates", []),
            "borrowing_info":  best_etym.get("borrowing_info"),
            "source_urls": {
                "dwds_etymology": (
                    f"https://www.dwds.de/wb/etymwb/"
                    f"{urllib.parse.quote(basic_word['lemma'])}"
                ),
            },
        }

        # Build word list (without internal _etym field)
        wort_list = []
        for w in words:
            segs = w.get("segments") or []
            wort_list.append({
                "id":            w["id"],
                "lemma":         w["lemma"],
                "pos":           w["pos"],
                "ipa":           w.get("ipa"),
                "cefr_level":    w.get("cefr_level"),
                "definition_en": w.get("definition_en", ""),
                "definition_de": w.get("definition_de", ""),
                # Only include segments if we actually decomposed something
                # (i.e., more than one segment, or the single segment has a prefix/suffix)
                "segments":      segs if len(segs) > 1 else None,
                "source_urls":   w.get("source_urls", {}),
            })

        links = [
            {"wurzel_id": wurzel["id"], "wort_id": w["id"]}
            for w in wort_list
        ]

        compounds = []
        for w in words:
            if w.get("compound_parts"):
                compounds.append({
                    "compound_wort_id":    w["id"],
                    "component_wort_ids":  [],
                    "split_display":       "·".join(w["compound_parts"]),
                })

        clusters.append({
            "wurzel":    wurzel,
            "words":     wort_list,
            "links":     links,
            "compounds": compounds,
        })
        cluster_id += 1

    return clusters


# ---------------------------------------------------------------------------
# Step 6: Resolve cross-cluster compound links
# ---------------------------------------------------------------------------

def resolve_compound_links(clusters: list[dict]) -> list[dict]:
    """Map compound component lemmas to their word IDs across clusters."""
    lemma_to_id: dict[str, str] = {}
    for cluster in clusters:
        for w in cluster["words"]:
            lemma_to_id[w["lemma"]] = w["id"]

    bridge_count = 0
    for cluster in clusters:
        for compound in cluster["compounds"]:
            parts = compound["split_display"].split("·")
            ids   = []
            for part in parts:
                wid = lemma_to_id.get(part) or lemma_to_id.get(part.capitalize())
                if wid:
                    ids.append(wid)
            compound["component_wort_ids"] = ids
            if len(ids) >= 2:
                bridge_count += 1

    print(f"[ontology] Resolved {bridge_count} compound bridges")
    return clusters


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_and_print_stats(clusters: list[dict]) -> None:
    """Print quality stats and flag potential issues."""
    total_words    = sum(len(c["words"]) for c in clusters)
    multi_clusters = [c for c in clusters if len(c["words"]) >= 2]
    words_in_multi = sum(len(c["words"]) for c in multi_clusters)

    chains_2plus = [
        c for c in clusters
        if len(c["wurzel"].get("etymology_chain", [])) >= 2
    ]
    words_sourced = sum(
        1 for c in clusters for w in c["words"] if w.get("source_urls")
    )
    words_def_en  = sum(
        1 for c in clusters for w in c["words"] if w.get("definition_en")
    )
    words_segmented = sum(
        1 for c in clusters for w in c["words"] if w.get("segments")
    )

    print(f"\n{'─'*55}")
    print(f"  Clusters total           : {len(clusters)}")
    print(f"  Multi-word clusters (≥2) : {len(multi_clusters)} "
          f"({words_in_multi} words)")
    print(f"  Single-word clusters     : {len(clusters) - len(multi_clusters)}")
    print(f"  Total words              : {total_words}")
    print(f"  Clusters with chain ≥2   : {len(chains_2plus)}")
    print(f"  Words with source URLs   : {words_sourced} / {total_words}")
    print(f"  Words with EN definition : {words_def_en} / {total_words}")
    print(f"  Words with segments      : {words_segmented} / {total_words}")
    print(f"{'─'*55}\n")

    # Spot-check 5 multi-word clusters
    print("  Sample multi-word clusters:")
    for c in sorted(multi_clusters, key=lambda x: -len(x["words"]))[:5]:
        chain_len = len(c["wurzel"].get("etymology_chain", []))
        lemmas    = [w["lemma"] for w in c["words"]]
        print(f"    [{c['wurzel']['origin_lang']:18s}] "
              f"{c['wurzel']['form']:15s} "
              f"chain={chain_len}  words={lemmas}")
    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Export Urwort ontology JSON (v2)")
    parser.add_argument("--db",       default="data/urwort.db",
                        help="Path to SQLite dictionary DB")
    parser.add_argument("--raw-data", default="raw-data",
                        help="Path to raw-data directory")
    parser.add_argument("--out",      default="game/public/ontology.json",
                        help="Output JSON path")
    args = parser.parse_args()

    base_dir     = Path(__file__).resolve().parent.parent
    db_path      = base_dir / args.db
    raw_data_dir = base_dir / args.raw_data
    out_path     = base_dir / args.out

    if not db_path.exists():
        print(f"ERROR: Database not found: {db_path}", file=sys.stderr)
        sys.exit(1)

    # Run pipeline
    vocab    = load_vocabulary(str(db_path))
    etym_map = load_kaikki_etymology(str(raw_data_dir))
    clusters = build_root_clusters(vocab, etym_map)
    clusters = resolve_compound_links(clusters)

    validate_and_print_stats(clusters)

    multi_word = [c for c in clusters if len(c["words"]) >= 2]

    output = {
        "version": 2,
        "stats": {
            "total_clusters":              len(clusters),
            "multi_word_clusters":         len(multi_word),
            "total_words":                 sum(len(c["words"]) for c in clusters),
            "total_compounds":             sum(len(c["compounds"]) for c in clusters),
            "clusters_with_etymology_chain": sum(
                1 for c in clusters
                if len(c["wurzel"].get("etymology_chain", [])) >= 2
            ),
            "words_with_segments": sum(
                1 for c in clusters for w in c["words"] if w.get("segments")
            ),
        },
        "clusters": clusters,
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=None, separators=(",", ":"))

    size_kb = out_path.stat().st_size / 1024
    print(f"[ontology] Written {out_path} ({size_kb:.0f} KB)")
    print(f"[ontology] Done!")


if __name__ == "__main__":
    main()
