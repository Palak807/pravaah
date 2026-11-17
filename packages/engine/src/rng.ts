/* Seeded, deterministic PRNG — ported verbatim from legacy/js/engine.js.
   Same seed + same key always return the same number, in any JS runtime. */

export function hash(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^= h >>> 16) >>> 0) / 4294967296;
}

export interface Rng {
  u(k: string): number;
  logn(k: string, med: number, sig: number): number;
}

export function rng(seed: string): Rng {
  function u(k: string): number {
    return hash(seed + '|' + k);
  }
  function norm(k: string): number {
    const a = Math.max(u(k + 'a'), 1e-9),
      b = u(k + 'b');
    return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
  }
  return {
    u,
    logn(k: string, med: number, sig: number): number {
      return med * Math.exp(sig * norm(k));
    },
  };
}
