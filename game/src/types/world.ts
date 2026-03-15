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

/** Camera state */
export interface CameraState {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  zoom: number;
}

/** Player input state */
export interface InputState {
  /** Movement keys held: WASD / arrow keys */
  moveForward: boolean;
  moveBackward: boolean;
  moveLeft: boolean;
  moveRight: boolean;
  /** Mouse drag state for orbit */
  isDragging: boolean;
  /** Pointer position (normalised -1..1) */
  pointerX: number;
  pointerY: number;
  /** Scroll delta for zoom */
  zoomDelta: number;
}
