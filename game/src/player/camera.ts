/**
 * Camera controller for Phase 0.
 *
 * Architecture: MapControls (from Three.js addons) handles all
 * pointer/touch/scroll interaction — orbit, pan, pinch-zoom.
 * We layer WASD keyboard translation and game-specific features
 * (fly-to-island, bounds clamping) on top.
 *
 * Mobile gestures (via MapControls):
 *   1-finger drag  → pan (move across world)
 *   2-finger pinch → zoom in/out
 *   2-finger rotate → orbit camera angle
 *
 * Desktop (via MapControls):
 *   Left-drag   → pan
 *   Right-drag  → orbit
 *   Scroll      → zoom
 *   Arrow keys  → pan (built into MapControls)
 *
 * Custom layer:
 *   WASD        → translate camera target on XZ plane
 *   focusOn()   → smooth fly-to-position for island focus
 */
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import type { KeyboardState } from './input';

// --- Tuning constants ---
const MOVE_SPEED = 25;          // WASD units per second
const DAMPING_FACTOR = 0.08;    // lower = more inertia
const MIN_DISTANCE = 10;        // closest zoom (slightly further to avoid terrain clipping)
const MAX_DISTANCE = 150;       // farthest zoom (need to pull back for terrain overview)
const MIN_POLAR_ANGLE = 0.15;   // nearly top-down (good for map view)
const MAX_POLAR_ANGLE = 1.45;   // nearly horizon (radians from +Y)
const PAN_SPEED = 1.5;          // touch/mouse pan sensitivity
const ROTATE_SPEED = 0.5;       // orbit sensitivity

// Smooth fly-to animation
const FLY_DURATION = 0.8;       // seconds

// Reusable vectors (avoid per-frame allocation)
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();

export class CameraController {
  readonly controls: MapControls;

  // Fly-to animation state
  private flyFrom = new THREE.Vector3();
  private flyTo = new THREE.Vector3();
  private flyProgress = 1;       // 1 = no animation active
  private flyDuration = FLY_DURATION;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLCanvasElement) {
    const controls = new MapControls(camera, domElement);

    // Damping gives the smooth inertia feel
    controls.enableDamping = true;
    controls.dampingFactor = DAMPING_FACTOR;

    // Zoom limits
    controls.minDistance = MIN_DISTANCE;
    controls.maxDistance = MAX_DISTANCE;

    // Vertical angle limits — prevent flipping under the ground
    controls.minPolarAngle = MIN_POLAR_ANGLE;
    controls.maxPolarAngle = MAX_POLAR_ANGLE;

    // Sensitivity
    controls.panSpeed = PAN_SPEED;
    controls.rotateSpeed = ROTATE_SPEED;

    // Pan along world XZ plane (not screen-space)
    controls.screenSpacePanning = false;

    // We handle WASD/arrows ourselves — don't let MapControls
    // bind its own key listeners (which only do pan at fixed px/frame)
    // By default MapControls doesn't listen to keys unless
    // listenToKeyEvents() is called, so we just skip that call.

    this.controls = controls;
  }

  /**
   * Called every frame from the render loop.
   * Applies WASD movement and updates MapControls.
   * Returns true if camera moved (for render-on-demand dirty flag).
   */
  update(keyboard: KeyboardState, deltaTime: number): boolean {
    const camera = this.controls.object as THREE.PerspectiveCamera;
    let moved = false;

    // --- WASD movement: translate the target on the XZ plane ---
    const hasMovement =
      keyboard.forward || keyboard.backward ||
      keyboard.left || keyboard.right;

    if (hasMovement) {
      camera.getWorldDirection(_forward);
      _forward.y = 0;
      _forward.normalize();
      _right.crossVectors(_forward, camera.up).normalize();

      const speed = MOVE_SPEED * deltaTime;
      if (keyboard.forward)  this.controls.target.addScaledVector(_forward, speed);
      if (keyboard.backward) this.controls.target.addScaledVector(_forward, -speed);
      if (keyboard.left)     this.controls.target.addScaledVector(_right, -speed);
      if (keyboard.right)    this.controls.target.addScaledVector(_right, speed);
      moved = true;
    }

    // --- Fly-to animation ---
    if (this.flyProgress < 1) {
      this.flyProgress += deltaTime / this.flyDuration;
      if (this.flyProgress >= 1) {
        this.flyProgress = 1;
      }
      const t = 1 - Math.pow(1 - this.flyProgress, 3);
      this.controls.target.lerpVectors(this.flyFrom, this.flyTo, t);
      moved = true;
    }

    // Let MapControls apply damping, pointer state, etc.
    this.controls.update(deltaTime);
    return moved;
  }

  /**
   * Smoothly fly the camera to look at a world position.
   * Useful for focusing on an island when clicked/tapped.
   */
  focusOn(position: THREE.Vector3, duration = FLY_DURATION): void {
    this.flyFrom.copy(this.controls.target);
    this.flyTo.copy(position);
    this.flyProgress = 0;
    this.flyDuration = duration;
  }

  /** Get the current look-at target (for raycasting, UI, etc.) */
  get target(): THREE.Vector3 {
    return this.controls.target;
  }

  /** Cleanup */
  dispose(): void {
    this.controls.dispose();
  }
}
