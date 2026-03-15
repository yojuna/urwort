/**
 * InstancedPillars — renders all word pillars using InstancedMesh.
 *
 * One InstancedMesh per POS type → 4-5 draw calls total instead of
 * one per word (~1000+). Each instance stores its Wort + island ID
 * for interaction lookup.
 *
 * Replaces individual word meshes that island.ts used to create.
 */
import * as THREE from 'three';
import type { Island, Wort } from '../types';

// ---------------------------------------------------------------------------
// POS config (same as EntityFactory)
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

const ISLAND_HEIGHT = 2;

// ---------------------------------------------------------------------------
// Instance record — stored in userData for interaction lookup
// ---------------------------------------------------------------------------

export interface InstanceRecord {
  wort: Wort;
  islandId: string;
}

// ---------------------------------------------------------------------------
// InstancedPillars
// ---------------------------------------------------------------------------

export class InstancedPillars {
  /** The InstancedMesh objects to add to the scene */
  readonly meshes: THREE.InstancedMesh[] = [];

  /** Map from InstancedMesh.uuid → array of InstanceRecord (index = instanceId) */
  private lookupMap = new Map<string, InstanceRecord[]>();

  /**
   * Build instanced meshes from islands.
   * Call once after all islands have been created.
   */
  constructor(islands: Island[]) {
    // Group all words by POS
    const byPos = new Map<string, { wort: Wort; worldPos: THREE.Vector3; islandId: string }[]>();

    for (const island of islands) {
      const wordCount = island.cluster.words.length;
      island.cluster.words.forEach((wort, i) => {
        const angle = (i / wordCount) * Math.PI * 2;
        const r = island.radius * 0.6;

        // World-space position (island position + local offset)
        const worldPos = new THREE.Vector3(
          island.position.x + Math.cos(angle) * r,
          island.position.y + ISLAND_HEIGHT + 0.75,
          island.position.z + Math.sin(angle) * r,
        );

        const pos = wort.pos in POS_CONFIG ? wort.pos : '_DEFAULT';
        if (!byPos.has(pos)) byPos.set(pos, []);
        byPos.get(pos)!.push({ wort, worldPos, islandId: island.id });
      });
    }

    // Create one InstancedMesh per POS group
    const _mat = new THREE.Matrix4();
    const _color = new THREE.Color();

    for (const [pos, entries] of byPos) {
      const cfg = POS_CONFIG[pos] ?? DEFAULT_POS;
      const geo = cfg.createGeo();
      const mat = new THREE.MeshStandardMaterial({
        color: cfg.color,
        roughness: 0.7,
        flatShading: true,
      });

      const instMesh = new THREE.InstancedMesh(geo, mat, entries.length);
      instMesh.castShadow = true;
      instMesh.name = `instanced-pillars-${pos}`;

      // Store type marker so InteractionManager can identify these
      instMesh.userData = { type: 'instanced-pillars' };

      const records: InstanceRecord[] = [];

      for (let i = 0; i < entries.length; i++) {
        const { wort, worldPos, islandId } = entries[i];

        _mat.identity();
        _mat.setPosition(worldPos);
        instMesh.setMatrixAt(i, _mat);

        // Set per-instance color (matches POS base color; hover will override)
        _color.setHex(cfg.color);
        instMesh.setColorAt(i, _color);

        records.push({ wort, islandId });
      }

      instMesh.instanceMatrix.needsUpdate = true;
      if (instMesh.instanceColor) instMesh.instanceColor.needsUpdate = true;

      this.lookupMap.set(instMesh.uuid, records);
      this.meshes.push(instMesh);
    }
  }

  /**
   * Lookup a wort + island from a raycast hit on an instanced mesh.
   * Returns null if the hit isn't on one of our meshes.
   */
  lookupHit(object: THREE.Object3D, instanceId: number | undefined): InstanceRecord | null {
    if (instanceId === undefined || instanceId < 0) return null;
    const records = this.lookupMap.get(object.uuid);
    if (!records || instanceId >= records.length) return null;
    return records[instanceId];
  }

  /**
   * Set the color of a specific instance (for hover effects).
   */
  setInstanceColor(mesh: THREE.InstancedMesh, instanceId: number, color: THREE.Color): void {
    mesh.setColorAt(instanceId, color);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  /**
   * Get the base color for a POS type (for restoring after hover).
   */
  getBaseColor(pos: string): THREE.Color {
    const cfg = POS_CONFIG[pos] ?? DEFAULT_POS;
    return new THREE.Color(cfg.color);
  }

  /** Total number of instances across all meshes */
  get totalInstances(): number {
    return this.meshes.reduce((sum, m) => sum + m.count, 0);
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}
