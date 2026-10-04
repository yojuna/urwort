"""Automated checks on the exported data. Run after export.py; exits non-zero if a hard check fails.

  .venv/bin/python validate.py            -> prints a table, writes out/validation.json

Hard checks (must pass) guard structure, provenance, licensing and the project's rules.
Regression checks pin facts we verified by hand, so a pipeline change cannot silently break them.
Metrics are reported, not enforced.
"""
import json, re, sqlite3, sys, collections
from pathlib import Path

HERE = Path(__file__).resolve().parent
V4 = json.load(open(HERE / "out" / "urwort-v4.json"))
V3 = json.load(open(HERE.parent / "game" / "public" / "ontology.json"))
F = {f["id"]: f for f in V4["families"]}
W = V4["words"]
SHIP = {"wikt_en", "wikt_de", "derivbase", "morphynet", "iecor", "wordfreq", "unimorph", "dib", "merlin", "subs", "subs2", "klexikon"}
CHECK_ONLY = re.compile(r"goethe|daflex|subtlex|derewo|cognet|ghost|germanet|dwds_api|pfeifer", re.I)
PARTICLES = set("ab an auf aus bei durch ein mit nach um unter vor weg zu zurück über".split())
MAX_FAMILY = 250

results = []


def check(name, ok, detail="", kind="hard"):
    results.append({"check": name, "ok": bool(ok), "detail": detail, "kind": kind})


def src_root(s): return s.split(":")[0]


# --- structure -------------------------------------------------------------------------------
check("every word belongs to an existing family", all(d["family"] in F for d in W.values()))
check("every family member is an exported word", all(m in W for f in F.values() for m in f["members"]))
owner = collections.Counter(m for f in F.values() for m in f["members"])
check("no word in two families", all(c == 1 for c in owner.values()), f"{sum(c > 1 for c in owner.values())} duplicates")
check("family root is a member", all(f["root"] in f["members"] for f in F.values()))
check("roots have no base inside their family",
      all(W[f["root"]]["base"] is None or W[f["root"]]["base"] not in f["members"] for f in F.values()))


def cyclic(w):
    seen, x = set(), w
    while x and x in W:
        if x in seen: return True
        seen.add(x); x = W[x]["base"]
    return False
check("derivation tree has no cycles", not any(cyclic(w) for w in W))
big = max(F.values(), key=lambda f: f["size_full"])
check(f"no family larger than {MAX_FAMILY} words (blob detector)", big["size_full"] <= MAX_FAMILY, f"largest: {big['root']} ({big['size_full']})")
check("no particle is a family base", not any(d["base"] in PARTICLES for d in W.values()))
bad_seg = [w for w, d in W.items() if d["segments"] and "".join(s["form"] for s in d["segments"]).lower() != w.lower()]
check("segments re-assemble to the word", not bad_seg, f"{len(bad_seg)} bad: {bad_seg[:5]}")
check("every bridge links exported words or lexicon words",
      all(b["word"] in W for b in V4["bridges"]) and all(b["head"] or b["modifiers"] for b in V4["bridges"]))

# --- provenance and licensing -----------------------------------------------------------------
stage_src = [s for f in F.values() for st in f["history"] for s in st["sources"]]
check("every history stage has a source", all(st["sources"] for f in F.values() for st in f["history"]))
check("only ship-licensed sources in history", all(src_root(s) in SHIP for s in stage_src),
      str(collections.Counter(src_root(s) for s in stage_src)))
pie_src = [s for f in F.values() if f["pie"] for s in f["pie"]["claims"]]
check("only ship-licensed sources in PIE claims", all(s in SHIP for s in pie_src))
# provenance fields only (glosses may legitimately contain words like "ghost")
prov = json.dumps([V4["sources"], stage_src, pie_src,
                   [b["sources"] for b in V4["bridges"]], [list((d["level_evidence"] or {}).keys()) for d in W.values()],
                   [d["base_sources"] for d in W.values()], [c.get("sources") for f in F.values() for c in f["cognates"].values()]])
check("no check-only source in any provenance field", not CHECK_ONLY.search(prov), (CHECK_ONLY.search(prov) or [None])[0] or "")
check("license and sources declared", V4.get("license") and V4.get("sources"))

# --- project rules ---------------------------------------------------------------------------
shown = [c for c in V3["clusters"] if any(s["stage"] == "ine-pro" for s in c["wurzel"]["etymology_chain"])]
fam_of_cluster = {c["wurzel"]["id"]: F[c["wurzel"]["id"]] for c in V3["clusters"]}
check("PIE shown only when verified by 2+ independent sources",
      all(fam_of_cluster[c["wurzel"]["id"]]["pie"]["status"] == "verified"
          and len(fam_of_cluster[c["wurzel"]["id"]]["pie"]["agreeing"]) >= 2 for c in shown), f"{len(shown)} shown")
check("doubted / conflicting PIE never shown",
      not any(fam_of_cluster[c["wurzel"]["id"]]["pie"]["status"] in ("doubted", "conflict") for c in shown))
check("loans from proto-languages are not asserted",
      not any(f["borrowed_from"] and f["borrowed_from"]["lang_code"].endswith("-pro") for f in F.values()))

# --- regression: facts verified by hand on 2026-10-03 --------------------------------------------
def fam(w): return F[W[w]["family"]] if w in W else None
def same(a, b): return a in W and b in W and W[a]["family"] == W[b]["family"]
def segs(w): return "·".join(s["form"] for s in (W[w]["segments"] or []))
REG = [
    ("fahren and Fahrer are one family", same("fahren", "Fahrer")),
    ("fahren and führen are not (causative pair = bridge)", not same("fahren", "führen")),
    ("gewinnen and wohnen are separate surface families", not same("gewinnen", "wohnen")),
    ("Schalter is not with schade", not same("Schalter", "schade")),
    ("verstehen = ver·steh·en", segs("verstehen") == "ver·steh·en"),
    ("Wohnung = Wohn·ung", segs("Wohnung") == "Wohn·ung"),
    ("Haus goes back to Proto-Germanic *hūsą", any(s["form"] == "*hūsą" for s in fam("Haus")["history"])),
    ("stehen: PIE *steh₂- verified", (fam("stehen")["pie"] or {}).get("status") == "verified"),
    ("lang: conflicting/doubted PIE not verified", (fam("lang")["pie"] or {}).get("status") != "verified"),
    ("Fenster borrowed from Latin fenestra", (fam("Fenster")["borrowed_from"] or {}).get("form") == "fenestra"),
    ("Haus has no Proto-Iranian loan claim", fam("Haus")["borrowed_from"] is None),
    ("fahren principal parts fährt/fuhr/gefahren", (W["fahren"]["forms"] or {}).get("past_3sg") == "fuhr"),
    ("Haus is neuter, plural Häuser", (W["Haus"]["forms"] or {}).get("plural") == "Häuser"),
    ("gehen and das Gehen are one family (conversion)", same("gehen", "Gehen") if "Gehen" in W else True),
    ("leben and das Leben are one family (conversion)", same("leben", "Leben")),
    ("haben and das Haben are one family (conversion)", same("haben", "Haben") if "Haben" in W else True),
    ("gehen has English cognate go", (fam("gehen")["cognates"].get("en") or {}).get("form") == "go"),
]
for name, ok in REG:
    check(name, ok, kind="regression")

# --- metrics (reported) -----------------------------------------------------------------------
levels = collections.Counter(d["level"] for d in W.values())
pie = collections.Counter((f["pie"] or {}).get("status") for f in F.values())
metrics = {
    "words": len(W), "families": len(F), "families_2plus": sum(len(f["members"]) > 1 for f in F.values()),
    "bridges": len(V4["bridges"]), "words_with_segments": sum(bool(d["segments"]) for d in W.values()),
    "words_with_forms": sum(bool(d["forms"]) for d in W.values()),
    "families_with_germanic_chain": sum(any(s["stage"] in ("gem-pro", "gmw-pro") for s in f["history"]) for f in F.values()),
    "families_with_loan_origin": sum(bool(f["borrowed_from"]) for f in F.values()),
    "history_stages_2plus_sources": sum(len(st["sources"]) > 1 for f in F.values() for st in f["history"]),
    "history_stages_total": sum(len(f["history"]) for f in F.values()),
    "pie_status": dict(pie), "levels": dict(levels),
    "english_cognates": sum("en" in f["cognates"] for f in F.values()),
    "english_cognates_expert_checked": sum("iecor" in (f["cognates"].get("en") or {}).get("sources", []) for f in F.values()),
}
out = {"results": results, "metrics": metrics}
json.dump(out, open(HERE / "out" / "validation.json", "w"), ensure_ascii=False, indent=1)
for r in results:
    print(f"{'PASS' if r['ok'] else 'FAIL'}  [{r['kind']:10}] {r['check']}" + (f"  ({r['detail']})" if r["detail"] else ""))
print(json.dumps(metrics, ensure_ascii=False, indent=1))
sys.exit(0 if all(r["ok"] for r in results) else 1)
