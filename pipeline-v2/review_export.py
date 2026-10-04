"""Full review export: the whole graph (not just the game slice), sharded for on-demand loading by the viewer.

  out/review/meta.json            stats, sources, rules, validation results, queue summaries
  out/review/index/<k>.json       search index per first letter: lemma -> [family id, pos, level, rank, in_game]
  out/review/fam/<nnn>.json       families by hash bucket: every member, every link with sources, history, flags
  out/review/queues/<name>.json   review queues (things most worth a human look)

Families are the pipeline's synchronic families (all 14,959), plus single-word "families" for every other lemma.
Usage: .venv/bin/python review_export.py   (after build.py, enrich.py, export.py)
"""
import json, sqlite3, collections, shutil, unicodedata, sys, datetime
from pathlib import Path
import export as X  # reuse wikt_info, history_chain, segment, pie_status and friends

HERE = Path(__file__).resolve().parent
OUT = HERE / "out" / "review"
G, L = X.G, X.L
BUCKETS = 512
LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]


COMMONS = "https://commons.wikimedia.org/wiki/Special:FilePath/"


def clean(d):
    """Drop empty fields (None, '', [], {}, False) recursively; the viewer treats missing as empty."""
    if isinstance(d, dict):
        return {k: clean(v) for k, v in d.items() if v not in (None, "", [], {}, False)}
    if isinstance(d, list):
        return [clean(v) for v in d]
    return d


def bucket(fid):
    """FNV-1a (32-bit) over UTF-8 bytes, mod BUCKETS; the viewer computes the same hash."""
    h = 0x811C9DC5
    for b in fid.encode("utf-8"):
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return h % BUCKETS


def letter(w):
    c = unicodedata.normalize("NFKD", w[:1].lower()).encode("ascii", "ignore").decode()
    return c if c.isalpha() else "_"


def main():
    t0 = datetime.datetime.now()
    lex, hist, edges = X.load()
    v4 = json.load(open(HERE / "out" / "urwort-v4.json"))
    game_words, game_fam = v4["words"], {}
    for f in v4["families"]:
        for m in f["members"]: game_fam[m] = f["id"]
    levels = {w: (lv, json.loads(ev)) for w, lv, ev in G.execute("select word, level, evidence from level")}
    forms = collections.defaultdict(list)
    for w, f, ft in G.execute("select word, form, feats from forms"): forms[w].append((f, ft))
    iecor_rows = collections.defaultdict(list)
    for r in G.execute("select word, root_form, root_lang, doubt, cognateset, english, comment from iecor"):
        iecor_rows[r[0]].append(dict(zip(("word", "root_form", "root_lang", "doubt", "cognateset", "english", "comment"), r)))
    rejected = [(b, d, s.split(","), json.loads(i)) for b, d, s, i in G.execute("select base, derived, sources, info from rejected")]

    # families: pipeline families + singletons
    members = collections.defaultdict(list)
    for w, e in lex.items():
        members[e["family"] or "w:" + w].append(w)
    by_word = collections.defaultdict(list)
    for e in edges:
        by_word[e["base"]].append(e); by_word[e["derived"]].append(e)
    deriv_in = collections.defaultdict(list)
    for e in edges:
        if e["kind"] == "deriv": deriv_in[e["derived"]].append(e)

    def root_of(ms):
        s = set(ms)
        roots = [w for w in s if not any(e["base"] in s and e["n"] >= 2 for e in deriv_in.get(w, []))]
        return max(roots or s, key=lambda w: (X.zipf(w), not (w[0].isupper() and w.lower() in s), -len(w)))

    def tree_of(ms, root):
        s = set(ms); adj = collections.defaultdict(list)
        for w in s:
            for e in deriv_in.get(w, []):
                if e["base"] in s: adj[e["base"]].append((w, e))
        tree, q = {root: (None, None)}, [root]
        for x in q:
            for w, e in sorted(adj[x], key=lambda t: -t[1]["n"]):
                if w not in tree: tree[w] = (x, e); q.append(w)
        for w in s - set(tree): tree[w] = (root, None)
        return tree

    rank = {}
    by_fold = collections.defaultdict(list)
    for w in lex: by_fold[w.casefold()].append(w)
    for tok in X.top_n_list("de", 200000):
        for w in by_fold.get(tok, []):
            if w not in rank: rank[w] = len(rank) + 1

    def own_history(w):
        h = hist.get(w)
        if not h: return None
        chain, pie, loan = X.history_chain(h, next(iter(iecor_rows.get(w, [])), None))
        return {"chain": chain, "pie": pie, "loan": loan,
                "cognates": {k[4:]: v for k, v in h.items() if k.startswith("cog_")}} if (chain or pie or loan) else None

    fid_of = {}
    for key, ms in members.items():
        fid_of_key = "f:" + root_of(ms) if len(ms) > 1 else key
        for m in ms: fid_of[m] = fid_of_key
    shards = collections.defaultdict(dict)
    index = collections.defaultdict(dict)
    queues = collections.defaultdict(list)
    n_fam = 0
    for key, ms in members.items():
        root = root_of(ms) if len(ms) > 1 else ms[0]
        fid = fid_of[root]
        tree = tree_of(ms, root) if len(ms) > 1 else {root: (None, None)}
        mset = set(ms)
        fam_edges, seen = [], set()
        for m in ms:
            for e in by_word.get(m, []):
                k = (e["base"], e["derived"], e["kind"])
                if k in seen or e["kind"] == "wb" and not (e["base"] in mset and e["derived"] in mset) and len(ms) > 50:
                    continue
                seen.add(k)
                other = e["derived"] if e["base"] in mset else e["base"]
                fam_edges.append([e["base"], e["derived"], e["kind"], e["sources"], e["info"] or None,
                                  None if other in mset else fid_of.get(other)])
        words = {}
        for m in ms:
            info = X.wikt_info(m)
            pos = info["pos"] or X.POS_MAP.get(lex[m]["pos"][0])
            base, be = tree.get(m, (None, None))
            path, x = [], m
            while tree.get(x, (None, None))[0] is not None:
                b, e = tree[x]
                if e:
                    aff = next((e["info"][s] for s in ("wikt_de", "wikt_en", "morphynet") if e["info"].get(s)), None)
                    if aff: path.append(aff.split(",")[-1])
                x = b
            lv, ev = levels.get(m, (None, {}))
            fs = forms.get(m, [])
            pick = lambda pat: next((f for f, ft in fs if all(t in ft.split(";") for t in pat)), None)
            pf = {}
            if pos == "NOUN":
                g = next((t for f, ft in fs for t in ft.split(";") if t in ("MASC", "FEM", "NEUT")), None)
                pf = {"gender": {"MASC": "m", "FEM": "f", "NEUT": "n"}.get(g), "plural": pick(("N", "NOM", "PL")), "genitive": pick(("N", "GEN", "SG"))}
            elif pos == "VERB":
                pf = {"present_3sg": pick(("V", "IND", "PRS", "3", "SG")), "past_3sg": pick(("V", "IND", "PST", "3", "SG")), "past_participle": pick(("V.PTCP", "PST"))}
            elif pos == "ADJ":
                pf = {"comparative": pick(("ADJ", "CMPR")), "superlative": pick(("ADJ", "SPRL"))}
            cands = [e["base"] for e in deriv_in.get(m, []) if e["base"] in mset]
            words[m] = {"pos": pos, "rank": rank.get(m), "game": m in game_words, "level": lv,
                        "ev": {k: (v.get("level"), v.get("rank") or v.get("chapter") or v.get("texts") or v.get("doc_share")) for k, v in ev.items()},
                        "base": base, "base_src": (be or {}).get("sources"), "bases": sorted(set(cands)) if len(set(cands)) > 1 else None,
                        "segs": [[s["form"], s["type"]] for s in X.segment(m, list(reversed(path)), pos)] if base else None,
                        "forms": {k: v for k, v in pf.items() if v} or None, "nforms": len(fs),
                        "ipa": info["ipa"], "audio": (info["audio"] or "").replace(COMMONS, "").split("/")[-1] if info["audio"] else None, "en": info["gloss_en"], "de": info["gloss_de"][:3],
                        "hist": own_history(m) if m != root else None}
            index[letter(m)][m] = [fid, (pos or "")[:4], lv or "", rank.get(m) or 0, int(m in game_words)]
        twins = [root] + [m for m in ms if m != root and m.casefold() == root.casefold()]
        hw = max(twins, key=lambda m: len(hist.get(m, {})))
        h = hist.get(hw, {})
        ie = next((r for r in iecor_rows.get(hw, []) + iecor_rows.get(root, [])), None)
        chain, pie, loan = X.history_chain(h, ie)
        rej = [[b, d, s, i] for b, d, s, i in rejected if b in mset or d in mset]
        in_game = [m for m in ms if m in game_words]
        fam = {"id": fid, "root": root, "size": len(ms), "game_family": game_fam.get(root) or (game_fam.get(in_game[0]) if in_game else None),
               "in_game": len(in_game), "history_from": hw, "history": chain, "pie": pie, "loan": loan,
               "cognates": {k[4:]: v for k, v in h.items() if k.startswith("cog_")}, "edges": fam_edges, "rejected": rej, "words": words}
        shards[bucket(fid)][fid] = clean(fam)
        n_fam += len(ms) > 1

        # review queues (prioritise what the game uses)
        g = bool(in_game)
        for m, d in words.items():
            if d["base"] and not d["base_src"] and len(ms) > 1:
                queues["indirect"].append([fid, m, f"{m} sits in the {root} family without a direct link", g])
            if d["bases"]:
                queues["multi_base"].append([fid, m, f"{m}: candidate bases {', '.join(d['bases'])}", g])
            if d["base_src"] and len(d["base_src"]) == 1 and g:
                queues["single_link"].append([fid, m, f"{d['base']} → {m} only from {d['base_src'][0]}", g])
            lvs = [LEVELS.index(v[0]) for k, v in d["ev"].items() if v[0] in LEVELS and k in ("dib", "merlin", "subs2")]
            if d["game"] and len(lvs) > 1 and max(lvs) - min(lvs) >= 2:
                queues["level_spread"].append([fid, m, f"{m}: evidence " + ", ".join(f"{k} {v[0]}" for k, v in d["ev"].items() if k in ('dib', 'merlin', 'subs2')), g])
        for b, d, s, i in rej:
            if b in mset:
                queues["rejected"].append([fid, d, f"{b} → {d} ({', '.join(s)}) would merge {root} with {fid_of.get(d, '?')[2:]}", g or d in game_words])
        if pie and pie["status"] != "verified" and g:
            queues["pie_" + pie["status"]].append([fid, root, f"{root}: " + " vs ".join(f"{k} {v}" for k, v in pie["claims"].items()), g])
        if g and not chain and not loan:
            queues["no_history"].append([fid, root, f"{root} ({len(in_game)} game words) has no history", g])
        for e in fam_edges:
            if e[2] == "ety_hint" and e[1] in mset:
                queues["ety_hint"].append([fid, e[1], f"{e[0]} ~ {e[1]} (history hint from de Wiktionary)", g])
            if e[2] in ("compound_head", "compound_mod") and e[1] in mset and len(e[3]) == 1 and words[e[1]]["game"]:
                queues["compound_single"].append([fid, e[1], f"{e[1]}: {e[0]} as {e[2][9:]} only from {e[3][0]}", g])

    if OUT.exists(): shutil.rmtree(OUT)
    for sub in ("index", "fam", "queues"): (OUT / sub).mkdir(parents=True)
    for k, d in index.items(): (OUT / "index" / f"{k}.json").write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
    for b, d in shards.items(): (OUT / "fam" / f"{b:03d}.json").write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
    qmeta = {}
    for name, items in queues.items():
        items.sort(key=lambda x: (not x[3], (rank.get(x[1]) or 10**7)))
        (OUT / "queues" / f"{name}.json").write_text(json.dumps(items, ensure_ascii=False, separators=(",", ":")))
        qmeta[name] = {"total": len(items), "in_game": sum(1 for x in items if x[3])}
    val = json.load(open(HERE / "out" / "validation.json"))
    meta = {"audio_base": COMMONS, "generated": datetime.date.today().isoformat(), "buckets": BUCKETS, "letters": sorted(index),
            "lemmas": len(lex), "families": n_fam, "game_words": len(game_words),
            "edges": dict(collections.Counter(e["kind"] for e in edges)), "rejected_merges": len(rejected),
            "queues": qmeta, "validation": val, "sources": v4["sources"], "rules": v4["rules"],
            "precision_sample": {"deriv_1src": "57/60", "deriv_2plus": "60/60", "compound_head": "34/40",
                                 "note": "hand-review of a random sample (seed 42), one reviewer, 2026-10-03"}}
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    size = sum(p.stat().st_size for p in OUT.rglob("*.json"))
    print(f"review export: {len(lex):,} lemmas, {n_fam:,} families, {len(shards)} shards, {size/1e6:.0f} MB, "
          f"queues {qmeta} ({(datetime.datetime.now()-t0).seconds}s)", file=sys.stderr)


if __name__ == "__main__":
    main()
