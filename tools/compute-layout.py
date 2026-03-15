#!/usr/bin/env python3
"""
tools/compute-layout.py — Compute embedding-based spatial layout for Urwort islands.

Phase 1A: Replaces grid layout with semantically meaningful positions.

Pipeline:
  1. Load fastText German word vectors
  2. Compute centroid embedding per root cluster
  3. UMAP reduction: 300-dim → 3-dim (x_seed, z_seed, height)
  4. Load graph edges from SQLite (compound, semantic, etymology)
  5. Force-directed refinement of (x, z) using graph constraints
  6. Write positions to spatial_layout table

Usage:
    python3 tools/compute-layout.py [--db data/urwort.db] \\
        [--ontology game/public/ontology.json] \\
        [--vectors raw-data/fasttext/cc.de.300.vec] \\
        [--limit 200000]

Prerequisites:
    - ontology.json must exist (run export-ontology.py first)
    - Graph tables must be populated in urwort.db
    - fastText vectors must be downloaded
"""

import argparse
import json
import sqlite3
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

WORLD_SIZE = 400        # -200 to 200 on x/z
HEIGHT_RANGE = 12       # 0 to 12 world units for island elevation

# Force-directed edge weights
EDGE_WEIGHTS = {
    "compound":  3.0,   # strongest: these are physical bridges
    "semantic":  0.3,   # moderate per-edge; clusters sharing synonyms/hypernyms
    "etymology": 0.5,   # moderate: shared deep ancestry
    "field":     0.1,   # weak: shared semantic field/domain
}

# Collision resolution
COLLISION_SPACING = 1.3  # radius multiplier for minimum spacing between islands


# ---------------------------------------------------------------------------
# Step 1: Load fastText vectors
# ---------------------------------------------------------------------------

def load_vectors(vec_path: str, limit: int = 200_000):
    """
    Load pre-trained German fastText vectors in word2vec text format.

    Args:
        vec_path: Path to cc.de.300.vec file
        limit: Max words to load (200k covers all A1-C2 vocabulary;
               reduces memory from ~5GB to ~500MB)

    Returns:
        gensim KeyedVectors model
    """
    from gensim.models import KeyedVectors

    print(f"[layout] Loading fastText vectors from {vec_path} (limit={limit:,})...")
    t0 = time.time()
    model = KeyedVectors.load_word2vec_format(vec_path, limit=limit)
    elapsed = time.time() - t0
    print(f"[layout] Loaded {len(model):,} word vectors, "
          f"dim={model.vector_size}, took {elapsed:.1f}s")
    return model


# ---------------------------------------------------------------------------
# Step 2: Compute cluster centroids
# ---------------------------------------------------------------------------

def compute_cluster_centroids(
    clusters: list[dict],
    model,
) -> tuple[dict[str, np.ndarray], dict[str, float]]:
    """
    For each root cluster, compute the centroid embedding
    (average of all word vectors in the cluster).

    Returns:
        centroids: {wurzel_id: 300-dim numpy array}
        radii:     {wurzel_id: float} island radius
    """
    centroids = {}
    radii = {}
    missing = 0
    total_hits = 0
    total_misses = 0

    for cluster in clusters:
        wid = cluster["wurzel"]["id"]
        vectors = []
        for word in cluster["words"]:
            lemma = word["lemma"]
            # Try exact match, then lowercase, then capitalised
            found = False
            for variant in [lemma, lemma.lower(), lemma.capitalize()]:
                if variant in model:
                    vectors.append(model[variant])
                    total_hits += 1
                    found = True
                    break
            if not found:
                total_misses += 1

        if vectors:
            centroid = np.mean(vectors, axis=0)
            centroids[wid] = centroid
        else:
            missing += 1

        # Island radius proportional to word count (min 3, max 8)
        radii[wid] = min(8, max(3, len(cluster["words"]) * 0.8 + 2))

    print(f"[layout] Computed centroids for {len(centroids)} / {len(clusters)} clusters "
          f"({missing} clusters had no vectors)")
    print(f"[layout] Vector hits: {total_hits}, misses: {total_misses}")
    return centroids, radii


# ---------------------------------------------------------------------------
# Step 3: UMAP reduction to 3D
# ---------------------------------------------------------------------------

def reduce_embeddings(
    centroids: dict[str, np.ndarray],
    n_components: int = 3,
    n_neighbors: int = 15,
    min_dist: float = 0.3,
    random_state: int = 42,
) -> dict[str, dict]:
    """
    UMAP reduction: 300-dim → 3-dim (x_seed, z_seed, height).

    Returns: {wurzel_id: {"x": float, "z": float, "height": float}}
    """
    import umap

    ids = list(centroids.keys())
    vectors = np.array([centroids[id] for id in ids])

    print(f"[layout] Running UMAP: {vectors.shape[0]} points, "
          f"{vectors.shape[1]}D → {n_components}D "
          f"(n_neighbors={n_neighbors}, min_dist={min_dist})...")
    t0 = time.time()

    reducer = umap.UMAP(
        n_components=n_components,
        n_neighbors=min(n_neighbors, len(ids) - 1),  # can't exceed n_samples-1
        min_dist=min_dist,
        metric='cosine',
        random_state=random_state,
    )
    reduced = reducer.fit_transform(vectors)
    elapsed = time.time() - t0
    print(f"[layout] UMAP complete in {elapsed:.1f}s")

    # Normalise each dimension to [0, 1]
    for dim in range(n_components):
        col = reduced[:, dim]
        col_min, col_max = col.min(), col.max()
        if col_max - col_min > 0:
            reduced[:, dim] = (col - col_min) / (col_max - col_min)
        else:
            reduced[:, dim] = 0.5

    # Scale to world coordinates
    positions = {}
    for i, id in enumerate(ids):
        positions[id] = {
            "x": float(reduced[i, 0] * WORLD_SIZE - WORLD_SIZE / 2),
            "z": float(reduced[i, 1] * WORLD_SIZE - WORLD_SIZE / 2),
            "height": float(reduced[i, 2] * HEIGHT_RANGE),
        }

    x_vals = [p["x"] for p in positions.values()]
    z_vals = [p["z"] for p in positions.values()]
    h_vals = [p["height"] for p in positions.values()]
    print(f"[layout] Positions: X=[{min(x_vals):.0f}, {max(x_vals):.0f}], "
          f"Z=[{min(z_vals):.0f}, {max(z_vals):.0f}], "
          f"H=[{min(h_vals):.1f}, {max(h_vals):.1f}]")

    return positions


# ---------------------------------------------------------------------------
# Step 4: Load graph edges from SQLite
# ---------------------------------------------------------------------------

def load_graph_edges(
    db_path: str,
    clusters: list[dict],
    all_clusters: list[dict] | None = None,
) -> dict[str, list[tuple[str, str]]]:
    """
    Load edges from graph tables that connect our rendered clusters.
    Maps entry-level edges to cluster-level (wurzel_id) pairs.

    Args:
        db_path: Path to SQLite database
        clusters: The multi-word clusters we're positioning
        all_clusters: ALL clusters (including single-word) for broader edge mapping.
                      If None, uses clusters.

    Returns: {"compound": [...], "semantic": [...], "etymology": [...], "field": [...]}
    """
    conn = sqlite3.connect(db_path)

    # Build entry_id → wurzel_id lookup from ALL clusters (not just multi-word)
    # This lets us find edges where one end is in a single-word cluster
    # that shares an edge with a multi-word cluster
    source_clusters = all_clusters if all_clusters else clusters
    entry_to_wurzel: dict[str, str] = {}
    for cluster in source_clusters:
        wid = cluster["wurzel"]["id"]
        for word in cluster["words"]:
            entry_to_wurzel[word["id"]] = wid

    # The set of wurzel_ids we're actually positioning
    positioned_ids = {c["wurzel"]["id"] for c in clusters}

    edges: dict[str, list[tuple[str, str]]] = {
        "compound":  [],
        "semantic":  [],
        "etymology": [],
        "field":     [],
    }

    # ── Compound edges ──
    rows = conn.execute("""
        SELECT compound_entry_id, component_entry_id
        FROM compound_edges
    """).fetchall()
    compound_pairs: set[tuple[str, str]] = set()
    for compound_eid, component_eid in rows:
        w_a = entry_to_wurzel.get(compound_eid)
        w_b = entry_to_wurzel.get(component_eid)
        # Both ends must be in our positioned set
        if w_a and w_b and w_a != w_b and w_a in positioned_ids and w_b in positioned_ids:
            pair = tuple(sorted([w_a, w_b]))
            compound_pairs.add(pair)
    edges["compound"] = list(compound_pairs)
    print(f"[layout] Compound edges: {len(edges['compound'])} cluster pairs")

    # ── Semantic edges ──
    # Include all edge types for broader coverage
    rows = conn.execute("""
        SELECT from_entry_id, to_entry_id
        FROM semantic_edges
    """).fetchall()
    semantic_pair_counts: dict[tuple[str, str], int] = defaultdict(int)
    for from_eid, to_eid in rows:
        w_a = entry_to_wurzel.get(from_eid)
        w_b = entry_to_wurzel.get(to_eid)
        if w_a and w_b and w_a != w_b and w_a in positioned_ids and w_b in positioned_ids:
            pair = tuple(sorted([w_a, w_b]))
            semantic_pair_counts[pair] += 1
    # Keep all pairs (even single-edge ones)
    edges["semantic"] = list(semantic_pair_counts.keys())
    print(f"[layout] Semantic edges: {len(edges['semantic'])} cluster pairs "
          f"(from {sum(semantic_pair_counts.values())} raw entry-level edges)")

    # ── Shared semantic field edges ──
    # Two clusters that have entries in the same semantic field should be near each other
    rows = conn.execute("""
        SELECT entry_id, field_id FROM entry_fields
    """).fetchall()
    field_to_clusters: dict[str, set[str]] = defaultdict(set)
    for entry_id, field_id in rows:
        wid = entry_to_wurzel.get(entry_id)
        if wid and wid in positioned_ids:
            field_to_clusters[field_id].add(wid)

    field_pairs: set[tuple[str, str]] = set()
    for field_id, cluster_set in field_to_clusters.items():
        cluster_list = list(cluster_set)
        # Only create pairs from fields with ≤20 clusters (avoid universal fields)
        if 2 <= len(cluster_list) <= 20:
            for i in range(len(cluster_list)):
                for j in range(i + 1, len(cluster_list)):
                    pair = tuple(sorted([cluster_list[i], cluster_list[j]]))
                    field_pairs.add(pair)
    edges["field"] = list(field_pairs)
    print(f"[layout] Shared-field edges: {len(edges['field'])} cluster pairs "
          f"(from {len(field_to_clusters)} fields)")

    # ── Etymology edges ──
    # Use derivation_edges to map entry_id → root_id, find clusters sharing roots
    rows = conn.execute("""
        SELECT entry_id, target_id
        FROM derivation_edges
        WHERE target_type = 'root'
    """).fetchall()
    root_to_clusters: dict[str, set[str]] = defaultdict(set)
    for entry_id, root_id in rows:
        wid = entry_to_wurzel.get(entry_id)
        if wid and wid in positioned_ids:
            root_to_clusters[root_id].add(wid)

    # Shared deep ancestors via etymology chain
    rows = conn.execute("""
        SELECT DISTINCT ee1.from_root_id, ee2.from_root_id
        FROM etymology_edges ee1
        JOIN etymology_edges ee2 ON ee1.to_root_id = ee2.to_root_id
        WHERE ee1.from_root_id != ee2.from_root_id
    """).fetchall()

    etym_pairs: set[tuple[str, str]] = set()

    # Direct shared-root pairs
    for root_id, cluster_set in root_to_clusters.items():
        cluster_list = list(cluster_set)
        for i in range(len(cluster_list)):
            for j in range(i + 1, len(cluster_list)):
                pair = tuple(sorted([cluster_list[i], cluster_list[j]]))
                etym_pairs.add(pair)

    # Shared-ancestor pairs via etymology chain
    for from_root, related_root in rows:
        clusters_a = root_to_clusters.get(from_root, set())
        clusters_b = root_to_clusters.get(related_root, set())
        for wa in clusters_a:
            for wb in clusters_b:
                if wa != wb:
                    pair = tuple(sorted([wa, wb]))
                    etym_pairs.add(pair)

    edges["etymology"] = list(etym_pairs)
    print(f"[layout] Etymology edges: {len(edges['etymology'])} cluster pairs")

    conn.close()

    total = sum(len(v) for v in edges.values())
    print(f"[layout] Total graph edges loaded: {total}")
    return edges


# ---------------------------------------------------------------------------
# Step 5: Force-directed refinement (Fruchterman-Reingold)
# ---------------------------------------------------------------------------

def refine_layout(
    positions: dict[str, dict],
    edges: dict[str, list[tuple[str, str]]],
    cluster_radii: dict[str, float],
) -> dict[str, dict]:
    """
    Refine UMAP positions: resolve collisions and nudge graph-connected clusters closer.

    Strategy: UMAP already provides a good semantic layout. We just need to:
      1. Graph nudge: pull connected clusters slightly closer
      2. Collision resolution: separate overlapping islands
      3. Rescale to fit world bounds

    Refines (x, z) only. Height stays from UMAP.
    """
    ids = list(positions.keys())
    n = len(ids)
    id_to_idx = {id: i for i, id in enumerate(ids)}

    pos = np.array([[positions[id]["x"], positions[id]["z"]] for id in ids],
                    dtype=np.float64)
    radii = np.array([cluster_radii.get(id, 3.0) for id in ids])

    # ── Phase 1: Graph-aware nudge ──
    # For each edge, pull connected clusters slightly closer
    print("[layout] Phase 1: Graph-aware nudge...")
    nudge_iterations = 10
    for nudge_iter in range(nudge_iterations):
        for edge_type, edge_list in edges.items():
            weight = EDGE_WEIGHTS.get(edge_type, 0.1)
            # Pull strength: 2-5% per iteration, scaled by weight
            pull_strength = 0.02 * weight
            for (id_a, id_b) in edge_list:
                if id_a not in id_to_idx or id_b not in id_to_idx:
                    continue
                i, j = id_to_idx[id_a], id_to_idx[id_b]
                dx = pos[j, 0] - pos[i, 0]
                dz = pos[j, 1] - pos[i, 1]
                dist = np.sqrt(dx * dx + dz * dz)
                if dist < 1.0:
                    continue
                # Pull towards each other (symmetrically)
                pull = pull_strength * dist  # proportional to distance
                pull = min(pull, 5.0)  # cap per-step movement
                nx, nz = dx / dist, dz / dist
                pos[i, 0] += nx * pull
                pos[i, 1] += nz * pull
                pos[j, 0] -= nx * pull
                pos[j, 1] -= nz * pull

    # Report graph nudge effect
    compound_edges = edges.get("compound", [])
    if compound_edges:
        dists_c = []
        for (a, b) in compound_edges:
            if a in id_to_idx and b in id_to_idx:
                i, j = id_to_idx[a], id_to_idx[b]
                d = np.sqrt((pos[i,0]-pos[j,0])**2 + (pos[i,1]-pos[j,1])**2)
                dists_c.append(d)
        if dists_c:
            print(f"  After nudge: avg compound dist = {np.mean(dists_c):.1f}")

    # ── Phase 2: Collision resolution ──
    # Iteratively push overlapping clusters apart
    print("[layout] Phase 2: Collision resolution...")
    min_spacing = 1.3  # 30% buffer beyond touching radius
    for collision_iter in range(500):
        resolved = True
        max_overlap_val = 0

        for i in range(n):
            for j in range(i + 1, n):
                dx = pos[i, 0] - pos[j, 0]
                dz = pos[i, 1] - pos[j, 1]
                dist = np.sqrt(dx * dx + dz * dz)
                min_dist = (radii[i] + radii[j]) * min_spacing
                if dist < min_dist:
                    resolved = False
                    overlap_amount = min_dist - dist
                    max_overlap_val = max(max_overlap_val, overlap_amount)

                    if dist < 0.01:
                        # Identical positions: nudge in random direction
                        angle = np.random.uniform(0, 2 * np.pi)
                        dx, dz = np.cos(angle), np.sin(angle)
                        dist = 0.01
                    # Push apart symmetrically
                    push = overlap_amount / 2 + 0.5
                    nx, nz = dx / dist, dz / dist
                    pos[i, 0] += nx * push
                    pos[i, 1] += nz * push
                    pos[j, 0] -= nx * push
                    pos[j, 1] -= nz * push

        if collision_iter % 100 == 0 and not resolved:
            current_overlaps = sum(
                1 for i in range(n) for j in range(i+1, n)
                if np.sqrt((pos[i,0]-pos[j,0])**2 + (pos[i,1]-pos[j,1])**2) <
                   (radii[i] + radii[j]) * min_spacing
            )
            print(f"  iter {collision_iter}: {current_overlaps} overlaps, "
                  f"max_overlap={max_overlap_val:.1f}")

        if resolved:
            print(f"  Collision resolved after {collision_iter + 1} iterations")
            break
    else:
        overlaps = sum(
            1 for i in range(n) for j in range(i+1, n)
            if np.sqrt((pos[i,0]-pos[j,0])**2 + (pos[i,1]-pos[j,1])**2) <
               (radii[i] + radii[j]) * min_spacing
        )
        print(f"  Hit max iterations, {overlaps} overlaps remain")

    # ── Phase 3: Rescale to fit world ──
    # After collision resolution, positions may have expanded.
    # Rescale to fit within WORLD_SIZE while preserving relative positions.
    margin = 15  # keep margin for island radii at edges
    x_min, x_max = pos[:, 0].min(), pos[:, 0].max()
    z_min, z_max = pos[:, 1].min(), pos[:, 1].max()
    x_range = max(x_max - x_min, 1.0)
    z_range = max(z_max - z_min, 1.0)
    target_range = WORLD_SIZE - 2 * margin  # 370

    # Scale uniformly (preserve aspect ratio from UMAP)
    scale = target_range / max(x_range, z_range)
    center_x = (x_max + x_min) / 2
    center_z = (z_max + z_min) / 2
    pos[:, 0] = (pos[:, 0] - center_x) * scale
    pos[:, 1] = (pos[:, 1] - center_z) * scale
    print(f"[layout] Phase 3: Rescaled — factor={scale:.2f}, "
          f"X=[{pos[:, 0].min():.0f}, {pos[:, 0].max():.0f}], "
          f"Z=[{pos[:, 1].min():.0f}, {pos[:, 1].max():.0f}]")

    result = {}
    for i, id in enumerate(ids):
        result[id] = {
            "x": float(pos[i, 0]),
            "z": float(pos[i, 1]),
            "height": positions[id]["height"],  # unchanged from UMAP
        }

    return result


# ---------------------------------------------------------------------------
# Step 6: Write to SQLite spatial_layout table
# ---------------------------------------------------------------------------

def write_layout(
    db_path: str,
    positions: dict[str, dict],
    cluster_radii: dict[str, float],
) -> None:
    """Write final positions to spatial_layout table."""
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    cur.execute("DELETE FROM spatial_layout")

    for wurzel_id, pos in positions.items():
        radius = cluster_radii.get(wurzel_id, 3.0)
        cur.execute("""
            INSERT INTO spatial_layout (root_id, x, z, island_radius, island_height, layout_version)
            VALUES (?, ?, ?, ?, ?, 1)
        """, (wurzel_id, pos["x"], pos["z"], radius, pos["height"]))

    conn.commit()
    conn.close()
    print(f"[layout] Wrote {len(positions)} positions to spatial_layout table")


# ---------------------------------------------------------------------------
# Step 7: Quality report
# ---------------------------------------------------------------------------

def print_quality_report(
    positions: dict[str, dict],
    edges: dict[str, list[tuple[str, str]]],
    clusters: list[dict],
) -> None:
    """Print layout quality metrics for manual inspection."""
    # Build wid → cluster lookup
    wid_to_cluster = {c["wurzel"]["id"]: c for c in clusters}

    print(f"\n{'─' * 60}")
    print("  LAYOUT QUALITY REPORT")
    print(f"{'─' * 60}")
    print(f"  Total positioned clusters: {len(positions)}")

    # Average edge distances by type
    for edge_type, edge_list in edges.items():
        if not edge_list:
            continue
        dists = []
        for (a, b) in edge_list:
            if a in positions and b in positions:
                dx = positions[a]["x"] - positions[b]["x"]
                dz = positions[a]["z"] - positions[b]["z"]
                dists.append(np.sqrt(dx * dx + dz * dz))
        if dists:
            print(f"  {edge_type:12s} edges: avg_dist={np.mean(dists):.1f}, "
                  f"median={np.median(dists):.1f}, "
                  f"max={np.max(dists):.1f}, "
                  f"count={len(dists)}")

    # Height distribution
    heights = [p["height"] for p in positions.values()]
    print(f"  Heights: min={min(heights):.1f}, max={max(heights):.1f}, "
          f"mean={np.mean(heights):.1f}, std={np.std(heights):.1f}")

    # Nearest-neighbour spot check: show 5 clusters + their 3 nearest neighbours
    print(f"\n  Nearest neighbours (spot check):")
    wids = list(positions.keys())
    coords = np.array([[positions[w]["x"], positions[w]["z"]] for w in wids])

    # Pick interesting clusters (largest multi-word ones)
    interesting = sorted(
        [(wid, wid_to_cluster[wid]) for wid in wids if wid in wid_to_cluster],
        key=lambda x: -len(x[1]["words"]),
    )[:10]

    for wid, cluster in interesting[:5]:
        idx = wids.index(wid)
        dists_to_all = np.sqrt(np.sum((coords - coords[idx]) ** 2, axis=1))
        nearest_indices = np.argsort(dists_to_all)[1:4]  # skip self
        neighbours = []
        for ni in nearest_indices:
            nwid = wids[ni]
            nc = wid_to_cluster.get(nwid)
            if nc:
                neighbours.append(f"{nc['wurzel']['form']} (d={dists_to_all[ni]:.0f})")
        words = [w["lemma"] for w in cluster["words"][:4]]
        print(f"    {cluster['wurzel']['form']:15s} [{', '.join(words)}]")
        print(f"      → neighbours: {', '.join(neighbours)}")

    print(f"{'─' * 60}\n")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compute embedding-based spatial layout for Urwort islands (Phase 1A)"
    )
    parser.add_argument("--db", default="data/urwort.db",
                        help="Path to SQLite dictionary DB")
    parser.add_argument("--ontology", default="game/public/ontology.json",
                        help="Path to ontology.json (for cluster/word data)")
    parser.add_argument("--vectors", default="raw-data/fasttext/cc.de.300.vec",
                        help="Path to fastText .vec file")
    parser.add_argument("--limit", type=int, default=200_000,
                        help="Max word vectors to load (default 200k)")
    parser.add_argument("--seed", type=int, default=42,
                        help="Random seed for UMAP (default 42)")
    args = parser.parse_args()

    base_dir = Path(__file__).resolve().parent.parent
    db_path = base_dir / args.db
    ontology_path = base_dir / args.ontology
    vectors_path = base_dir / args.vectors

    # ── Validate inputs ──
    if not db_path.exists():
        print(f"ERROR: Database not found: {db_path}", file=sys.stderr)
        sys.exit(1)
    if not ontology_path.exists():
        print(f"ERROR: Ontology not found: {ontology_path}", file=sys.stderr)
        sys.exit(1)
    if not vectors_path.exists():
        print(f"ERROR: fastText vectors not found: {vectors_path}", file=sys.stderr)
        print(f"  Download with: wget -O {vectors_path}.gz "
              f"https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.de.300.vec.gz "
              f"&& gunzip {vectors_path}.gz", file=sys.stderr)
        sys.exit(1)

    # ── Load cluster data ──
    print(f"[layout] Loading ontology from {ontology_path}...")
    with open(ontology_path, encoding="utf-8") as f:
        ontology = json.load(f)

    all_clusters = ontology["clusters"]
    # Only layout clusters with 2+ words (same filter as game client)
    clusters = [c for c in all_clusters if len(c["words"]) >= 2]
    print(f"[layout] {len(clusters)} multi-word clusters "
          f"(from {len(all_clusters)} total)")

    # ── Step 1: Load vectors ──
    model = load_vectors(str(vectors_path), limit=args.limit)

    # ── Step 2: Compute centroids ──
    centroids, radii = compute_cluster_centroids(clusters, model)

    # Free the large model from memory
    del model
    print("[layout] Freed fastText model from memory")

    # ── Step 3: UMAP reduction ──
    positions = reduce_embeddings(centroids)

    # ── Step 4: Load graph edges ──
    # Pass all_clusters so entry→cluster mapping covers single-word clusters too
    edges = load_graph_edges(str(db_path), clusters, all_clusters=all_clusters)

    # ── Step 5: Refine layout (graph nudge + collision resolution) ──
    positions = refine_layout(positions, edges, radii)

    # ── Step 6: Write to SQLite ──
    write_layout(str(db_path), positions, radii)

    # ── Quality report ──
    print_quality_report(positions, edges, clusters)

    print("[layout] Done! Next steps:")
    print("  1. Re-run export-ontology.py to attach positions to JSON")
    print("  2. Build game client: cd game && npm run build")


if __name__ == "__main__":
    main()
