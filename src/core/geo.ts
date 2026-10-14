import type { LatLng } from './types';

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function bearing(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function destination(p: LatLng, km: number, brg: number): LatLng {
  const d = km / R;
  const b = rad(brg);
  const lat1 = rad(p.lat);
  const lng1 = rad(p.lng);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: deg(lat2), lng: ((deg(lng2) + 540) % 360) - 180 };
}

export interface Route { pts: LatLng[]; cum: number[]; totalM: number }

export function makeRoute(pts: LatLng[]): Route {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversineKm(pts[i - 1], pts[i]) * 1000);
  return { pts, cum, totalM: cum[cum.length - 1] };
}

/** Road-like fallback used offline: a gently bent polyline (deterministic for given endpoints). */
export function fallbackRoute(a: LatLng, b: LatLng): Route {
  const km = haversineKm(a, b);
  if (km < 0.05) return makeRoute([a, b]);
  const brg = bearing(a, b);
  const sign = Math.sin(a.lat * 1000 + b.lng * 1000) > 0 ? 1 : -1;
  const pts: LatLng[] = [a];
  const n = Math.min(6, Math.max(2, Math.round(km / 0.8)));
  for (let i = 1; i <= n; i++) {
    const f = i / (n + 1);
    const base = destination(a, km * f, brg);
    const off = km * 0.12 * Math.sin(f * Math.PI) * sign * (i % 2 ? 1 : 0.4);
    pts.push(destination(base, off, brg + 90));
  }
  pts.push(b);
  return makeRoute(pts);
}

export function pointAt(route: Route, m: number): { pos: LatLng; heading: number } {
  const { pts, cum, totalM } = route;
  if (pts.length === 1) return { pos: pts[0], heading: 0 };
  const d = Math.max(0, Math.min(totalM, m));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const seg = cum[i] - cum[i - 1] || 1;
  const f = Math.max(0, Math.min(1, (d - cum[i - 1]) / seg));
  const a = pts[i - 1];
  const b = pts[i];
  return { pos: { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f }, heading: bearing(a, b) };
}

export function jitter(p: LatLng, maxKm: number, r: () => number): LatLng {
  return destination(p, Math.sqrt(r()) * maxKm, r() * 360);
}
