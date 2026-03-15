/**
 * Bridge mesh generation for Phase 0.
 * Bridges connect two islands that share a compound word.
 */
import * as THREE from 'three';
import type { Bridge, Island } from '@/types';

const BRIDGE_COLOR = 0xC4A882;
const BRIDGE_WIDTH = 0.8;
const BRIDGE_HEIGHT = 0.3;

/**
 * Creates a simple rectangular bridge mesh between two islands.
 * Phase 0: flat plank connecting island edges. No walk animation yet.
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

  const from = new THREE.Vector3(
    fromIsland.position.x,
    2,  // island top height
    fromIsland.position.z,
  );
  const to = new THREE.Vector3(
    toIsland.position.x,
    2,
    toIsland.position.z,
  );

  const midpoint = from.clone().add(to).multiplyScalar(0.5);
  const length = from.distanceTo(to);
  const direction = to.clone().sub(from).normalize();
  const angle = Math.atan2(direction.x, direction.z);

  // Bridge plank
  const plankGeo = new THREE.BoxGeometry(BRIDGE_WIDTH, BRIDGE_HEIGHT, length);
  const plankMat = new THREE.MeshStandardMaterial({
    color: BRIDGE_COLOR,
    roughness: 0.85,
    flatShading: true,
  });
  const plank = new THREE.Mesh(plankGeo, plankMat);
  plank.position.copy(midpoint);
  plank.rotation.y = angle;
  plank.castShadow = true;
  plank.receiveShadow = true;
  plank.userData = { type: 'bridge', bridge };
  group.add(plank);

  // Compound label at midpoint
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
  label.position.y += 2;
  label.scale.set(4, 1, 1);
  group.add(label);

  return group;
}
