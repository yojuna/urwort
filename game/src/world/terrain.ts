/**
 * Heightmap terrain mesh + water plane for Phase 1B.
 *
 * The terrain is a subdivided plane whose vertices are displaced
 * by a sum-of-Gaussians (one per island) plus fractal Brownian
 * motion noise for natural surface variation.  Vertex colours are
 * painted by a height-based colour ramp (deep ocean → beach →
 * grass → rock → peak).
 */
import * as THREE from 'three';
import type { Island } from '../types/world';
import { fbm } from '../utils/noise';

// ── Terrain configuration ──────────────────────────────────────────────

const SEA_LEVEL = -0.3;           // below this = underwater
const NOISE_FREQUENCY = 0.015;    // how "busy" the terrain variation is
const NOISE_AMPLITUDE = 0.8;      // how much noise affects height
const GAUSSIAN_SIGMA_FACTOR = 2.0; // how wide the island's terrain influence is

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

/**
 * Create a heightmap terrain mesh.
 * Land rises at island positions (sum of Gaussians) and falls to ocean between them.
 * Perlin noise adds natural surface variation.
 */
export function createTerrain(
  islands: Island[],
  worldSize: number = 400,
  segments: number = 200,
): THREE.Mesh {
  const t0 = performance.now();

  const geometry = new THREE.PlaneGeometry(worldSize, worldSize, segments, segments);
  geometry.rotateX(-Math.PI / 2); // lay flat on XZ plane

  const posAttr = geometry.attributes.position;
  const vertexCount = posAttr.count;
  const colours = new Float32Array(vertexCount * 3);

  // Pre-compute island data for the height kernel
  const islandData = islands.map(island => {
    const sigma = island.radius * GAUSSIAN_SIGMA_FACTOR;
    return {
      x: island.position.x,
      z: island.position.z,
      height: island.position.y, // y stores the computed height
      sigma,
      sigmaSq2: 2 * sigma * sigma,
    };
  });

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

  // Terrain is not interactable — disable raycasting (huge perf win:
  // 80K+ triangles would otherwise be tested every pointer move)
  mesh.userData.type = 'terrain';
  mesh.raycast = () => {};

  const elapsed = performance.now() - t0;
  console.log(`[Urwort] Terrain generated in ${elapsed.toFixed(0)}ms (${vertexCount} vertices, ${islands.length} islands)`);

  return mesh;
}

// ── Water plane ────────────────────────────────────────────────────────

/**
 * Create a semi-transparent water plane at sea level.
 * Gives the ocean a reflective/translucent quality distinct from the
 * terrain's vertex-coloured ocean floor visible beneath.
 */
export function createWaterPlane(worldSize: number = 400): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(worldSize, worldSize);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshStandardMaterial({
    color: 0x3a7ca5,
    transparent: true,
    opacity: 0.6,
    roughness: 0.2,
    metalness: 0.1,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = SEA_LEVEL; // sits at sea level
  mesh.receiveShadow = true;
  mesh.userData.type = 'water'; // not interactable
  mesh.raycast = () => {};

  return mesh;
}
