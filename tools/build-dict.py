#!/usr/bin/env python3
"""
tools/build-dict.py

Reads two FreeDict StarDict dictionaries and outputs per-letter JSON chunks:

  Sources:
    raw-data/freedict/deu-eng/  →  DE→EN  (517k headword entries)
    raw-data/freedict/eng-deu/  →  EN→DE  (460k headword entries)

  Output:
    src/data/de-en/{a..z,misc}.json   German  → English
    src/data/en-de/{a..z,misc}.json   English → German

Both dicts use the same StarDict HTML format:
  - <font color="green">pos info</font>  e.g. "male, noun, sg" or "verb, intr"
  - <div lang="en"> or <div lang="de">   for translations
  - <div class="example">               for bilingual examples
  - Multiple idx entries per headword   (one per sense — merged by this script)

Entry schema (Option B — index + examples bundled):
{
  "id":     "de_Haus",
  "w":      "Haus",
  "pos":    "noun",
  "gender": "n",
  "meta":   { "freq": null, "level": null },
  "l1": {
    "en":  ["house", "home", "building"],
    "ex":  ["Das Haus ist groß. :: The house is big."]
  },
  "sources": { "freedict": { "senses": 3 } }
}

Usage:
  cd /path/to/urwort
  python3 tools/build-dict.py             # full build
  python3 tools/build-dict.py --dry-run   # stats only, no files written
  python3 tools/build-dict.py --limit 2000  # quick test with first N headwords
"""

import argparse
import gzip
import json
import os
import re
import struct
import sys
from collections import defaultdict
from html.parser import HTMLParser

# ── Paths ─────────────────────────────────────────────────────────────────────

SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
ROOT         = os.path.dirname(SCRIPT_DIR)
FREEDICT_DIR = os.path.join(ROOT, "raw-data", "freedict")
OUT_DE_EN    = os.path.join(ROOT, "src", "data", "de-en")
OUT_EN_DE    = os.path.join(ROOT, "src", "data", "en-de")

DICTS = {
    "de-en": {
        "idx":  os.path.join(FREEDICT_DIR, "deu-eng", "deu-eng.idx.gz"),
        "dict": os.path.join(FREEDICT_DIR, "deu-eng", "deu-eng.dict.dz"),
        "trans_lang": "en",   # translation nodes are lang="en"
        "out":  OUT_DE_EN,
    },
    "en-de": {
        "idx":  os.path.join(FREEDICT_DIR, "eng-deu", "eng-deu.idx.gz"),
        "dict": os.path.join(FREEDICT_DIR, "eng-deu", "eng-deu.dict.dz"),
        "trans_lang": "de",   # translation nodes are lang="de"
        "out":  OUT_EN_DE,
    },
}

# ── HTML Parser ───────────────────────────────────────────────────────────────

class EntryParser(HTMLParser):
    """
    Extract structured data from one StarDict HTML sense-entry.
    Handles both deu-eng (lang="en" translations) and eng-deu (lang="de").
    """
    def __init__(self, trans_lang: str):
        super().__init__()
        self.trans_lang   = trans_lang   # "en" or "de"
        self.translations = []
        self.examples_src = []           # source language example text
        self.examples_tgt = []           # target language example text
        self.pos_raw      = ""
        self.gender_raw   = ""

        self._depth         = 0
        self._in_example    = False
        self._example_depth = 0
        self._in_trans      = False
        self._in_src_ex     = False
        self._in_tgt_ex     = False
        self._in_pos        = False

    def handle_starttag(self, tag, attrs):
        self._depth += 1
        attrs_d = dict(attrs)
        lang    = attrs_d.get("lang", "")
        cls     = attrs_d.get("class", "")
        color   = attrs_d.get("color", "")

        if cls == "example":
            self._in_example    = True
            self._example_depth = self._depth

        if self._in_example:
            # In example: source lang is the opposite of trans_lang
            src_lang = "de" if self.trans_lang == "en" else "en"
            if lang == self.trans_lang:
                self._in_tgt_ex = True
            elif lang == src_lang:
                self._in_src_ex = True
        else:
            if lang == self.trans_lang:
                self._in_trans = True

        if tag == "font" and color == "green":
            self._in_pos = True

    def handle_endtag(self, tag):
        if self._in_example and self._depth == self._example_depth:
            self._in_example = False
            self._in_src_ex  = False
            self._in_tgt_ex  = False
        self._in_trans = False
        self._in_pos   = False
        self._depth   -= 1

    def handle_data(self, data):
        data = data.strip()
        if not data:
            return
        if self._in_pos:
            # e.g. "male, noun, sg"  or  "verb, intr"  or  "female, noun"
            self.pos_raw += " " + data
        elif self._in_tgt_ex:
            self.examples_tgt.append(data)
        elif self._in_src_ex:
            self.examples_src.append(data)
        elif self._in_trans:
            self.translations.append(data)


def parse_pos_gender(pos_raw: str):
    """
    Parse the <font color="green"> text into (pos, gender).
    Examples: "male, noun, sg" → ("noun","m")
              "female, noun"   → ("noun","f")
              "neuter, noun"   → ("noun","n")
              "verb, intr"     → ("verb", None)
              "adjective"      → ("adjective", None)
    """
    s = pos_raw.lower()
    gender = None
    if "male, noun" in s or "masculine" in s:
        gender = "m"
    elif "female" in s or "feminine" in s:
        gender = "f"
    elif "neuter" in s:
        gender = "n"
    elif "male" in s and "noun" in s:
        gender = "m"

    pos = ""
    if "noun" in s:
        pos = "noun"
    elif "verb" in s:
        pos = "verb"
    elif "adj" in s:
        pos = "adjective"
    elif "adv" in s:
        pos = "adverb"
    elif "prep" in s:
        pos = "preposition"
    elif "conj" in s:
        pos = "conjunction"
    elif "pron" in s:
        pos = "pronoun"
    elif "article" in s or "art." in s:
        pos = "article"
    return pos, gender


# ── StarDict reader ───────────────────────────────────────────────────────────

def read_stardict(idx_path: str, dict_path: str):
    """Generator — yields (headword: str, html: str) for every idx entry."""
    print(f"  Reading index  : {os.path.basename(idx_path)}", file=sys.stderr)
    with gzip.open(idx_path, "rb") as f:
        idx_raw = f.read()
    print(f"  Decompressing  : {os.path.basename(dict_path)}", file=sys.stderr)
    with gzip.open(dict_path, "rb") as f:
        dict_raw = f.read()
    print(f"  Index {len(idx_raw):,}B  |  Dict {len(dict_raw):,}B", file=sys.stderr)

    i = 0
    while i < len(idx_raw):
        try:
            null_pos = idx_raw.index(b"\x00", i)
        except ValueError:
            break
        word   = idx_raw[i:null_pos].decode("utf-8", errors="replace")
        offset, size = struct.unpack(">II", idx_raw[null_pos + 1: null_pos + 9])
        html   = dict_raw[offset: offset + size].decode("utf-8", errors="replace")
        i      = null_pos + 9
        yield word, html


# ── Filtering ─────────────────────────────────────────────────────────────────

# Skip headwords that are:
#   - quoted phrases / idioms (start with " or ')
#   - purely numeric or symbolic
#   - too short or too long
SKIP_START_RE = re.compile(r'^[\"\'\d\W]')

def should_skip(word: str) -> bool:
    if len(word) < 2 or len(word) > 60:
        return True
    if SKIP_START_RE.match(word):
        return True
    # Skip if contains brackets, ellipsis
    if any(c in word for c in "()[]{}..."):
        return True
    return False


def clean_translation(t: str) -> str:
    """Strip noise from a translation string."""
    # Remove trailing context labels like "(wire drawing)"
    t = re.sub(r'\s+', ' ', t).strip()
    return t


# ── Core builder ─────────────────────────────────────────────────────────────

def build_direction(direction: str, trans_lang: str,
                    idx_path: str, dict_path: str,
                    limit=None) -> list:
    """
    Parse a StarDict dictionary and return merged entry list.
    Multiple idx entries sharing the same headword (one per sense)
    are merged into a single entry with combined translations/examples.
    """
    # Accumulator: headword → merged data
    # Using OrderedDict-like insertion order via plain dict (Python 3.7+)
    merged = {}   # word → { pos, gender, translations[], examples[], sense_count }

    total_idx = 0
    skipped   = 0
    limit_hit = False

    for word, html in read_stardict(idx_path, dict_path):
        total_idx += 1

        if should_skip(word):
            skipped += 1
            continue

        p = EntryParser(trans_lang)
        try:
            p.feed(html)
        except Exception:
            pass

        pos, gender = parse_pos_gender(p.pos_raw)

        # Clean translations
        clean_trans = []
        seen_trans  = merged[word]["translations"] if word in merged else []
        seen_set    = set(t.lower() for t in seen_trans)
        for t in p.translations:
            t = clean_translation(t)
            if t and len(t) < 100 and t.lower() not in seen_set:
                clean_trans.append(t)
                seen_set.add(t.lower())

        # Build examples "source :: target"
        new_examples = []
        for src, tgt in zip(p.examples_src, p.examples_tgt):
            src = src.strip(); tgt = tgt.strip()
            if src and tgt:
                new_examples.append(f"{src} :: {tgt}")

        if word not in merged:
            merged[word] = {
                "pos":         pos,
                "gender":      gender,
                "translations": clean_trans,
                "examples":    new_examples,
                "senses":      1,
            }
        else:
            # Merge into existing entry
            m = merged[word]
            if pos and not m["pos"]:
                m["pos"] = pos
            if gender and not m["gender"]:
                m["gender"] = gender
            m["translations"].extend(clean_trans)
            m["examples"].extend(
                e for e in new_examples if e not in m["examples"]
            )
            m["senses"] += 1

        # Apply limit based on unique headwords
        if limit and len(merged) >= limit:
            limit_hit = True
            break

    # Convert to entry list
    entries = []
    empty   = 0
    for word, data in merged.items():
        if not data["translations"]:
            empty += 1
            continue
        entry = {
            "id":     f"{direction[:2]}_{word.lower().replace(' ', '_').replace('/', '_')}",
            "w":      word,
            "pos":    data["pos"],
            "gender": data["gender"],
            "meta":   {"freq": None, "level": None},
            "l1": {
                "en":  data["translations"][:6],   # cap 6 translations
                "ex":  data["examples"][:3],        # cap 3 examples
            },
            "sources": {"freedict": {"senses": data["senses"]}},
        }
        entries.append(entry)

    print(
        f"  {direction}: {total_idx:,} idx rows → {len(merged):,} unique words "
        f"→ {len(entries):,} entries  "
        f"({skipped:,} skipped, {empty:,} no-translation"
        f"{', LIMIT HIT' if limit_hit else ''})",
        file=sys.stderr
    )
    return entries


# ── Chunker & writer ──────────────────────────────────────────────────────────

def chunk_by_letter(entries: list) -> dict:
    chunks = defaultdict(list)
    for entry in entries:
        first = entry["w"][0].lower()
        if "a" <= first <= "z":
            chunks[first].append(entry)
        else:
            # German umlauts etc. → map to base letter
            umlaut_map = {"ä": "a", "ö": "o", "ü": "u", "ß": "s"}
            mapped = umlaut_map.get(first, "misc")
            chunks[mapped].append(entry)
    return chunks


def write_chunks(chunks: dict, out_dir: str, dry_run: bool):
    os.makedirs(out_dir, exist_ok=True)
    total    = 0
    total_kb = 0
    for letter, entries in sorted(chunks.items()):
        entries.sort(key=lambda e: e["w"].lower())
        data     = json.dumps(entries, ensure_ascii=False, separators=(",", ":"))
        size_kb  = len(data.encode("utf-8")) / 1024
        total_kb += size_kb
        total    += len(entries)
        flag      = "  (would write)" if dry_run else ""
        print(
            f"    {letter}.json  {len(entries):>6,} entries  {size_kb:>7.1f} KB{flag}",
            file=sys.stderr
        )
        if not dry_run:
            path = os.path.join(out_dir, f"{letter}.json")
            with open(path, "w", encoding="utf-8") as f:
                f.write(data)
    print(
        f"  → {total:,} total entries  ~{total_kb/1024:.1f} MB  in {out_dir}",
        file=sys.stderr
    )


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(
        description="Build urwort per-letter JSON chunks from FreeDict StarDict files"
    )
    ap.add_argument("--dry-run", action="store_true",
                    help="Print stats only, don't write output files")
    ap.add_argument("--limit", type=int, default=None,
                    help="Stop after N unique headwords per direction (for quick testing)")
    ap.add_argument("--direction", choices=["de-en", "en-de", "both"], default="both",
                    help="Which direction(s) to build (default: both)")
    args = ap.parse_args()

    # Validate source files exist
    for key, cfg in DICTS.items():
        if args.direction != "both" and key != args.direction:
            continue
        for fpath in [cfg["idx"], cfg["dict"]]:
            if not os.path.exists(fpath):
                print(f"ERROR: Missing file: {fpath}", file=sys.stderr)
                sys.exit(1)

    for direction, cfg in DICTS.items():
        if args.direction != "both" and direction != args.direction:
            continue

        print(f"\n── {direction.upper()} ──────────────────────────────────────────",
              file=sys.stderr)
        entries = build_direction(
            direction   = direction,
            trans_lang  = cfg["trans_lang"],
            idx_path    = cfg["idx"],
            dict_path   = cfg["dict"],
            limit       = args.limit,
        )
        chunks = chunk_by_letter(entries)
        write_chunks(chunks, cfg["out"], dry_run=args.dry_run)

    if args.dry_run:
        print("\n── DRY RUN complete — no files written ──", file=sys.stderr)
    else:
        print("\n── Build complete ──", file=sys.stderr)


if __name__ == "__main__":
    main()
