/**
 * Camera controller for Phase 0.
 * Hybrid navigation: WASD translates the camera target,
 * mouse drag orbits, scroll zooms.
 */
import * as THREE from 'three';
import type { InputState } from '@/types';

const MOVE_SPEED = 20;     // units per second
const ORBIT_SPEED = 0.003; // radians per pixel
const ZOOM_SPEED = 1.0;
const MIN_ZOOM = 10;
const MAX_ZOOM = 80;
const ORBIT_MIN_POLAR = 0.3;  // radians from +Y
const ORBIT_MAX_POLAR = 1.4;

export class CameraController {
  private target = new THREE.Vector3(0, 0, 0);
  private spherical = new THREE.Spherical(40, Math.PI / 4, 0);

  // For drag-based orbit tracking
  private prevPointerX = 0;
  private prevPointerY = 0;

  update(
    camera: THREE.PerspectiveCamera,
    input: InputState,
    deltaTime: number,
  ): void {
    // --- WASD movement (translate target on XZ plane) ---
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, camera.up).normalize();

    const moveAmount = MOVE_SPEED * deltaTime;

    if (input.moveForward)  this.target.addScaledVector(forward, moveAmount);
    if (input.moveBackward) this.target.addScaledVector(forward, -moveAmount);
    if (input.moveLeft)     this.target.addScaledVector(right, -moveAmount);
    if (input.moveRight)    this.target.addScaledVector(right, moveAmount);

    // --- Mouse orbit (drag) ---
    if (input.isDragging) {
      const deltaX = input.pointerX - this.prevPointerX;
      const deltaY = input.pointerY - this.prevPointerY;

      this.spherical.theta -= deltaX * ORBIT_SPEED * 200;
      this.spherical.phi -= deltaY * ORBIT_SPEED * 200;

      this.spherical.phi = THREE.MathUtils.clamp(
        this.spherical.phi,
        ORBIT_MIN_POLAR,
        ORBIT_MAX_POLAR,
      );
    }
    this.prevPointerX = input.pointerX;
    this.prevPointerY = input.pointerY;

    // --- Scroll zoom ---
    if (input.zoomDelta !== 0) {
      this.spherical.radius += input.zoomDelta * ZOOM_SPEED;
      this.spherical.radius = THREE.MathUtils.clamp(
        this.spherical.radius,
        MIN_ZOOM,
        MAX_ZOOM,
      );
      input.zoomDelta = 0; // consume
    }

    // --- Apply spherical coordinates ---
    this.spherical.makeSafe();
    const offset = new THREE.Vector3().setFromSpherical(this.spherical);
    camera.position.copy(this.target).add(offset);
    camera.lookAt(this.target);
  }

  /** Smoothly move to look at a position */
  lookAt(position: THREE.Vector3): void {
    this.target.copy(position);
  }
}
