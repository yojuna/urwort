"""Case-sensitive token counts from a German Commons sample -> out/case_counts.tsv

wordfreq and FrequencyWords are case-folded, so 'Die' (a semiconductor die) gets the rank of the article 'die'.
This counts how often each spelling (die / Die / DIE) occurs NOT at the start of a sentence, where German
capitalisation carries meaning. freq.py turns the counts into a share per spelling.

Sample (all openly licensed; the counts are derived numbers and are not shipped as text):
  The German Commons (coral-nlp/german-commons): Wikipedia, Wikibooks, Wikivoyage, Wikinews (CC BY-SA / CC BY),
  Bundestag plenary minutes (CC0), German Political Speeches (CC BY-SA), and narrative prose from Wikisource and
  DiBiLit (CC BY-SA; 18th-19th century, so stories' words like weinen and schau are not drowned out by Wein and
  Schau). At most CAP model tokens per source.
Download: see download.sh (german-commons section); files go to raw-data/v2/german-commons/.
Usage: .venv/bin/python case_counts.py
Output columns: form, n_inner (not sentence-initial), n_initial

Also writes out/function_words.txt: words German Wiktionary (kaikki) lists as article, pronoun, preposition,
conjunction, numeral, particle or contraction. freq.py uses it to tell 'die' (article) from 'waren' (verb form).
"""
import collections, re, sys
from pathlib import Path
import pyarrow.parquet as pq
import freq

HERE = Path(__file__).resolve().parent
SRC = HERE.parent / "raw-data" / "v2" / "german-commons"
CAP = 25_000_000
FUNCTION_POS = {"det", "pron", "prep", "postp", "conj", "num", "particle"}
ENTRY = re.compile(r'^\{"word": "([^"]+)", "pos": "([a-z_]+)", "pos_title": "([^"]*)"')
WORD = re.compile(r"[A-Za-zÄÖÜäöüß]+")
SENT = re.compile(r"(?<=[.!?:;])\s+|\n+")

fw = set()
with open(HERE.parent / "raw-data" / "v2" / "kaikki-de-Deutsch.jsonl", encoding="utf-8") as kaikki:
    for line in kaikki:
        m = ENTRY.match(line)
        if m and (m.group(2) in FUNCTION_POS or m.group(3) == "Kontraktion"): fw.add(m.group(1))
(HERE / "out" / "function_words.txt").write_text("\n".join(sorted(fw)) + "\n", encoding="utf-8")
print(f"function words: {len(fw):,}", file=sys.stderr)

keep = {w.casefold() for w in freq.content_spellings()}

inner, initial = collections.Counter(), collections.Counter()
for f in sorted(SRC.glob("*.parquet")):
    pf, used = pq.ParquetFile(f), 0
    for batch in pf.iter_batches(columns=["text", "num_tokens"], batch_size=20):
        for text, nt in zip(batch.column("text").to_pylist(), batch.column("num_tokens").to_pylist()):
            for sent in SENT.split(text):
                toks = WORD.findall(sent)
                if not toks: continue
                if toks[0].casefold() in keep: initial[toks[0]] += 1
                inner.update(t for t in toks[1:] if t.casefold() in keep)
            used += nt or 0
        if used >= CAP: break
    print(f"{f.name}: {used / 1e6:.1f} M tokens, {len(inner):,} forms so far", file=sys.stderr)

with open(HERE / "out" / "case_counts.tsv", "w", encoding="utf-8") as out:
    for w in sorted(set(inner) | set(initial)):
        out.write(f"{w}\t{inner[w]}\t{initial[w]}\n")
print(f"wrote {len(set(inner) | set(initial)):,} forms", file=sys.stderr)
