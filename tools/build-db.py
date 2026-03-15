#!/usr/bin/env python3
"""
tools/build-db.py

Builds data/urwort.db (SQLite) from all available bulk sources.

Sources processed (in priority order):
  1. FreeDict   raw-data/freedict/deu-eng/     → base entries (translations, examples)
  2. Kaikki     raw-data/kaikki/*.jsonl         → enrich entries + build forms index
  3. UniMorph   raw-data/unimorph/deu           → supplement forms index  (if present)
  4. IPA-dict   raw-data/ipa-dict/de.tsv        → supplement IPA           (if present)
  5. OpenThes   raw-data/openthesaurus/         → supplement synonyms      (if present)
  6. CEFR       raw-data/cefr/de.tsv            → tag CEFR levels          (if present)

Usage:
  python3 tools/build-db.py                    # full build
  python3 tools/build-db.py --limit 5000       # quick test (first N Kaikki entries)
  python3 tools/build-db.py --skip-kaikki      # FreeDict only
  python3 tools/build-db.py --dry-run          # validate input, no DB written
"""

import argparse
import gzip
import json
import os
import re
import sqlite3
import struct
import sys
import time
from html.parser import HTMLParser

# ── Paths ────────────────────────────────────────────────────────────────────

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(SCRIPT_DIR)

RAW = os.path.join(ROOT, "raw-data")
DATA_DIR = os.path.join(ROOT, "data")
DB_PATH = os.path.join(DATA_DIR, "urwort.db")
SCHEMA_PATH = os.path.join(SCRIPT_DIR, "schema.sql")

FREEDICT_DE_EN = os.path.join(RAW, "freedict", "deu-eng")
KAIKKI_DIR = os.path.join(RAW, "kaikki")

# Also check raw-data root for Kaikki files dropped there directly
KAIKKI_SEARCH_DIRS = [KAIKKI_DIR, RAW]

# ── UPOS mapping ─────────────────────────────────────────────────────────────

KAIKKI_POS_TO_UPOS = {
    "noun": "NOUN", "name": "NOUN", "proper noun": "NOUN",
    "verb": "VERB",
    "adj": "ADJ", "adjective": "ADJ",
    "adv": "ADV", "adverb": "ADV",
    "prep": "ADP", "preposition": "ADP",
    "conj": "CONJ", "conjunction": "CONJ",
    "det": "DET", "article": "DET",
    "num": "NUM", "numeral": "NUM",
    "pron": "PRON", "pronoun": "PRON",
    "intj": "INTJ", "interjection": "INTJ",
    "particle": "PART",
    "affix": "X", "phrase": "X", "proverb": "X",
    "character": "X", "symbol": "X",
}

FREEDICT_POS_TO_UPOS = {
    "noun": "NOUN",
    "verb": "VERB",
    "adjective": "ADJ",
    "adverb": "ADV",
    "preposition": "ADP",
    "conjunction": "CONJ",
    "article": "DET",
    "pronoun": "PRON",
    "": "X",
}

def kaikki_pos_to_upos(raw_pos: str) -> str:
    return KAIKKI_POS_TO_UPOS.get(raw_pos.lower().strip(), "X")

def freedict_pos_to_upos(raw_pos: str) -> str:
    return FREEDICT_POS_TO_UPOS.get(raw_pos.lower().strip(), "X")

# ── Timestamp ────────────────────────────────────────────────────────────────

def now_ms() -> int:
    return int(time.time() * 1000)

# ── FreeDict parser (StarDict binary) ────────────────────────────────────────

class FreeDictHTMLParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.translations: list[str] = []
        self.examples_de: list[str] = []
        self.examples_en: list[str] = []
        self.pos_raw = ""
        self._depth = 0
        self._in_example = False
        self._example_depth = 0
        self._in_trans = False
        self._in_src_ex = False
        self._in_tgt_ex = False
        self._in_pos = False

    def handle_starttag(self, tag, attrs):
        self._depth += 1
        a = dict(attrs)
        lang = a.get("lang", "")
        cls = a.get("class", "")
        color = a.get("color", "")
        if cls == "example":
            self._in_example = True
            self._example_depth = self._depth
        if self._in_example:
            if lang == "en":
                self._in_tgt_ex = True
            elif lang == "de":
                self._in_src_ex = True
        else:
            if lang == "en":
                self._in_trans = True
        if tag == "font" and color == "green":
            self._in_pos = True

    def handle_endtag(self, tag):
        if self._in_example and self._depth == self._example_depth:
            self._in_example = False
            self._in_src_ex = False
            self._in_tgt_ex = False
        self._in_trans = False
        self._in_pos = False
        self._depth -= 1

    def handle_data(self, data):
        data = data.strip()
        if not data:
            return
        if self._in_pos:
            self.pos_raw += " " + data
        elif self._in_tgt_ex:
            self.examples_en.append(data)
        elif self._in_src_ex:
            self.examples_de.append(data)
        elif self._in_trans:
            self.translations.append(data)


def parse_freedict_pos_gender(pos_raw: str):
    s = pos_raw.lower()
    gender = None
    if "maskulin" in s or "masculine" in s or "male, noun" in s:
        gender = "m"
    elif "feminin" in s or "feminine" in s or "female" in s:
        gender = "f"
    elif "neuter" in s or "neutrum" in s:
        gender = "n"
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


SKIP_WORD_RE = re.compile(r'^[\"\'\d\W]')

def should_skip_word(word: str) -> bool:
    if len(word) < 2 or len(word) > 60:
        return True
    if SKIP_WORD_RE.match(word):
        return True
    if any(c in word for c in "()[]{}"):
        return True
    return False


def read_stardict(idx_path: str, dict_path: str):
    with gzip.open(idx_path, "rb") as f:
        idx_raw = f.read()
    with gzip.open(dict_path, "rb") as f:
        dict_raw = f.read()
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


def import_freedict(conn: sqlite3.Connection, dry_run: bool = False) -> int:
    idx_path = os.path.join(FREEDICT_DE_EN, "deu-eng.idx.gz")
    dict_path = os.path.join(FREEDICT_DE_EN, "deu-eng.dict.dz")

    if not os.path.exists(idx_path) or not os.path.exists(dict_path):
        print("  [FreeDict] files not found, skipping", file=sys.stderr)
        return 0

    print("  [FreeDict] reading StarDict files...", file=sys.stderr)

    merged: dict[str, dict] = {}
    total = 0
    skipped = 0

    for word, html in read_stardict(idx_path, dict_path):
        total += 1
        if should_skip_word(word):
            skipped += 1
            continue

        p = FreeDictHTMLParser()
        try:
            p.feed(html)
        except Exception:
            pass

        pos_raw, gender = parse_freedict_pos_gender(p.pos_raw)

        clean_trans = []
        seen = set()
        for t in p.translations:
            t = re.sub(r'\s+', ' ', t).strip()
            if t and len(t) < 120 and t.lower() not in seen:
                clean_trans.append(t)
                seen.add(t.lower())

        examples = []
        for de, en in zip(p.examples_de, p.examples_en):
            de, en = de.strip(), en.strip()
            if de and en:
                examples.append({"de": de, "en": en})

        if word not in merged:
            merged[word] = {
                "pos_raw": pos_raw,
                "gender": gender,
                "translations": clean_trans,
                "examples": examples,
                "senses": 1,
            }
        else:
            m = merged[word]
            if pos_raw and not m["pos_raw"]:
                m["pos_raw"] = pos_raw
            if gender and not m["gender"]:
                m["gender"] = gender
            existing = {t.lower() for t in m["translations"]}
            m["translations"].extend(t for t in clean_trans if t.lower() not in existing)
            m["examples"].extend(e for e in examples if e not in m["examples"])
            m["senses"] += 1

    print(
        f"  [FreeDict] {total:,} index rows → {len(merged):,} unique words "
        f"({skipped:,} skipped)",
        file=sys.stderr,
    )

    if dry_run:
        return len(merged)

    ts = now_ms()
    cur = conn.cursor()
    rows = []

    for word, data in merged.items():
        if not data["translations"]:
            continue
        pos_upos = freedict_pos_to_upos(data["pos_raw"])
        entry_id = f"{word}|{pos_upos}"
        rows.append((
            entry_id, word, pos_upos,
            data["gender"],
            json.dumps(data["translations"][:8], ensure_ascii=False),
            json.dumps(data["examples"][:5], ensure_ascii=False),
            json.dumps({"freedict": {"extracted_at": ts, "senses": data["senses"]}},
                       ensure_ascii=False),
            ts, ts,
        ))

    cur.executemany(
        """
        INSERT OR IGNORE INTO entries
            (id, lemma, pos, gender, translations, examples, sources, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    inserted = cur.rowcount
    conn.commit()
    print(f"  [FreeDict] inserted {inserted:,} entries", file=sys.stderr)
    return inserted


# ── Kaikki.org JSONL parser ───────────────────────────────────────────────────

def extract_gender_from_head_templates(head_templates: list) -> str | None:
    """
    Kaikki head_templates for German nouns look like:
      {"name": "de-noun", "args": {"1": "n", "gen": "Hauses", "pl": "Häuser"}}
    The first positional arg ("1") is the gender: m/f/n.
    """
    for ht in head_templates:
        args = ht.get("args", {})
        g = args.get("1") or args.get("g")
        if g in ("m", "f", "n"):
            return g
        # Some entries use "m|f" for common gender
        if g and g[0] in ("m", "f", "n"):
            return g[0]
    return None


_AUX_RE   = re.compile(r'\bauxiliary\s+(haben|sein)\b', re.I)
_CLASS_RE = re.compile(r'\bclass\s+(\d+)\s+(strong|weak|mixed)\b', re.I)
_COMP_RE  = re.compile(r'\bcomparative\s+(\S+)', re.I)
_SUP_RE   = re.compile(r'\bsuperlative\s+((?:am\s+)?\S+)', re.I)


def extract_auxiliary_from_head_templates(head_templates: list) -> str | None:
    for ht in head_templates:
        # Primary: parse expansion string (e.g. "… auxiliary haben")
        m = _AUX_RE.search(ht.get("expansion", ""))
        if m:
            return m.group(1).lower()
        # Fallback: explicit args field
        args = ht.get("args", {})
        aux = args.get("aux") or args.get("auxiliary")
        if aux:
            return aux.lower()
    return None


def extract_verb_class_from_head_templates(head_templates: list) -> str | None:
    for ht in head_templates:
        expansion = ht.get("expansion", "")
        # "class 5 strong" → "strong/5"
        m = _CLASS_RE.search(expansion)
        if m:
            return f"{m.group(2).lower()}/{m.group(1)}"
        # "weak" / "irregular" without a numbered class
        el = expansion.lower()
        if "irregular" in el:
            return "irregular"
        if "weak" in el:
            return "weak"
        # Fallback: explicit args field
        args = ht.get("args", {})
        cls = args.get("class")
        if cls:
            return f"strong/{cls}" if cls.isdigit() else cls
    return None


def extract_comparative_superlative(head_templates: list) -> tuple[str | None, str | None]:
    comp = sup = None
    for ht in head_templates:
        expansion = ht.get("expansion", "")
        if not comp:
            m = _COMP_RE.search(expansion)
            if m:
                comp = m.group(1).rstrip(",) ")
        if not sup:
            m = _SUP_RE.search(expansion)
            if m:
                sup = m.group(1).rstrip(",) ")
        # Fallback: args fields
        args = ht.get("args", {})
        comp = comp or args.get("comp") or args.get("comparative")
        sup  = sup  or args.get("sup")  or args.get("superlative")
    return comp, sup


def parse_kaikki_entry(obj: dict) -> tuple[dict | None, list[dict]]:
    """
    Returns (entry_dict_or_None, list_of_form_dicts).

    entry_dict is None if this is an inflected-form-only entry.
    form_dicts are always returned for any forms found.
    """
    word = obj.get("word", "").strip()
    if not word:
        return None, []

    pos_raw = obj.get("pos", "")
    pos = kaikki_pos_to_upos(pos_raw)
    senses = obj.get("senses", [])

    # ── Detect inflected-form entries ────────────────────────────────────────
    # An entry is an inflected form if ALL senses have form_of
    is_form_only = bool(senses) and all(
        s.get("form_of") or "form-of" in s.get("tags", [])
        for s in senses
    )

    forms_out: list[dict] = []

    # ── Forms table (all entries contribute forms) ───────────────────────────
    for form_obj in obj.get("forms", []):
        form_str = form_obj.get("form", "").strip()
        if not form_str or form_str == word:
            continue
        tags = form_obj.get("tags", [])
        if not tags:
            continue
        entry_id = f"{word}|{pos}"
        forms_out.append({
            "form": form_str,
            "entry_id": entry_id,
            "tags": json.dumps(tags, ensure_ascii=False),
            "source": "kaikki",
        })

    # Also add a self-form entry (lemma itself)
    if senses and not is_form_only:
        forms_out.append({
            "form": word,
            "entry_id": f"{word}|{pos}",
            "tags": json.dumps(["lemma"], ensure_ascii=False),
            "source": "kaikki",
        })

    # ── Form-only entries: extract the form_of links ─────────────────────────
    if is_form_only:
        for sense in senses:
            for fo in sense.get("form_of", []):
                lemma_word = fo.get("word", "").strip()
                if lemma_word:
                    # We don't know the target lemma's POS yet — use same POS as assumption
                    entry_id = f"{lemma_word}|{pos}"
                    tags = sense.get("tags", [])
                    forms_out.append({
                        "form": word,
                        "entry_id": entry_id,
                        "tags": json.dumps(tags, ensure_ascii=False),
                        "source": "kaikki",
                    })
        return None, forms_out

    # ── Build lemma entry ────────────────────────────────────────────────────
    entry_id = f"{word}|{pos}"
    head_templates = obj.get("head_templates", [])

    # Gender
    gender = extract_gender_from_head_templates(head_templates)

    # IPA + audio
    ipa = None
    audio_url = None
    rhymes = None
    homophones = []
    for sound in obj.get("sounds", []):
        if not ipa:
            raw_ipa = sound.get("ipa")
            if raw_ipa:
                ipa = raw_ipa if isinstance(raw_ipa, str) else str(raw_ipa)
        if not audio_url:
            audio_url = sound.get("mp3_url") or sound.get("ogg_url")
        if not rhymes:
            raw_rhymes = sound.get("rhymes")
            if raw_rhymes:
                rhymes = raw_rhymes if isinstance(raw_rhymes, str) else raw_rhymes[0] if raw_rhymes else None
        raw_homophones = sound.get("homophones") or []
        if isinstance(raw_homophones, list):
            homophones.extend(raw_homophones)
        elif isinstance(raw_homophones, str):
            homophones.append(raw_homophones)

    # Syllabification — hyphenation in Kaikki is often a list: ["Häu", "ser"]
    raw_hyph = obj.get("hyphenation")
    if raw_hyph is None:
        syllabification = None
    elif isinstance(raw_hyph, list):
        syllabification = "·".join(raw_hyph) if raw_hyph else None
    else:
        syllabification = str(raw_hyph)

    # Etymology — normally a string, guard against edge cases
    raw_etym = obj.get("etymology_text")
    if raw_etym is None:
        etymology = None
    elif isinstance(raw_etym, list):
        etymology = " ".join(str(x) for x in raw_etym if x)
    else:
        etymology = str(raw_etym) if raw_etym else None

    # Wikidata / Wikipedia
    wikidata_id = None
    wds = obj.get("wikidata") or []
    if wds and isinstance(wds, list) and wds[0]:
        wikidata_id = str(wds[0])

    wikipedia = None
    wplist = obj.get("wikipedia") or []
    if wplist and isinstance(wplist, list) and wplist[0]:
        wikipedia = str(wplist[0])

    # Literal meaning (compounds)
    raw_compound = obj.get("literal_meaning")
    compound_parts = str(raw_compound) if raw_compound and not isinstance(raw_compound, (dict, list)) else None

    # Verb-specific
    auxiliary  = extract_auxiliary_from_head_templates(head_templates)
    verb_class = extract_verb_class_from_head_templates(head_templates)

    # Adjective comparative / superlative (prepend to inflections later)
    comp, sup = extract_comparative_superlative(head_templates)

    # ── Senses ───────────────────────────────────────────────────────────────
    translations: list[str] = []
    senses_out: list[dict] = []
    all_synonyms: list[str] = []
    all_antonyms: list[str] = []
    all_hypernyms: list[str] = []
    all_hyponyms: list[str] = []
    all_derived: list[str] = []
    all_related: list[str] = []
    all_usage_labels: list[str] = []
    all_domains: list[str] = []
    examples_out: list[dict] = []
    proverbs: list[str] = []

    for sense in senses:
        glosses = sense.get("glosses", [])
        raw_glosses = sense.get("raw_glosses", glosses)
        tags = [t for t in sense.get("tags", []) if t != "form-of"]
        domain = ""
        topics = sense.get("topics", [])
        if topics:
            domain = topics[0]
            all_domains.extend(t for t in topics if t not in all_domains)

        # Collect glosses as translations (skip meta lines like "inflection of X")
        for g in glosses:
            g = g.strip()
            if g and len(g) < 200 and g.lower() not in {"inflection of", ""}:
                if g not in translations:
                    translations.append(g)

        # Sense-level examples
        sense_examples: list[dict] = []
        for ex in sense.get("examples", []):
            text = ex.get("text", "").strip()
            english = ex.get("english", "").strip()
            if text:
                ex_obj = {"de": text}
                if english:
                    ex_obj["en"] = english
                sense_examples.append(ex_obj)
                if ex_obj not in examples_out:
                    examples_out.append(ex_obj)

        # Sense-level semantic relations
        for syn in sense.get("synonyms", []):
            w = syn.get("word", "").strip()
            if w and w not in all_synonyms:
                all_synonyms.append(w)
        for ant in sense.get("antonyms", []):
            w = ant.get("word", "").strip()
            if w and w not in all_antonyms:
                all_antonyms.append(w)
        for hyp in sense.get("hypernyms", []):
            w = hyp.get("word", "").strip()
            if w and w not in all_hypernyms:
                all_hypernyms.append(w)
        for hypo in sense.get("hyponyms", []):
            w = hypo.get("word", "").strip()
            if w and w not in all_hyponyms:
                all_hyponyms.append(w)
        for der in sense.get("derived", []):
            w = der.get("word", "").strip()
            if w and w not in all_derived:
                all_derived.append(w)
        for rel in sense.get("related", []):
            w = rel.get("word", "").strip()
            if w and w not in all_related:
                all_related.append(w)

        # Usage labels from tags
        register_tags = {"colloquial", "formal", "archaic", "poetic", "literary",
                         "dialectal", "offensive", "vulgar", "dated", "rare",
                         "technical", "humorous"}
        for t in tags:
            if t in register_tags and t not in all_usage_labels:
                all_usage_labels.append(t)

        # Qualifiers
        for q in sense.get("qualifiers", []):
            if q not in all_usage_labels:
                all_usage_labels.append(q)

        senses_out.append({
            "glosses": glosses[:5],
            "tags": tags[:10],
            "domain": domain,
            "examples": sense_examples[:2],
        })

    # Top-level derived / related / proverbs
    for der in obj.get("derived", []):
        w = der.get("word", "").strip()
        if w and w not in all_derived:
            all_derived.append(w)
    for rel in obj.get("related", []):
        w = rel.get("word", "").strip()
        if w and w not in all_related:
            all_related.append(w)
    for prov in obj.get("proverbs", []):
        w = prov.get("word", "").strip()
        if w and w not in proverbs:
            proverbs.append(w)

    # ── Inflection table ─────────────────────────────────────────────────────
    inflections: list[dict] = []
    # Prepend comparative / superlative for adjectives
    if comp:
        inflections.append({"form": comp, "tags": ["comparative"]})
    if sup:
        inflections.append({"form": sup, "tags": ["superlative"]})
    for form_obj in obj.get("forms", []):
        form_str = form_obj.get("form", "").strip()
        tags = form_obj.get("tags", [])
        if form_str and tags:
            inflections.append({"form": form_str, "tags": tags})

    entry = {
        "id": entry_id,
        "lemma": word,
        "pos": pos,
        "gender": gender,
        "ipa": ipa,
        "audio_url": audio_url,
        "syllabification": syllabification,
        "etymology": etymology,
        "translations": translations[:12],
        "senses": senses_out,
        "examples": examples_out[:8],
        "inflections": inflections,
        "synonyms": all_synonyms[:20],
        "antonyms": all_antonyms[:10],
        "hypernyms": all_hypernyms[:10],
        "hyponyms": all_hyponyms[:20],
        "derived": all_derived[:30],
        "related": all_related[:20],
        "rhymes": rhymes,
        "homophones": homophones[:5],
        "proverbs": proverbs[:5],
        "wikidata_id": wikidata_id,
        "wikipedia": wikipedia,
        "compound_parts": compound_parts,
        "auxiliary": auxiliary,
        "verb_class": verb_class,
        "usage_labels": all_usage_labels[:10],
        "subject_domains": all_domains[:10],
    }
    return entry, forms_out


def _scalar(v) -> str | None:
    """Ensure a value is a scalar (str/None) safe to bind to SQLite."""
    if v is None:
        return None
    if isinstance(v, (str, int, float)):
        return v
    if isinstance(v, list):
        return " ".join(str(x) for x in v if x) or None
    return str(v)


def find_kaikki_files() -> list[str]:
    """Find all Kaikki JSONL files in known locations."""
    files = []
    for search_dir in KAIKKI_SEARCH_DIRS:
        if not os.path.isdir(search_dir):
            continue
        for fname in sorted(os.listdir(search_dir)):
            if not fname.endswith(".jsonl"):
                continue
            # Only process Kaikki German dictionaries, not sample files
            if "kaikki" in fname.lower() and "german" in fname.lower():
                fpath = os.path.join(search_dir, fname)
                if fpath not in files:
                    files.append(fpath)
    return files


def import_kaikki(
    conn: sqlite3.Connection,
    dry_run: bool = False,
    limit: int | None = None,
) -> tuple[int, int]:
    """Returns (entries_inserted_or_updated, forms_inserted)."""
    files = find_kaikki_files()
    if not files:
        print("  [Kaikki] no JSONL files found, skipping", file=sys.stderr)
        return 0, 0

    print(f"  [Kaikki] found {len(files)} file(s):", file=sys.stderr)
    for f in files:
        size_mb = os.path.getsize(f) / 1024 / 1024
        print(f"    {os.path.basename(f)}  ({size_mb:.1f} MB)", file=sys.stderr)

    ts = now_ms()
    entries_upserted = 0
    forms_inserted = 0
    lines_processed = 0
    form_only_count = 0

    cur = conn.cursor()

    for jsonl_path in files:
        print(f"  [Kaikki] processing {os.path.basename(jsonl_path)}...", file=sys.stderr)
        file_entries = 0
        file_forms = 0

        with open(jsonl_path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                lines_processed += 1

                if limit and lines_processed > limit:
                    print(f"  [Kaikki] --limit {limit} reached", file=sys.stderr)
                    break

                if lines_processed % 10000 == 0:
                    print(
                        f"    {lines_processed:,} lines | "
                        f"{file_entries:,} entries | "
                        f"{file_forms:,} forms",
                        file=sys.stderr,
                    )

                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue

                try:
                    entry, forms = parse_kaikki_entry(obj)
                except Exception as parse_err:
                    word = obj.get("word", "?") if isinstance(obj, dict) else "?"
                    print(f"    WARN: parse error for '{word}': {parse_err}", file=sys.stderr)
                    continue

                # Insert/update forms regardless of whether entry is a lemma
                if not dry_run and forms:
                    for fm in forms:
                        try:
                            cur.execute(
                                """
                                INSERT OR IGNORE INTO forms (form, entry_id, tags, source)
                                VALUES (?, ?, ?, ?)
                                """,
                                (fm["form"], fm["entry_id"], fm["tags"], fm["source"]),
                            )
                            file_forms += cur.rowcount
                        except sqlite3.Error:
                            pass

                if entry is None:
                    form_only_count += 1
                    continue

                if dry_run:
                    file_entries += 1
                    continue

                # UPSERT: Kaikki data wins over FreeDict base
                e = entry
                sources_json = json.dumps(
                    {"kaikki": {"extracted_at": ts}}, ensure_ascii=False
                )

                cur.execute(
                    """
                    INSERT INTO entries
                        (id, lemma, pos, gender, ipa, audio_url, syllabification,
                         etymology, translations, senses, examples, inflections,
                         synonyms, antonyms, hypernyms, hyponyms, derived, related,
                         rhymes, homophones, proverbs, wikidata_id, wikipedia,
                         compound_parts, auxiliary, verb_class,
                         usage_labels, subject_domains, sources,
                         created_at, updated_at)
                    VALUES
                        (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(id) DO UPDATE SET
                        gender          = COALESCE(excluded.gender, gender),
                        ipa             = COALESCE(excluded.ipa, ipa),
                        audio_url       = COALESCE(excluded.audio_url, audio_url),
                        syllabification = COALESCE(excluded.syllabification, syllabification),
                        etymology       = COALESCE(excluded.etymology, etymology),
                        translations    = CASE
                                            WHEN json_array_length(excluded.translations) > 0
                                            THEN excluded.translations
                                            ELSE translations
                                          END,
                        senses          = excluded.senses,
                        examples        = CASE
                                            WHEN json_array_length(excluded.examples) > 0
                                            THEN excluded.examples
                                            ELSE examples
                                          END,
                        inflections     = excluded.inflections,
                        synonyms        = excluded.synonyms,
                        antonyms        = excluded.antonyms,
                        hypernyms       = excluded.hypernyms,
                        hyponyms        = excluded.hyponyms,
                        derived         = excluded.derived,
                        related         = excluded.related,
                        rhymes          = COALESCE(excluded.rhymes, rhymes),
                        homophones      = excluded.homophones,
                        proverbs        = excluded.proverbs,
                        wikidata_id     = COALESCE(excluded.wikidata_id, wikidata_id),
                        wikipedia       = COALESCE(excluded.wikipedia, wikipedia),
                        compound_parts  = COALESCE(excluded.compound_parts, compound_parts),
                        auxiliary       = COALESCE(excluded.auxiliary, auxiliary),
                        verb_class      = COALESCE(excluded.verb_class, verb_class),
                        usage_labels    = excluded.usage_labels,
                        subject_domains = excluded.subject_domains,
                        sources         = json_patch(sources, excluded.sources),
                        updated_at      = excluded.updated_at
                    """,
                    (
                        _scalar(e["id"]), _scalar(e["lemma"]), _scalar(e["pos"]), _scalar(e["gender"]),
                        _scalar(e["ipa"]), _scalar(e["audio_url"]), _scalar(e["syllabification"]),
                        _scalar(e["etymology"]),
                        json.dumps(e["translations"], ensure_ascii=False),
                        json.dumps(e["senses"], ensure_ascii=False),
                        json.dumps(e["examples"], ensure_ascii=False),
                        json.dumps(e["inflections"], ensure_ascii=False),
                        json.dumps(e["synonyms"], ensure_ascii=False),
                        json.dumps(e["antonyms"], ensure_ascii=False),
                        json.dumps(e["hypernyms"], ensure_ascii=False),
                        json.dumps(e["hyponyms"], ensure_ascii=False),
                        json.dumps(e["derived"], ensure_ascii=False),
                        json.dumps(e["related"], ensure_ascii=False),
                        _scalar(e["rhymes"]),
                        json.dumps(e["homophones"], ensure_ascii=False),
                        json.dumps(e["proverbs"], ensure_ascii=False),
                        _scalar(e["wikidata_id"]), _scalar(e["wikipedia"]),
                        _scalar(e["compound_parts"]), _scalar(e["auxiliary"]), _scalar(e["verb_class"]),
                        json.dumps(e["usage_labels"], ensure_ascii=False),
                        json.dumps(e["subject_domains"], ensure_ascii=False),
                        sources_json,
                        ts, ts,
                    ),
                )
                file_entries += 1

        # Batch commit per file
        if not dry_run:
            conn.commit()

        forms_inserted += file_forms
        entries_upserted += file_entries
        print(
            f"  [Kaikki] {os.path.basename(jsonl_path)}: "
            f"{file_entries:,} lemmas, {file_forms:,} forms "
            f"({form_only_count:,} form-only entries)",
            file=sys.stderr,
        )

    return entries_upserted, forms_inserted


# ── IPA-dict supplement ───────────────────────────────────────────────────────

def import_ipa_dict(conn: sqlite3.Connection) -> int:
    tsv_path = os.path.join(RAW, "ipa-dict", "de.tsv")
    if not os.path.exists(tsv_path):
        print("  [IPA-dict] not found, skipping", file=sys.stderr)
        return 0

    print("  [IPA-dict] importing...", file=sys.stderr)
    updated = 0
    cur = conn.cursor()
    ts = now_ms()

    with open(tsv_path, encoding="utf-8") as f:
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) < 2:
                continue
            word, ipa = parts[0].strip(), parts[1].strip()
            if not word or not ipa:
                continue

            # Try to find matching entry (any POS)
            rows = cur.execute(
                "SELECT id FROM entries WHERE lemma = ? AND ipa IS NULL",
                (word,),
            ).fetchall()
            for row in rows:
                cur.execute(
                    "UPDATE entries SET ipa = ?, updated_at = ? WHERE id = ? AND ipa IS NULL",
                    (ipa, ts, row[0]),
                )
                updated += cur.rowcount

    conn.commit()
    print(f"  [IPA-dict] filled IPA for {updated:,} entries", file=sys.stderr)
    return updated


# ── CEFR tagging ──────────────────────────────────────────────────────────────

def import_cefr(conn: sqlite3.Connection) -> int:
    tsv_path = os.path.join(RAW, "cefr", "de.tsv")
    if not os.path.exists(tsv_path):
        print("  [CEFR] not found, skipping", file=sys.stderr)
        return 0

    print("  [CEFR] importing...", file=sys.stderr)
    tagged = 0
    cur = conn.cursor()
    ts = now_ms()

    with open(tsv_path, encoding="utf-8") as f:
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) < 2:
                continue
            word, level = parts[0].strip(), parts[1].strip().upper()
            if not word or level not in ("A1", "A2", "B1", "B2", "C1", "C2"):
                continue

            rows = cur.execute(
                "SELECT id FROM entries WHERE lemma = ?", (word,)
            ).fetchall()
            for row in rows:
                cur.execute(
                    "UPDATE entries SET cefr_level = ?, updated_at = ? WHERE id = ?",
                    (level, ts, row[0]),
                )
                tagged += cur.rowcount

    conn.commit()
    print(f"  [CEFR] tagged {tagged:,} entries", file=sys.stderr)
    return tagged


# ── Stats ─────────────────────────────────────────────────────────────────────

def print_stats(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()

    total_entries = cur.execute("SELECT COUNT(*) FROM entries").fetchone()[0]
    total_forms = cur.execute("SELECT COUNT(*) FROM forms").fetchone()[0]

    pos_counts = cur.execute(
        "SELECT pos, COUNT(*) as n FROM entries GROUP BY pos ORDER BY n DESC"
    ).fetchall()

    entries_with_ipa = cur.execute(
        "SELECT COUNT(*) FROM entries WHERE ipa IS NOT NULL"
    ).fetchone()[0]
    entries_with_audio = cur.execute(
        "SELECT COUNT(*) FROM entries WHERE audio_url IS NOT NULL"
    ).fetchone()[0]
    entries_with_etymology = cur.execute(
        "SELECT COUNT(*) FROM entries WHERE etymology IS NOT NULL"
    ).fetchone()[0]
    entries_with_inflections = cur.execute(
        "SELECT COUNT(*) FROM entries WHERE json_array_length(inflections) > 0"
    ).fetchone()[0]
    entries_with_synonyms = cur.execute(
        "SELECT COUNT(*) FROM entries WHERE json_array_length(synonyms) > 0"
    ).fetchone()[0]

    db_size_mb = os.path.getsize(DB_PATH) / 1024 / 1024

    print(f"\n{'='*60}", file=sys.stderr)
    print(f"  urwort.db built: {DB_PATH}", file=sys.stderr)
    print(f"  DB size        : {db_size_mb:.1f} MB", file=sys.stderr)
    print(f"  Total entries  : {total_entries:,}", file=sys.stderr)
    print(f"  Total forms    : {total_forms:,}", file=sys.stderr)
    print(f"\n  POS breakdown:", file=sys.stderr)
    for pos, count in pos_counts:
        print(f"    {pos or '(none)':10}  {count:>8,}", file=sys.stderr)
    print(f"\n  Data coverage:", file=sys.stderr)
    pct = lambda n: f"{n:,}  ({100*n//max(1,total_entries)}%)"
    print(f"    IPA           : {pct(entries_with_ipa)}", file=sys.stderr)
    print(f"    Audio         : {pct(entries_with_audio)}", file=sys.stderr)
    print(f"    Etymology     : {pct(entries_with_etymology)}", file=sys.stderr)
    print(f"    Inflections   : {pct(entries_with_inflections)}", file=sys.stderr)
    print(f"    Synonyms      : {pct(entries_with_synonyms)}", file=sys.stderr)
    print(f"{'='*60}\n", file=sys.stderr)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    global DB_PATH  # pylint: disable=global-statement

    default_db = DB_PATH
    ap = argparse.ArgumentParser(
        description="Build urwort SQLite database from bulk sources"
    )
    ap.add_argument("--dry-run", action="store_true",
                    help="Parse input files but do not write DB")
    ap.add_argument("--limit", type=int, default=None,
                    help="Process only first N Kaikki lines (for quick testing)")
    ap.add_argument("--skip-freedict", action="store_true")
    ap.add_argument("--skip-kaikki", action="store_true")
    ap.add_argument("--db", default=default_db,
                    help=f"Output DB path (default: {default_db})")
    args = ap.parse_args()

    DB_PATH = args.db
    os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)

    t_start = time.time()
    print(f"\n{'='*60}", file=sys.stderr)
    print(f"  urwort build-db", file=sys.stderr)
    print(f"  Output: {DB_PATH}", file=sys.stderr)
    print(f"  Dry run: {args.dry_run}", file=sys.stderr)
    if args.limit:
        print(f"  Limit: {args.limit:,} Kaikki lines", file=sys.stderr)
    print(f"{'='*60}\n", file=sys.stderr)

    if args.dry_run:
        print("DRY RUN — no DB will be written\n", file=sys.stderr)
        if not args.skip_kaikki:
            import_kaikki(None, dry_run=True, limit=args.limit)
        return

    # ── Open / create DB ────────────────────────────────────────────────────
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # Performance pragmas
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous  = NORMAL")
    conn.execute("PRAGMA cache_size   = -64000")   # 64 MB page cache
    conn.execute("PRAGMA temp_store   = MEMORY")

    # Apply schema
    with open(SCHEMA_PATH, encoding="utf-8") as f:
        schema_sql = f.read()
    conn.executescript(schema_sql)
    conn.commit()

    # ── Phase 1: FreeDict ────────────────────────────────────────────────────
    if not args.skip_freedict:
        print("\n── Phase 1: FreeDict ─────────────────────────────────", file=sys.stderr)
        import_freedict(conn)

    # ── Phase 2: Kaikki ──────────────────────────────────────────────────────
    if not args.skip_kaikki:
        print("\n── Phase 2: Kaikki ───────────────────────────────────", file=sys.stderr)
        import_kaikki(conn, limit=args.limit)

    # ── Phase 3: IPA-dict ────────────────────────────────────────────────────
    print("\n── Phase 3: IPA-dict ─────────────────────────────────", file=sys.stderr)
    import_ipa_dict(conn)

    # ── Phase 4: CEFR ────────────────────────────────────────────────────────
    print("\n── Phase 4: CEFR ─────────────────────────────────────", file=sys.stderr)
    import_cefr(conn)

    # ── Finalize ─────────────────────────────────────────────────────────────
    print("\n── Finalizing ────────────────────────────────────────", file=sys.stderr)
    print("  Running ANALYZE...", file=sys.stderr)
    conn.execute("ANALYZE")

    ts = now_ms()
    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
        ("build_ts", str(ts)),
    )
    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
        ("build_version", "1.0"),
    )
    conn.commit()

    elapsed = time.time() - t_start
    print(f"  Build time: {elapsed:.1f}s", file=sys.stderr)

    print_stats(conn)
    conn.close()


if __name__ == "__main__":
    main()
