# URWORT — Phase 1B: Heightmap Terrain

_Implementation plan for transforming flat ocean into a semantically meaningful landscape._

_Prerequisites: Phase 1A complete (embedding-based positions in ontology.json v3)._

_Audience: Coding agent — all tasks specified with file paths, code, algorithms, and acceptance criteria._

March 2026

---

## 0. What This Phase Delivers

**Before (Phase 1A):** Islands have semantically meaningful (x, z) positions and computed heights, but they still float on a flat blue-grey ocean plane. The height data exists in the JSON but isn't used visually. The ground is a single flat `PlaneGeometry` with a uniform colour.

**After (Phase 1B):** The ground plane is a displacement-mapped terrain mesh. Land rises at island positions and falls to ocean level between them. Vertex colours paint the landscape: deep blue ocean, sandy beaches, green lowlands, brown uplands, grey mountain peaks. Islands sit naturally on elevated terrain rather than floating on water. The world looks and feels like geography.

**No Python pipeline changes.** This is entirely a game client (TypeScript/Three.js) task. All data is already in `ontology.json` from Phase 1A.

---

## 1. Architecture

```
ontology.json (already has positions + heights)
    │
    ▼
layout.ts ─── reads cluster.position {x, z, height}
    │          replaces grid computation with direct position read
    │
    ▼
terrain.ts ── NEW: generates heightmap terrain mesh
    │          sum-of-Gaussians at island positions
    │          + Perlin noise for natural variation
    │          + vertex colours by height
    │
    ▼
island.ts ─── modified: islands placed at y = height
    │          island base cylinder bottom aligns with terrain surface
    │
    ▼
bridge.ts ─── modified: bridges slope between different heights
    │
    ▼
renderer.ts ─ modified: camera, fog, background adjusted for terrain
```

---

## 2. Task List

| # | Task | File(s) | Effort | Dependencies |
|---|------|---------|--------|--------------|
| T1 | Perlin noise utility | `utils/noise.ts` (new) | 1h | None |
| T2 | Replace grid layout with position data | `world/layout.ts` | 1h | None |
| T3 | Heightmap terrain mesh | `world/terrain.ts` (new) | 3h | T1, T2 |
| T4 | Elevate islands to computed heights | `world/island.ts` | 30min | T2 |
| T5 | Height-aware bridges | `world/bridge.ts` | 1h | T2, T4 |
| T6 | Camera, fog, background adjustments | `scene/renderer.ts`, `player/camera.ts` | 1h | T3 |
| T7 | Replace old ground plane with terrain | `main.ts` or scene setup | 30min | T3 |
| T8 | Water plane (separate from terrain) | `world/terrain.ts` | 30min | T3 |
| T9 | Tuning + mobile performance testing | All files | 1.5h | All above |
| **Total** | | | **~10h** | |

---

## 3. Task Details

### T1: Perlin Noise Utility

**File:** `game/src/utils/noise.ts` (new)

**What:** A self-contained 2D Perlin noise implementation. No external library needed. Used by the terrain generator for natural surface variation so the landscape doesn't look like pure mathematical Gaussians.

**Implementation:** Classic permutation-table Perlin noise. ~60 lines.

```typescript
// utils/noise.ts

/**
 * Classic 2D Perlin noise.
 * Returns values in approximately [-1, 1] range.
 * 
 * Usage:
 *   noise2D(x * frequency, z * frequency) * amplitude
 */

// Permutation table (256 entries, doubled for wrapping)
const perm = new Uint8Array(512);
const grad = [
  [1,1], [-1,1], [1,-1], [-1,-1],
  [1,0], [-1,0], [0,1], [0,-1],
];

// Seed the permutation table (deterministic)
function seedNoise(seed: number = 42): void {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  
  // Fisher-Yates shuffle with seeded PRNG
  let s = seed;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807 + 0) % 2147483647;  // Park-Miller PRNG
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}

// Initialise on module load
seedNoise(42);

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

function dot2(g: number[], x: number, y: number): number {
  return g[0] * x + g[1] * y;
}

export function noise2D(x: number, y: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  
  const u = fade(xf);
  const v = fade(yf);
  
  const g00 = grad[perm[perm[X] + Y] & 7];
  const g10 = grad[perm[perm[X + 1] + Y] & 7];
  const g01 = grad[perm[perm[X] + Y + 1] & 7];
  const g11 = grad[perm[perm[X + 1] + Y + 1] & 7];
  
  const n00 = dot2(g00, xf, yf);
  const n10 = dot2(g10, xf - 1, yf);
  const n01 = dot2(g01, xf, yf - 1);
  const n11 = dot2(g11, xf - 1, yf - 1);
  
  return lerp(
    lerp(n00, n10, u),
    lerp(n01, n11, u),
    v
  );
}

/**
 * Fractal Brownian Motion — layered noise for natural-looking terrain.
 * octaves=3 is good for subtle ground variation.
 */
export function fbm(x: number, y: number, octaves: number = 3): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;
  
  for (let i = 0; i < octaves; i++) {
    value += noise2D(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  
  return value / maxValue;  // normalise to [-1, 1]
}
```

**Acceptance criteria:**
- `noise2D(0, 0)` returns a deterministic value (same every run due to fixed seed)
- `noise2D(x, y)` returns values in approximately [-1, 1]
- `fbm(x, y, 3)` returns smooth, natural-looking variation
- No external dependencies

---

### T2: Replace Grid Layout with Position Data

**File:** `game/src/world/layout.ts`

**What:** The current `computeGridLayout()` places islands on a uniform grid. Replace it with a function that reads pre-computed positions from `ontology.json`.

**Current behaviour:**
```typescript
// Currently computes grid positions:
const col = index % gridCols;
const row = Math.floor(index / gridCols);
const x = col * GRID_SPACING - (gridCols * GRID_SPACING) / 2;
const z = row * GRID_SPACING - (gridRows * GRID_SPACING) / 2;
```

**New behaviour:**
```typescript
export function computeLayout(clusters: RootCluster[]): WorldLayout {
  const islands: Island[] = [];
  const bridges: Bridge[] = [];
  
  // Fallback grid parameters (used when position data is missing)
  const GRID_SPACING = 25;
  let fallbackIndex = 0;
  const fallbackCols = Math.ceil(Math.sqrt(clusters.length));
  
  for (const cluster of clusters) {
    const radius = Math.min(8, Math.max(3, cluster.words.length * 0.8 + 2));
    
    let x: number, z: number, height: number;
    
    if (cluster.position) {
      // Use pre-computed embedding-based position (Phase 1A)
      x = cluster.position.x;
      z = cluster.position.z;
      height = cluster.position.height;
    } else {
      // Fallback: grid layout for clusters without position data
      const col = fallbackIndex % fallbackCols;
      const row = Math.floor(fallbackIndex / fallbackCols);
      x = col * GRID_SPACING - (fallbackCols * GRID_SPACING) / 2;
      z = row * GRID_SPACING - (fallbackCols * GRID_SPACING) / 2;
      height = 0;
      fallbackIndex++;
    }
    
    islands.push({
      id: cluster.wurzel.id,
      cluster,
      x,
      z,
      height,
      radius,
    });
  }
  
  // Bridge computation (unchanged — compound links between islands)
  // ... existing bridge logic ...
  
  return { islands, bridges };
}
```

**Type change required:** Ensure the `Island` interface in `types/world.ts` has the `height` field:

```typescript
export interface Island {
  id: string;
  cluster: RootCluster;
  x: number;
  z: number;
  height: number;  // base elevation from embedding (0-12)
  radius: number;
}
```

And ensure `RootCluster` in `types/ontology.ts` includes optional position:

```typescript
export interface RootCluster {
  wurzel: Wurzel;
  words: Wort[];
  links: WurzelWortLink[];
  compounds: CompoundLink[];
  position?: { x: number; z: number; height: number };  // from Phase 1A
}
```

**Acceptance criteria:**
- Islands placed at positions from `ontology.json` (not on a grid)
- Clusters without position data fall back to grid (no crash)
- `height` property available on every Island object

---

### T3: Heightmap Terrain Mesh

**File:** `game/src/world/terrain.ts` (new)

**What:** Generate a terrain mesh where land rises at island positions and falls to ocean level between them. This is the core visual change of Phase 1B.

**Algorithm:**

For each vertex in a subdivided plane:
1. Compute the sum of Gaussian contributions from all nearby islands
2. Add fractal Brownian motion noise for natural surface variation
3. Clamp below sea level for ocean areas
4. Assign vertex colour based on final height

```typescript
// world/terrain.ts

import * as THREE from 'three';
import { Island } from '../types/world';
import { fbm } from '../utils/noise';

// ── Terrain configuration ──────────────────────────────────────────────

const SEA_LEVEL = -0.3;           // below this = underwater
const NOISE_FREQUENCY = 0.015;    // how "busy" the terrain variation is
const NOISE_AMPLITUDE = 0.8;      // how much noise affects height
const GAUSSIAN_SIGMA_FACTOR = 2.0; // how wide the island's terrain influence is
const SHORE_BLEND = 1.5;          // width of the beach/shore transition

// ── Height-to-colour mapping ───────────────────────────────────────────

interface ColourStop {
  height: number;
  colour: [number, number, number];
}

const COLOUR_RAMP: ColourStop[] = [
  { height: -2.0, colour: [0.10, 0.18, 0.35] },   // deep ocean
  { height: -0.3, colour: [0.20, 0.35, 0.55] },   // shallow water
  { height:  0.0, colour: [0.76, 0.70, 0.50] },   // sand/beach
  { height:  0.5, colour: [0.45, 0.60, 0.30] },   // lowland grass
  { height:  3.0, colour: [0.35, 0.50, 0.22] },   // grass
  { height:  6.0, colour: [0.30, 0.42, 0.18] },   // upland grass
  { height:  8.0, colour: [0.45, 0.40, 0.30] },   // rocky
  { height: 10.0, colour: [0.55, 0.50, 0.42] },   // high rock
  { height: 12.0, colour: [0.70, 0.68, 0.65] },   // peak / snow-line
];

function sampleColourRamp(height: number): [number, number, number] {
  // Find the two stops bracketing this height and lerp between them
  if (height <= COLOUR_RAMP[0].height) return COLOUR_RAMP[0].colour;
  if (height >= COLOUR_RAMP[COLOUR_RAMP.length - 1].height) {
    return COLOUR_RAMP[COLOUR_RAMP.length - 1].colour;
  }
  
  for (let i = 0; i < COLOUR_RAMP.length - 1; i++) {
    const a = COLOUR_RAMP[i];
    const b = COLOUR_RAMP[i + 1];
    if (height >= a.height && height <= b.height) {
      const t = (height - a.height) / (b.height - a.height);
      return [
        a.colour[0] + (b.colour[0] - a.colour[0]) * t,
        a.colour[1] + (b.colour[1] - a.colour[1]) * t,
        a.colour[2] + (b.colour[2] - a.colour[2]) * t,
      ];
    }
  }
  return COLOUR_RAMP[0].colour;
}

// ── Terrain generation ─────────────────────────────────────────────────

export function createTerrain(
  islands: Island[],
  worldSize: number = 400,
  segments: number = 200,
): THREE.Mesh {
  
  const geometry = new THREE.PlaneGeometry(worldSize, worldSize, segments, segments);
  geometry.rotateX(-Math.PI / 2);  // lay flat on XZ plane
  
  const posAttr = geometry.attributes.position;
  const vertexCount = posAttr.count;
  const colours = new Float32Array(vertexCount * 3);
  
  // Pre-compute island data for the height kernel
  // Only sample nearby islands per vertex (optimisation)
  const islandData = islands.map(island => ({
    x: island.x,
    z: island.z,
    height: island.height,
    sigma: island.radius * GAUSSIAN_SIGMA_FACTOR,
    sigmaSq2: 2 * (island.radius * GAUSSIAN_SIGMA_FACTOR) ** 2,
  }));
  
  for (let i = 0; i < vertexCount; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    
    // ── Step 1: Sum of Gaussian contributions from islands ──
    let islandHeight = SEA_LEVEL;
    
    for (const isl of islandData) {
      const dx = vx - isl.x;
      const dz = vz - isl.z;
      const distSq = dx * dx + dz * dz;
      
      // Skip islands too far away (>4σ contributes negligibly)
      if (distSq > isl.sigmaSq2 * 8) continue;
      
      const gauss = isl.height * Math.exp(-distSq / isl.sigmaSq2);
      islandHeight = Math.max(islandHeight, gauss);
    }
    
    // ── Step 2: Add fractal noise for natural variation ──
    const noiseVal = fbm(vx * NOISE_FREQUENCY, vz * NOISE_FREQUENCY, 3);
    
    // Noise amplitude is stronger above sea level (terrain detail)
    // and weaker below (gentle ocean floor variation)
    let finalHeight: number;
    if (islandHeight > 0) {
      // Above sea level: noise adds terrain detail
      finalHeight = islandHeight + noiseVal * NOISE_AMPLITUDE;
    } else {
      // Below sea level: subtle ocean floor variation
      finalHeight = islandHeight + noiseVal * 0.3;
    }
    
    // ── Step 3: Apply height to vertex ──
    posAttr.setY(i, finalHeight);
    
    // ── Step 4: Vertex colour from height ──
    const [r, g, b] = sampleColourRamp(finalHeight);
    colours[i * 3]     = r;
    colours[i * 3 + 1] = g;
    colours[i * 3 + 2] = b;
  }
  
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  posAttr.needsUpdate = true;
  
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.85,
    metalness: 0.0,
  });
  
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  
  // Terrain is not interactable — don't include in raycasting
  mesh.userData.type = 'terrain';
  
  return mesh;
}
```

**Performance analysis:**
- 200×200 segments = 40,401 vertices
- Each vertex tests ~155 islands (with early-exit for distant islands)
- Realistic cost: ~50-100ms on desktop, ~150-300ms on mobile
- This is a one-time cost at scene init, not per-frame
- If too slow: reduce segments to 128×128 (16,641 vertices) or pre-compute a 2D heightmap array first and sample it per vertex

**Acceptance criteria:**
- Terrain rises at island positions, falls to ocean between them
- Smooth Gaussian slopes, not sharp steps
- Natural variation from Perlin noise (no perfectly smooth surfaces)
- Vertex colours transition smoothly: blue → sand → green → brown → grey
- flatShading gives the low-poly aesthetic
- Terrain renders in <300ms on mobile
- Terrain receives shadows from islands/pillars

---

### T4: Elevate Islands to Computed Heights

**File:** `game/src/world/island.ts`

**What:** Islands currently sit at y=0. They need to sit at their computed height so they're on top of the terrain, not buried in it.

**Change:**

```typescript
// In createIslandMesh() — when setting the island group position:

// BEFORE:
islandGroup.position.set(island.x, 0, island.z);

// AFTER:
// Place island at its computed height.
// Add a small offset (+1) so the island base sits ON the terrain, not IN it.
// The island cylinder extends 2 units tall, so its bottom is at height-1, top at height+1.
islandGroup.position.set(island.x, island.height, island.z);
```

**Important detail:** The island's base cylinder geometry is centred at local y=0, extending from y=-1 to y=1 (if height is 2). So `islandGroup.position.y = island.height` puts the cylinder's centre at the computed height. The terrain Gaussian peaks at the same height, so the island's bottom half is embedded in the terrain (hidden) and the top half protrudes. This looks natural — like the island is part of the landscape.

If the island cylinder extends too far below the terrain, adjust the cylinder's local y offset:

```typescript
// If needed: shift the cylinder up so its bottom sits at terrain level
baseCylinder.position.y = cylinderHeight / 2;
```

**Acceptance criteria:**
- Islands sit at varying heights (not all at y=0)
- Island base is flush with or slightly above the terrain surface
- Root labels and word pillars are positioned correctly relative to the elevated island
- No islands floating above or sunk below the terrain

---

### T5: Height-Aware Bridges

**File:** `game/src/world/bridge.ts`

**What:** Bridges currently span horizontally between islands at y=0. They need to slope between islands at different heights.

**Change:**

```typescript
// In createBridgeMesh():

// Get heights of both endpoints
const heightA = islandA.height;
const heightB = islandB.height;
const midHeight = (heightA + heightB) / 2;
const heightDiff = heightB - heightA;

// Bridge position: midpoint between the two islands, at average height
const midX = (islandA.x + islandB.x) / 2;
const midZ = (islandA.z + islandB.z) / 2;
bridgeGroup.position.set(midX, midHeight, midZ);

// Bridge rotation: angle horizontally toward target (existing)
const dx = islandB.x - islandA.x;
const dz = islandB.z - islandA.z;
const horizontalLength = Math.sqrt(dx * dx + dz * dz);
const yaw = Math.atan2(dx, dz);

// Bridge rotation: slope to match height difference (NEW)
const pitch = Math.atan2(heightDiff, horizontalLength);

// Apply rotations
bridgeGroup.rotation.set(pitch, yaw, 0, 'YXZ');

// Bridge length: account for height difference in total span
const totalLength = Math.sqrt(horizontalLength * horizontalLength + heightDiff * heightDiff);
// Scale the bridge geometry to match total length
// (or create the geometry at the correct length)
```

**Edge case:** If two connected islands have a very large height difference (>5 units), the bridge will be steeply sloped. This is fine visually — it looks like a mountain path or a steep bridge. But verify it doesn't look broken.

**Acceptance criteria:**
- Bridges slope correctly between islands at different heights
- Bridge midpoint is at the average height of the two endpoints
- Bridge label is still readable (not rotated so far it's sideways)
- No bridges passing through terrain

---

### T6: Camera, Fog, and Background Adjustments

**Files:** `game/src/scene/renderer.ts`, `game/src/player/camera.ts`

**What:** The terrain is taller and more varied than the flat ocean. Camera and fog need to adjust.

**Changes to `scene/renderer.ts`:**

```typescript
// Background: gradient sky colour (keep the same sky blue)
scene.background = new THREE.Color(0x87CEEB);

// Fog: increase far distance to see more of the landscape
// The terrain extends up to 12 units high, and the world is 400x400
// We want to see ~150-200 units of terrain before fog hides it
scene.fog = new THREE.Fog(0x87CEEB, 80, 280);  // was (80, 200)

// Optional: if fog obscures too much terrain, try:
// scene.fog = new THREE.FogExp2(0x87CEEB, 0.004);
// Exponential fog gives a more natural atmospheric feel

// Directional light: ensure it illuminates the terrain from above
// so the vertex normals create visible shading on slopes
directionalLight.position.set(50, 80, 30);
directionalLight.castShadow = true;
// Shadow camera should encompass the world
directionalLight.shadow.camera.left = -200;
directionalLight.shadow.camera.right = 200;
directionalLight.shadow.camera.top = 200;
directionalLight.shadow.camera.bottom = -200;
directionalLight.shadow.camera.far = 300;
directionalLight.shadow.mapSize.setScalar(2048);
```

**Changes to `player/camera.ts`:**

```typescript
// Initial camera position: higher up to see the terrain relief
// The tallest island is at height ~12, so the camera should start above that
const INITIAL_CAMERA_HEIGHT = 50;  // was likely ~30
const INITIAL_CAMERA_DISTANCE = 100;  // horizontal distance from origin

// Set initial position looking down at an interesting cluster
camera.position.set(0, INITIAL_CAMERA_HEIGHT, INITIAL_CAMERA_DISTANCE);

// MapControls min/max distance may need adjustment
controls.minDistance = 10;   // was 8 — slightly further to avoid terrain clipping
controls.maxDistance = 150;  // was 100 — need to pull back further for overview

// Polar angle: allow slightly steeper look-down for terrain overview
controls.minPolarAngle = 0.15;  // nearly top-down (good for map view)
controls.maxPolarAngle = 1.45;  // nearly horizon (same as before)
```

**Acceptance criteria:**
- Starting camera view shows terrain relief (not just flat plane)
- Zooming out shows the full landscape with visible height variation
- Fog fades distant terrain naturally (no hard cutoff)
- Terrain slopes are visibly shaded by the directional light
- Camera doesn't clip into terrain at close zoom

---

### T7: Replace Old Ground Plane with Terrain

**File:** `game/src/main.ts` (or wherever the ground plane is created)

**What:** Remove the old flat ground plane and replace it with the new terrain mesh.

**Current code (somewhere in scene setup or main.ts):**
```typescript
// OLD: flat ocean plane
const groundGeo = new THREE.PlaneGeometry(500, 500);
groundGeo.rotateX(-Math.PI / 2);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x4a6670 });
const ground = new THREE.Mesh(groundGeo, groundMat);
scene.add(ground);
```

**New code:**
```typescript
import { createTerrain } from './world/terrain';

// NEW: heightmap terrain
const terrain = createTerrain(layout.islands, 400, 200);
scene.add(terrain);
```

**Acceptance criteria:**
- Old flat ground plane is removed
- New terrain mesh is the only ground surface
- Scene has no leftover flat plane under/behind the terrain

---

### T8: Water Plane (Separate from Terrain)

**File:** `game/src/world/terrain.ts` (add to the module) or create inline in main

**What:** The terrain mesh includes underwater vertices (coloured blue), but for visual quality we want a separate semi-transparent water plane at sea level. This gives the ocean a reflective/translucent quality distinct from the terrain colouring.

```typescript
export function createWaterPlane(worldSize: number = 400): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(worldSize, worldSize);
  geometry.rotateX(-Math.PI / 2);
  
  const material = new THREE.MeshStandardMaterial({
    color: 0x3a7ca5,
    transparent: true,
    opacity: 0.6,
    roughness: 0.2,
    metalness: 0.1,
    // Water sits at sea level
  });
  
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = -0.3;  // SEA_LEVEL — matches terrain.ts constant
  mesh.receiveShadow = true;
  mesh.userData.type = 'water';  // not interactable
  
  return mesh;
}
```

**Usage in main.ts:**
```typescript
import { createTerrain, createWaterPlane } from './world/terrain';

const terrain = createTerrain(layout.islands);
const water = createWaterPlane();
scene.add(terrain);
scene.add(water);
```

**Visual effect:** The terrain's blue-coloured underwater vertices show through the semi-transparent water plane, creating depth. The water plane catches subtle specular highlights from the directional light, giving the ocean a glassy quality. Land above sea level pokes through the water naturally.

**Acceptance criteria:**
- Water plane visible as a distinct flat surface at sea level
- Land areas protrude above the water
- Water is semi-transparent (can see terrain colour beneath)
- Water doesn't z-fight with terrain (water is at a fixed y, terrain vertices are below)

---

### T9: Tuning and Mobile Performance Testing

**What:** After all pieces are assembled, tune the terrain parameters and test on mobile.

**Parameters to tune:**

| Parameter | Default | Tune If... | Range |
|-----------|---------|------------|-------|
| `segments` (terrain resolution) | 200 | Mobile too slow | 100–250 |
| `GAUSSIAN_SIGMA_FACTOR` | 2.0 | Islands look too sharp/flat | 1.5–3.0 |
| `NOISE_FREQUENCY` | 0.015 | Terrain looks too busy/smooth | 0.005–0.03 |
| `NOISE_AMPLITUDE` | 0.8 | Terrain variation too subtle/extreme | 0.3–1.5 |
| `SEA_LEVEL` | -0.3 | Too much/little land visible | -1.0–0.0 |
| `SHORE_BLEND` | 1.5 | Beach too narrow/wide | 0.5–3.0 |
| Fog near/far | 80/280 | Too much/little visible | 60–120 / 200–350 |
| Water opacity | 0.6 | Water too opaque/invisible | 0.3–0.8 |

**Mobile performance checklist:**
- [ ] Terrain generates in <300ms (check `performance.now()` around `createTerrain`)
- [ ] Frame rate stays at 30+ fps after terrain is in scene
- [ ] No visible jank when panning over terrain
- [ ] Terrain doesn't cause memory issues (check heap size in Chrome DevTools)
- [ ] Loading overlay still dismisses within 5 seconds total

**If mobile is too slow:**
1. Reduce segments from 200 to 128 (cuts vertex count by 60%)
2. Reduce Gaussian sampling: skip islands >100 units away
3. Remove shadow receiving from terrain (`mesh.receiveShadow = false`)
4. Reduce shadow map size from 2048 to 1024

**Visual quality checklist:**
- [ ] No visible grid pattern in the terrain (flatShading hides it but check)
- [ ] Colour transitions are smooth (no banding)
- [ ] Islands look like they belong on the terrain (not floating)
- [ ] Bridges don't pass through terrain
- [ ] Scene looks good at extreme zoom-out (see whole world)
- [ ] Scene looks good at close zoom (terrain detail visible)

---

## 4. Acceptance Criteria (Phase 1B Complete)

| # | Criterion | Test |
|---|-----------|------|
| 1 | Terrain mesh with visible height variation | Visual inspection — hills and valleys, not flat |
| 2 | Vertex colours match height (blue ocean → sand → green → brown → grey) | Visual — colour changes smoothly with elevation |
| 3 | Islands sit at correct heights on terrain | Visual — islands are at varying elevations, flush with terrain |
| 4 | Bridges slope between different heights | Visual — bridges angle up/down, not horizontal |
| 5 | Water plane visible at sea level | Visual — flat semi-transparent water surface |
| 6 | Perlin noise adds natural surface variation | Visual — terrain isn't perfectly smooth Gaussians |
| 7 | Performance: 30+ fps on mobile Chrome | Chrome DevTools Performance tab |
| 8 | Terrain generation <300ms | `performance.now()` measurement |
| 9 | No regressions: search, cards, navigation all still work | Manual testing |
| 10 | Grid fallback works for clusters without positions | Remove `spatial_layout` data → verify grid still works |

---

## 5. Files Changed / Created

| File | Status | Changes |
|------|--------|---------|
| `game/src/utils/noise.ts` | **NEW** | 2D Perlin noise + fBm (~80 lines) |
| `game/src/world/terrain.ts` | **NEW** | Heightmap terrain + water plane (~150 lines) |
| `game/src/world/layout.ts` | **MODIFIED** | Read positions from data instead of computing grid |
| `game/src/world/island.ts` | **MODIFIED** | Place islands at `island.height` Y position |
| `game/src/world/bridge.ts` | **MODIFIED** | Slope bridges between different heights |
| `game/src/scene/renderer.ts` | **MODIFIED** | Fog distances, light position, shadow camera |
| `game/src/player/camera.ts` | **MODIFIED** | Initial position higher, zoom limits adjusted |
| `game/src/main.ts` | **MODIFIED** | Replace ground plane with terrain + water |
| `game/src/types/world.ts` | **MODIFIED** | Add `height` to Island interface (if not already) |
| `game/src/types/ontology.ts` | **MODIFIED** | Add `position` to RootCluster (if not already) |

**No Python pipeline changes. No data changes. No deployment changes.**

---

## 6. What This Enables for Phase 1C+

Once the terrain is in place:

**Phase 1C (WFC Island Detail):** The terrain surface provides the "canvas" on which WFC tiles are placed. Each island's Voronoi cell (Phase 1C) replaces the simple cylinder with a detailed tile grid. The terrain colour ramp provides the base palette that WFC tile colours complement.

**Phase 1D (LOD System):** Distant islands can be rendered as just a bump in the terrain (no separate island mesh needed) with a label floating above. The terrain itself provides visual context at all zoom levels.

**Phase 1E (Fog of War):** The terrain below fog creates a compelling "emerging from mist" effect as you explore. Mountain peaks (high-frequency abstract roots) poke through the fog before you reach them.

**Ambient Sound (Phase 2):** Terrain type at the player's position (ocean, beach, grass, rock) drives ambient soundscape selection.

---

_Last updated: 2026-03-15_
_Reference for: Phase 1B implementation sprint_
