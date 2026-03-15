/**
 * World and scene types for Phase 0.
 */
import type { RootCluster } from './ontology';

/** An island in the world — one per root cluster */
export interface Island {
  id: string;
  cluster: RootCluster;
  position: { x: number; y: number; z: number };
  radius: number;
}

/** A bridge connecting two islands (compound relationship) */
export interface Bridge {
  id: string;
  from_island_id: string;
  to_island_id: string;
  compound_display: string;
}

/** The entire world layout — computed once then rendered */
export interface WorldLayout {
  islands: Island[];
  bridges: Bridge[];
}
