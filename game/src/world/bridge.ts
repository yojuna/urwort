/**
 * Bridge mesh generation.
 * Bridges connect two islands that share a compound word.
 *
 * Phase 1B: bridges slope between islands at different heights.
 */
import * as THREE from 'three';
import type { Bridge, Island } from '@/types';

const BRIDGE_COLOR = 0xC4A882;
const BRIDGE_WIDTH = 0.8;
const BRIDGE_HEIGHT = 0.3;
const ISLAND_TOP_OFFSET = 2; // island cylinder extends 2 units above position.y

/**
 * Creates a bridge mesh between two islands.
 * The bridge slopes to match the height difference between endpoints.
 */
export function createBridgeMesh(
  bridge: Bridge,
  islands: Map<string, Island>,
): THREE.Group | null {
  const fromIsland = islands.get(bridge.from_island_id);
  const toIsland = islands.get(bridge.to_island_id);

  if (!fromIsland || !toIsland) return null;

  const group = new THREE.Group();
  group.name = `bridge-${bridge.id}`;

  // Bridge endpoints sit at the top of each island's cylinder
  const heightA = fromIsland.position.y + ISLAND_TOP_OFFSET;
  const heightB = toIsland.position.y + ISLAND_TOP_OFFSET;

  const from = new THREE.Vector3(
    fromIsland.position.x,
    heightA,
    fromIsland.position.z,
  );
  const to = new THREE.Vector3(
    toIsland.position.x,
    heightB,
    toIsland.position.z,
  );

  const midpoint = from.clone().add(to).multiplyScalar(0.5);
  const totalLength = from.distanceTo(to);

  // Horizontal direction (for yaw)
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const horizontalLength = Math.sqrt(dx * dx + dz * dz);
  const yaw = Math.atan2(dx, dz);

  // Slope (pitch) to match height difference
  const heightDiff = heightB - heightA;
  const pitch = Math.atan2(heightDiff, horizontalLength);

  // Bridge plank
  const plankGeo = new THREE.BoxGeometry(BRIDGE_WIDTH, BRIDGE_HEIGHT, totalLength);
  const plankMat = new THREE.MeshStandardMaterial({
    color: BRIDGE_COLOR,
    roughness: 0.85,
    flatShading: true,
  });
  const plank = new THREE.Mesh(plankGeo, plankMat);
  plank.castShadow = true;
  plank.receiveShadow = true;
  plank.userData = { type: 'bridge', bridge };

  // Position the plank at the midpoint and apply rotations
  // Use a nested group so we can apply yaw then pitch cleanly
  plank.position.copy(midpoint);
  plank.rotation.set(pitch, yaw, 0, 'YXZ');
  group.add(plank);

  // Compound label at midpoint (slightly above the bridge)
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = 512;
  canvas.height = 128;
  ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillStyle = '#5C4033';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(bridge.compound_display, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const label = new THREE.Sprite(spriteMat);
  label.position.copy(midpoint);
  label.position.y += 2; // float label above the bridge
  label.scale.set(4, 1, 1);
  group.add(label);

  return group;
}
