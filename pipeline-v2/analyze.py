"""Compare pipeline-v2 families with the current game data; write out/report.json + out/samples.tsv.

Scopes
  old   the 1,351 lemmas in game/public/ontology.json (current game)
  top   the 5,000 most frequent content lemmas (wordfreq, CC BY-SA 4.0) - a rough stand-in for A1-B2
"""
import json, random, sqlite3, collections, sys
from pathlib import Path
from wordfreq import top_n_list, zipf_frequency

HERE = Path(__file__).resolve().parent
G = sqlite3.connect(HERE / "out" / "graph.db")
OLD = json.load(open(HERE.parent / "game" / "public" / "ontology.json"))

lex = {w: (pos, fam) for w, pos, fam in G.execute("select word, pos, family from lexeme")}
fam_members = collections.defaultdict(list)
for w, (_, f) in lex.items():
    if f: fam_members[f].append(w)
hist = {w: json.loads(d) for w, d in G.execute("select word, data from history")}
edges = G.execute("select base, derived, kind, sources, n_sources, info from edge").fetchall()
deriv_in = collections.defaultdict(list)
for b, d, k, s, n, i in edges:
    if k == "deriv": deriv_in[d].append(b)


def zipf(w): return zipf_frequency(w, "de")


strong_in = collections.defaultdict(list)
for b, d, k, s, n, i in edges:
    if k == "deriv" and n >= 2: strong_in[d].append(b)


def root_of(fam):
    """Most frequent member with no well-attested (2+ sources) base inside the family; shorter wins ties."""
    ms = set(fam_members[fam])
    roots = [w for w in ms if not any(b in ms for b in strong_in.get(w, []))]
    return max(roots or ms, key=lambda w: (zipf(w), not (w[0].isupper() and w.lower() in ms), -len(w)))  # fahren over Fahren


def hist_of(fam):
    """History of the root, else of the most frequent member that has one (e.g. a noun entry carrying the etymology)."""
    r = root_of(fam)
    if any(k in hist.get(r, {}) for k in ("en_gem-pro", "de_pgmc", "en_from", "en_gmw-pro", "en_goh", "en_dercat")): return r
    cands = [w for w in fam_members[fam] if any(k in hist.get(w, {}) for k in ("en_gem-pro", "de_pgmc", "en_from", "en_gmw-pro", "en_goh", "en_dercat"))]
    return max(cands, key=zipf) if cands else r


# scopes
old_words = [w["lemma"] for c in OLD["clusters"] for w in c["words"]]
old_cluster = {w["lemma"]: c["wurzel"]["id"] for c in OLD["clusters"] for w in c["words"]}
by_fold = collections.defaultdict(list)
for w in lex: by_fold[w.casefold()].append(w)
top = []
for tok in top_n_list("de", 60000):
    for w in by_fold.get(tok, []):
        if w not in top: top.append(w)
    if len(top) >= 5000: break
top = top[:5000]


def scope_stats(words, name):
    words = [w for w in words if w in lex]
    in_fam = [w for w in words if lex[w][1]]
    fams = collections.Counter(lex[w][1] for w in in_fam)
    sizes_full = [len(fam_members[f]) for f in fams]
    sizes_scope = list(fams.values())
    roots = [hist_of(f) for f in fams]
    def h(w, *keys): return any(k in hist.get(w, {}) for k in keys)
    pgmc = sum(h(r, "en_gem-pro", "de_pgmc") for r in roots)
    germanic_any = sum(h(r, "en_gem-pro", "de_pgmc", "en_gmw-pro", "en_goh") or "gem-pro" in hist.get(r, {}).get("en_dercat", []) for r in roots)
    pie_cat = sum("ine-pro" in hist.get(r, {}).get("en_dercat", []) and not h(r, "en_ine-pro") for r in roots)
    pie_en = sum(h(r, "en_ine-pro") for r in roots)
    pie_de = sum(h(r, "de_pie") for r in roots)
    pie_both = sum(h(r, "en_ine-pro") and h(r, "de_pie") for r in roots)
    cog_en = sum(h(r, "cog_en", "cog_ang", "cog_enm") for r in roots)
    borrowed = sum(h(r, "en_from") and not h(r, "en_gem-pro") for r in roots)
    comp = sum(1 for w in words if any(k == "compound_head" and d == w for b, d, k, *_ in edges_by_der.get(w, [])))
    return {
        "scope": name, "lemmas_found": len(words),
        "in_multi_member_family": len(in_fam), "pct_in_family": round(100 * len(in_fam) / max(1, len(words)), 1),
        "families": len(fams),
        "family_size_full_median": sorted(sizes_full)[len(sizes_full) // 2] if sizes_full else 0,
        "family_size_in_scope_dist": dict(sorted(collections.Counter(min(s, 10) for s in sizes_scope).items())),
        "roots_with_pgmc": pgmc, "roots_with_germanic_chain_any": germanic_any, "roots_with_pie_category_only": pie_cat, "roots_with_pie_en": pie_en, "roots_with_pie_de": pie_de, "roots_with_pie_both": pie_both,
        "roots_with_english_cognate": cog_en, "roots_borrowed": borrowed,
        "scope_words_that_are_compounds": comp,
    }


edges_by_der = collections.defaultdict(list)
for e in edges: edges_by_der[e[1]].append(e)

report = {"old_game": {
    "words": len(old_words), "clusters": len(OLD["clusters"]),
    "pct_in_multi_word_cluster": round(100 * sum(1 for c in OLD["clusters"] if len(c["words"]) > 1 for _ in c["words"]) / len(old_words), 1)}}
report["new_old_scope"] = scope_stats(old_words, "old")
report["new_top5000"] = scope_stats(top, "top5000")

# agreement: old multi-word clusters vs new families
pairs = agree = 0
disagreements = collections.defaultdict(list)
for c in OLD["clusters"]:
    ws = [w["lemma"] for w in c["words"]]
    for i in range(len(ws)):
        for j in range(i + 1, len(ws)):
            a, b = ws[i], ws[j]
            if a not in lex or b not in lex: continue
            pairs += 1
            same = lex[a][1] and lex[a][1] == lex[b][1]
            agree += bool(same)
            if not same: disagreements[c["wurzel"]["form"]].append(f"{a}/{b}")
report["old_pair_agreement"] = {"pairs": pairs, "kept_together": agree, "pct": round(100 * agree / max(1, pairs), 1),
                                "split_examples": {k: v[:4] for k, v in list(disagreements.items())[:15]}}

# edge evidence inside top-5000 families
topset = set(top)
deriv_top = [e for e in edges if e[2] == "deriv" and e[0] in topset and e[1] in topset]
report["deriv_edges_top5000"] = {"total": len(deriv_top),
                                 "by_sources": dict(collections.Counter(e[3] for e in deriv_top).most_common(12)),
                                 "pct_2plus_sources": round(100 * sum(e[4] >= 2 for e in deriv_top) / max(1, len(deriv_top)), 1)}

# example families for the top scope
ex = {}
for w in ["fahren", "stehen", "sprechen", "Hand", "schön", "wohnen", "gewinnen", "Wunsch", "Schalter", "schade", "Reise", "Karte"]:
    if w in lex and lex[w][1]:
        f = lex[w][1]
        ms = sorted(fam_members[f], key=lambda x: -zipf(x))
        ex[w] = {"root": root_of(f), "size": len(ms), "top_members": ms[:15], "in_top5000": [m for m in ms if m in topset][:20],
                 "history": hist.get(hist_of(f), {}), "history_from": hist_of(f)}
    else:
        ex[w] = {"root": None, "note": "no family (singleton)", "history": hist.get(w, {})}
report["examples"] = ex
json.dump(report, open(HERE / "out" / "report.json", "w"), ensure_ascii=False, indent=1)

# review sample: stratified, for manual precision estimates
random.seed(42)
one = [e for e in deriv_top if e[4] == 1]
multi = [e for e in deriv_top if e[4] >= 2]
comp = [e for e in edges if e[2] == "compound_head" and e[1] in topset]
with open(HERE / "out" / "samples.tsv", "w") as f:
    f.write("stratum\tbase\tderived\tkind\tsources\tinfo\tverdict\tnote\n")
    for name, pool, n in [("deriv_1src", one, 60), ("deriv_2plus", multi, 60), ("compound", comp, 40)]:
        for e in random.sample(pool, min(n, len(pool))):
            f.write(f"{name}\t{e[0]}\t{e[1]}\t{e[2]}\t{e[3]}\t{e[5] or ''}\t\t\n")
print(json.dumps(report, ensure_ascii=False, indent=1)[:6000])
