import { makeRoute, type Route } from '../core/geo';
import type { Router } from '../core/engine';

const BASE = (import.meta.env.VITE_OSRM_URL as string | undefined) ?? 'https://router.project-osrm.org';

/** OSRM-compatible road routing. Returns null on any failure so the engine keeps its offline fallback route. */
export const osrmRouter: Router | null = BASE
  ? async (a, b) => {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 5000);
      try {
        const url = `${BASE}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
        const res = await fetch(url, { signal: ctl.signal });
        if (!res.ok) return null;
        const json = await res.json();
        const coords = json?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
        if (!coords || coords.length < 2) return null;
        return makeRoute(coords.map(([lng, lat]) => ({ lat, lng }))) as Route;
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    }
  : null;
