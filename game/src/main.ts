/**
 * Urwort — Phase 0 entry point.
 * Sets up the Three.js scene, loads ontology data, and starts the render loop.
 */
import * as THREE from 'three';
import { createSceneContext } from '@/scene/renderer';
import { CameraController } from '@/player/camera';
import { createKeyboardState, bindKeyboard } from '@/player/input';
import { computeGridLayout } from '@/world/layout';
import { createIslandMesh } from '@/world/island';
import { createBridgeMesh } from '@/world/bridge';
import { loadOntology } from '@/data/loader';
import { MOCK_CLUSTERS } from '@/data/mock';
import type { Island, RootCluster } from '@/types';

async function main(): Promise<void> {
  const container = document.getElementById('app');
  if (!container) throw new Error('Missing #app container');

  const loading = document.getElementById('loading');
  const loadingText = loading?.querySelector('p');

  // --- Init scene ---
  const ctx = createSceneContext(container);

  // Camera: MapControls base + WASD layer
  const cameraCtrl = new CameraController(ctx.camera, ctx.renderer.domElement);
  const keyboard = createKeyboardState();
  const cleanupKeyboard = bindKeyboard(keyboard);

  // --- Load ontology data ---
  let clusters: RootCluster[];

  try {
    if (loadingText) loadingText.textContent = 'Loading ontology data...';

    const ontology = await loadOntology({
      minClusterSize: 2,   // Only show clusters with 2+ words (interesting roots)
      maxClusters: 200,    // Cap for performance in Phase 0
    });
    clusters = ontology.clusters;

    console.log(`[Urwort] Using real ontology: ${clusters.length} clusters`);
  } catch (err) {
    // Fallback to mock data if ontology.json not available
    console.warn('[Urwort] Failed to load ontology, using mock data:', err);
    clusters = MOCK_CLUSTERS;
  }

  if (loadingText) loadingText.textContent = 'Building world...';

  // --- Build world ---
  const layout = computeGridLayout(clusters);

  // Create island meshes
  const islandMap = new Map<string, Island>();
  for (const island of layout.islands) {
    islandMap.set(island.id, island);
    const mesh = createIslandMesh(island);
    ctx.scene.add(mesh);
  }

  // Create bridge meshes
  for (const bridge of layout.bridges) {
    const mesh = createBridgeMesh(bridge, islandMap);
    if (mesh) ctx.scene.add(mesh);
  }

  // --- Click/tap to focus on island ---
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, ctx.camera);
    const intersects = raycaster.intersectObjects(ctx.scene.children, true);

    for (const hit of intersects) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        if (obj.userData?.type === 'word') {
          const wort = obj.userData.wort;
          console.log(`[Urwort] Tapped word: ${wort.lemma} (${wort.definition_en})`);
          break;
        }
        if (obj.name?.startsWith('island-')) {
          const islandId = obj.name.replace('island-', '');
          const island = islandMap.get(islandId);
          if (island) {
            console.log(`[Urwort] Flying to island: ${island.cluster.wurzel.form}`);
            cameraCtrl.focusOn(
              new THREE.Vector3(island.position.x, 0, island.position.z),
            );
          }
          break;
        }
        obj = obj.parent;
      }
    }
  };

  // Distinguish taps from drags
  let pointerDownPos = { x: 0, y: 0 };
  const TAP_THRESHOLD = 5;

  ctx.renderer.domElement.addEventListener('pointerdown', (e: PointerEvent) => {
    pointerDownPos = { x: e.clientX, y: e.clientY };
  });

  ctx.renderer.domElement.addEventListener('pointerup', (e: PointerEvent) => {
    const dx = e.clientX - pointerDownPos.x;
    const dy = e.clientY - pointerDownPos.y;
    if (Math.sqrt(dx * dx + dy * dy) < TAP_THRESHOLD) {
      onPointerUp(e);
    }
  });

  // --- Hide loading screen ---
  if (loading) {
    loading.classList.add('hidden');
    setTimeout(() => loading.remove(), 600);
  }

  // --- Render loop ---
  function animate(): void {
    requestAnimationFrame(animate);

    const delta = ctx.clock.getDelta();
    cameraCtrl.update(keyboard, delta);

    ctx.renderer.render(ctx.scene, ctx.camera);
  }

  animate();

  // Log for dev
  console.log(
    `[Urwort] Scene ready — ${layout.islands.length} islands, ${layout.bridges.length} bridges`,
  );
  console.log(
    `[Urwort] Controls: drag=pan, right-drag/2-finger=orbit, scroll/pinch=zoom, WASD=move, tap island=fly to`,
  );
}

// --- Boot ---
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
