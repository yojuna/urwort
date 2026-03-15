/**
 * Classic 2D Perlin noise + Fractal Brownian Motion.
 * Self-contained — no external dependencies.
 *
 * Usage:
 *   noise2D(x * frequency, z * frequency) * amplitude
 *   fbm(x, y, octaves)  — layered noise for natural terrain variation
 */

// Permutation table (256 entries, doubled for wrapping)
const perm = new Uint8Array(512);
const grad: [number, number][] = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

// Seed the permutation table (deterministic)
function seedNoise(seed: number = 42): void {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;

  // Fisher-Yates shuffle with seeded PRNG (Park-Miller)
  let s = seed;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807 + 0) % 2147483647;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }

  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}

// Initialise on module load
seedNoise(42);

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

function dot2(g: [number, number], x: number, y: number): number {
  return g[0] * x + g[1] * y;
}

/**
 * Classic 2D Perlin noise.
 * Returns values in approximately [-1, 1] range.
 */
export function noise2D(x: number, y: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);

  const u = fade(xf);
  const v = fade(yf);

  const g00 = grad[perm[perm[X] + Y] & 7];
  const g10 = grad[perm[perm[X + 1] + Y] & 7];
  const g01 = grad[perm[perm[X] + Y + 1] & 7];
  const g11 = grad[perm[perm[X + 1] + Y + 1] & 7];

  const n00 = dot2(g00, xf, yf);
  const n10 = dot2(g10, xf - 1, yf);
  const n01 = dot2(g01, xf, yf - 1);
  const n11 = dot2(g11, xf - 1, yf - 1);

  return lerp(
    lerp(n00, n10, u),
    lerp(n01, n11, u),
    v,
  );
}

/**
 * Fractal Brownian Motion — layered noise for natural-looking terrain.
 * octaves=3 is good for subtle ground variation.
 */
export function fbm(x: number, y: number, octaves: number = 3): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    value += noise2D(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return value / maxValue; // normalise to [-1, 1]
}
