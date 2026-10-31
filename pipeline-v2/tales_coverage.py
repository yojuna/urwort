"""Coverage spike: which of our lemmas and families appear in the Grimm tales.

Input: a JSONL file with one tale per line: {"edition", "number", "title", "text"}.
Output: out/tales/coverage.json and a markdown summary on stdout.

Lemmatisation is a lookup, not a tagger: UniMorph forms -> lemma, then our lexicon.
1812 spellings (Thür, seyn, todt, giebt) are tried as rewrites only when the original
token is unknown. Separable verb particles are not reattached (aufhalten in "hielt ... auf"
counts as halten), so derived verbs are undercounted.
"""

import argparse
import collections
import json
import re
import sqlite3
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent

# old spelling -> modern, tried in order on unknown tokens
REWRITES = [
    (r"th", "t"), (r"ey", "ei"), (r"dt$", "t"), (r"ie(b|bt|st)$", r"i\1"),
    (r"ß", "ss"), (r"ss", "ß"), (r"aa", "a"), (r"seyn$", "sein"),
]
TOKEN = re.compile(r"[A-Za-zÄÖÜäöüßſ]+")


def load_lexicon():
    db = sqlite3.connect(HERE / "out/graph.db")
    lex = {w: (pos, fam) for w, pos, fam in db.execute("select word, pos, family from lexeme")}
    forms = collections.defaultdict(set)
    for line in open(ROOT / "raw-data/v2/unimorph-deu.tsv", encoding="utf-8"):
        parts = line.rstrip("\n").split("\t")
        if len(parts) >= 2 and parts[0] in lex:
            forms[parts[1]].add(parts[0])
    for w in lex:
        forms[w].add(w)
    return lex, forms


def candidates(tok):
    yield tok
    if tok[:1].isupper():
        yield tok.lower()
    for pat, rep in REWRITES:
        new = re.sub(pat, rep, tok)
        if new != tok:
            yield new
            if new[:1].isupper():
                yield new.lower()


def lemmatise(tok, forms, scope):
    for c in candidates(tok.replace("ſ", "s")):
        if c in forms:
            lemmas = forms[c]
            in_scope = sorted(l for l in lemmas if l in scope)
            return (in_scope or sorted(lemmas))[0], c != tok
    return None, False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("tales", help="JSONL with edition, number, title, text")
    ap.add_argument("--out", default=str(HERE / "out/tales/coverage.json"))
    args = ap.parse_args()

    v4 = json.load(open(ROOT / "data/urwort-v4.json", encoding="utf-8"))
    scope = v4["words"]
    fam_of = {w: d["family"] for w, d in scope.items()}
    fams = {f["id"]: f for f in v4["families"]}
    multi = {fid for fid, f in fams.items() if len(f["members"]) > 1}
    lex, forms = load_lexicon()

    tales = [json.loads(l) for l in open(args.tales, encoding="utf-8")]
    per_tale, corpus_words, quotes = [], collections.Counter(), collections.defaultdict(list)
    for t in tales:
        toks = TOKEN.findall(t["text"])
        hits, rewritten, oos = collections.Counter(), 0, collections.Counter()
        unknown = 0
        for tok in toks:
            lemma, rw = lemmatise(tok, forms, scope)
            if lemma is None:
                unknown += 1
            elif lemma in scope:
                hits[lemma] += 1
                rewritten += rw
            else:
                oos[lemma] += 1
        fam_tokens = collections.Counter()
        for w, n in hits.items():
            fam_tokens[fam_of[w]] += n
        levels = collections.Counter(scope[w]["level"] or "none" for w in hits)
        per_tale.append({
            "edition": t["edition"], "number": t["number"], "title": t["title"],
            "tokens": len(toks), "unknown": unknown, "rewritten": rewritten,
            "scope_tokens": sum(hits.values()), "scope_words": len(hits),
            "families": len(fam_tokens), "multi_families": sum(1 for f in fam_tokens if f in multi),
            "levels": dict(levels),
            "top_families": [(fams[f]["root"], n) for f, n in fam_tokens.most_common(8)],
            "out_of_scope_top": oos.most_common(10),
        })
        corpus_words.update(hits.keys())
        # one quotation per word per tale: the first sentence containing it (cheap heuristic)
        for sent in re.split(r"(?<=[.!?;:])\s+", t["text"]):
            for tok in TOKEN.findall(sent):
                lemma, _ = lemmatise(tok, forms, scope)
                if lemma in scope and len(quotes[lemma]) < 3 and (t["edition"], t["number"]) not in [q[:2] for q in quotes[lemma]]:
                    quotes[lemma].append((t["edition"], t["number"], sent.strip()[:300]))

    covered_fams = {fam_of[w] for w in corpus_words}
    summary = {
        "tales": len(tales),
        "scope_words_total": len(scope),
        "scope_words_in_corpus": len(corpus_words),
        "multi_families_total": len(multi),
        "multi_families_in_corpus": len(covered_fams & multi),
        "words_with_quotation": len(quotes),
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    json.dump({"summary": summary, "tales": per_tale, "quotes": quotes},
              open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(json.dumps(summary, indent=1))
    print("\n| tale | ed. | tokens | unknown % | scope words | families (multi) | top families |")
    print("|---|---|---|---|---|---|---|")
    for p in sorted(per_tale, key=lambda p: -p["multi_families"]):
        print(f"| {p['number']} {p['title'][:30]} | {p['edition']} | {p['tokens']} | "
              f"{100 * p['unknown'] / max(p['tokens'], 1):.0f} | {p['scope_words']} | "
              f"{p['families']} ({p['multi_families']}) | "
              + ", ".join(f"{r} {n}" for r, n in p["top_families"][:5]) + " |")


if __name__ == "__main__":
    main()
