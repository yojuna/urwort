/**
 * World layout computation for Phase 0.
 * Simple grid layout for now — force-directed to be explored later
 * once we have visuals and can evaluate spatial quality.
 */
import type { RootCluster, Island, Bridge, WorldLayout, CompoundLink } from '@/types';

const GRID_SPACING = 25;  // distance between island centres

/**
 * Arrange root clusters in a grid layout.
 * Phase 0: deterministic placement. Force-directed layout is Phase 0.5+.
 */
export function computeGridLayout(clusters: RootCluster[]): WorldLayout {
  const cols = Math.ceil(Math.sqrt(clusters.length));

  const islands: Island[] = clusters.map((cluster, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);

    // Island radius proportional to word count (min 3, max 8)
    const radius = Math.min(8, Math.max(3, cluster.words.length * 0.8 + 2));

    return {
      id: cluster.wurzel.id,
      cluster,
      position: {
        x: (col - cols / 2) * GRID_SPACING,
        y: 0,
        z: (row - cols / 2) * GRID_SPACING,
      },
      radius,
    };
  });

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
