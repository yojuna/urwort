/**
 * Keyboard input handling for Phase 0.
 *
 * Touch/pointer/scroll input is handled entirely by MapControls.
 * This module only tracks WASD/arrow key state for camera translation.
 */

/** Current keyboard movement state */
export interface KeyboardState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
}

export function createKeyboardState(): KeyboardState {
  return {
    forward: false,
    backward: false,
    left: false,
    right: false,
  };
}

/**
 * Bind keyboard listeners. Returns a cleanup function.
 */
export function bindKeyboard(state: KeyboardState): () => void {
  const setKey = (code: string, pressed: boolean) => {
    switch (code) {
      case 'KeyW': case 'ArrowUp':    state.forward = pressed; break;
      case 'KeyS': case 'ArrowDown':  state.backward = pressed; break;
      case 'KeyA': case 'ArrowLeft':  state.left = pressed; break;
      case 'KeyD': case 'ArrowRight': state.right = pressed; break;
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    // Don't capture when typing in an input/textarea
    if ((e.target as HTMLElement)?.tagName === 'INPUT' ||
        (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
    setKey(e.code, true);
  };

  const onKeyUp = (e: KeyboardEvent) => {
    setKey(e.code, false);
  };

  // Reset all keys on blur (prevents stuck keys when tabbing away)
  const onBlur = () => {
    state.forward = false;
    state.backward = false;
    state.left = false;
    state.right = false;
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  };
}
