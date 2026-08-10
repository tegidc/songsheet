// §7: the wireframe's 120-phrase pool and 1400-particle cap were dialled in
// for demo data, not measured against real object-writing volume. Rather than
// guess a hard number, this scales particles-per-phrase down as the pool
// grows and caps the phrase pool itself to whatever keeps total particles
// inside the budget — so a small pool still looks full, and a large one
// degrades gracefully instead of spawning tens of thousands of particles.

export const PARTICLE_BUDGET = 1400;
export const MIN_DENSITY = 2;
export const MAX_DENSITY = 7;

/** However many phrases the densest allowed particle count can still afford. */
export const PHRASE_CAP = Math.floor(PARTICLE_BUDGET / MIN_DENSITY);

/** O(n²) every frame — not worth it once there's this many dots to pair up. */
export const CONSTELLATION_CUTOFF = 900;

export function densityForPoolSize(n: number): number {
  return Math.max(MIN_DENSITY, Math.min(MAX_DENSITY, Math.floor(PARTICLE_BUDGET / Math.max(1, n))));
}
