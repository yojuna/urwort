/**
 * Urwort — Phase 0 entry point.
 * Orchestration only: init scene, load data, wire modules, start render loop.
 */
import * as THREE from 'three';
import { createSceneContext } from '@/scene/renderer';
import { CameraController } from '@/player/camera';
import { createKeyboardState, bindKeyboard } from '@/player/input';
import { computeGridLayout } from '@/world/layout';
import { createIslandMesh } from '@/world/island';
import { createBridgeMesh } from '@/world/bridge';
import { loadOntology } from '@/data/loader';
import { OntologyStore } from '@/data/OntologyStore';
import { MOCK_CLUSTERS } from '@/data/mock';
import { WordCard } from '@/ui/word-card';
import { SearchBar } from '@/ui/search-bar';
import { InteractionManager } from '@/entities/InteractionManager';
import { InstancedPillars } from '@/entities/InstancedPillars';
import type { Island } from '@/types';

async function main(): Promise<void> {
  const container = document.getElementById('app');
  if (!container) throw new Error('Missing #app container');

  const loading = document.getElementById('loading');
  const loadingText = loading?.querySelector('p');

  const ctx = createSceneContext(container);
  const cameraCtrl = new CameraController(ctx.camera, ctx.renderer.domElement);
  const keyboard = createKeyboardState();
  bindKeyboard(keyboard);
  const wordCard = new WordCard(container);

  // --- Load ontology data (fall back to mock) ---
  let store: OntologyStore;
  try {
    if (loadingText) loadingText.textContent = 'Loading ontology data...';
    store = new OntologyStore((await loadOntology()).clusters);
    console.log(`[Urwort] Loaded ${store.totalClusters} clusters, ${store.totalWords} words`);
  } catch (err) {
    console.warn('[Urwort] Failed to load ontology, using mock data:', err);
    store = new OntologyStore(MOCK_CLUSTERS);
  }

  // Render only multi-word clusters, capped for performance
  const clusters = store.allClusters().filter(c => c.words.length >= 2).slice(0, 200);

  // --- Build world ---
  if (loadingText) loadingText.textContent = 'Building world...';
  const layout = computeGridLayout(clusters);
  const islandMap = new Map<string, Island>();

  for (const island of layout.islands) {
    islandMap.set(island.id, island);
    ctx.scene.add(createIslandMesh(island));
  }
  for (const bridge of layout.bridges) {
    const mesh = createBridgeMesh(bridge, islandMap);
    if (mesh) ctx.scene.add(mesh);
  }

  // Word pillars — instanced (one draw call per POS type)
  const pillars = new InstancedPillars([...islandMap.values()]);
  for (const mesh of pillars.meshes) ctx.scene.add(mesh);

  // --- Render-on-demand dirty flag ---
  let needsRender = true;
  const markDirty = () => { needsRender = true; };
  cameraCtrl.controls.addEventListener('change', markDirty);
  window.addEventListener('resize', markDirty);

  // --- Wire UI: search + 3D interaction ---
  new SearchBar(container, store, ({ wort, cluster }) => {
    const island = [...islandMap.values()].find(i => i.cluster.words.some(w => w.id === wort.id));
    if (island) cameraCtrl.focusOn(new THREE.Vector3(island.position.x, 0, island.position.z));
    const compound = cluster.compounds.find(c => c.compound_wort_id === wort.id);
    wordCard.showWord(wort, cluster.wurzel, compound);
  });

  new InteractionManager(
    ctx.camera, ctx.renderer.domElement, ctx.scene,
    wordCard, cameraCtrl, islandMap, pillars, markDirty,
  );

  // --- Hide loading screen ---
  if (loading) {
    loading.classList.add('hidden');
    setTimeout(() => loading.remove(), 600);
  }

  // --- Render loop ---
  (function animate() {
    requestAnimationFrame(animate);
    if (cameraCtrl.update(keyboard, ctx.clock.getDelta())) needsRender = true;
    if (needsRender) {
      ctx.renderer.render(ctx.scene, ctx.camera);
      needsRender = false;
    }
  })();

  console.log(`[Urwort] Scene ready — ${layout.islands.length} islands, ${layout.bridges.length} bridges`);
}

// --- Boot ---
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
