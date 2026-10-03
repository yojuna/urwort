"""Export game data from out/graph.db + out/lex.db.

  out/urwort-v4.json        canonical data (families, words, bridges, history, provenance)
  game/public/ontology.json the same data in the current client's v3 format (with --game)

Scope: the N most frequent German content lemmas (wordfreq), plus each family's root.
Rules (decided with the user, 2026-10-03):
  - families are present-day (synchronic); history is a separate layer
  - Proto-Indo-European is shown only when two independent sources give it
    (English Wiktionary chain + German Wiktionary Herkunft); otherwise history stops at Proto-Germanic
  - only commercial-safe sources (CC BY-SA / CC0) are shipped
Usage: .venv/bin/python export.py [--n 5000] [--game]
"""
import argparse, json, re, sqlite3, collections, datetime, unicodedata
from pathlib import Path
from wordfreq import top_n_list, zipf_frequency

HERE = Path(__file__).resolve().parent
G = sqlite3.connect(HERE / "out" / "graph.db")
L = sqlite3.connect(HERE / "out" / "lex.db")

LANG_NAMES = {"gmh": "Middle High German", "goh": "Old High German", "gmw-pro": "Proto-West-Germanic",
              "gem-pro": "Proto-Germanic", "ine-pro": "Proto-Indo-European", "la": "Latin", "ML.": "Medieval Latin",
              "LL.": "Late Latin", "fr": "French", "fro": "Old French", "frm": "Middle French", "grc": "Ancient Greek",
              "it": "Italian", "en": "English", "nl": "Dutch", "gml": "Middle Low German", "nds": "Low German",
              "es": "Spanish", "pt": "Portuguese", "ru": "Russian", "pl": "Polish", "cs": "Czech", "ar": "Arabic",
              "tr": "Turkish", "fa": "Persian", "he": "Hebrew", "yi": "Yiddish", "sv": "Swedish", "da": "Danish",
              "got": "Gothic", "ang": "Old English", "enm": "Middle English", "non": "Old Norse", "la-new": "New Latin",
              "la-lat": "Late Latin", "la-med": "Medieval Latin", "dum": "Middle Dutch", "osx": "Old Saxon"}
STAGE_ORDER = ["ine-pro", "gem-pro", "gmw-pro", "goh", "gmh"]  # oldest first
POS_MAP = {"noun": "NOUN", "verb": "VERB", "adj": "ADJ", "adv": "ADV"}
INSEPARABLE = ("be", "ge", "er", "ver", "zer", "ent", "emp", "miss", "un", "ur")


def zipf(w): return zipf_frequency(w, "de")


def load():
    lex = {w: {"pos": p.split(","), "family": f} for w, p, f in G.execute("select word, pos, family from lexeme")}
    hist = {w: json.loads(d) for w, d in G.execute("select word, data from history")}
    edges = [dict(zip(("base", "derived", "kind", "sources", "n", "info"), r)) for r in
             G.execute("select base, derived, kind, sources, n_sources, info from edge")]
    for e in edges:
        e["sources"] = e["sources"].split(","); e["info"] = json.loads(e["info"]) if e["info"] else {}
    return lex, hist, edges


def wikt_info(word):
    """IPA, audio, glosses (en, de), main POS from both Wiktionary editions."""
    out = {"ipa": None, "audio": None, "gloss_en": [], "gloss_de": [], "pos": None}
    for src, pos, ipa, audio, glosses, kind in L.execute(
            "select src, pos, ipa, audio, glosses, kind from wikt where word=? and kind in "
            "('lemma','Substantiv','Verb','Adjektiv','Adverb')", (word,)):
        g = json.loads(glosses) if glosses else []
        if src == "de":
            out["ipa"] = out["ipa"] or ipa; out["audio"] = out["audio"] or audio
            out["gloss_de"] += [x for x in g if x not in out["gloss_de"]]
        else:
            out["ipa"] = out["ipa"] or ipa
            out["gloss_en"] += [x for x in g if x not in out["gloss_en"]]
        out["pos"] = out["pos"] or POS_MAP.get(pos)
    def dedupe(xs):
        seen, res = set(), []
        for x in xs:
            k = x.strip().rstrip(".").casefold()
            if k and k not in seen: seen.add(k); res.append(x.strip())
        return res[:4]
    out["gloss_en"], out["gloss_de"] = dedupe(out["gloss_en"]), dedupe(out["gloss_de"])
    if out["ipa"]:  # stored without /…/ or […] delimiters; the client adds its own
        out["ipa"] = out["ipa"].strip().strip("/[]").strip()
    return out


def recon(lang, form):
    r = L.execute("select ety_templates, descendants, gloss from recon where lang=? and word=?",
                  (lang, form.lstrip("*"))).fetchone()
    return (json.loads(r[0]) if r and r[0] else [], json.loads(r[1]) if r and r[1] else [], r[2] if r else None)


PROTO = ("gmw-pro", "gem-pro", "ine-pro")


def recon_loan(stages):
    """A loan recorded on a reconstruction page: {{bor|gmw-pro|la|fenestra}} etc."""
    for lo in ("gmw-pro", "gem-pro"):
        if lo in stages:
            for t in recon(lo, stages[lo]["form"])[0]:
                a = t["args"]
                # proto-language sources (ira-pro *kátah for *hūsą) are hypotheses, not attested loans
                if (t["name"] in ("bor", "der", "lbor", "bor+", "der+") and a.get("2") and not a["2"].endswith("-pro")
                        and a.get("3") and not (lo == "gem-pro" and t["name"] in ("der", "der+"))):
                    return {"lang_code": a["2"], "lang": LANG_NAMES.get(a["2"], a["2"]), "form": a["3"],
                            "sources": ["wikt_en:reconstruction"]}
    return None


def history_chain(h):
    """Merge the word's own chain with the reconstruction pages. Each stage records its sources."""
    stages = {}
    for st in STAGE_ORDER:
        if h.get("en_" + st):
            stages[st] = {"form": h["en_" + st], "sources": ["wikt_en:entry"]}
    # follow reconstruction pages downward-up: gmw-pro -> gem-pro -> ine-pro
    for lo, hi in (("gmw-pro", "gem-pro"), ("gem-pro", "ine-pro")):
        if lo in stages:
            tmpl, _, gloss = recon(lo, stages[lo]["form"])
            stages[lo]["gloss"] = stages[lo].get("gloss") or gloss
            if any(t["name"] in ("unc", "uncertain") for t in tmpl):
                stages[lo]["origin_uncertain"] = True  # Wiktionary marks the etymology beyond this stage as uncertain
            for t in tmpl:
                a = t["args"]
                if t["name"] in ("inh", "der", "inh+", "der+") and a.get("2") == hi and a.get("3"):
                    if hi not in stages:
                        stages[hi] = {"form": a["3"], "sources": ["wikt_en:reconstruction"]}
                    elif "wikt_en:reconstruction" not in stages[hi]["sources"]:
                        stages[hi]["sources"].append("wikt_en:reconstruction")
                    if a.get("5") or a.get("t"):
                        stages[hi]["gloss"] = a.get("5") or a.get("t")
                    break
    if "gem-pro" in stages and not stages["gem-pro"].get("gloss"):
        stages["gem-pro"]["gloss"] = recon("gem-pro", stages["gem-pro"]["form"])[2]
    norm = lambda x: unicodedata.normalize("NFKD", x).encode("ascii", "ignore").decode().lower().strip("*")
    for st in ("gmh", "goh"):
        if h.get("de_" + st):
            if st in stages and norm(stages[st]["form"]) == norm(h["de_" + st]):
                stages[st]["sources"].append("wikt_de")
            elif st not in stages:
                stages[st] = {"form": h["de_" + st], "sources": ["wikt_de"]}
    if h.get("de_pgmc"):
        stages.setdefault("gem-pro", {"form": h["de_pgmc"], "sources": []})["sources"].append("wikt_de")
    pie = None
    if "ine-pro" in stages:
        en_pie = stages.pop("ine-pro")
        verified = bool(h.get("de_pie"))
        pie = {"form": en_pie["form"], "gloss": en_pie.get("gloss"), "sources": en_pie["sources"] + (["wikt_de"] if verified else []),
               "de_form": h.get("de_pie"), "status": "verified" if verified else "single_source"}
    loan = recon_loan(stages)
    chain = [{"stage": st, "lang": LANG_NAMES[st], "form": stages[st]["form"], "gloss": stages[st].get("gloss"),
              "sources": stages[st]["sources"], "origin_uncertain": stages[st].get("origin_uncertain", False)} for st in STAGE_ORDER if st in stages]
    return chain, pie, loan


def segment(word, path_affixes, pos):
    """Split the surface form with the affixes met on the derivation path (outermost last in path_affixes)."""
    segs_pre, segs_suf, rest = [], [], word
    for aff in reversed(path_affixes):  # outermost affix first
        a = aff.strip()
        if a.endswith("-") and len(a) > 1 and rest.lower().startswith(a[:-1].lower()) and len(rest) > len(a):
            p = rest[:len(a) - 1]
            segs_pre.append({"form": p, "type": "prefix",
                             "function": "inseparable" if a[:-1].lower() in INSEPARABLE else "separable / particle"})
            rest = rest[len(p):]
        elif a.startswith("-") and len(a) > 1 and rest.lower().endswith(a[1:].lower()) and len(rest) > len(a):
            s = rest[-(len(a) - 1):]
            segs_suf.insert(0, {"form": s, "type": "suffix", "function": ""})
            rest = rest[:-len(s)]
    if pos == "VERB" and not any(s["type"] == "suffix" for s in segs_suf) and re.search(r"(?<=[^e])(e?n)$", rest) and len(rest) > 3:
        m = re.search(r"(e?n)$", rest)
        segs_suf.append({"form": m.group(1), "type": "suffix", "function": "infinitive"}); rest = rest[:m.start()]
    return segs_pre + [{"form": rest, "type": "root", "function": ""}] + segs_suf


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=5000)
    ap.add_argument("--game", action="store_true", help="also write game/public/ontology.json (v3 format)")
    args = ap.parse_args()
    lex, hist, edges = load()

    # scope: top-N content lemmas by frequency
    by_fold = collections.defaultdict(list)
    for w in lex: by_fold[w.casefold()].append(w)
    scope, rank = [], {}
    for tok in top_n_list("de", 80000):
        for w in by_fold.get(tok, []):
            if w not in rank:
                rank[w] = len(scope) + 1; scope.append(w)
        if len(scope) >= args.n: break
    scope = scope[:args.n]; scope_set = set(scope)

    fam_members = collections.defaultdict(list)
    for w, e in lex.items():
        if e["family"]: fam_members[e["family"]].append(w)
    deriv_in = collections.defaultdict(list)
    for e in edges:
        if e["kind"] == "deriv": deriv_in[e["derived"]].append(e)

    def root_of(f):
        ms = set(fam_members[f])
        roots = [w for w in ms if not any(e["base"] in ms and e["n"] >= 2 for e in deriv_in.get(w, []))]
        return max(roots or ms, key=lambda w: (zipf(w), not (w[0].isupper() and w.lower() in ms), -len(w)))

    def parent_tree(f, root):
        """BFS tree over the family's derivation links, preferring better-attested links; returns {word: (base, edge)}."""
        ms = set(fam_members[f])
        adj = collections.defaultdict(list)
        for w in ms:
            for e in deriv_in.get(w, []):
                if e["base"] in ms:
                    adj[e["base"]].append((w, e))
        tree, q = {root: (None, None)}, [root]
        for x in q:
            for w, e in sorted(adj[x], key=lambda t: -t[1]["n"]):
                if w not in tree:
                    tree[w] = (x, e); q.append(w)
        for w in ms - set(tree):  # links pointing the other way: attach to the root, no affix info
            tree[w] = (root, None)
        return tree

    families, words, used_fams = [], {}, {}
    for w in scope:
        f = lex[w]["family"]
        if f and f not in used_fams: used_fams[f] = None
    for f in used_fams:
        root = root_of(f)
        tree = parent_tree(f, root)
        members = [m for m in fam_members[f] if m in scope_set or m == root]
        # history: the root's, else the best-attested member's (often the noun carries the etymology)
        # history from the root itself, or its noun/verb twin (fahren/Fahren); never from another member
        twins = [root] + [m for m in fam_members[f] if m != root and m.casefold() == root.casefold()]
        hw = max(twins, key=lambda m: len(hist.get(m, {})))
        h = hist.get(hw, {})
        chain, pie, loan = history_chain(h)
        borrowed = loan
        if not borrowed and h.get("en_from") and (not chain or h["en_from"].split(":")[0] not in ("gml", "nds", "dum", "osx", "ang", "non", "got", "nl", "odt", "ofs", "goh", "gmh", "gmw-pro", "gem-pro")):
            code, _, form = h["en_from"].partition(":")
            borrowed = {"lang_code": code, "lang": LANG_NAMES.get(code, code), "form": form, "sources": ["wikt_en:entry"]}
        cognates = {k[4:]: v for k, v in h.items() if k.startswith("cog_")}
        fid = f"fam-{len(families) + 1}"
        families.append({"id": fid, "root": root, "members": members, "size_full": len(fam_members[f]),
                         "history_from": hw, "history": chain, "pie": pie, "borrowed_from": borrowed,
                         "cognates": cognates, "weight": round(sum(zipf(m) for m in members), 2)})
        for m in members:
            info = wikt_info(m)
            path, x = [], m
            while tree.get(x, (None, None))[0] is not None:
                base, e = tree[x]
                if e:
                    aff = next((e["info"][s] for s in ("wikt_de", "wikt_en", "morphynet") if e["info"].get(s)), None)
                    if aff: path.append(aff.split(",")[-1])
                x = base
            pos = info["pos"] or POS_MAP.get(lex[m]["pos"][0])
            words[m] = {"family": fid, "pos": pos, "rank": rank.get(m), "in_scope": m in scope_set,
                        "base": tree.get(m, (None,))[0],
                        "base_sources": (tree.get(m, (None, None))[1] or {}).get("sources"),
                        "segments": segment(m, list(reversed(path)), pos) if m != root else None,
                        "ipa": info["ipa"], "audio": info["audio"], "gloss_en": info["gloss_en"], "gloss_de": info["gloss_de"]}

    # unattached scope words (no family) become single-word families so nothing is lost
    for w in scope:
        if w in words: continue
        info = wikt_info(w); h = hist.get(w, {})
        chain, pie, loan = history_chain(h)
        fid = f"fam-{len(families) + 1}"
        borrowed = loan
        if not borrowed and h.get("en_from") and (not chain or h["en_from"].split(":")[0] not in ("gml", "nds", "dum", "osx", "ang", "non", "got", "nl", "odt", "ofs", "goh", "gmh", "gmw-pro", "gem-pro")):
            code, _, form = h["en_from"].partition(":")
            borrowed = {"lang_code": code, "lang": LANG_NAMES.get(code, code), "form": form, "sources": ["wikt_en:entry"]}
        families.append({"id": fid, "root": w, "members": [w], "size_full": 1, "history_from": w, "history": chain, "pie": pie,
                         "borrowed_from": borrowed, "cognates": {k[4:]: v for k, v in h.items() if k.startswith("cog_")},
                         "weight": round(zipf(w), 2)})
        words[w] = {"family": fid, "pos": info["pos"] or POS_MAP.get(lex[w]["pos"][0]), "rank": rank.get(w), "in_scope": True,
                    "base": None, "base_sources": None, "segments": None, "ipa": info["ipa"], "audio": info["audio"],
                    "gloss_en": info["gloss_en"], "gloss_de": info["gloss_de"]}

    # last resort for loan origin: a category-level claim (dercat) naming a non-Germanic source language
    germanic = {"gml", "nds", "dum", "osx", "ang", "non", "got", "nl", "odt", "ofs", "goh", "gmh", *PROTO}
    for fam in families:
        if not fam["borrowed_from"]:
            langs = [l for l in hist.get(fam["history_from"], {}).get("en_dercat", []) if l not in germanic]
            if langs:
                fam["borrowed_from"] = {"lang_code": langs[0], "lang": LANG_NAMES.get(langs[0], langs[0]), "form": None,
                                        "sources": ["wikt_en:category"]}

    # bridges: compounds and causative pairs among exported words
    bridges = collections.defaultdict(lambda: {"modifiers": [], "head": None, "sources": set()})
    for e in edges:
        if e["kind"] in ("compound_head", "compound_mod") and e["derived"] in words and e["base"] in lex:
            b = bridges[e["derived"]]
            b["sources"].update(e["sources"])
            if e["kind"] == "compound_head": b["head"] = e["base"]
            elif e["base"] not in b["modifiers"]: b["modifiers"].append(e["base"])
    bridge_list = [{"kind": "compound", "word": w, "head": b["head"], "modifiers": b["modifiers"],
                    "confidence": "high" if len(b["sources"]) >= 2 else "single_source", "sources": sorted(b["sources"])}
                   for w, b in bridges.items() if b["head"] or b["modifiers"]]
    bridge_list += [{"kind": "causative", "word": e["derived"], "head": e["base"], "modifiers": [],
                     "confidence": "single_source", "sources": e["sources"]}
                    for e in edges if e["kind"] == "causative" and e["derived"] in words and e["base"] in words]

    families.sort(key=lambda f: -f["weight"])
    sources = {"derivbase": "DErivBase 2.0, Zeller/Šnajder/Padó 2013, CC BY-SA 3.0",
               "wikt_en": "English Wiktionary via kaikki.org (Ylonen 2022), CC BY-SA 4.0",
               "wikt_de": "German Wiktionary via kaikki.org, CC BY-SA 4.0",
               "morphynet": "MorphyNet, Batsuren et al. 2021, CC BY-SA 3.0",
               "wordfreq": "wordfreq 3, Speer 2022, CC BY-SA 4.0"}
    v4 = {"version": 4, "generated": datetime.date.today().isoformat(), "license": "CC BY-SA 4.0", "sources": sources,
          "scope": {"kind": "top-N content lemmas by frequency (wordfreq)", "n": args.n},
          "rules": {"pie": "shown only when English and German Wiktionary both give a PIE root (status 'verified')",
                    "families": "present-day derivation families; compounds and causatives are bridges"},
          "families": families, "words": words, "bridges": bridge_list}
    (HERE / "out" / "urwort-v4.json").write_text(json.dumps(v4, ensure_ascii=False, separators=(",", ":")))
    multi = sum(1 for f in families if len(f["members"]) > 1)
    print(f"v4: {len(families):,} families ({multi:,} with 2+ words), {len(words):,} words, {len(bridge_list):,} bridges")
    if args.game:
        write_v3(v4)


def write_v3(v4):
    """Adapter for the current client (game/src/types/ontology.ts)."""
    words, clusters = v4["words"], []
    word_id = {w: f"{w}|{d['pos'] or 'X'}" for w, d in words.items()}
    comp_by_family = collections.defaultdict(list)
    for b in v4["bridges"]:
        if b["kind"] == "compound" and b["word"] in words:
            parts = [m for m in b["modifiers"] + ([b["head"]] if b["head"] else []) if m in words]
            if parts:
                comp_by_family[words[b["word"]]["family"]].append({
                    "compound_wort_id": word_id[b["word"]], "component_wort_ids": [word_id[p] for p in parts],
                    "split_display": "·".join(b["modifiers"] + ([b["head"]] if b["head"] else []))})
    for f in v4["families"]:
        root = f["root"]
        chain = [{"stage": s["stage"], "form": s["form"], "lang_name": s["lang"], "is_reconstructed": s["form"].startswith("*")}
                 for s in f["history"]]
        if f["pie"] and f["pie"]["status"] == "verified":
            chain.insert(0, {"stage": "ine-pro", "form": f["pie"]["form"], "lang_name": "Proto-Indo-European", "is_reconstructed": True})
        if chain:
            chain.append({"stage": "nhg", "form": root, "lang_name": "Modern German", "is_reconstructed": False})
        origin = chain[0]["lang_name"] if chain else (f["borrowed_from"]["lang"] if f["borrowed_from"] else "Modern German")
        gem = next((s["form"] for s in f["history"] if s["stage"] == "gem-pro"), None)
        cog_names = {"en": "English", "nl": "Dutch", "got": "Gothic", "ang": "Old English", "enm": "Middle English",
                     "non": "Old Norse", "sv": "Swedish", "da": "Danish"}
        rw = words.get(root) or {}
        cluster = {
            "wurzel": {"id": f["id"], "form": root, "meaning_de": (rw.get("gloss_de") or [""])[0],
                       "meaning_en": (rw.get("gloss_en") or [""])[0], "origin_lang": origin, "proto_form": gem,
                       "etymology_chain": chain,
                       "cognates": [{"language": cog_names.get(k, k), "form": v} for k, v in f["cognates"].items()],
                       "borrowing_info": ({"from_lang": f["borrowed_from"]["lang"], "form": f["borrowed_from"]["form"],
                                           "lang_code": f["borrowed_from"]["lang_code"]} if f["borrowed_from"] else None),
                       "source_urls": {"wiktionary": f"https://en.wiktionary.org/wiki/{f['history_from']}#German",
                                       "wiktionary_de": f"https://de.wiktionary.org/wiki/{f['history_from']}"}},
            "words": [], "links": [], "compounds": comp_by_family.get(f["id"], [])}
        for m in sorted(f["members"], key=lambda m: (words[m]["rank"] or 10**6)):
            d = words[m]
            cluster["words"].append({
                "id": word_id[m], "lemma": m, "pos": d["pos"] or "X", "ipa": d["ipa"],
                "definition_en": "; ".join(d["gloss_en"][:2]), "definition_de": "; ".join(d["gloss_de"][:2]),
                "segments": d["segments"] if d["segments"] and len(d["segments"]) > 1 else None,
                "source_urls": {"wiktionary": f"https://en.wiktionary.org/wiki/{m}#German",
                                "wiktionary_de": f"https://de.wiktionary.org/wiki/{m}",
                                "dwds": f"https://www.dwds.de/wb/{m}"}})
            cluster["links"].append({"wurzel_id": f["id"], "wort_id": word_id[m]})
        clusters.append(cluster)
    stats = {"total_clusters": len(clusters), "multi_word_clusters": sum(len(c["words"]) > 1 for c in clusters),
             "total_words": len(words), "total_compounds": sum(len(c["compounds"]) for c in clusters),
             "clusters_with_etymology_chain": sum(bool(c["wurzel"]["etymology_chain"]) for c in clusters),
             "words_with_segments": sum(1 for c in clusters for w in c["words"] if w["segments"])}
    out = {"version": 3, "generated_from": "pipeline-v2 urwort-v4.json", "license": v4["license"], "sources": v4["sources"],
           "stats": stats, "clusters": clusters}
    path = HERE.parent / "game" / "public" / "ontology.json"
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"v3 (game): {stats} -> {path} ({path.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
