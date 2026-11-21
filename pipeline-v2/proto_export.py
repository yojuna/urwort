"""Export the word data for the client prototype from the dialogue and maps.

Collects every word used in client/src/story/main.ink and the LDtk maps (client/public/maps/urwort.ldtk), lemmatises it
(UniMorph lookup, as in tales_coverage.py), and writes client/public/data/slice.json:
words (glosses, IPA, audio, level, family, history, a quotation from the tales),
inflected forms -> lemma (for tappable words), and rune edges (base + affix -> derived,
2+ sources only). Also writes client/story-lint.txt: unknown tokens and words above A2.
"""

import collections
import json
import re
import sqlite3
from pathlib import Path

import tales_coverage as tc

HERE = Path(__file__).parent
ROOT = HERE.parent
CLIENT = ROOT / "client"
RUNES = ["ver-", "er-", "-lein", "-in", "-en", "auf-", "ent-", "be-", "-chen", "-ung"]
NAMES = {"Jacob", "Wilhelm", "Dortchen", "Wild", "Grimm", "Kassel", "Westfalen", "Jérôme", "Napoleon",
         "Conrad", "Heinrich", "J", "r", "me", "Männ", "lein", "ver", "else", "Rumpelstilzchen", "Erzählerin", "Marktfrau", "Soldat", "Bonjour"}


# Reviewed for the slice: the first Wiktionary sense is not the one the tale uses,
# or the lookup picks a homograph (back = imperative of backen, heiß = heißen in the song).
GLOSS_DE = {"raten": "eine Antwort suchen, ohne sie sicher zu wissen", "wandeln": "sich ändern, anders werden (auch: langsam gehen)", "Männlein": "kleiner Mann", "Männchen": "kleiner Mann", "Rat": "Hilfe, ein guter Vorschlag"}
GLOSS_EN = {"raten": "to guess", "wandeln": "to change; to stroll", "Männlein": "little man", "Männchen": "little man", "erraten": "to guess (correctly)"}
FORM_OVERRIDES = {"back": "backen", "brau": "brauen", "hol": "holen", "heiß": "heißen", "Raten": "raten",
                  "Sprechen": "sprechen", "Wandeln": "wandeln", "Erraten": "erraten"}


def sentence_tokens(line):
    """Tokens with a flag for sentence-initial position (capital letter may be the sentence, not a noun)."""
    start = True
    for m in re.finditer(r"[A-Za-zÄÖÜäöüßſ]+|[.!?:„“]", line):
        t = m.group(0)
        if t in ".!?:„“":
            start = True
            continue
        yield t, start
        start = False


def ink_text(src):
    """Visible German text of the ink file, line by line (without syntax, tags, speakers)."""
    out = []
    for raw in src.splitlines():
        line = raw.strip()
        if not line or line.startswith(("//", "VAR", "~", "===", "= ", "{", "}", "->")) or re.match(r"^-\s*[\w\s=!<>]+:\s*->", line):
            continue
        line = line.split("#")[0]
        line = re.sub(r"->\s*\w+", "", line)
        line = re.sub(r"^[-*+\s]+", "", line)
        line = re.sub(r"^-?\s*[\w\s=!<>]+:\s*(?=\w+:)", "", line)  # "- honig: Marktfrau: ..." conditions
        line = line.replace("[", "").replace("]", "")
        line = re.sub(r"^[A-ZÄÖÜ][\wäöü]*:\s*", "", line)          # speaker
        out.append(line)
    return out


def first_sense(js):
    try:
        senses = json.loads(js or "[]")
    except json.JSONDecodeError:
        return None
    return senses[0] if senses else None


def main():
    v4 = json.load(open(ROOT / "data/urwort-v4.json", encoding="utf-8"))
    scope = v4["words"]
    lex, forms = tc.load_lexicon()
    lexdb = sqlite3.connect(HERE / "out/lex.db")
    graph = sqlite3.connect(HERE / "out/graph.db")

    ink = (CLIENT / "src/story/main.ink").read_text(encoding="utf-8")
    ink = "\n".join(l for l in ink.splitlines() if not l.strip().startswith("//"))
    ldtk = json.load(open(CLIENT / "public/maps/urwort.ldtk", encoding="utf-8"))
    obj_fields = [{f["__identifier"]: f["__value"] for f in e["fieldInstances"]}
                  for lv in ldtk["levels"] for li in lv["layerInstances"] or [] for e in li["entityInstances"]
                  if e["__identifier"] == "Obj"]
    lines = ink_text(ink) + [f["label"] for f in obj_fields if f.get("label")]
    explicit = set(re.findall(r"slip:([^\s#]+)", ink)) | {f["slip"] for f in obj_fields if f.get("slip")}
    puzzles = re.findall(r"puzzle:([^,\s]+),([^,\s]+),([^\s#]+)", ink)
    explicit |= {p[0] for p in puzzles} | {p[2] for p in puzzles}

    lemmas, unknown, form_map = set(explicit), collections.Counter(), {}
    for line in lines:
        for tok, initial in sentence_tokens(line):
            if tok in NAMES:
                continue
            if tok in FORM_OVERRIDES:
                lemma = FORM_OVERRIDES[tok]
            else:
                lemma, _ = tc.lemmatise(tok, forms, scope)
                # sentence start: "Hier", "Nein", "Raten" are hier, nein, raten, unless the lowercase
                # reading is a rare word (Wasser stays Wasser, not wassern)
                if initial and tok[:1].isupper() and tok.lower() in forms:
                    low, _ = tc.lemmatise(tok.lower(), forms, scope)
                    if low in scope:
                        lemma = low
            if lemma is None:
                unknown[tok] += 1
                continue
            if lemma in lex:
                lemmas.add(lemma)
                form_map[tok] = lemma
                form_map.setdefault(tok.lower(), lemma)

    # every inflected form of every lemma, so new dialogue lines stay tappable
    for line in open(ROOT / "raw-data/v2/unimorph-deu.tsv", encoding="utf-8"):
        parts = line.rstrip("\n").split("\t")
        if len(parts) >= 2 and parts[0] in lemmas:
            form_map.setdefault(parts[1], parts[0])
    for l in lemmas:
        form_map[l] = l
    form_map.update({k: v for k, v in FORM_OVERRIDES.items() if v in lemmas})

    # quotations: first sentence in the 1812/15 tales, Rumpelstilzchen first
    tales = [json.loads(l) for l in open(HERE / "out/tales/khm.jsonl", encoding="utf-8")]
    tales = [t for t in tales if t["edition"] == "1812/15"]
    tales.sort(key=lambda t: t["number"] != 55)
    quotes = {}
    for t in tales:
        for sent in re.split(r"(?<=[.!?;:])\s+", t["text"]):
            for tok in tc.TOKEN.findall(sent):
                lemma, _ = tc.lemmatise(tok, forms, scope)
                if lemma in lemmas and lemma not in quotes and 20 < len(sent) < 260:
                    quotes[lemma] = {"text": sent.strip(), "tale": t["title"], "number": t["number"], "edition": "1812/15"}
        if len(quotes) == len(lemmas):
            break

    def wikt(word, src):
        r = lexdb.execute("select ipa, audio, glosses from wikt where word=? and src=? and kind not in ('form','Nachname','Vorname') and pos not in ('name') and glosses not like '%surname%' order by (kind='lemma' or kind in ('Substantiv','Verb','Adjektiv')) desc, length(glosses) desc limit 1", (word, src)).fetchone()
        return r or (None, None, None)

    def history(word, depth=0):
        r = graph.execute("select data from history where word=?", (word,)).fetchone()
        if r:
            return word, json.loads(r[0])
        if depth < 3:
            b = graph.execute("select base from edge where derived=? and kind='deriv' and n_sources>=2 limit 1", (word,)).fetchone()
            if b:
                return history(b[0], depth + 1)
        return None, None

    words = {}
    for l in sorted(lemmas):
        ipa_en, audio, g_en = wikt(l, "en")
        ipa_de, audio_de, g_de = wikt(l, "de")
        hist_from, h = history(l)
        chain = []
        if h:
            for key, label in [("de_gmh", "Mittelhochdeutsch"), ("en_gmh", "Mittelhochdeutsch"), ("de_goh", "Althochdeutsch"),
                               ("en_goh", "Althochdeutsch"), ("de_pgmc", "Urgermanisch"), ("en_gem-pro", "Urgermanisch")]:
                if h.get(key) and label not in [c["stage"] for c in chain]:
                    chain.append({"stage": label, "form": h[key]})
        sc = scope.get(l, {})
        words[l] = {
            "pos": (lex.get(l) or (None,))[0],
            "ipa": ipa_de or ipa_en,
            "audio": audio_de or audio,
            "gloss_de": GLOSS_DE.get(l) or first_sense(g_de),
            "gloss_en": GLOSS_EN.get(l) or first_sense(g_en),
            "level": sc.get("level"),
            "rank": sc.get("rank"),
            "family": (lex.get(l) or (None, None))[1],
            "history_from": hist_from,
            "history": chain,
            "cognates": {k[4:]: v for k, v in (h or {}).items() if k.startswith("cog_") and k[4:] in ("en", "nl")},
            "quote": quotes.get(l),
        }

    # rune edges: base + affix -> derived, 2+ sources, among slice lemmas as bases
    runes = []
    for base in sorted(lemmas):
        for derived, n, info in graph.execute("select derived, n_sources, info from edge where base=? and kind='deriv' and n_sources>=2", (base,)):
            affixes = set()
            for v in json.loads(info or "{}").values():
                affixes |= {a.strip() for a in str(v).split(",")}
            affix_like = {a for a in affixes if a.startswith("-") or a.endswith("-")}
            if len(affix_like) != 1:      # ent-…-en, ver-…-en: a two-part pattern is not one rune
                continue
            for a in affix_like & set(RUNES):
                runes.append({"base": base, "rune": a, "derived": derived, "sources": n})
                if derived not in words:
                    ipa_de, audio_de, g_de = wikt(derived, "de")
                    _, _, g_en = wikt(derived, "en")
                    words[derived] = {"pos": (lex.get(derived) or (None,))[0], "ipa": ipa_de, "audio": audio_de,
                                      "gloss_de": first_sense(g_de), "gloss_en": first_sense(g_en),
                                      "level": scope.get(derived, {}).get("level"), "family": (lex.get(derived) or (None, None))[1],
                                      "history": [], "cognates": {}, "quote": quotes.get(derived)}

    for b, r, t in puzzles:
        r_ok = [e for e in runes if e["base"] == b and e["derived"] == t]
        assert r_ok, f"puzzle {b}|{r}|{t} has no 2-source edge"

    out = CLIENT / "public/data/slice.json"
    rumpel = next(t for t in tales if t["number"] == 55)
    tale_text = rumpel["text"].split("Rumpelstilzchen.", 1)[-1].strip()
    json.dump({"generated": "pipeline-v2/proto_export.py",
               "tale": {"title": "Rumpelstilzchen", "number": 55, "edition": "KHM 1812, Band 1",
                        "source": "de.wikisource.org (public domain)", "text": tale_text}, "license": "CC BY-SA 4.0 (Wiktionary, DErivBase, MorphyNet); tale text public domain",
               "words": words, "forms": form_map, "runes": runes},
              open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

    lint = ["# story lint (generated by pipeline-v2/proto_export.py)", "",
            f"lemmas: {len(lemmas)}, rune edges: {len(runes)}, quotes: {sum(1 for l in lemmas if l in quotes)}", "",
            "## tokens not found in the lexicon (function words are expected here)",
            ", ".join(f"{t} ({n})" for t, n in unknown.most_common()), "",
            "## words above A2 or outside the top-5000 slice (fine for tale words; check the rest)"]
    for l in sorted(lemmas):
        lvl = scope.get(l, {}).get("level")
        if lvl not in ("A1", "A2"):
            lint.append(f"- {l}: {lvl or 'not in slice'}")
    (CLIENT / "story-lint.txt").write_text("\n".join(lint) + "\n", encoding="utf-8")
    print(f"{len(words)} words, {len(form_map)} forms, {len(runes)} rune edges, {len(quotes)} quotes -> {out}")


if __name__ == "__main__":
    main()
