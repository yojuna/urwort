/**
 * Island mesh generation for Phase 0.
 * Each root cluster becomes a low-poly island in the world.
 */
import * as THREE from 'three';
import type { Island } from '@/types';

const ISLAND_COLOR = 0x8FBC8F;  // Dark sea green
const ISLAND_HEIGHT = 2;

/**
 * Creates a simple cylindrical island mesh for a root cluster.
 * Phase 0: basic geometry, no procedural detail yet.
 */
export function createIslandMesh(island: Island): THREE.Group {
  const group = new THREE.Group();
  group.name = `island-${island.id}`;

  // Island base — flat cylinder
  const baseGeo = new THREE.CylinderGeometry(
    island.radius,
    island.radius * 1.2,
    ISLAND_HEIGHT,
    16,
  );
  const baseMat = new THREE.MeshStandardMaterial({
    color: ISLAND_COLOR,
    roughness: 0.9,
    metalness: 0.0,
    flatShading: true,
  });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = ISLAND_HEIGHT / 2;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  // Root label — simple sprite for now
  const label = createTextSprite(
    island.cluster.wurzel.form,
    { fontSize: 48, color: '#1A1A2E' },
  );
  label.position.y = ISLAND_HEIGHT + 1.5;
  label.scale.set(4, 2, 1);
  group.add(label);

  // Word markers — small pillars around the island
  const wordCount = island.cluster.words.length;
  island.cluster.words.forEach((wort, i) => {
    const angle = (i / wordCount) * Math.PI * 2;
    const r = island.radius * 0.6;

    const pillarGeo = new THREE.BoxGeometry(0.4, 1.5, 0.4);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0xD4A574,
      roughness: 0.7,
      flatShading: true,
    });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(
      Math.cos(angle) * r,
      ISLAND_HEIGHT + 0.75,
      Math.sin(angle) * r,
    );
    pillar.castShadow = true;
    pillar.userData = { type: 'word', wort };
    group.add(pillar);

    // Word label
    const wordLabel = createTextSprite(wort.lemma, {
      fontSize: 32,
      color: '#2D6A4F',
    });
    wordLabel.position.copy(pillar.position);
    wordLabel.position.y += 1.5;
    wordLabel.scale.set(3, 1.5, 1);
    group.add(wordLabel);
  });

  // Position the group in world space
  group.position.set(
    island.position.x,
    island.position.y,
    island.position.z,
  );

  return group;
}

/**
 * Creates a text sprite (canvas-based) for labels.
 */
function createTextSprite(
  text: string,
  opts: { fontSize?: number; color?: string } = {},
): THREE.Sprite {
  const fontSize = opts.fontSize ?? 36;
  const color = opts.color ?? '#1A1A2E';

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  canvas.width = 512;
  canvas.height = 256;

  ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });

  return new THREE.Sprite(material);
}
