# URWORT — Phase 1A: Embedding-Based Spatial Layout

_Implementation plan for replacing the grid layout with a semantically meaningful landscape._

_Prerequisites: Phase 0 complete (all success criteria met, graph tables populated)._

_Audience: Coding agent — all tasks specified with file paths, interfaces, algorithms, and acceptance criteria._

March 2026

---

## 0. What This Phase Delivers

**Before (Phase 0):** Islands are placed on a uniform grid. Position encodes nothing. A root for "house" might be next to a root for "fly" by accident of alphabetical order. The world is a spreadsheet with 3D dressing.

**After (Phase 1A):** Islands are placed in a 2D landscape where position is semantically meaningful. Roots used in similar contexts (fahren/reisen/fliegen) cluster together. Roots that share etymology sit near each other. Compound bridges are short. The third dimension — height — encodes concreteness: concrete words (Haus, Tisch, Hund) are in lowland valleys, abstract words (Freiheit, Erfahrung) are on mountain ridges. The world becomes a landscape you can read.

**Technique:** Hybrid pipeline — UMAP dimensionality reduction of fastText embeddings provides initial (x, z, height) positions, then a Fruchterman-Reingold force simulation refines (x, z) using structural constraints from the graph tables (compound edges, semantic edges, etymology connections).

---

## 1. Architecture Overview

```
BUILD TIME (Python — tools/compute-layout.py)

Step 1: Download fastText German vectors (one-time, ~1.2GB)
    ↓
Step 2: Load vectors, compute centroid per root cluster
    ↓
Step 3: UMAP reduction: 300-dim → 3-dim (x_seed, z_seed, height)
    ↓
Step 4: Load graph edges from SQLite (compound, semantic, etymology)
    ↓
Step 5: Force-directed refinement of (x, z) with graph constraints
    ↓
Step 6: Write positions to spatial_layout table + ontology.json
    ↓
Step 7: Generate heightmap data for terrain displacement

RUNTIME (Three.js — game client)

Step 1: Read positions + heights from ontology.json
Step 2: Place islands at pre-computed (x, z) positions
Step 3: Generate heightmap: Gaussian bumps at island positions
Step 4: Displace ground plane vertices from heightmap
Step 5: Colour vertices by height (ocean → beach → grass → rock)
```

---

## 2. Data Requirements

### 2.1 fastText German Vectors

**Source:** Facebook Research pre-trained Common Crawl + Wikipedia vectors
**URL:** `https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.de.300.vec.gz`
**Format:** Text (word2vec format) — first line is `{vocab_size} {dim}`, subsequent lines are `{word} {v1} {v2} ... {v300}`
**Size:** ~1.2GB compressed, ~4.5GB uncompressed
**License:** CC BY-SA 3.0
**Vocabulary:** ~2M German words, 300 dimensions
**Local path:** `raw-data/fasttext/cc.de.300.vec` (gitignored)

**Why the .vec text format (not .bin binary):**
- The .bin file is ~7GB and requires the `fasttext` C library to load
- The .vec file is loadable with pure `gensim.models.KeyedVectors` — no C dependencies
- We don't need subword composition (our words are all known lemmas in the vocabulary)
- Gensim can load with a `limit` parameter to cap memory usage

**Fallback if fastText is too large:**
- Use `limit=200000` when loading (top 200k most frequent words) — reduces memory from ~5GB to ~500MB
- All 1,351 of our A1-A2 lemmas will be in the top 200k
- This is the recommended approach for the Docker dev container

### 2.2 Graph Edges from SQLite

Read from the graph tables populated in Phase 0 Week 3:

| Table | What it provides | Edge count (approx) |
|-------|-----------------|-------------------|
| `compound_edges` | Compound word connections between clusters | ~50 |
| `semantic_edges` | Synonym/antonym/hypernym links | ~44,000 (filtered to our vocabulary) |
| `etymology_edges` | Shared etymological ancestry | ~800 |
| `entry_fields` + `semantic_fields` | Shared topic/domain | variable |
| `derivation_edges` | Shared root morpheme | ~600 |

### 2.3 Dependencies (Python, build-time only)

```
# Add to tools/requirements.txt or Dockerfile.dev
gensim>=4.3.0          # Load fastText .vec format via KeyedVectors
umap-learn>=0.5.0      # UMAP dimensionality reduction
numpy>=1.24.0          # Array operations (already present via gensim)
scipy>=1.10.0          # Spatial distance, used by UMAP internally
```

**Note:** These are build-time dependencies only. They run in the Docker container. They do not affect the game client bundle.

---

## 3. Implementation: Python Pipeline

### 3.1 New Script: `tools/compute-layout.py`

This is a new standalone script (not merged into `export-ontology.py`) because:
- It has heavy dependencies (gensim, umap-learn) that the main export doesn't need
- It takes 2-5 minutes to run (loading vectors + UMAP + force simulation)
- Its output (positions) changes rarely — only when vocabulary or edges change
- It writes to the `spatial_layout` SQLite table, which `export-ontology.py` reads during JSON export

**Usage:**

```bash
# First time: download fastText vectors
./tools/download-sources.sh  # or manual wget

# Compute layout (reads graph tables, writes spatial_layout)
python3 tools/compute-layout.py [--db data/urwort.db] [--vectors raw-data/fasttext/cc.de.300.vec] [--limit 200000]

# Then re-export ontology with positions
python3 tools/export-ontology.py
```

### 3.2 Step 1: Load fastText Vectors

```python
from gensim.models import KeyedVectors

def load_vectors(vec_path: str, limit: int = 200_000) -> KeyedVectors:
    """
    Load pre-trained German fastText vectors in word2vec text format.
    
    Args:
        vec_path: Path to cc.de.300.vec file
        limit: Max words to load (200k covers all A1-C2 vocabulary;
               reduces memory from ~5GB to ~500MB)
    """
    print(f"[layout] Loading fastText vectors (limit={limit:,})...")
    model = KeyedVectors.load_word2vec_format(vec_path, limit=limit)
    print(f"[layout] Loaded {len(model):,} word vectors, dim={model.vector_size}")
    return model
```

**Memory estimate:** 200,000 words × 300 dimensions × 4 bytes = ~240MB. Comfortable in the Docker container.

**Time estimate:** ~30-60 seconds to load 200k vectors from the .vec file.

### 3.3 Step 2: Compute Cluster Centroids

```python
import numpy as np

def compute_cluster_centroids(
    clusters: list[dict],
    model: KeyedVectors,
) -> dict[str, np.ndarray]:
    """
    For each root cluster, compute the centroid embedding
    (average of all word vectors in the cluster).
    
    Returns: {wurzel_id: 300-dim numpy array}
    """
    centroids = {}
    missing = 0
    
    for cluster in clusters:
        vectors = []
        for word in cluster["words"]:
            lemma = word["lemma"]
            # Try exact match, then lowercase, then with/without capitalisation
            for variant in [lemma, lemma.lower(), lemma.capitalize()]:
                if variant in model:
                    vectors.append(model[variant])
                    break
        
        if vectors:
            centroid = np.mean(vectors, axis=0)
            centroids[cluster["wurzel"]["id"]] = centroid
        else:
            missing += 1
    
    print(f"[layout] Computed centroids for {len(centroids)} clusters "
          f"({missing} clusters had no vectors)")
    return centroids
```

**Expected coverage:** ~95%+ of clusters should have at least one word with a vector. A1-A2 vocabulary is common enough to be in the top 200k words.

### 3.4 Step 3: UMAP Reduction to 3D

```python
import umap

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
    ids = list(centroids.keys())
    vectors = np.array([centroids[id] for id in ids])
    
    print(f"[layout] Running UMAP: {vectors.shape[0]} points, "
          f"{vectors.shape[1]}D → {n_components}D...")
    
    reducer = umap.UMAP(
        n_components=n_components,
        n_neighbors=n_neighbors,
        min_dist=min_dist,
        metric='cosine',
        random_state=random_state,
    )
    reduced = reducer.fit_transform(vectors)
    
    # Normalise each dimension to a useful range
    for dim in range(n_components):
        col = reduced[:, dim]
        col_min, col_max = col.min(), col.max()
        if col_max - col_min > 0:
            reduced[:, dim] = (col - col_min) / (col_max - col_min)
        else:
            reduced[:, dim] = 0.5
    
    # Scale to world coordinates
    WORLD_SIZE = 400       # -200 to 200
    HEIGHT_RANGE = 12      # 0 to 12 world units
    
    positions = {}
    for i, id in enumerate(ids):
        positions[id] = {
            "x": float(reduced[i, 0] * WORLD_SIZE - WORLD_SIZE / 2),
            "z": float(reduced[i, 1] * WORLD_SIZE - WORLD_SIZE / 2),
            "height": float(reduced[i, 2] * HEIGHT_RANGE),
        }
    
    print(f"[layout] UMAP complete. X range: [{min(p['x'] for p in positions.values()):.0f}, "
          f"{max(p['x'] for p in positions.values()):.0f}], "
          f"Height range: [{min(p['height'] for p in positions.values()):.1f}, "
          f"{max(p['height'] for p in positions.values()):.1f}]")
    
    return positions
```

**UMAP parameter choices:**
- `n_neighbors=15`: Balances local vs global structure. Lower = more local clusters, higher = more spread out. 15 is a good default for ~150 points.
- `min_dist=0.3`: How tightly UMAP packs points. 0.3 gives room for islands to have distinct territories. Lower = tighter clusters with more empty space.
- `metric='cosine'`: Standard for word embeddings (direction matters more than magnitude).
- `random_state=42`: Reproducible output. Same data always produces same layout.

**Height interpretation:** The third UMAP component naturally tends to separate concrete from abstract words (a well-documented property of word embedding spaces). Concrete nouns cluster differently from abstract nouns in embedding space. By mapping this to height, concrete words end up in valleys and abstract words on ridges — or vice versa. We may need to flip the height axis after inspecting the output.

**Time estimate:** UMAP on ~150 points takes <5 seconds.

### 3.5 Step 4: Load Graph Edges

```python
def load_graph_edges(db_path: str, cluster_ids: set[str]) -> dict:
    """
    Load edges from graph tables that connect our rendered clusters.
    Returns a dict of edge lists by type.
    """
    conn = sqlite3.connect(db_path)
    
    # We need to map entry_ids to cluster_ids (wurzel_ids)
    # Build this from the clusters data
    
    edges = {
        "compound": [],    # strongest: physical bridges
        "semantic": [],    # medium: same-topic clustering
        "etymology": [],   # weak: shared deep ancestry
    }
    
    # Compound edges: directly connect clusters via shared compound words
    # These come from compound_edges → map component entry_ids to their clusters
    rows = conn.execute("""
        SELECT DISTINCT ce.compound_entry_id, ce.component_entry_id
        FROM compound_edges ce
    """).fetchall()
    # ... map to cluster pairs ...
    
    # Semantic edges: synonym/antonym/hypernym between words in different clusters
    rows = conn.execute("""
        SELECT from_entry_id, to_entry_id, edge_type
        FROM semantic_edges
        WHERE edge_type IN ('synonym_of', 'hypernym_of')
    """).fetchall()
    # ... map to cluster pairs, count edges per pair ...
    
    # Etymology edges: clusters sharing a deep ancestor root
    # Two clusters share ancestry if their etymology chains converge
    rows = conn.execute("""
        SELECT DISTINCT ee1.from_root_id, ee2.from_root_id
        FROM etymology_edges ee1
        JOIN etymology_edges ee2 ON ee1.to_root_id = ee2.to_root_id
        WHERE ee1.from_root_id != ee2.from_root_id
    """).fetchall()
    # ... map to cluster pairs ...
    
    conn.close()
    return edges
```

**Note:** The exact SQL for mapping entry_ids/root_ids to cluster IDs depends on how clusters are identified. The simplest approach: build a `lemma → cluster_id` lookup from the clusters data, then map each edge's entry_ids through this lookup.

### 3.6 Step 5: Force-Directed Refinement

```python
def force_directed_refine(
    positions: dict[str, dict],
    edges: dict[str, list],
    cluster_radii: dict[str, float],
    iterations: int = 300,
    initial_temp: float = 50.0,
) -> dict[str, dict]:
    """
    Fruchterman-Reingold force-directed refinement of UMAP positions.
    
    Refines (x, z) only. Height stays from UMAP.
    Uses graph edges as attraction forces with different weights.
    
    Args:
        positions: {wurzel_id: {"x", "z", "height"}} from UMAP
        edges: {"compound": [...], "semantic": [...], "etymology": [...]}
        cluster_radii: {wurzel_id: float} island radius per cluster
        iterations: Number of simulation steps
        initial_temp: Starting temperature (annealing schedule)
    """
    ids = list(positions.keys())
    n = len(ids)
    id_to_idx = {id: i for i, id in enumerate(ids)}
    
    # Initialise positions from UMAP seeds
    pos = np.array([[positions[id]["x"], positions[id]["z"]] for id in ids])
    
    # Optimal distance between nodes (Fruchterman-Reingold parameter)
    area = 400.0 * 400.0  # world area
    k = np.sqrt(area / max(n, 1))  # optimal spacing
    
    # Edge weight configuration
    EDGE_WEIGHTS = {
        "compound": 3.0,     # strongest: these are physical bridges
        "semantic": 0.15,    # weak per-edge but many edges → meaningful aggregate
        "etymology": 0.5,    # moderate: shared deep ancestry
    }
    
    # Build adjacency with weights
    adjacency = np.zeros((n, n), dtype=np.float32)
    for edge_type, edge_list in edges.items():
        weight = EDGE_WEIGHTS.get(edge_type, 0.1)
        for (id_a, id_b) in edge_list:
            if id_a in id_to_idx and id_b in id_to_idx:
                i, j = id_to_idx[id_a], id_to_idx[id_b]
                adjacency[i, j] = max(adjacency[i, j], weight)
                adjacency[j, i] = max(adjacency[j, i], weight)
    
    # Radii for collision detection
    radii = np.array([cluster_radii.get(id, 3.0) for id in ids])
    
    print(f"[layout] Force-directed: {n} nodes, {iterations} iterations, "
          f"k={k:.1f}, temp={initial_temp:.1f}")
    
    for iteration in range(iterations):
        # Temperature annealing (linear cooldown)
        temp = initial_temp * (1.0 - iteration / iterations)
        
        # Compute displacement vectors
        disp = np.zeros_like(pos)
        
        for i in range(n):
            # ── Repulsion: all pairs ──
            for j in range(n):
                if i == j:
                    continue
                delta = pos[i] - pos[j]
                dist = max(np.linalg.norm(delta), 0.01)
                
                # Standard FR repulsion: k² / dist
                repulsion = (k * k) / dist
                disp[i] += (delta / dist) * repulsion
                
                # Hard collision: push apart if overlapping
                min_dist = (radii[i] + radii[j]) * 1.5
                if dist < min_dist:
                    overlap_force = (min_dist - dist) * 5.0
                    disp[i] += (delta / dist) * overlap_force
            
            # ── Attraction: connected pairs only ──
            for j in range(n):
                if adjacency[i, j] <= 0:
                    continue
                delta = pos[j] - pos[i]
                dist = max(np.linalg.norm(delta), 0.01)
                
                # FR attraction: dist² / k, scaled by edge weight
                attraction = (dist * dist / k) * adjacency[i, j]
                disp[i] += (delta / dist) * attraction
        
        # Apply displacement with temperature limit
        for i in range(n):
            disp_len = np.linalg.norm(disp[i])
            if disp_len > 0:
                # Clamp displacement to temperature
                scale = min(disp_len, temp) / disp_len
                pos[i] += disp[i] * scale
        
        # Keep within world bounds
        pos = np.clip(pos, -190, 190)
        
        if iteration % 50 == 0:
            avg_disp = np.mean(np.linalg.norm(disp, axis=1))
            print(f"  iteration {iteration}: temp={temp:.1f}, avg_disp={avg_disp:.2f}")
    
    # Write back to positions dict (preserve height from UMAP)
    result = {}
    for i, id in enumerate(ids):
        result[id] = {
            "x": float(pos[i, 0]),
            "z": float(pos[i, 1]),
            "height": positions[id]["height"],  # unchanged from UMAP
        }
    
    return result
```

**Performance note:** The naive O(n²) per iteration is fine for n=155. At 300 iterations, that's 155² × 300 = ~7.2M distance calculations — takes ~2-3 seconds in NumPy. For Phase 2 with 1,000+ clusters, switch to a Barnes-Hut approximation (O(n log n) per iteration).

**Tuning parameters:**
- `EDGE_WEIGHTS["compound"] = 3.0`: Compound bridges should be short. These are physical structures in the game.
- `EDGE_WEIGHTS["semantic"] = 0.15`: Each individual synonym edge is weak, but a cluster with many synonym connections to another cluster creates strong aggregate attraction. This forms the "semantic field archipelagos."
- `EDGE_WEIGHTS["etymology"] = 0.5`: Shared deep ancestry creates moderate attraction. Two roots from the same PIE ancestor should be in the same neighbourhood but not forced together.
- `initial_temp = 50.0`: Start with large movements, anneal to fine adjustments.
- `collision radius × 1.5`: Ensures visible water channels between all islands.

### 3.7 Step 6: Write to SQLite + ontology.json

```python
def write_layout(db_path: str, positions: dict[str, dict], 
                 cluster_radii: dict[str, float]):
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
```

Then modify `export-ontology.py` to read positions from `spatial_layout` and include them in the JSON:

```python
# In export-ontology.py, after building clusters:

def attach_positions(clusters: list[dict], db_path: str):
    """Read positions from spatial_layout and attach to cluster data."""
    conn = sqlite3.connect(db_path)
    positions = {}
    for row in conn.execute("SELECT root_id, x, z, island_height FROM spatial_layout"):
        positions[row[0]] = {"x": row[1], "z": row[2], "height": row[3]}
    conn.close()
    
    for cluster in clusters:
        wid = cluster["wurzel"]["id"]
        if wid in positions:
            cluster["position"] = positions[wid]
        # else: fallback to grid position (for clusters without embeddings)
```

**ontology.json output change:**

```json
{
  "version": 3,
  "layout": {
    "algorithm": "umap_force_directed",
    "embedding_model": "fasttext_cc_de_300",
    "world_size": 400,
    "height_range": 12
  },
  "clusters": [
    {
      "wurzel": { ... },
      "words": [ ... ],
      "position": { "x": -42.7, "z": 88.3, "height": 6.2 },
      ...
    }
  ]
}
```

### 3.8 Step 7: Heightmap Data (Optional Extra for Terrain)

Optionally, the Python script can pre-compute a low-resolution heightmap grid that the game client uses for terrain displacement:

```python
def compute_heightmap(positions: dict, cluster_radii: dict, 
                      resolution: int = 128) -> list[list[float]]:
    """
    Compute a 2D heightmap grid for terrain generation.
    Each cell's height is the sum of Gaussian contributions from nearby islands.
    """
    WORLD_SIZE = 400
    cell_size = WORLD_SIZE / resolution
    heightmap = [[0.0] * resolution for _ in range(resolution)]
    
    for wurzel_id, pos in positions.items():
        radius = cluster_radii.get(wurzel_id, 3.0)
        height = pos["height"]
        cx = (pos["x"] + WORLD_SIZE/2) / cell_size
        cz = (pos["z"] + WORLD_SIZE/2) / cell_size
        sigma = radius * 1.5 / cell_size
        
        # Stamp a Gaussian bump at this island's position
        r = int(sigma * 3)
        for dx in range(-r, r+1):
            for dz in range(-r, r+1):
                gx, gz = int(cx) + dx, int(cz) + dz
                if 0 <= gx < resolution and 0 <= gz < resolution:
                    dist_sq = dx*dx + dz*dz
                    gauss = height * np.exp(-dist_sq / (2 * sigma * sigma))
                    heightmap[gz][gx] = max(heightmap[gz][gx], gauss)
    
    return heightmap
```

This heightmap can either be:
- Included in `ontology.json` as a flat array (128×128 = 16K floats = ~65KB in JSON)
- Generated client-side from island positions (simpler, no data overhead, slightly slower)

**Recommendation for Phase 1A:** Generate client-side. The heightmap is a simple sum-of-Gaussians that takes ~10ms to compute in JavaScript. No need to ship it as data.

---

## 4. Implementation: Game Client Changes

### 4.1 Modify `world/layout.ts` — Replace Grid with Position Data

**Current:** `computeGridLayout()` takes clusters and returns Island positions on a uniform grid.

**New:** `computeLayout()` reads pre-computed positions from `ontology.json`.

```typescript
// world/layout.ts

export function computeLayout(clusters: RootCluster[]): WorldLayout {
    const islands: Island[] = [];
    const bridges: Bridge[] = [];
    
    for (const cluster of clusters) {
        const pos = cluster.position;
        if (!pos) continue;  // skip clusters without layout data
        
        const radius = Math.min(8, Math.max(3, cluster.words.length * 0.8 + 2));
        
        islands.push({
            id: cluster.wurzel.id,
            cluster,
            x: pos.x,
            z: pos.z,
            height: pos.height ?? 0,  // NEW: island base elevation
            radius,
        });
    }
    
    // Bridges computed same as before (compound links between islands)
    // ...
    
    return { islands, bridges };
}
```

**Type change:** Add `height` to the `Island` interface:

```typescript
// types/world.ts
interface Island {
    id: string;
    cluster: RootCluster;
    x: number;
    z: number;
    height: number;   // NEW: base elevation from embedding
    radius: number;
}
```

### 4.2 Modify `world/island.ts` — Elevate Islands

**Current:** Islands are placed at y=0 (sea level).

**New:** Islands are placed at y=`island.height`.

```typescript
// In createIslandMesh():
islandGroup.position.set(island.x, island.height, island.z);
```

This single line change makes the entire landscape 3D. Islands at different heights create a natural topography.

### 4.3 New: `world/terrain.ts` — Heightmap Ground Plane

**File:** `game/src/world/terrain.ts` (new)

Replace the flat ocean plane with a displaced terrain mesh:

```typescript
import * as THREE from 'three';
import { Island } from '../types/world';

export function createTerrain(
    islands: Island[],
    worldSize: number = 400,
    resolution: number = 200,
): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(
        worldSize, worldSize, resolution, resolution
    );
    geometry.rotateX(-Math.PI / 2);
    
    const positions = geometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    
    const SEA_LEVEL = -0.5;
    
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        
        // Sum of Gaussian bumps from all islands
        let height = SEA_LEVEL;
        for (const island of islands) {
            const dx = x - island.x;
            const dz = z - island.z;
            const distSq = dx * dx + dz * dz;
            const sigma = island.radius * 2.0;
            const gauss = island.height * Math.exp(-distSq / (2 * sigma * sigma));
            height = Math.max(height, gauss);
        }
        
        // Add subtle Perlin noise for natural variation
        // (use a simple noise function — see utils/noise.ts)
        height += noise2D(x * 0.02, z * 0.02) * 0.5;
        
        positions.setY(i, height);
        
        // Vertex colours by height
        const [r, g, b] = heightToColour(height);
        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
    }
    
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    
    const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        roughness: 0.9,
        metalness: 0.0,
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    return mesh;
}

function heightToColour(h: number): [number, number, number] {
    if (h < -0.3)  return [0.15, 0.25, 0.45];   // deep ocean (dark blue)
    if (h < 0.0)   return [0.25, 0.40, 0.55];   // shallow water (blue)
    if (h < 0.5)   return [0.76, 0.70, 0.50];   // beach/sand
    if (h < 3.0)   return [0.35, 0.55, 0.25];   // lowland grass (green)
    if (h < 6.0)   return [0.30, 0.45, 0.20];   // upland grass (darker green)
    if (h < 9.0)   return [0.50, 0.45, 0.35];   // rocky (brown)
    return [0.65, 0.65, 0.65];                   // mountain peak (grey)
}
```

**Performance:** 200×200 = 40,000 vertices. The Gaussian sum loop (40,000 vertices × 155 islands) is ~6.2M operations — takes ~50ms. Acceptable as a one-time cost on load. If too slow, pre-compute the heightmap as a Float32Array and sample it.

### 4.4 New: `utils/noise.ts` — Simple Perlin Noise

**File:** `game/src/utils/noise.ts` (new)

A minimal 2D noise implementation (~60 lines). Used for subtle terrain variation so the landscape doesn't look like pure mathematical bumps.

Many open-source implementations exist. The classic permutation-table approach works. No library needed.

### 4.5 Modify Camera Defaults

The camera starting position and fog distances need to adjust for the larger, more varied world:

```typescript
// scene/renderer.ts
// Fog: further distances to account for height variation
scene.fog = new THREE.Fog(0x87CEEB, 100, 300);  // was (80, 200)

// player/camera.ts
// Start position: higher up to see the landscape
camera.position.set(0, 40, 80);  // was lower
```

### 4.6 Modify Bridge Generation

Bridges now need to account for island height differences:

```typescript
// world/bridge.ts
// Bridge Y position = average of the two island heights
const bridgeY = (islandA.height + islandB.height) / 2;
bridgeGroup.position.y = bridgeY;

// Optionally: angle the bridge to slope between different heights
const heightDiff = islandB.height - islandA.height;
const length = /* bridge length */;
bridgeGroup.rotation.x = Math.atan2(heightDiff, length);
```

---

## 5. Download Script Update

### 5.1 Update `tools/download-sources.sh`

Add fastText German vectors to the download script:

```bash
# ── fastText German vectors ──
FASTTEXT_DIR="${RAW_DATA}/fasttext"
FASTTEXT_URL="https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.de.300.vec.gz"
FASTTEXT_FILE="${FASTTEXT_DIR}/cc.de.300.vec"

if [ ! -f "${FASTTEXT_FILE}" ]; then
    echo "Downloading fastText German vectors (~1.2GB compressed)..."
    mkdir -p "${FASTTEXT_DIR}"
    wget -O "${FASTTEXT_DIR}/cc.de.300.vec.gz" "${FASTTEXT_URL}"
    echo "Decompressing..."
    gunzip "${FASTTEXT_DIR}/cc.de.300.vec.gz"
    echo "Done: ${FASTTEXT_FILE} ($(du -h ${FASTTEXT_FILE} | cut -f1))"
else
    echo "fastText vectors already present: ${FASTTEXT_FILE}"
fi
```

### 5.2 Update `tools/source-manifest.yaml`

```yaml
  fasttext_cc_de_300:
    url: "https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.de.300.vec.gz"
    local_path: "raw-data/fasttext/cc.de.300.vec"
    format: "word2vec text format"
    dimensions: 300
    vocabulary: "~2M words"
    compressed_size: "~1.2GB"
    uncompressed_size: "~4.5GB"
    license: "CC-BY-SA-3.0"
    citation: "Grave et al., Learning Word Vectors for 157 Languages, LREC 2018"
```

### 5.3 Update `.gitignore`

```
raw-data/fasttext/
```

### 5.4 Update `Dockerfile.dev`

Add Python dependencies for the layout script:

```dockerfile
# In the pip install section:
RUN pip install --no-cache-dir \
    gensim>=4.3.0 \
    umap-learn>=0.5.0 \
    numpy>=1.24.0 \
    scipy>=1.10.0
```

---

## 6. Full Build Pipeline (Updated)

```bash
# Complete build from scratch:

# 1. Download all raw data (including fastText, ~1.2GB)
./tools/download-sources.sh

# 2. Build dictionary DB (FreeDict + Kaikki + IPA + CEFR → SQLite)
python3 tools/build-db.py

# 3. Export ontology + populate graph tables
python3 tools/export-ontology.py

# 4. Compute spatial layout (NEW — fastText + UMAP + force-directed)
python3 tools/compute-layout.py

# 5. Re-export ontology with positions attached
python3 tools/export-ontology.py

# 6. Build game client
cd game && npm run build
```

**Note:** Steps 4-5 require `export-ontology.py` to be run twice — first to populate graph tables (needed by `compute-layout.py`), then to attach positions to the JSON export. This could be optimised by having `compute-layout.py` directly update `ontology.json`, but the two-pass approach is cleaner and more maintainable.

---

## 7. Acceptance Criteria

### 7.1 Data Pipeline

| Criterion | Test |
|-----------|------|
| fastText vectors load successfully | `python3 -c "from gensim.models import KeyedVectors; m = KeyedVectors.load_word2vec_format('raw-data/fasttext/cc.de.300.vec', limit=1000); print(len(m))"` → prints `1000` |
| Centroid computed for ≥90% of clusters | Stats printed by `compute-layout.py` |
| UMAP produces 3D coordinates | All clusters in spatial_layout table have non-null x, z, height |
| Force-directed converges | Average displacement decreases over iterations (printed in log) |
| Positions written to spatial_layout | `SELECT COUNT(*) FROM spatial_layout` ≥ 150 |
| ontology.json includes positions | `jq '.clusters[0].position' game/public/ontology.json` returns `{"x": ..., "z": ..., "height": ...}` |

### 7.2 Visual (Game Client)

| Criterion | Test |
|-----------|------|
| Islands placed at different positions (not a grid) | Visual inspection — no regular rows/columns |
| Islands at different heights | Visual inspection — visible altitude variation |
| Semantically related islands near each other | "fahren", "gehen", "laufen" roots visible in same neighbourhood |
| Compound bridges are short (not crossing entire map) | Bridges connect nearby islands, not distant ones |
| Terrain rises at island locations | Ground plane is elevated under islands, low between them |
| Terrain coloured by height | Blue ocean, sandy beaches, green lowlands, grey peaks |
| No islands overlap | All islands have visible water/channel between them |
| Performance maintained | 60fps desktop, 30+ fps mobile, load < 5s |

### 7.3 Semantic Quality Spot-Check

Manually verify 10 cluster neighbourhoods:

| Root | Expected Neighbours (semantic) | Expected Neighbours (etymological) |
|------|-------------------------------|-----------------------------------|
| fahr- (drive) | geh- (walk), lauf- (run) | (if any shared PGmc ancestor) |
| haus- (house) | wohn- (dwell), zimmer- (room) | — |
| sprech- (speak) | sag- (say), red- (talk) | — |
| lern- (learn) | lehr- (teach), schul- (school) | — |
| ess- (eat) | trink- (drink), koch- (cook) | — |

If ≥7 of 10 have at least one expected neighbour in their visual vicinity, the layout is semantically meaningful.

---

## 8. Estimated Effort

| Task | Effort | Dependency |
|------|--------|------------|
| T1: Download script + manifest + gitignore + Dockerfile update | 1h | None |
| T2: `compute-layout.py` — vector loading + centroid computation | 2h | T1 |
| T3: `compute-layout.py` — UMAP reduction | 1.5h | T2 |
| T4: `compute-layout.py` — graph edge loading | 1.5h | T3 |
| T5: `compute-layout.py` — force-directed refinement | 3h | T3, T4 |
| T6: `compute-layout.py` — write to spatial_layout + integration with export | 1h | T5 |
| T7: `export-ontology.py` — attach positions from spatial_layout | 1h | T6 |
| T8: `world/layout.ts` — replace grid with position data | 1h | T7 |
| T9: `world/terrain.ts` — heightmap terrain generation | 3h | T8 |
| T10: `utils/noise.ts` — Perlin noise | 1h | T9 |
| T11: Camera, fog, bridge adjustments | 1h | T8 |
| T12: Testing, tuning UMAP/force parameters | 2-3h | All above |
| **Total** | **~19-22h** | |

**Calendar estimate:** 3-4 days focused, or 1 week at half-days.

**Critical path:** T1 → T2 → T3 → T5 → T6 → T7 → T8 → T9 → T12

T4 (graph edge loading) can be done in parallel with T3 (UMAP).

---

## 9. Risk Register

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| fastText vectors too large for Docker container memory | Medium | Low | Use `limit=200000` (default). Only loads top 200k words. ~240MB in RAM. |
| UMAP height dimension doesn't separate concrete/abstract | Medium | Medium | Inspect output. If height isn't meaningful, try: (a) swap UMAP components, (b) use frequency as height instead, (c) use a concreteness lexicon to orient the axis. |
| Force-directed produces ugly overlapping clusters | Medium | Low | The collision constraint prevents overlap. Tune `initial_temp` and `collision radius multiplier`. Grid layout remains as fallback. |
| Some clusters missing from fastText vocabulary | Low | Low | Already handled: clusters without vectors get no centroid, fall back to random position. Expected <5% miss rate for A1-A2 vocabulary. |
| UMAP non-deterministic across platforms | Low | Medium | `random_state=42` should ensure reproducibility. Test on the Docker container specifically. |
| gensim/umap-learn dependency conflicts | Low | Low | Pin versions in requirements.txt. These are stable, well-maintained libraries. |

---

## 10. What This Enables for Phase 1B+

Once positions and heights are in place:

**Phase 1B (Heightmap Terrain):** Already implemented in this plan as Task T9. The terrain mesh with vertex colours gives the world a natural landscape feel.

**Phase 1C (WFC Island Detail):** The island positions and heights are inputs to the WFC tile generator. Each island's position determines its biome (from embedding neighbourhood), and its height determines cliff/grass/beach tile ratios.

**Phase 1D (LOD System):** Islands far from the camera can be rendered as simple coloured discs at their (x, height, z) position. The height data makes distant islands visible above the terrain horizon.

**Phase 1E (Fog of War):** Unexplored regions rendered as mist at sea level. As you explore, the terrain "rises" from the fog. Height variation makes this dramatic — mountain peaks poke through the mist before you reach them.

---

## Appendix: File Inventory After Phase 1A

```
tools/
├── build-db.py                    ~1,100 lines (unchanged)
├── schema.sql                     ~250 lines   (unchanged, spatial_layout already exists)
├── export-ontology.py             ~1,050 lines (add attach_positions())
├── compute-layout.py              ~350 lines   (NEW)
├── download-sources.sh            (updated with fastText)
├── source-manifest.yaml           (updated with fastText)
└── requirements.txt               (add gensim, umap-learn)

game/src/
├── world/
│   ├── layout.ts                  ~50 lines   (simplified: reads positions, no grid computation)
│   ├── terrain.ts                 ~100 lines  (NEW: heightmap generation)
│   ├── island.ts                  ~120 lines  (modified: use height for Y position)
│   └── bridge.ts                  ~90 lines   (modified: height-aware bridges)
├── utils/
│   └── noise.ts                   ~60 lines   (NEW: 2D Perlin noise)
└── ... (all other files unchanged)
```

---

_Last updated: 2026-03-15_
_Version: 1_
_Reference for: Phase 1A implementation sprint_
