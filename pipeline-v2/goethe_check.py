"""CHECK ONLY: headwords of the Goethe-Institut A1/A2/B1 lists (copyrighted) to evaluate our level estimates.
Output out/goethe-levels.json is never shipped. Nouns appear with their article; other headwords start a line in
lower case (example sentences start with a capital letter, so a capitalised word without article is skipped)."""
import json, sqlite3
from pathlib import Path
from pypdf import PdfReader
HERE = Path(__file__).resolve().parent
lex = {w for (w,) in sqlite3.connect(HERE / "out" / "graph.db").execute("select word from lexeme")}
levels = {}
for lv in ("A1", "A2", "B1"):
    text = "\n".join(p.extract_text() or "" for p in PdfReader(HERE.parent / "raw-data" / "v2" / "check" / f"goethe-{lv}.pdf").pages)
    found = set()
    for line in text.splitlines():
        t = line.strip().split()
        if not t: continue
        if t[0] in ("der", "die", "das") and len(t) > 1 and t[1][:1].isupper():
            cand = t[1]
        elif t[0][:1].islower():
            cand = t[0]
        else:
            continue
        cand = cand.strip(",.;:()|/")
        if cand in lex: found.add(cand)
    for w in found: levels.setdefault(w, lv)
    print(lv, len(found))
json.dump(levels, open(HERE / "out" / "goethe-levels.json", "w"), ensure_ascii=False)
