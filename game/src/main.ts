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
import { WordCard } from '@/ui/word-card';
import { SearchBar } from '@/ui/search-bar';
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

  // --- UI ---
  const wordCard = new WordCard(container);

  // --- Load ontology data ---
  let clusters: RootCluster[];         // rendered in the 3D world (multi-word only)
  let allClusters: RootCluster[];      // full set used by search (every word)

  try {
    if (loadingText) loadingText.textContent = 'Loading ontology data...';

    // Load everything — no filter — so search can find every word
    const ontology = await loadOntology();
    allClusters = ontology.clusters;

    // Render only multi-word clusters, capped for performance
    clusters = allClusters
      .filter(c => c.words.length >= 2)
      .slice(0, 200);

    console.log(`[Urwort] Ontology: ${allClusters.length} total clusters, ${clusters.length} rendered`);
  } catch (err) {
    // Fallback to mock data if ontology.json not available
    console.warn('[Urwort] Failed to load ontology, using mock data:', err);
    clusters    = MOCK_CLUSTERS;
    allClusters = MOCK_CLUSTERS;
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

  // --- Search bar (needs islandMap to fly-to on select) ---
  const searchBar = new SearchBar(container, ({ wort, cluster }) => {
    const island = [...islandMap.values()].find(
      i => i.cluster.words.some(w => w.id === wort.id),
    );
    if (island) {
      cameraCtrl.focusOn(
        new THREE.Vector3(island.position.x, 0, island.position.z),
      );
    }
    const compound = cluster.compounds.find(c => c.compound_wort_id === wort.id);
    wordCard.showWord(wort, cluster.wurzel, compound);
  });
  // Search over ALL clusters (not just multi-word ones), so single words are findable too
  searchBar.setClusters(allClusters);

  // --- Click/tap interaction ---
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const onTap = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, ctx.camera);
    const intersects = raycaster.intersectObjects(ctx.scene.children, true);

    // If nothing hit, dismiss the card
    if (intersects.length === 0) {
      wordCard.hide();
      return;
    }

    for (const hit of intersects) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        // --- Tapped a word pillar ---
        if (obj.userData?.type === 'word') {
          const wort = obj.userData.wort;

          // Find which island/cluster this word belongs to
          let parentIsland: Island | undefined;
          let parentGroup = obj.parent;
          while (parentGroup) {
            if (parentGroup.name?.startsWith('island-')) {
              parentIsland = islandMap.get(parentGroup.name.replace('island-', ''));
              break;
            }
            parentGroup = parentGroup.parent;
          }

          const cluster = parentIsland?.cluster;
          const compound = cluster?.compounds.find(c => c.compound_wort_id === wort.id);

          wordCard.showWord(wort, cluster?.wurzel, compound);
          return;
        }

        // --- Tapped an island (not a specific word) ---
        if (obj.name?.startsWith('island-')) {
          const islandId = obj.name.replace('island-', '');
          const island = islandMap.get(islandId);
          if (island) {
            // Fly camera to island
            cameraCtrl.focusOn(
              new THREE.Vector3(island.position.x, 0, island.position.z),
            );

            // Show island info card with word list
            wordCard.showIsland(
              island.cluster.wurzel,
              island.cluster.words,
              island.cluster.compounds,
              // When a word in the list is tapped, show that word's detail
              (wort) => {
                const compound = island.cluster.compounds.find(
                  c => c.compound_wort_id === wort.id,
                );
                wordCard.showWord(wort, island.cluster.wurzel, compound);
              },
            );
          }
          return;
        }

        obj = obj.parent;
      }
    }

    // Hit something but not a word or island — dismiss
    wordCard.hide();
  };

  // Distinguish taps from drags
  let pointerDownPos = { x: 0, y: 0 };
  const TAP_THRESHOLD = 8; // pixels

  ctx.renderer.domElement.addEventListener('pointerdown', (e: PointerEvent) => {
    pointerDownPos = { x: e.clientX, y: e.clientY };
  });

  ctx.renderer.domElement.addEventListener('pointerup', (e: PointerEvent) => {
    const dx = e.clientX - pointerDownPos.x;
    const dy = e.clientY - pointerDownPos.y;
    if (Math.sqrt(dx * dx + dy * dy) < TAP_THRESHOLD) {
      onTap(e);
    }
  });

  // Dismiss card on Escape
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.code === 'Escape') wordCard.hide();
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
    '[Urwort] Controls: drag=pan, right-drag/2-finger=orbit, scroll/pinch=zoom, WASD=move',
  );
  console.log(
    '[Urwort] Tap island=fly to + show words, tap word pillar=show details, Esc=dismiss',
  );
}

// --- Boot ---
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
