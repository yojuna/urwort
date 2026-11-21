"""Case-aware German word frequency. Fixes the case-folding bug found in the 2026-10-31 audit.

wordfreq is case-folded: zipf('Die') == zipf('die'), so the noun 'Die' (a semiconductor die) took the article's
rank 1, 'DAS' rank 3, 'Ich' (the ego) the pronoun's. Two rules split a folded frequency between spellings:

  1. Function-word twins. A lowercase word is closed-class when German Wiktionary lists it as an article,
     pronoun, preposition, conjunction, numeral, particle or contraction (out/function_words.txt), it is in
     wordfreq's top CLOSED_TOP, it is neither a lexicon lemma nor an inflected form of one, and it is written in
     lowercase at least CLOSED_LOWER of the time when not sentence-initial ('die' yes; 'zeit', a rare
     preposition, no: that is the noun 'Zeit'; 'waren' no: a verb form, so 'Waren' (goods) keeps its share). Its capitalised or all-caps twin gets nothing
     ('Die', 'Ich', 'DAS'). Even a 1% capitalised share of 'die' (titles: 'Fraktion Die Linke') would rank the
     noun in the top 500, so the case counts cannot be used here.
  2. Everything else gets its share of the occurrences that are not sentence-initial in a case-sensitive sample
     (out/case_counts.tsv, made by case_counts.py): 'Macht' vs 'macht', 'Leben' vs 'leben', 'Reif' vs 'reif'.
     With fewer than MIN_EVIDENCE occurrences, a spelling keeps the full folded frequency (rare words, little
     harm), except all-caps spellings, which get none. An all-caps spelling only counts when it is the main
     spelling ('EU', 'USA'); 'SO' at 0.1% of 'so' would still rank in the top 5,000.
"""
import collections, math, sqlite3
from functools import lru_cache
from pathlib import Path
from wordfreq import top_n_list, word_frequency

HERE = Path(__file__).resolve().parent
MIN_EVIDENCE = 20
CLOSED_TOP = 3000
CLOSED_LOWER = 0.5


@lru_cache(None)
def _counts():
    path = HERE / "out" / "case_counts.tsv"
    if not path.exists():
        raise SystemExit("out/case_counts.tsv is missing: run case_counts.py first")
    c = collections.defaultdict(dict)   # folded -> {spelling: n not sentence-initial}
    for line in open(path, encoding="utf-8"):
        w, inner, _ = line.rstrip("\n").split("\t")
        c[w.casefold()][w] = int(inner)
    return c


@lru_cache(None)
def content_spellings():
    """Lexicon lemmas plus their inflected forms (UniMorph, read from the raw file so this works before enrich.py)."""
    lex = {w for (w,) in sqlite3.connect(HERE / "out" / "graph.db").execute("select word from lexeme")}
    out = set(lex)
    for line in open(HERE.parent / "raw-data" / "v2" / "unimorph-deu.tsv", encoding="utf-8"):
        p = line.rstrip("\n").split("\t")
        if len(p) == 3 and p[0] in lex: out.add(p[1])
    return frozenset(out)


@lru_cache(None)
def closed_class():
    """Frequent lowercase words that are not content words: articles, pronouns, prepositions, conjunctions..."""
    content = content_spellings()
    fw = set((HERE / "out" / "function_words.txt").read_text(encoding="utf-8").split())
    def lower_share(t):
        c = _counts().get(t, {})
        return c.get(t, 0) / max(1, sum(c.values()))
    return frozenset(t for t in top_n_list("de", CLOSED_TOP)
                     if t in fw and t not in content and lower_share(t) >= CLOSED_LOWER)


def is_allcaps(w): return len(w) > 1 and w.isupper()


@lru_cache(None)
def share(w):
    """The part of the case-folded frequency that belongs to this spelling (0..1). Works for inflected forms too."""
    f = w.casefold()
    if w != f and f in closed_class():
        return 0.0
    c = _counts().get(f, {})
    total = sum(c.values())
    if total < MIN_EVIDENCE:
        return 0.0 if is_allcaps(w) else 1.0
    sh = c.get(w, 0) / total
    return 0.0 if is_allcaps(w) and sh < 0.5 else sh   # 'EU' yes; 'SO', 'AB' (stray caps of so, ab) no


def freq(w): return word_frequency(w, "de") * share(w)


def zipf(w):
    f = freq(w)
    return round(math.log10(f * 1e9), 2) if f > 0 else 0.0


def ranked(words, depth=200_000):
    """Words in order of case-aware frequency, most frequent first. Words outside wordfreq's top `depth`
    and words with no share (function-word twins) are left out."""
    by_fold = collections.defaultdict(list)
    for w in words: by_fold[w.casefold()].append(w)
    seen, cands = set(), []
    for i, tok in enumerate(top_n_list("de", depth)):
        for w in by_fold.get(tok, []):
            if w not in seen and share(w) > 0:
                seen.add(w); cands.append((-freq(w), i, w))
    return [w for _, _, w in sorted(cands)]
