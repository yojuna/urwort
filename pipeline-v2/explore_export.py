"""Explore data for the viewer: the game slice (urwort-v4.json) as one compact file with a precomputed map layout.

  out/review/explore.json
    families: [id, root, n_game, size_full, origin(0 Germanic, 1 loan, 2 none), origin_lang, depth, pie, cognate_en, x, y, r]
    edges:    [family_index_a, family_index_b, kind, via_word]     compound / causative bridges between families
    words:    [lemma, family_index, pos, level, rank, segs, n_base_sources, base, gloss_en, forms]

Map: families are nodes (radius ~ sqrt of game words), bridges are edges. Connected groups are laid out with a
spring layout (networkx), then all groups and standalone families are packed on a spiral, largest first.
Usage: .venv/bin/python explore_export.py   (after export.py; writes next to review_export.py's output)
"""
import json, math, collections
from pathlib import Path
import networkx as nx
import numpy as np

HERE = Path(__file__).resolve().parent
OUT = HERE / "out" / "review"
PIE = {None: 0, "verified": 1, "single_source": 2, "doubted": 3, "conflict": 4}


def radius(n): return 3 + 2.4 * math.sqrt(n)


def main():
    v = json.load(open(HERE / "out" / "urwort-v4.json"))
    W, fams = v["words"], v["families"]
    idx = {f["id"]: i for i, f in enumerate(fams)}
    edges = {}
    for b in v["bridges"]:
        fw = W[b["word"]]["family"]
        for p in b["modifiers"] + ([b["head"]] if b["head"] else []):
            if p in W and W[p]["family"] != fw:
                a, c = sorted((idx[fw], idx[W[p]["family"]]))
                edges.setdefault((a, c), [a, c, b["kind"], b["word"]])
    G = nx.Graph(); G.add_nodes_from(range(len(fams))); G.add_edges_from(edges)
    r = [radius(len(f["members"])) for f in fams]

    def origin_of(f):
        germanic = any(s["stage"] in ("gem-pro", "gmw-pro", "goh", "gmh") for s in f["history"])
        return 1 if f["borrowed_from"] else 0 if germanic else 2

    # 1. connected groups (families linked by compounds): spring layout each, then a spiral around the largest.
    #    Only ~70 groups, so the pairwise overlap test is cheap.
    groups, singles = [], []
    for comp in nx.connected_components(G):
        comp = list(comp)
        if len(comp) == 1: singles.append(comp[0]); continue
        sub = G.subgraph(comp)
        pos = nx.spring_layout(sub, seed=42, k=1.4 / math.sqrt(len(comp)), iterations=300)
        # scale so linked bubbles sit about one gap apart (median over links), then push apart any overlaps
        ratios = sorted((r[a] + r[b] + 14) / max(math.dist(pos[a], pos[b]), 1e-6) for a, b in sub.edges())
        scale = ratios[len(ratios) // 2]
        P = np.array([pos[i] for i in comp]) * scale
        R = np.array([r[i] for i in comp])
        for _ in range(120):
            d = P[:, None, :] - P[None, :, :]
            dist = np.sqrt((d ** 2).sum(-1)) + np.eye(len(comp))
            overlap = np.clip(R[:, None] + R[None, :] + 4 - dist, 0, None)
            np.fill_diagonal(overlap, 0)
            if overlap.max() < 0.5: break
            P += (d / dist[..., None] * overlap[..., None] * 0.5).sum(1)
        P -= P.mean(0)
        pts = {i: (float(P[k, 0]), float(P[k, 1])) for k, i in enumerate(comp)}
        groups.append((pts, max(math.hypot(x, y) + r[i] for i, (x, y) in pts.items())))
    groups.sort(key=lambda g: -g[1])
    placed, xy = [], [None] * len(fams)
    for pts, R in groups:
        t = 0.0
        while True:
            rr = 2.2 * t; x, y = rr * math.cos(t), rr * math.sin(t)
            if all(math.hypot(x - px, y - py) >= R + pR + 6 for px, py, pR in placed): break
            t += 0.1 if t < 10 else 6 / max(rr, 1)
        placed.append((x, y, R))
        for i, (dx, dy) in pts.items(): xy[i] = (round(x + dx, 1), round(y + dy, 1))

    # 2. standalone families: shelf-packed rows below the groups, grouped by origin, largest first. Linear time.
    left = min(px - pR for px, py, pR in placed); right = max(px + pR for px, py, pR in placed)
    y0 = max(py + pR for px, py, pR in placed) + 40
    width = max(right - left, 700)
    for origin in (0, 1, 2):
        row = [i for i in singles if origin_of(fams[i]) == origin]
        row.sort(key=lambda i: (-len(fams[i]["members"]), fams[i]["root"]))
        x, rowh = left, 0
        for i in row:
            d = 2 * r[i] + 3
            if x + d > left + width: x, y0, rowh = left, y0 + rowh, 0
            xy[i] = (round(x + r[i], 1), round(y0 + r[i], 1)); x += d; rowh = max(rowh, d)
        y0 += rowh + 30

    fam_rows = []
    for i, f in enumerate(fams):
        chain = f["history"]
        origin = origin_of(f)
        lang = f["borrowed_from"]["lang"] if f["borrowed_from"] else (chain[0]["lang"] if chain else "")
        pie = f["pie"]["status"] if f["pie"] else None
        fam_rows.append([f["id"], f["root"], len(f["members"]), f["size_full"], origin, lang, len(chain),
                         PIE[pie], (f["cognates"].get("en") or {}).get("form", ""), xy[i][0], xy[i][1], round(r[i], 1)])
    word_rows = []
    for w, d in W.items():
        segs = "|".join(f"{s['type'][0]}:{s['form']}" for s in d["segments"]) if d["segments"] and len(d["segments"]) > 1 else ""
        word_rows.append([w, idx[d["family"]], d["pos"] or "", d["level"] or "", d["rank"] or 0, segs,
                          len(d["base_sources"] or []), d["base"] or "", (d["gloss_en"] or [""])[0][:90], d["forms"] or {}])
    OUT.mkdir(parents=True, exist_ok=True)
    out = {"generated": v["generated"], "families": fam_rows, "edges": list(edges.values()), "words": word_rows,
           "pie_codes": [k for k in PIE], "origin_names": ["native Germanic", "loanword", "no history yet"]}
    (OUT / "explore.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"explore: {len(fam_rows)} families, {len(edges)} bridges, {len(word_rows)} words, "
          f"{(OUT / 'explore.json').stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
