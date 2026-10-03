"""Stream the raw sources once into out/lex.db (SQLite), keeping only what pipeline-v2 needs.

Tables
  wikt(src, word, pos, ety_text, ety_templates, ety_links, derived, related, ipa, audio, glosses, hyph, kind)
      kind = de pos_title, or 'form' for en form-of entries
      src = 'en' (English Wiktionary, German entries) | 'de' (German Wiktionary, Deutsch entries)
  derivbase_pair(a, a_pos, b, b_pos, path_len, path)   shortest rule path per lemma pair (DErivBase v2.0)
  derivbase_member(family, cluster, lemma, pos)        family = v2 semantic cluster id
  morphynet(base, derived, base_pos, derived_pos, affix, kind)

Usage: .venv/bin/python ingest.py   (about 5 minutes; re-run rebuilds from scratch)
"""
import json, re, sqlite3, sys, time
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent / "raw-data" / "v2"
OUT = Path(__file__).resolve().parent / "out"
DB = OUT / "lex.db"
POS_KEEP = {"noun", "verb", "adj", "adv", "name", "prefix", "suffix", "root", "affix", "interfix", "particle", "prep"}


def j(x):
    return json.dumps(x, ensure_ascii=False) if x else None


def ingest_wikt(con, src, path, lang_code):
    n = kept = 0
    t = time.time()
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            n += 1
            d = json.loads(line)
            if d.get("lang_code") != lang_code or d.get("pos") not in POS_KEEP:
                continue
            ety_text = d.get("etymology_text") or "\n".join(d.get("etymology_texts") or []) or None
            tmpl = [{"name": t["name"], "args": t.get("args", {})} for t in d.get("etymology_templates", [])
                    if t.get("name") != "ety"] or None
            # keep the 'ety' tree template's expansion text only (it encodes the tree); the args say little
            sounds = d.get("sounds") or []
            ipa = next((s["ipa"] for s in sounds if "ipa" in s), None)
            audio = next((s.get("ogg_url") or s.get("mp3_url") for s in sounds if "audio" in s), None)
            glosses = [g for s in d.get("senses", [])[:5] for g in s.get("glosses", [])[:1]]
            hyph = d.get("hyphenations") or d.get("hyphenation")
            rows.append((src, d["word"], d["pos"], ety_text, j(tmpl), j([l[0] for l in d.get("etymology_links") or []]),
                         j([x["word"] for x in d.get("derived", []) if "word" in x]),
                         j([x["word"] for x in d.get("related", []) if "word" in x]),
                         ipa, audio, j(glosses), j(hyph),
                         d.get("pos_title") or ("form" if any("form_of" in s for s in d.get("senses", [])) else "lemma")))
            kept += 1
            if len(rows) >= 5000:
                con.executemany("INSERT INTO wikt VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", rows); rows.clear()
    con.executemany("INSERT INTO wikt VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
    print(f"  wikt[{src}]: {kept:,} of {n:,} lines kept ({time.time()-t:.0f}s)", file=sys.stderr)


DB_POS = re.compile(r"^(.*)_(V(?:en|eln|ern)?|N[fmn]?|A)$")


def split_lemma(tok):
    m = DB_POS.match(tok)
    return (m.group(1), m.group(2)[0]) if m else (tok, "?")


def ingest_derivbase(con):
    base = RAW / "derivbase-v2.0" / "derivbase"
    rows = []
    with open(base / "DErivBase-v2.0-rulePaths.txt", encoding="utf-8") as f:
        for line in f:
            p = line.split()
            if len(p) < 4:
                continue
            (a, ap), (b, bp) = split_lemma(p[0]), split_lemma(p[1])
            rows.append((a, ap, b, bp, int(p[2]), " ".join(p[3:])))
    con.executemany("INSERT INTO derivbase_pair VALUES (?,?,?,?,?,?)", rows)
    # families file: one v2 semantic cluster per line (the v1.4.1 family is recoverable from rulePaths)
    fam_rows = []
    with open(base / "DErivBase-v2.0-families.txt", encoding="utf-8") as f:
        for cid, line in enumerate(f):
            for tok in line.split():
                lem, pos = split_lemma(tok)
                fam_rows.append((cid, 0, lem, pos))
    con.executemany("INSERT INTO derivbase_member VALUES (?,?,?,?)", fam_rows)
    print(f"  derivbase: {len(rows):,} pairs, {len(fam_rows):,} memberships", file=sys.stderr)


def ingest_morphynet(con):
    rows = [tuple(l.rstrip("\n").split("\t"))[:6] for l in open(RAW / "morphynet-deu.derivational.v1.tsv", encoding="utf-8")]
    con.executemany("INSERT INTO morphynet VALUES (?,?,?,?,?,?)", [r for r in rows if len(r) == 6])
    print(f"  morphynet: {len(rows):,} rows", file=sys.stderr)


def main():
    OUT.mkdir(exist_ok=True)
    DB.unlink(missing_ok=True)
    con = sqlite3.connect(DB)
    con.executescript("""
      PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
      CREATE TABLE wikt(src, word, pos, ety_text, ety_templates, ety_links, derived, related, ipa, audio, glosses, hyph, kind);
      CREATE TABLE derivbase_pair(a, a_pos, b, b_pos, path_len INT, path);
      CREATE TABLE derivbase_member(family INT, cluster INT, lemma, pos);
      CREATE TABLE morphynet(base, derived, base_pos, derived_pos, affix, kind);
    """)
    ingest_derivbase(con)
    ingest_morphynet(con)
    ingest_wikt(con, "en", RAW / "kaikki-en-German.jsonl", "de")
    ingest_wikt(con, "de", RAW / "kaikki-de-Deutsch.jsonl", "de")
    con.executescript("""
      CREATE INDEX wikt_word ON wikt(word); CREATE INDEX db_a ON derivbase_pair(a); CREATE INDEX db_b ON derivbase_pair(b);
      CREATE INDEX dbm_lemma ON derivbase_member(lemma); CREATE INDEX dbm_fam ON derivbase_member(family, cluster);
      CREATE INDEX mn_base ON morphynet(base); CREATE INDEX mn_der ON morphynet(derived);
    """)
    con.commit()
    print(f"wrote {DB} ({DB.stat().st_size/1e6:.0f} MB)", file=sys.stderr)


if __name__ == "__main__":
    main()
