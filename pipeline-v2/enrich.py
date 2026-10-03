"""Enrich out/graph.db with IE-CoR roots/cognates, UniMorph forms and level evidence; estimate levels.

Tables written to graph.db
  forms(word, form, feats)                      UniMorph (CC BY-SA 3.0)
  iecor(word, root_form, root_lang, doubt, cognateset, english, comment)   IE-CoR (CC BY 4.0)
  level(word, level, rule, evidence)            level model; evidence = JSON of every input

Level model (transparent rules, commercial-safe inputs only):
  freq   rank among content lemmas (wordfreq) -> level by the vocabulary sizes per CEFR level reported by
         Milton & Alexiou (2009): A1 <1500, A2 <2500, B1 <3250, B2 <3750, C1 <4500, else C2
  dib    Deutsch im Blick (CC BY 4.0), a first-year course: chapters 1-5 -> A1, 6-10 -> A2
  merlin MERLIN learner texts (CC BY-SA 4.0): the lowest rated level at which >= MIN_TEXTS texts at or
         below that level use the word (corrected 'target hypothesis' text)
  The rule is chosen below by evaluation against the Goethe-Institut lists (check only, never shipped).
"""
import csv, json, re, sqlite3, collections, sys, unicodedata
from pathlib import Path
from wordfreq import top_n_list

HERE = Path(__file__).resolve().parent
RAW = HERE.parent / "raw-data" / "v2"
G = sqlite3.connect(HERE / "out" / "graph.db")
LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
MIN_TEXTS = 2

lex = {w for (w,) in G.execute("select word from lexeme")}


def ingest_unimorph():
    G.executescript("DROP TABLE IF EXISTS forms; CREATE TABLE forms(word, form, feats);")
    rows = []
    for line in open(RAW / "unimorph-deu.tsv", encoding="utf-8"):
        p = line.rstrip("\n").split("\t")
        if len(p) == 3 and p[0] in lex:
            rows.append((p[0], p[1], p[2]))
    G.executemany("INSERT INTO forms VALUES (?,?,?)", rows)
    G.execute("CREATE INDEX forms_w ON forms(word)"); G.execute("CREATE INDEX forms_f ON forms(form)")
    print(f"unimorph: {len(rows):,} forms for {len({r[0] for r in rows}):,} lemmas", file=sys.stderr)


def ingest_iecor():
    d = RAW / "iecor"
    langs = {r["ID"]: r["Name"] for r in csv.DictReader(open(d / "languages.csv"))}
    de_id = next(i for i, n in langs.items() if n == "German")
    en_id = next(i for i, n in langs.items() if n == "English")
    forms = {r["ID"]: r for r in csv.DictReader(open(d / "forms.csv"))}
    sets = {r["ID"]: r for r in csv.DictReader(open(d / "cognatesets.csv"))}
    by_set = collections.defaultdict(list)
    for c in csv.DictReader(open(d / "cognates.csv")):
        f = forms.get(c["Form_ID"])
        if f: by_set[c["Cognateset_ID"]].append((f, c.get("Doubt")))
    rows = []
    for sid, members in by_set.items():
        de = [f["Form"] for f, _ in members if f["Language_ID"] == de_id]
        en = [f["Form"] for f, _ in members if f["Language_ID"] == en_id]
        cs = sets[sid]
        for w in de:
            if w in lex:
                doubt = cs["Root_Form"].startswith("?") or any(dbt == "true" for f, dbt in members if f["Form"] == w)
                rows.append((w, cs["Root_Form"].lstrip("?"), cs["Root_Language"], int(doubt), sid,
                             ", ".join(en) or None, (cs.get("Comment") or "")[:500] or None))
    G.executescript("DROP TABLE IF EXISTS iecor; CREATE TABLE iecor(word, root_form, root_lang, doubt INT, cognateset, english, comment);")
    G.executemany("INSERT INTO iecor VALUES (?,?,?,?,?,?,?)", rows)
    print(f"iecor: {len(rows)} German words in cognate sets", file=sys.stderr)


def lemma_index():
    """surface form -> lemmas (lexicon words and UniMorph inflected forms)."""
    idx = collections.defaultdict(set)
    for w in lex: idx[w].add(w)
    for w, f in G.execute("select word, form from forms"): idx[f].add(w)
    return idx


def lemmatize(tok, idx):
    for t in (tok, tok.lower(), tok.capitalize()):
        if t in idx: return idx[t]
    return set()


def merlin_evidence(idx):
    texts = collections.defaultdict(lambda: collections.Counter())  # word -> level -> n texts
    for path in (RAW / "merlin" / "merlin-text-v1.2" / "meta_ltext_THs" / "german").glob("*.txt"):
        t = path.read_text(encoding="utf-8", errors="ignore")
        m = re.search(r"Overall CEFR rating:\s*(A1|A2|B1|B2|C1|C2)", t)
        th = t.split("Target hypothesis 1:", 1)
        if not m or len(th) < 2: continue
        body = th[1].split("----------------", 1)[0]
        words = set()
        for tok in re.findall(r"[A-Za-zÄÖÜäöüß]+", body):
            words |= lemmatize(tok, idx)
        for w in words: texts[w][m.group(1)] += 1
    out = {}
    for w, c in texts.items():
        cum = 0
        for lv in LEVELS:
            cum += c[lv]
            if cum >= MIN_TEXTS:
                out[w] = {"level": lv, "texts": dict(c)}; break
    return out


def dib_evidence():
    fields = open(RAW / "dib_deck_fields.txt").read().split()
    out = {}
    for line in open(RAW / "dib_deck.txt", encoding="utf-8"):
        r = dict(zip(fields, line.rstrip("\n").split("\t")))
        if not r.get("chapter", "").isdigit(): continue
        ch = int(r["chapter"])
        head = re.split(r"[,;(!?]", r.get("de1", ""))[0].strip()
        head = re.sub(r"^(der|die|das|sich)\s+", "", head).strip()
        for w in {head, head.split()[-1] if head else ""}:
            if w in lex and (w not in out or ch < out[w]["chapter"]):
                out[w] = {"chapter": ch, "level": "A1" if ch <= 5 else "A2"}
    return out


def freq_evidence():
    by_fold = collections.defaultdict(list)
    for w in lex: by_fold[w.casefold()].append(w)
    rank, n = {}, 0
    for tok in top_n_list("de", 200000):
        for w in by_fold.get(tok, []):
            if w not in rank:
                n += 1; rank[w] = n
    def lv(r): return "A1" if r < 1500 else "A2" if r < 2500 else "B1" if r < 3250 else "B2" if r < 3750 else "C1" if r < 4500 else "C2"
    return {w: {"rank": r, "level": lv(r)} for w, r in rank.items()}


def subtitle_evidence(idx, thresholds):
    """OpenSubtitles 2018 counts (FrequencyWords, CC BY-SA 4.0), summed over all forms of a lemma."""
    counts = collections.Counter()
    for line in open(RAW / "opensubtitles-de_full.txt", encoding="utf-8"):
        p = line.split()
        if len(p) != 2 or not p[1].isdigit(): continue
        ls = lemmatize(p[0], idx)
        for l in ls: counts[l] += int(p[1]) / len(ls)
    out = {}
    for r, (w, c) in enumerate(counts.most_common(), 1):
        lv = next((LEVELS[i] for i, t in enumerate(thresholds) if r < t), "C2")
        out[w] = {"rank": r, "level": lv}
    return out


def family_cap(levels, L):
    """Bauer & Nation (1993): once the parts are known, a transparent derived word or compound needs little extra
    effort. Cap a word at one level above its hardest part (well-attested links: 2+ sources)."""
    capped = dict(levels)
    parts = collections.defaultdict(set)
    for b, d, k, n in G.execute("select base, derived, kind, n_sources from edge where kind in ('deriv','compound_head','compound_mod')"):
        if n >= 2 or k != "deriv": parts[d].add(b)
    for w, ps in parts.items():
        if w in levels and ps and all(p in levels for p in ps):
            cap = LEVELS[min(len(LEVELS) - 1, max(L[levels[p]] for p in ps) + 1)]
            if L[cap] < L[levels[w]]: capped[w] = cap
    return capped


def klexikon_evidence(idx):
    df, n = collections.Counter(), 0
    for line in open(RAW / "klexikon-train.json", encoding="utf-8"):
        d = json.loads(line); n += 1
        text = " ".join(d.get("klexikon_sentences") or [d.get("klexikon_text", "")])
        ws = set()
        for tok in re.findall(r"[A-Za-zÄÖÜäöüß]+", text): ws |= lemmatize(tok, idx)
        df.update(ws)
    return {w: {"doc_share": round(c / n, 4)} for w, c in df.items()}, n


def main():
    ingest_unimorph()
    ingest_iecor()
    idx = lemma_index()
    ev = {"freq": freq_evidence(), "dib": dib_evidence(), "merlin": merlin_evidence(idx),
          # Milton & Alexiou (2009) sizes, and a doubling scale (1k, 2k, 4k, 8k, 16k) as an alternative
          "subs": subtitle_evidence(idx, (1500, 2500, 3250, 3750, 4500)),
          "subs2": subtitle_evidence(idx, (1000, 2000, 4000, 8000, 16000))}
    klex, n_klex = klexikon_evidence(idx)
    print(f"evidence: freq {len(ev['freq']):,}, dib {len(ev['dib']):,}, merlin {len(ev['merlin']):,}, klexikon {len(klex):,} (docs {n_klex})", file=sys.stderr)
    L = {lv: i for i, lv in enumerate(LEVELS)}

    def rules(w):
        f = ev["freq"].get(w, {}).get("level"); d = ev["dib"].get(w, {}).get("level"); m = ev["merlin"].get(w, {}).get("level")
        s1 = ev["subs"].get(w, {}).get("level"); s2 = ev["subs2"].get(w, {}).get("level")
        lvls = [x for x in (f, d, m) if x]
        mn = lambda *xs: min([x for x in xs if x], key=L.get, default=None)
        return {
            "subs (Milton)": s1,
            "subs (doubling)": s2,
            "dib else min(subs, merlin)": d or mn(s1, m),
            "dib else min(subs2, merlin)": d or mn(s2, m),
            "min(dib, subs2, merlin)": mn(d, s2, m),
            "freq": f,
            "freq+dib (min)": min([x for x in (f, d) if x], key=L.get, default=None),
            "freq+dib+merlin (min)": min(lvls, key=L.get, default=None),
            "freq+dib+merlin (median)": sorted(lvls, key=L.get)[len(lvls) // 2] if lvls else None,
            "dib else min(freq, merlin)": d or min([x for x in (f, m) if x], key=L.get, default=None),
        }

    # evaluation against the Goethe lists (check only)
    gpath = HERE / "out" / "goethe-levels.json"
    if gpath.exists():
        gold = json.load(open(gpath))
        print("\nrule                         n     exact  within1  too-high  too-low", file=sys.stderr)
        scores = {}
        base = {name: {w: rules(w)[name] for w in lex} for name in rules("Haus")}
        for name in list(base):
            base[name + " +family"] = family_cap({w: l for w, l in base[name].items() if l}, L)
        for name in base:
            n = ex = w1 = hi = lo = 0
            for w, g in gold.items():
                p = base[name].get(w)
                if not p: continue
                n += 1; diff = L[p] - L[g]
                ex += diff == 0; w1 += abs(diff) <= 1; hi += diff > 0; lo += diff < 0
            scores[name] = (ex + w1) / max(n, 1)
            print(f"{name:28} {n:5} {ex/n:7.1%} {w1/n:8.1%} {hi/n:9.1%} {lo/n:8.1%}", file=sys.stderr)
        best = max(scores, key=scores.get)
    else:
        best = "dib else min(subs2, merlin) +family"
        base = None
    print(f"\nchosen rule: {best}", file=sys.stderr)
    G.executescript("DROP TABLE IF EXISTS level; CREATE TABLE level(word PRIMARY KEY, level, rule, evidence);")
    rows = []
    for w in lex:
        lv = base[best].get(w) if base else None
        evd = {k: ev[k][w] for k in ev if w in ev[k]}
        if w in klex: evd["klexikon"] = klex[w]
        if lv or evd:
            rows.append((w, lv, best, json.dumps(evd, ensure_ascii=False)))
    G.executemany("INSERT INTO level VALUES (?,?,?,?)", rows)
    G.commit()
    print(f"level: {sum(1 for r in rows if r[1]):,} words with a level", file=sys.stderr)


if __name__ == "__main__":
    main()
