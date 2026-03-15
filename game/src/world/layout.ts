/**
 * World layout computation.
 *
 * Phase 1B: reads pre-computed embedding-based positions from ontology.json.
 * Falls back to a deterministic grid for clusters without position data.
 */
import type { RootCluster, Island, Bridge, WorldLayout } from '@/types';

const GRID_SPACING = 25; // distance between island centres (fallback grid)

/**
 * Arrange root clusters using embedding positions when available,
 * falling back to a grid layout for clusters without position data.
 */
export function computeLayout(clusters: RootCluster[]): WorldLayout {
  const islands: Island[] = [];

  // Fallback grid parameters (used when position data is missing)
  let fallbackIndex = 0;
  const fallbackCols = Math.ceil(Math.sqrt(clusters.length));

  for (const cluster of clusters) {
    // Island radius proportional to word count (min 3, max 8)
    const radius = Math.min(8, Math.max(3, cluster.words.length * 0.8 + 2));

    let x: number, z: number, height: number;

    if (cluster.position) {
      // Use pre-computed embedding-based position (Phase 1A)
      x = cluster.position.x;
      z = cluster.position.z;
      height = cluster.position.height;
    } else {
      // Fallback: grid layout for clusters without position data
      const col = fallbackIndex % fallbackCols;
      const row = Math.floor(fallbackIndex / fallbackCols);
      x = (col - fallbackCols / 2) * GRID_SPACING;
      z = (row - fallbackCols / 2) * GRID_SPACING;
      height = 0;
      fallbackIndex++;
    }

    islands.push({
      id: cluster.wurzel.id,
      cluster,
      position: { x, y: height, z },
      radius,
    });
  }

  // Build bridges from compound links
  const bridges: Bridge[] = [];
  const islandByWortId = new Map<string, string>();

  // Map each word to its island
  for (const island of islands) {
    for (const wort of island.cluster.words) {
      islandByWortId.set(wort.id, island.id);
    }
  }

  // Find compound links that span islands
  for (const island of islands) {
    for (const compound of island.cluster.compounds) {
      const sourceIslandId = islandByWortId.get(compound.compound_wort_id);
      if (!sourceIslandId) continue;

      for (const componentId of compound.component_wort_ids) {
        const targetIslandId = islandByWortId.get(componentId);
        if (targetIslandId && targetIslandId !== sourceIslandId) {
          bridges.push({
            id: `bridge-${sourceIslandId}-${targetIslandId}`,
            from_island_id: sourceIslandId,
            to_island_id: targetIslandId,
            compound_display: compound.split_display,
          });
        }
      }
    }
  }

  return { islands, bridges };
}
