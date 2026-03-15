#!/usr/bin/env python3
"""
tools/export-ontology.py — Export root-word ontology for the Urwort game client.

Reads the SQLite dictionary DB + Kaikki JSONL raw data, extracts root clusters
for A1-A2 content words, and writes a static JSON file that the game loads.

Usage:
    python3 tools/export-ontology.py [--db data/urwort.db] [--out game/public/ontology.json]

Output format matches the game's RootCluster[] TypeScript type.
"""

import argparse
import json
import os
import re
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

CEFR_LEVELS = ("A1", "A2")
CONTENT_POS = ("NOUN", "VERB", "ADJ", "ADV")
KAIKKI_POS_FILES = ("noun", "verb", "adj")  # no adv file available

# Language codes for etymology chain (oldest → newest)
PROTO_LANGS = {
    "ine-pro": "PIE",
    "gem-pro": "Proto-Germanic",
    "gmw-pro": "Proto-West-Germanic",
    "goh": "OHG",
    "gmh": "MHG",
}

# ---------------------------------------------------------------------------
# Step 1: Load vocabulary seed from SQLite
# ---------------------------------------------------------------------------

def load_vocabulary(db_path: str) -> dict[str, dict]:
    """Load A1-A2 content words from the dictionary DB."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    rows = conn.execute("""
        SELECT id, lemma, pos, ipa, cefr_level, etymology,
               derived, related, compound_parts,
               translations, frequency_class
        FROM entries
        WHERE cefr_level IN (?, ?)
        AND pos IN ('NOUN', 'VERB', 'ADJ', 'ADV')
        ORDER BY
            CASE cefr_level WHEN 'A1' THEN 0 WHEN 'A2' THEN 1 END,
            COALESCE(frequency_class, 99)
    """, CEFR_LEVELS).fetchall()

    vocab = {}
    for r in rows:
        vocab[r["lemma"]] = {
            "id": r["id"],
            "lemma": r["lemma"],
            "pos": r["pos"],
            "ipa": r["ipa"],
            "cefr_level": r["cefr_level"],
            "etymology_text": r["etymology"] or "",
            "derived": json.loads(r["derived"]) if r["derived"] else [],
            "related": json.loads(r["related"]) if r["related"] else [],
            "compound_parts": r["compound_parts"] or "",
            "translations": json.loads(r["translations"]) if r["translations"] else [],
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
                word = obj.get("word", "")
                templates = obj.get("etymology_templates", [])
                if templates and word:
                    # Keep the first (most complete) entry per word
                    if word not in etym_map:
                        etym_map[word] = templates
                        count += 1

        print(f"[ontology] Loaded {count} etymology entries from {os.path.basename(path)}")

    return etym_map


# ---------------------------------------------------------------------------
# Step 3: Extract root from etymology templates
# ---------------------------------------------------------------------------

def extract_root(templates: list[dict]) -> dict | None:
    """
    Extract the deepest ancestral root from etymology_templates.

    Priority: PIE root > Proto-Germanic > OHG > MHG
    Returns: {form, lang, lang_name} or None
    """
    # First: look for explicit 'root' template (best quality)
    for t in templates:
        if t.get("name") == "root":
            args = t.get("args", {})
            lang = args.get("2", "")
            form = args.get("3", "")
            if lang and form:
                return {
                    "form": form.strip("*").strip(),
                    "proto_form": form.strip(),
                    "lang": lang,
                    "lang_name": PROTO_LANGS.get(lang, lang),
                }

    # Second: walk 'inh' (inherited) and 'der' (derived-from) chains
    # Find the deepest ancestor
    best = None
    best_depth = -1

    depth_order = list(PROTO_LANGS.keys())  # ine-pro is deepest

    for t in templates:
        name = t.get("name", "")
        if name not in ("inh", "inh+", "der"):
            continue
        args = t.get("args", {})
        lang = args.get("2", "")
        form = args.get("3", "")
        if not lang or not form:
            continue

        depth = depth_order.index(lang) if lang in depth_order else -1
        if depth > best_depth:
            best_depth = depth
            best = {
                "form": form.split(",")[0].strip("*").strip(),
                "proto_form": form.split(",")[0].strip(),
                "lang": lang,
                "lang_name": PROTO_LANGS.get(lang, lang),
            }

    return best


# ---------------------------------------------------------------------------
# Step 4: Detect compounds
# ---------------------------------------------------------------------------

def detect_compound(lemma: str, templates: list[dict],
                    etymology_text: str) -> list[str] | None:
    """
    Detect if a word is a compound and return its parts.
    Uses Kaikki 'compound' templates or etymology text patterns.
    """
    # Check for 'compound' template
    for t in templates:
        if t.get("name") == "compound":
            args = t.get("args", {})
            parts = []
            for i in range(2, 10):
                part = args.get(str(i), "").strip()
                if part:
                    parts.append(part)
            if len(parts) >= 2:
                return parts

    # Fallback: parse etymology text for "X + Y" pattern
    match = re.match(r'^(\w+)\s*\+\s*(\w+)', etymology_text)
    if match:
        return [match.group(1), match.group(2)]

    return None


# ---------------------------------------------------------------------------
# Step 5: Build root clusters
# ---------------------------------------------------------------------------

def build_root_clusters(
    vocab: dict[str, dict],
    etym_map: dict[str, list[dict]],
) -> list[dict]:
    """
    Group vocabulary words by shared root.

    Strategy:
    1. For each vocab word, extract root from etymology.
    2. Group words sharing the same root form + lang.
    3. For words without a clear root, try to match via
       the 'derived' field of other words.
    """
    # --- Phase A: Direct root extraction ---
    root_key_to_words: dict[str, list[dict]] = defaultdict(list)
    root_key_to_info: dict[str, dict] = {}
    unrooted: list[dict] = []

    for lemma, entry in vocab.items():
        templates = etym_map.get(lemma, [])
        root_info = extract_root(templates)

        # Detect compound
        compound_parts = detect_compound(
            lemma, templates, entry["etymology_text"])

        word_data = {
            "id": entry["id"],
            "lemma": entry["lemma"],
            "pos": entry["pos"],
            "ipa": entry.get("ipa"),
            "cefr_level": entry["cefr_level"],
            "definition_en": (entry["translations"][0][:80]
                              if entry["translations"] else ""),
            "frequency_class": entry.get("frequency_class"),
            "compound_parts": compound_parts,
        }

        if root_info:
            key = f"{root_info['lang']}:{root_info['form']}"
            root_key_to_words[key].append(word_data)
            if key not in root_key_to_info:
                root_key_to_info[key] = root_info
        else:
            unrooted.append(word_data)

    print(f"[ontology] Rooted: {sum(len(ws) for ws in root_key_to_words.values())} words "
          f"in {len(root_key_to_words)} root groups")
    print(f"[ontology] Unrooted: {len(unrooted)} words")

    # --- Phase B: Try to adopt unrooted words via 'derived' backlinks ---
    lemma_to_root_key: dict[str, str] = {}
    for key, words in root_key_to_words.items():
        for w in words:
            lemma_to_root_key[w["lemma"]] = key

    adopted = 0
    still_unrooted = []
    for word in unrooted:
        # Check if this word appears in another word's derived list
        found = False
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

        # Check if any of this word's derived words are rooted
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

    print(f"[ontology] Adopted via derived links: {adopted}")
    print(f"[ontology] Still unrooted: {len(still_unrooted)}")

    # --- Phase C: Create a catch-all cluster for unrooted words ---
    # Group remaining by first 3 letters as a rough grouping
    if still_unrooted:
        stem_groups: dict[str, list[dict]] = defaultdict(list)
        for w in still_unrooted:
            stem = w["lemma"][:4].lower()
            stem_groups[stem].append(w)

        for stem, words in stem_groups.items():
            key = f"nhg:{stem}"
            root_key_to_words[key] = words
            root_key_to_info[key] = {
                "form": stem,
                "proto_form": None,
                "lang": "nhg",
                "lang_name": "Modern German",
            }

    # --- Phase D: Build output clusters ---
    clusters = []
    cluster_id = 0

    for key, words in sorted(root_key_to_words.items(),
                              key=lambda x: -len(x[1])):
        if len(words) < 1:
            continue

        root_info = root_key_to_info.get(key, {
            "form": key, "proto_form": None,
            "lang": "?", "lang_name": "Unknown",
        })

        # Build wurzel
        wurzel = {
            "id": f"r-{cluster_id}",
            "form": root_info["form"],
            "meaning_de": "",
            "meaning_en": "",
            "origin_lang": root_info["lang_name"],
            "proto_form": root_info.get("proto_form"),
        }

        # Try to infer root meaning from the most basic word
        basic_word = min(words,
                         key=lambda w: ({"A1": 0, "A2": 1}.get(w["cefr_level"], 2),
                                        w.get("frequency_class") or 99))
        if basic_word["definition_en"]:
            wurzel["meaning_en"] = basic_word["definition_en"]

        # Build wort list
        wort_list = []
        for w in words:
            wort_list.append({
                "id": w["id"],
                "lemma": w["lemma"],
                "pos": w["pos"],
                "ipa": w.get("ipa"),
                "cefr_level": w.get("cefr_level"),
                "definition_en": w.get("definition_en", ""),
            })

        # Build links
        links = [
            {
                "wurzel_id": wurzel["id"],
                "wort_id": w["id"],
            }
            for w in wort_list
        ]

        # Build compound links
        compounds = []
        for w in words:
            if w.get("compound_parts"):
                compounds.append({
                    "compound_wort_id": w["id"],
                    "component_wort_ids": [],  # resolved later if parts are in vocab
                    "split_display": "·".join(w["compound_parts"]),
                })

        cluster = {
            "wurzel": wurzel,
            "words": wort_list,
            "links": links,
            "compounds": compounds,
        }

        clusters.append(cluster)
        cluster_id += 1

    return clusters


# ---------------------------------------------------------------------------
# Step 6: Resolve cross-cluster compound links
# ---------------------------------------------------------------------------

def resolve_compound_links(clusters: list[dict]) -> list[dict]:
    """
    For compounds whose parts belong to different root clusters,
    record the component_wort_ids so the game can draw bridges.
    """
    # Build lemma → wort_id lookup
    lemma_to_id: dict[str, str] = {}
    for cluster in clusters:
        for w in cluster["words"]:
            lemma_to_id[w["lemma"]] = w["id"]

    bridge_count = 0
    for cluster in clusters:
        for compound in cluster["compounds"]:
            parts = compound["split_display"].split("·")
            ids = []
            for part in parts:
                # Try exact match, then capitalised
                wid = lemma_to_id.get(part) or lemma_to_id.get(part.capitalize())
                if wid:
                    ids.append(wid)
            compound["component_wort_ids"] = ids
            if len(ids) >= 2:
                bridge_count += 1

    print(f"[ontology] Resolved {bridge_count} compound bridges")
    return clusters


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Export Urwort ontology JSON")
    parser.add_argument("--db", default="data/urwort.db",
                        help="Path to SQLite dictionary DB")
    parser.add_argument("--raw-data", default="raw-data",
                        help="Path to raw-data directory")
    parser.add_argument("--out", default="game/public/ontology.json",
                        help="Output JSON path")
    args = parser.parse_args()

    # Resolve paths relative to script location
    base_dir = Path(__file__).resolve().parent.parent
    db_path = base_dir / args.db
    raw_data_dir = base_dir / args.raw_data
    out_path = base_dir / args.out

    if not db_path.exists():
        print(f"ERROR: Database not found: {db_path}", file=sys.stderr)
        sys.exit(1)

    # Run pipeline
    vocab = load_vocabulary(str(db_path))
    etym_map = load_kaikki_etymology(str(raw_data_dir))
    clusters = build_root_clusters(vocab, etym_map)
    clusters = resolve_compound_links(clusters)

    # Filter: only keep clusters with 2+ words (single-word clusters aren't interesting)
    multi_word = [c for c in clusters if len(c["words"]) >= 2]
    single_word = [c for c in clusters if len(c["words"]) == 1]
    print(f"\n[ontology] Clusters with 2+ words: {len(multi_word)} "
          f"({sum(len(c['words']) for c in multi_word)} words)")
    print(f"[ontology] Single-word clusters: {len(single_word)} (kept as-is)")

    # Output
    output = {
        "version": 1,
        "stats": {
            "total_clusters": len(clusters),
            "multi_word_clusters": len(multi_word),
            "total_words": sum(len(c["words"]) for c in clusters),
            "total_compounds": sum(len(c["compounds"]) for c in clusters),
        },
        "clusters": clusters,
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=None,
                  separators=(",", ":"))

    size_kb = out_path.stat().st_size / 1024
    print(f"\n[ontology] Written {out_path} ({size_kb:.0f} KB)")
    print(f"[ontology] Done!")


if __name__ == "__main__":
    main()
