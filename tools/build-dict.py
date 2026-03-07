#!/usr/bin/env python3
"""
tools/build-dict.py  (v2)

Outputs TWO sets of per-letter JSON chunks per direction:

  src/data/{dir}/index/{letter}.json  -- Layer 1 slim rows (w, pos, gender, hint)
  src/data/{dir}/data/{letter}.json   -- Layer 2 full rows (w, pos, gender, l1, sources)

Sources:
  raw-data/freedict/deu-eng/  ->  DE->EN
  raw-data/freedict/eng-deu/  ->  EN->DE

Usage:
  python3 tools/build-dict.py               # full build
  python3 tools/build-dict.py --dry-run     # stats only
  python3 tools/build-dict.py --limit 2000  # quick test
  python3 tools/build-dict.py --direction de-en
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

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
ROOT         = os.path.dirname(SCRIPT_DIR)
FREEDICT_DIR = os.path.join(ROOT, "raw-data", "freedict")
OUT_DE_EN    = os.path.join(ROOT, "src", "data", "de-en")
OUT_EN_DE    = os.path.join(ROOT, "src", "data", "en-de")

DICTS = {
    "de-en": {
        "idx":        os.path.join(FREEDICT_DIR, "deu-eng", "deu-eng.idx.gz"),
        "dict":       os.path.join(FREEDICT_DIR, "deu-eng", "deu-eng.dict.dz"),
        "trans_lang": "en",
        "out":        OUT_DE_EN,
    },
    "en-de": {
        "idx":        os.path.join(FREEDICT_DIR, "eng-deu", "eng-deu.idx.gz"),
        "dict":       os.path.join(FREEDICT_DIR, "eng-deu", "eng-deu.dict.dz"),
        "trans_lang": "de",
        "out":        OUT_EN_DE,
    },
}

# ---------------------------------------------------------------------------
# HTML Parser
# ---------------------------------------------------------------------------

class EntryParser(HTMLParser):
    def __init__(self, trans_lang):
        super().__init__()
        self.trans_lang   = trans_lang
        self.translations = []
        self.examples_src = []
        self.examples_tgt = []
        self.pos_raw      = ""
        self._depth         = 0
        self._in_example    = False
        self._example_depth = 0
        self._in_trans      = False
        self._in_src_ex     = False
        self._in_tgt_ex     = False
        self._in_pos        = False

    def handle_starttag(self, tag, attrs):
        self._depth += 1
        a = dict(attrs)
        lang  = a.get("lang", "")
        cls   = a.get("class", "")
        color = a.get("color", "")
        if cls == "example":
            self._in_example    = True
            self._example_depth = self._depth
        if self._in_example:
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
            self.pos_raw += " " + data
        elif self._in_tgt_ex:
            self.examples_tgt.append(data)
        elif self._in_src_ex:
            self.examples_src.append(data)
        elif self._in_trans:
            self.translations.append(data)


def parse_pos_gender(pos_raw):
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
    if "noun" in s:          pos = "noun"
    elif "verb" in s:        pos = "verb"
    elif "adj" in s:         pos = "adjective"
    elif "adv" in s:         pos = "adverb"
    elif "prep" in s:        pos = "preposition"
    elif "conj" in s:        pos = "conjunction"
    elif "pron" in s:        pos = "pronoun"
    elif "article" in s or "art." in s: pos = "article"
    return pos, gender

# ---------------------------------------------------------------------------
# StarDict reader
# ---------------------------------------------------------------------------

def read_stardict(idx_path, dict_path):
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
        word = idx_raw[i:null_pos].decode("utf-8", errors="replace")
        offset, size = struct.unpack(">II", idx_raw[null_pos + 1: null_pos + 9])
        html = dict_raw[offset: offset + size].decode("utf-8", errors="replace")
        i = null_pos + 9
        yield word, html

# ---------------------------------------------------------------------------
# Filtering
# ---------------------------------------------------------------------------

SKIP_START_RE = re.compile(r'^[\"\'\d\W]')

def should_skip(word):
    if len(word) < 2 or len(word) > 60:
        return True
    if SKIP_START_RE.match(word):
        return True
    if any(c in word for c in "()[]{}..."):
        return True
    return False

def clean_translation(t):
    return re.sub(r'\s+', ' ', t).strip()

# ---------------------------------------------------------------------------
# Core builder
# ---------------------------------------------------------------------------

def build_direction(direction, trans_lang, idx_path, dict_path, limit=None):
    merged    = {}
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

        existing_trans = merged[word]["translations"] if word in merged else []
        seen_set = set(t.lower() for t in existing_trans)
        clean_trans = []
        for t in p.translations:
            t = clean_translation(t)
            if t and len(t) < 100 and t.lower() not in seen_set:
                clean_trans.append(t)
                seen_set.add(t.lower())

        new_examples = []
        for src, tgt in zip(p.examples_src, p.examples_tgt):
            src = src.strip(); tgt = tgt.strip()
            if src and tgt:
                new_examples.append(f"{src} :: {tgt}")

        if word not in merged:
            merged[word] = {
                "pos":          pos,
                "gender":       gender,
                "translations": clean_trans,
                "examples":     new_examples,
                "senses":       1,
            }
        else:
            m = merged[word]
            if pos and not m["pos"]:       m["pos"]    = pos
            if gender and not m["gender"]: m["gender"] = gender
            m["translations"].extend(clean_trans)
            m["examples"].extend(e for e in new_examples if e not in m["examples"])
            m["senses"] += 1

        if limit and len(merged) >= limit:
            limit_hit = True
            break

    entries = []
    empty   = 0
    for word, data in merged.items():
        if not data["translations"]:
            empty += 1
            continue
        entries.append({
            "w":      word,
            "pos":    data["pos"],
            "gender": data["gender"],
            "l1": {
                "en": data["translations"][:6],
                "ex": data["examples"][:3],
            },
            "sources": {"freedict": {"senses": data["senses"]}},
        })

    print(
        f"  {direction}: {total_idx:,} idx rows -> {len(merged):,} unique words "
        f"-> {len(entries):,} entries  "
        f"({skipped:,} skipped, {empty:,} no-translation"
        f"{', LIMIT HIT' if limit_hit else ''})",
        file=sys.stderr
    )
    return entries

# ---------------------------------------------------------------------------
# Chunker
# ---------------------------------------------------------------------------

UMLAUT_MAP = {"ae": "a", "oe": "o", "ue": "u",
              "\u00e4": "a", "\u00f6": "o", "\u00fc": "u",
              "\u00df": "s", "\u00c4": "a", "\u00d6": "o", "\u00dc": "u"}

def chunk_by_letter(entries):
    chunks = defaultdict(list)
    for entry in entries:
        first = entry["w"][0].lower()
        if "a" <= first <= "z":
            chunks[first].append(entry)
        else:
            chunks[UMLAUT_MAP.get(first, "misc")].append(entry)
    return chunks

# ---------------------------------------------------------------------------
# Writers
# ---------------------------------------------------------------------------

def make_index_row(entry):
    """Slim row for wordIndex (Layer 1). Only what a search card needs."""
    hint = entry["l1"]["en"][0] if entry["l1"]["en"] else ""
    row = {"w": entry["w"], "hint": hint}
    if entry["pos"]:    row["pos"]    = entry["pos"]
    if entry["gender"]: row["gender"] = entry["gender"]
    return row


def write_chunks(chunks, out_dir, dry_run):
    """
    Write index/ and data/ sub-directories.
      index/{letter}.json  -- slim rows (w, hint, pos?, gender?)
      data/{letter}.json   -- full rows (w, pos, gender, l1, sources)
    """
    index_dir = os.path.join(out_dir, "index")
    data_dir  = os.path.join(out_dir, "data")

    if not dry_run:
        os.makedirs(index_dir, exist_ok=True)
        os.makedirs(data_dir,  exist_ok=True)

    total_entries  = 0
    index_total_kb = 0.0
    data_total_kb  = 0.0

    print(f"\n  {'letter':8}  {'entries':>8}  {'index KB':>9}  {'data KB':>8}", file=sys.stderr)
    print(f"  {'-'*8}  {'-'*8}  {'-'*9}  {'-'*8}", file=sys.stderr)

    for letter, entries in sorted(chunks.items()):
        entries.sort(key=lambda e: e["w"].lower())

        index_rows = [make_index_row(e) for e in entries]
        index_json = json.dumps(index_rows, ensure_ascii=False, separators=(",", ":"))
        data_json  = json.dumps(entries,    ensure_ascii=False, separators=(",", ":"))

        index_kb = len(index_json.encode("utf-8")) / 1024
        data_kb  = len(data_json.encode("utf-8"))  / 1024
        index_total_kb += index_kb
        data_total_kb  += data_kb
        total_entries  += len(entries)

        flag = "  (dry)" if dry_run else ""
        print(
            f"  {letter+'.json':8}  {len(entries):>8,}  {index_kb:>8.1f}K  {data_kb:>7.1f}K{flag}",
            file=sys.stderr
        )

        if not dry_run:
            with open(os.path.join(index_dir, f"{letter}.json"), "w", encoding="utf-8") as f:
                f.write(index_json)
            with open(os.path.join(data_dir, f"{letter}.json"), "w", encoding="utf-8") as f:
                f.write(data_json)

    total_mb_index = index_total_kb / 1024
    total_mb_data  = data_total_kb  / 1024
    print(
        f"\n  -> {total_entries:,} entries | "
        f"index {total_mb_index:.1f} MB | "
        f"data {total_mb_data:.1f} MB",
        file=sys.stderr
    )

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(
        description="Build urwort per-letter JSON chunks (v2: index/ + data/ split)"
    )
    ap.add_argument("--dry-run",   action="store_true")
    ap.add_argument("--limit",     type=int, default=None)
    ap.add_argument("--direction", choices=["de-en", "en-de", "both"], default="both")
    args = ap.parse_args()

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
        print(f"\n== {direction.upper()} {'='*50}", file=sys.stderr)
        entries = build_direction(
            direction   = direction,
            trans_lang  = cfg["trans_lang"],
            idx_path    = cfg["idx"],
            dict_path   = cfg["dict"],
            limit       = args.limit,
        )
        chunks = chunk_by_letter(entries)
        write_chunks(chunks, cfg["out"], dry_run=args.dry_run)

    status = "DRY RUN -- no files written" if args.dry_run else "Build complete"
    print(f"\n== {status} {'='*40}", file=sys.stderr)


if __name__ == "__main__":
    main()
