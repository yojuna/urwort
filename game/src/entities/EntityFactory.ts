/**
 * EntityFactory — creates Three.js meshes for game entities.
 *
 * Uses shared geometry + material pools per POS type to minimize
 * GPU state changes and memory. Each POS type gets a unique geometry
 * shape and colour (P2), and all meshes of the same POS share instances
 * of the same geometry and material (R2).
 */
import * as THREE from 'three';
import type { Wort } from '../types';

// ---------------------------------------------------------------------------
// POS config
// ---------------------------------------------------------------------------

interface PosConfig {
  color: number;
  createGeo: () => THREE.BufferGeometry;
}

const POS_CONFIG: Record<string, PosConfig> = {
  NOUN: { color: 0x8B7355, createGeo: () => new THREE.BoxGeometry(0.4, 1.5, 0.4) },
  VERB: { color: 0xC44536, createGeo: () => new THREE.OctahedronGeometry(0.4, 0) },
  ADJ:  { color: 0x2A9D8F, createGeo: () => new THREE.SphereGeometry(0.3, 5, 4) },
  ADV:  { color: 0x6C757D, createGeo: () => new THREE.TetrahedronGeometry(0.3, 0) },
};

const DEFAULT_POS: PosConfig = {
  color: 0xD4A574,
  createGeo: () => new THREE.BoxGeometry(0.4, 1.5, 0.4),
};

// ---------------------------------------------------------------------------
// Shared geometry + material pool (one per POS type)
// ---------------------------------------------------------------------------

const geoPool = new Map<string, THREE.BufferGeometry>();
const matPool = new Map<string, THREE.MeshStandardMaterial>();

function getGeo(pos: string): THREE.BufferGeometry {
  if (!geoPool.has(pos)) {
    const cfg = POS_CONFIG[pos] ?? DEFAULT_POS;
    geoPool.set(pos, cfg.createGeo());
  }
  return geoPool.get(pos)!;
}

function getMat(pos: string): THREE.MeshStandardMaterial {
  if (!matPool.has(pos)) {
    const cfg = POS_CONFIG[pos] ?? DEFAULT_POS;
    matPool.set(pos, new THREE.MeshStandardMaterial({
      color: cfg.color,
      roughness: 0.7,
      flatShading: true,
    }));
  }
  return matPool.get(pos)!;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a word pillar mesh for a given Wort.
 * Uses POS-specific geometry/colour from shared pools.
 */
export function createWordPillar(wort: Wort): THREE.Mesh {
  const mesh = new THREE.Mesh(getGeo(wort.pos), getMat(wort.pos));
  mesh.castShadow = true;
  mesh.userData = { type: 'word', wort };
  return mesh;
}

/**
 * Get the shared material for a POS type (for hover effect restore).
 */
export function getPosMaterial(pos: string): THREE.MeshStandardMaterial {
  return getMat(pos);
}
