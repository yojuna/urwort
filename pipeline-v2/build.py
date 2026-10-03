"""Build the layered word graph from out/lex.db and write out/graph.db.

Layers (see docs/research notes):
  lexeme     content lemmas from German + English Wiktionary
  edge       typed word-formation links, one row per (base, derived, kind, source)
               kind: deriv (prefix/suffix/conversion/motion) | compound_head | compound_mod | ety_hint
               source: derivbase | wikt_de | wikt_en | morphynet | wikt_de_wb (Wortbildungen list, untyped)
  family     synchronic families = connected components over deriv edges with >= MIN_SUPPORT evidence
  history    etymon chain per lemma (gmh, goh, gmw-pro, gem-pro, ine-pro) + cognates, with source agreement

Usage: .venv/bin/python build.py
"""
import json, re, sqlite3, sys, collections
from pathlib import Path

HERE = Path(__file__).resolve().parent
LEX = HERE / "out" / "lex.db"
OUT = HERE / "out" / "graph.db"

DE_LEMMA_KINDS = {"Substantiv", "Verb", "Adjektiv", "Adverb"}
EN_LEMMA_POS = {"noun", "verb", "adj", "adv"}
META = set("""Determinativkompositum Ableitung Derivatem Ableitungsmorphem Fugenelement Substantiv Substantiven Substantivs
Verb Verbs Adjektiv Adjektivs Adverb Verbzusatz Partikel Derivation Motion Movierung Zusammensetzung Konversion strukturell
etymologisch Suffix Präfix Entlehnung Flexionsendung Kompositum Umlaut Substantivierung Stamm Verbstamm Suffigierung
Gleitlaut Erbwort Präfixoid Lehnwort Neologismus Diminutiv Halbpräfix Zusammenbildung Lehnübersetzung Zusammenrückung
Infinitiv Partizip Wort Sprache Wortbildung Kurzwort Abkürzung Präfigierung Rückbildung Kontamination Verkleinerungsform
Possessivkompositum Kopulativkompositum Ableitungsbasis Grundwort Bestimmungswort Femininum Maskulinum Neutrum Plural
Wortstamm Lexem Morphem Endung Bedeutung Variante Form Schreibung Nebenform Kurzform Lautmalerei Onomatopoetikum
Anthroponym Toponym Studentensprache Jugendsprache Fachsprache Umgangssprache Eigenname Familienname Vorname Nachname""".split())
# separable/inseparable verb particles and prepositions: affixes in word formation, never a family base
PARTICLES = set("""ab an auf aus bei da dar durch ein empor entgegen fort her herab heran herauf heraus herbei herein herüber herum
herunter hervor hin hinab hinauf hinaus hinein hinüber hinunter hoch los mit nach nieder um unter vor voran voraus vorbei vorüber
weg weiter wieder zu zurück zusammen über wider hinter gegen entlang davon dazu daran darauf""".split())
INSEPARABLE = set("be ge er ver zer ent emp miss un ur erz".split())  # never free words in a template
BASE_AFTER = re.compile(r"(?:Stamm von|Verbs?|Substantivs?|Adjektivs?|Adverbs?|Wortes|männlichen Form|weiblichen Form|Infinitivs?)\s+[»„\"]?([A-Za-zÄÖÜäöüß-]+)")
PARTICLE_VERB = re.compile(r"(?:Partikel|Adjektiv|Substantiv|Adverb)\s+(\S+)\s+als Verbzusatz und (?:dem|einem) Verb\s+(\S+)")
LANG_RE = re.compile(r"^(alt|mittel|spät|früh|neu|ur|vulgär|kirchen|gemein|west|nord|ost|süd|ober|nieder|schweizer|österreichisch)*"
                     r"(hoch|nieder)?(deutsch|lateinisch|englisch|französisch|griechisch|germanisch|nordisch|sächsisch|niederländisch|"
                     r"italienisch|spanisch|portugiesisch|russisch|polnisch|tschechisch|arabisch|hebräisch|jiddisch|türkisch|persisch|"
                     r"slawisch|keltisch|gotisch|friesisch|isländisch|dänisch|schwedisch|norwegisch|ungarisch|indogermanisch)$", re.I)
DERIV_KW = re.compile(r"Ableitung|Derivation|Präfix|Suffix|Konversion|Motion|Movierung|Substantivierung|Verkleinerung|Diminutiv|Rückbildung|Partikelverb|Verbzusatz", re.I)
COMP_KW = re.compile(r"[Kk]ompositum|Zusammensetzung|zusammengesetzt|Zusammenbildung|Zusammenrückung")
STAGES = ["gmh", "goh", "gmw-pro", "gem-pro", "ine-pro"]
ETY_TEMPLATES = {"inh", "inh+", "der", "der+", "bor", "bor+", "lbor", "slbor", "uder"}
AFFIX_TEMPLATES = {"af", "affix", "prefix", "pre", "suffix", "suf", "compound", "com", "confix", "con", "surf"}
MIN_SUPPORT = int(__import__("os").environ.get("MIN_SUPPORT", 1))  # evidence (distinct typed sources) needed for a deriv edge to join a family


def is_meta(tok):
    return " " in tok or tok in META or tok in PARTICLES or bool(LANG_RE.match(tok)) or tok.startswith("-") or tok.endswith("-")


def load(con):
    lex = {}  # word -> {pos:set, src:set}
    for src, word, pos, kind in con.execute("select src, word, pos, kind from wikt"):
        if (src == "de" and kind in DE_LEMMA_KINDS) or (src == "en" and kind == "lemma" and pos in EN_LEMMA_POS):
            e = lex.setdefault(word, {"pos": set(), "src": set()})
            e["pos"].add(pos); e["src"].add(src)
    return lex


def edges_wikt_de(con, lex, add, hist):
    for word, text, links, derived, kind in con.execute(
            "select word, ety_text, ety_links, derived, kind from wikt where src='de'"):
        if kind not in DE_LEMMA_KINDS or word not in lex:
            continue
        links = json.loads(links) if links else []
        text = text or ""
        # structural part: after 'strukturell:' when present, else the first sentence
        if "strukturell" in links and "strukturell:" in text:
            struct = text.split("strukturell:", 1)[1]
            s_links = links[links.index("strukturell") + 1:]
        else:
            struct = re.split(r"[.;]\s|\n", text, maxsplit=1)[0]
            s_links = links
        cands = [t for t in s_links if not is_meta(t) and t != word and t in lex]
        affixes = [t for t in s_links if t.startswith("-") or t.endswith("-")]
        if COMP_KW.search(struct) and len(cands) >= 2:
            *mods, head = cands[:3]
            add(head, word, "compound_head", "wikt_de", None)
            for m in mods:
                add(m, word, "compound_mod", "wikt_de", "+".join(a for a in affixes if a.startswith("-")) or None)
        elif m := PARTICLE_VERB.search(struct):
            verb, first = m.group(2).strip(",.;"), m.group(1).strip(",.;")
            if verb in lex:
                add(verb, word, "deriv", "wikt_de", first + "-")
            if first not in PARTICLES and first in lex:  # fest-, voll-, teil-: a modifier, i.e. a bridge
                add(first, word, "compound_mod", "wikt_de", None)
        elif DERIV_KW.search(struct):
            base = next((b for b in BASE_AFTER.findall(struct) if b in lex and b != word and not is_meta(b)), None)
            if base is None and len(cands) == 1:
                base = cands[0]
            if base:
                add(base, word, "deriv", "wikt_de", ",".join(affixes) or None)
        # diachronic hints: 'vergleiche ... Etymologie zu X', 'siehe X'
        for m in re.finditer(r"(?:Etymologie zu|vergleiche|siehe)\s+(?:auch\s+)?(?:»)?([A-ZÄÖÜa-zäöüß]+)", text):
            if m.group(1) in lex and m.group(1) != word:
                add(m.group(1), word, "ety_hint", "wikt_de", None)
        h = hist.setdefault(word, {})
        if m := re.search(r"(?<!indo)germanisch\s+(\*\s*[^\s,;]+)", text):
            h.setdefault("de_pgmc", m.group(1).replace(" ", ""))
        if m := re.search(r"indogermanisch\s+(\*\s*[^\s,;]+)", text):
            h.setdefault("de_pie", m.group(1).replace(" ", ""))
        for d in json.loads(derived) if derived else []:
            if d in lex and d != word:
                add(word, d, "wb", "wikt_de_wb", None)


def edges_wikt_en(con, lex, add, hist):
    for word, tmpl_json, kind in con.execute("select word, ety_templates, kind from wikt where src='en'"):
        if kind != "lemma" or word not in lex or not tmpl_json:
            continue
        h = hist.setdefault(word, {})
        for t in json.loads(tmpl_json):
            name, a = t["name"], t["args"]
            if name in AFFIX_TEMPLATES and a.get("1") == "de":
                parts = [a[k] for k in sorted((k for k in a if k.isdigit() and k != "1"), key=int) if a[k]]
                # {{prefix|de|ver|langen}}, {{suffix|de|Seil|er}}, {{confix|de|ab|Seil|en}} write affixes without hyphens
                if parts and name in ("prefix", "pre", "confix", "con") and not parts[0].endswith("-"):
                    parts[0] += "-"
                if len(parts) > 1 and name in ("suffix", "suf", "confix", "con") and not parts[-1].startswith("-"):
                    parts[-1] = "-" + parts[-1]
                is_verb = "verb" in lex[word]["pos"] or "Verb" in lex[word]["pos"]
                is_aff = lambda p: (p.startswith("-") or p.endswith("-") or p in INSEPARABLE
                                    or (is_verb and p in PARTICLES))
                stems = [p for p in parts if not is_aff(p)]
                free = [p for p in stems if p in lex and p != word]
                aff = [p for p in parts if is_aff(p)]
                if len(stems) >= 2:  # compound, or Zusammenbildung (vier+Minute+-ig): bridges, not a family link
                    zusammenbildung = parts[-1].startswith("-")
                    head = None if zusammenbildung else stems[-1]
                    if head in lex and head != word:
                        add(head, word, "compound_head", "wikt_en", None)
                    for m in free:
                        if m != head:
                            add(m, word, "compound_mod", "wikt_en", None)
                elif len(free) == 1 and aff:
                    add(free[0], word, "deriv", "wikt_en", ",".join(aff))
            elif name in ETY_TEMPLATES and a.get("1") == "de" and a.get("2") in STAGES and a.get("3"):
                h.setdefault("en_" + a["2"], a["3"])
            elif name in ETY_TEMPLATES and a.get("1") == "de" and a.get("2") and a.get("2") not in STAGES:
                h.setdefault("en_from", f'{a["2"]}:{a.get("3", "")}')
            elif name == "dercat" and a.get("1") == "de":  # category-level ancestry claim, weaker than a chain
                h["en_dercat"] = sorted(set(h.get("en_dercat", [])) | {v for k, v in a.items() if k.isdigit() and k != "1"})
            elif name in ("cog", "cognate") and a.get("1") in ("en", "enm", "ang", "nl", "got", "non", "sv", "da") and a.get("2"):
                h.setdefault("cog_" + a["1"], a["2"])


def edges_derivbase(con, lex, add):
    rule_re = re.compile(r"^(\S+?)_\S+ (d([NVA])([NVA])\d+(?:\.\d)?(\*?))> (\S+?)_\S+$")
    for path, in con.execute("select path from derivbase_pair where path_len = 1"):
        m = rule_re.match(path)
        if not m:
            continue
        left, rule, inv, right = m.group(1), m.group(2), m.group(5), m.group(6)
        base, der = (right, left) if inv else (left, right)
        if base in lex and der in lex:
            # dVV11/dVV12: tränken->trinken, legen->liegen, setzen->sitzen: Germanic causative pairs,
            # historically related but unproductive today (Fleischer & Barz 2012) -> a bridge, not a family link
            kind = "causative" if rule.startswith(("dVV11", "dVV12")) else "deriv"
            add(base, der, kind, "derivbase", rule)


def edges_morphynet(con, lex, add):
    for base, der, aff, kind in con.execute("select base, derived, affix, kind from morphynet"):
        if base in lex and der in lex and base != der:
            add(base, der, "deriv", "morphynet", ("-" + aff) if kind == "suffix" else (aff + "-"))


class DSU:
    def __init__(self): self.p = {}
    def find(self, x):
        self.p.setdefault(x, x)
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]; x = self.p[x]
        return x
    def union(self, a, b): self.p[self.find(a)] = self.find(b)


def main():
    con = sqlite3.connect(LEX)
    lex = load(con)
    print(f"lexicon: {len(lex):,} content lemmas", file=sys.stderr)
    edges = collections.defaultdict(lambda: {"sources": set(), "info": {}})

    def add(base, der, kind, source, info):
        if base == der or len(base) < 2 or len(der) < 2:
            return
        e = edges[(base, der, kind)]
        e["sources"].add(source)
        if info: e["info"][source] = info

    hist = {}
    edges_derivbase(con, lex, add)
    edges_morphynet(con, lex, add)
    edges_wikt_en(con, lex, add, hist)
    edges_wikt_de(con, lex, add, hist)
    # a Wortbildungen entry (untyped) that is also a typed compound is a compound, not a derivation
    typed_pairs = {(b, d) for (b, d, k) in edges if k != "wb"}
    for (b, d, k) in list(edges):
        if k == "wb" and (b, d) in typed_pairs:
            del edges[(b, d, k)]
    kinds = collections.Counter(k for (_, _, k) in edges)
    print(f"edges: {dict(kinds)}", file=sys.stderr)

    # families: deriv edges only (compounds are bridges between families)
    # Pass 1: links with >= 2 independent sources (100% precise in the 2026-10-03 sample) merge freely.
    # Pass 2: single-source links (95%) may attach a word to a family, but never merge two families:
    #         one wrong link (Anfuhr->anführen) would otherwise fuse fahren and führen.
    dsu = DSU()
    size = collections.Counter()
    def comp_size(x): return size[dsu.find(x)] or 1
    def join(a, b):
        ra, rb = dsu.find(a), dsu.find(b)
        if ra != rb:
            dsu.p[ra] = rb; size[rb] = (size[ra] or 1) + (size[rb] or 1)
    usable = [(b, d, e) for (b, d, k), e in sorted(edges.items()) if k == "deriv" and b not in PARTICLES
              and len(e["sources"]) >= MIN_SUPPORT and e["sources"] != {"morphynet"}]  # MorphyNet alone: noisy
    for b, d, e in usable:
        if len(e["sources"]) >= 2: join(b, d)
    for b, d, e in usable:
        if len(e["sources"]) == 1 and (comp_size(b) == 1 or comp_size(d) == 1): join(b, d)
    members = collections.defaultdict(list)
    for w in dsu.p:
        members[dsu.find(w)].append(w)

    out = sqlite3.connect(OUT) if not OUT.exists() else (OUT.unlink() or sqlite3.connect(OUT))
    out.executescript("""
      CREATE TABLE lexeme(word PRIMARY KEY, pos, src, family);
      CREATE TABLE edge(base, derived, kind, sources, n_sources INT, info);
      CREATE TABLE history(word PRIMARY KEY, data);
    """)
    fam_of = {w: root for root, ms in members.items() for w in ms}
    out.executemany("INSERT INTO lexeme VALUES (?,?,?,?)",
                    [(w, ",".join(sorted(e["pos"])), ",".join(sorted(e["src"])), fam_of.get(w)) for w, e in lex.items()])
    out.executemany("INSERT INTO edge VALUES (?,?,?,?,?,?)",
                    [(b, d, k, ",".join(sorted(e["sources"])), len(e["sources"]), json.dumps(e["info"], ensure_ascii=False) or None)
                     for (b, d, k), e in edges.items()])
    out.executemany("INSERT INTO history VALUES (?,?)",
                    [(w, json.dumps(h, ensure_ascii=False)) for w, h in hist.items() if h])
    out.executescript("CREATE INDEX e_b ON edge(base); CREATE INDEX e_d ON edge(derived); CREATE INDEX l_f ON lexeme(family);")
    out.commit()
    sizes = collections.Counter(len(ms) for ms in members.values())
    print(f"families (>=2 members): {len(members):,}; largest: {max(sizes)}; wrote {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
