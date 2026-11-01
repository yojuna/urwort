// Saved game state (localStorage). One save slot for the prototype.
const KEY = 'urwort-proto-v1';

export interface GameState {
  scene: string;
  x: number;
  y: number;
  slips: string[];        // lemmas, in the order they were found
  runes: string[];
  items: string[];
  flags: Record<string, boolean>;
  ink: string | null;     // ink story state JSON
  english: boolean;       // show English glosses and cognates
}

const fresh = (): GameState => ({
  scene: 'study', x: 4, y: 5, slips: [], runes: [], items: [], flags: {}, ink: null, english: false,
});

export const state: GameState = (() => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...JSON.parse(raw) };
  } catch { /* ignore a broken save */ }
  return fresh();
})();

export function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function reset() {
  localStorage.removeItem(KEY);
  location.reload();
}
