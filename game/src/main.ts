/**
 * Urwort — Phase 0 entry point.
 * Sets up the Three.js scene, loads mock data, and starts the render loop.
 */
import { createSceneContext } from '@/scene/renderer';
import { CameraController } from '@/player/camera';
import { createInputState, bindInputListeners } from '@/player/input';
import { computeGridLayout } from '@/world/layout';
import { createIslandMesh } from '@/world/island';
import { createBridgeMesh } from '@/world/bridge';
import { MOCK_CLUSTERS } from '@/data/mock';
import type { Island } from '@/types';

function main(): void {
  const container = document.getElementById('app');
  if (!container) throw new Error('Missing #app container');

  const loading = document.getElementById('loading');

  // --- Init scene ---
  const ctx = createSceneContext(container);
  const cameraCtrl = new CameraController();
  const input = createInputState();
  const cleanup = bindInputListeners(ctx.renderer.domElement, input);

  // --- Build world from mock data ---
  const layout = computeGridLayout(MOCK_CLUSTERS);

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

  // --- Hide loading screen ---
  if (loading) {
    loading.classList.add('hidden');
    setTimeout(() => loading.remove(), 600);
  }

  // --- Render loop ---
  function animate(): void {
    requestAnimationFrame(animate);

    const delta = ctx.clock.getDelta();
    cameraCtrl.update(ctx.camera, input, delta);

    ctx.renderer.render(ctx.scene, ctx.camera);
  }

  animate();

  // Log for dev
  console.log(
    `[Urwort] Scene ready — ${layout.islands.length} islands, ${layout.bridges.length} bridges`,
  );
}

// --- Boot ---
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
