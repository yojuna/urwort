/**
 * Input handling for Phase 0.
 * Keyboard (WASD/arrows) + mouse drag orbit + scroll zoom.
 */
import type { InputState } from '@/types';

export function createInputState(): InputState {
  return {
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    isDragging: false,
    pointerX: 0,
    pointerY: 0,
    zoomDelta: 0,
  };
}

export function bindInputListeners(
  canvas: HTMLCanvasElement,
  state: InputState,
): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    state.moveForward = true; break;
      case 'KeyS': case 'ArrowDown':  state.moveBackward = true; break;
      case 'KeyA': case 'ArrowLeft':  state.moveLeft = true; break;
      case 'KeyD': case 'ArrowRight': state.moveRight = true; break;
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    state.moveForward = false; break;
      case 'KeyS': case 'ArrowDown':  state.moveBackward = false; break;
      case 'KeyA': case 'ArrowLeft':  state.moveLeft = false; break;
      case 'KeyD': case 'ArrowRight': state.moveRight = false; break;
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button === 0 || e.button === 2) {
      state.isDragging = true;
      canvas.setPointerCapture(e.pointerId);
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    state.isDragging = false;
    canvas.releasePointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    state.pointerX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    state.pointerY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    state.zoomDelta += e.deltaY * 0.01;
  };

  const onContextMenu = (e: Event) => e.preventDefault();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);

  // Return cleanup function
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('contextmenu', onContextMenu);
  };
}
