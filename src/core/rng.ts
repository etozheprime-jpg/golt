import type { Rng } from './types';

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(r: Rng, a: T[]): T => a[Math.floor(r() * a.length)];
export const range = (r: Rng, a: number, b: number) => a + (b - a) * r();

export function weighted<T>(r: Rng, items: T[], w: (t: T) => number): T {
  const total = items.reduce((s, i) => s + Math.max(0, w(i)), 0);
  if (total <= 0) return items[Math.floor(r() * items.length)];
  let x = r() * total;
  for (const i of items) {
    x -= Math.max(0, w(i));
    if (x <= 0) return i;
  }
  return items[items.length - 1];
}

export const expo = (r: Rng, mean: number) => -Math.log(1 - r()) * mean;

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
