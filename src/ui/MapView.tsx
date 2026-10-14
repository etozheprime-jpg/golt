import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { engine, uiStore, useEngine, useUI } from '../store';
import { gps } from '../services/gps';
import { getCity } from '../core/cities';
import type { LatLng } from '../core/types';

// Default: OpenStreetMap standard tiles (fine for demos; see OSM tile usage policy). Dark theme is a CSS filter.
// For production traffic set VITE_TILE_URL_DARK / VITE_TILE_URL_LIGHT to a keyed provider (MapTiler, Stadia, CARTO…).
const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_DARK = (import.meta.env.VITE_TILE_URL_DARK as string) || OSM;
const TILE_LIGHT = (import.meta.env.VITE_TILE_URL_LIGHT as string) || OSM;
const filterDark = !import.meta.env.VITE_TILE_URL_DARK;
const SHEET_OFFSET_PX = 110;

let mapRef: L.Map | null = null;
export const mapApi = {
  zoomIn: () => mapRef?.zoomIn(),
  zoomOut: () => mapRef?.zoomOut(),
  center: () => {
    uiStore.set({ follow: true });
    centerOn(engine.getState().driver.pos, true);
  },
};

function centerOn(pos: LatLng, animate = false) {
  const m = mapRef;
  if (!m) return;
  const z = m.getZoom();
  const p = m.project([pos.lat, pos.lng], z).add([0, SHEET_OFFSET_PX]);
  m.setView(m.unproject(p, z), z, { animate });
}

const ll = (p: LatLng): L.LatLngTuple => [p.lat, p.lng];

const driverIcon = L.divIcon({
  className: 'drv',
  iconSize: [56, 56],
  iconAnchor: [28, 28],
  html: '<div class="drv-pulse"></div><svg class="drv-arrow" viewBox="0 0 48 48" width="44" height="44"><path d="M24 4L40 42 24 33 8 42z" fill="#C6FF3D" stroke="#0A0B0C" stroke-width="3" stroke-linejoin="round"/><path d="M24 4L40 42 24 33z" fill="#9BD018"/></svg>',
});
const pin = (letter: string, cls: string) =>
  L.divIcon({ className: 'pin-wrap', iconSize: [34, 42], iconAnchor: [17, 40], html: `<div class="pin ${cls}"><span>${letter}</span></div>` });

export function MapView({ onClick }: { onClick: (p: LatLng) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const s = useEngine();
  const ui = useUI();
  const refs = useRef<{
    tiles?: L.TileLayer; driver?: L.Marker; acc?: L.Circle; a?: L.Marker; b?: L.Marker; pickLine?: L.Polyline; tripLine?: L.Polyline;
    heat?: L.LayerGroup; others?: L.LayerGroup; otherMarkers: Map<number, L.CircleMarker>; heatKey?: string; click?: (p: LatLng) => void;
  }>({ otherMarkers: new Map() });
  refs.current.click = onClick;

  // init
  useEffect(() => {
    if (!el.current) return;
    const st = engine.getState();
    const map = L.map(el.current, { zoomControl: false, preferCanvas: true, attributionControl: true, zoomSnap: 0.5 }).setView(ll(st.driver.pos), 15);
    map.attributionControl.setPrefix(false);
    mapRef = map;
    const r = refs.current;
    r.heat = L.layerGroup().addTo(map);
    r.others = L.layerGroup().addTo(map);
    r.tripLine = L.polyline([], { color: '#e9ece4', weight: 5, opacity: 0.7, dashArray: '2 10', lineCap: 'round' }).addTo(map);
    r.pickLine = L.polyline([], { color: '#c6ff3d', weight: 6, opacity: 0.95, lineCap: 'round' }).addTo(map);
    r.acc = L.circle(ll(st.driver.pos), { radius: 0, weight: 1, color: '#C6FF3D', fillColor: '#C6FF3D', fillOpacity: 0.1 }).addTo(map);
    r.driver = L.marker(ll(st.driver.pos), { icon: driverIcon, zIndexOffset: 1000, interactive: false }).addTo(map);
    map.on('dragstart', () => uiStore.set({ follow: false }));
    map.on('click', (e: L.LeafletMouseEvent) => r.click?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
    return () => { map.remove(); mapRef = null; r.heatKey = undefined; r.otherMarkers.clear(); };
  }, []);

  // tiles by theme
  useEffect(() => {
    const map = mapRef;
    if (!map) return;
    refs.current.tiles?.remove();
    refs.current.tiles = L.tileLayer(s.settings.theme === 'dark' ? TILE_DARK : TILE_LIGHT, {
      maxZoom: 19, attribution: '© OpenStreetMap contributors',
    }).addTo(map);
    refs.current.tiles.bringToBack();
  }, [s.settings.theme]);

  // driver, follow, routes, markers
  useEffect(() => {
    const map = mapRef;
    const r = refs.current;
    if (!map || !r.driver) return;
    const { driver } = s;
    r.driver.setLatLng(ll(driver.pos));
    const arrow = r.driver.getElement()?.querySelector<SVGElement>('.drv-arrow');
    if (arrow) arrow.style.transform = `rotate(${driver.heading}deg)`;
    const g = gps.getState();
    const accOn = s.settings.movement === 'gps' && g.accuracy;
    r.acc?.setLatLng(ll(driver.pos));
    r.acc?.setRadius(accOn ? g.accuracy! : 0);
    if (ui.follow) centerOn(driver.pos);

    r.pickLine?.setLatLngs(s.routes.pickup ? s.routes.pickup.map(ll) : []);
    r.tripLine?.setLatLngs(s.routes.trip ? s.routes.trip.map(ll) : []);
    const light = s.settings.theme === 'light';
    r.pickLine?.setStyle({ color: light ? '#4f8200' : '#c6ff3d' });
    r.tripLine?.setStyle({ color: light ? '#12150f' : '#e9ece4', dashArray: s.phase === 'inTrip' ? undefined : '2 10', opacity: s.phase === 'inTrip' ? 0.95 : 0.7, weight: s.phase === 'inTrip' ? 6 : 5 });

    const o = s.offer ?? s.active;
    const showA = !!o && s.phase !== 'inTrip';
    if (showA && o) {
      if (!r.a) r.a = L.marker(ll(o.pickup.pos), { icon: pin('A', 'pin-a'), interactive: false }).addTo(map);
      else r.a.setLatLng(ll(o.pickup.pos));
    } else if (r.a) { r.a.remove(); r.a = undefined; }
    if (o) {
      if (!r.b) r.b = L.marker(ll(o.dropoff.pos), { icon: pin('B', 'pin-b'), interactive: false }).addTo(map);
      else r.b.setLatLng(ll(o.dropoff.pos));
    } else if (r.b) { r.b.remove(); r.b = undefined; }
  }, [s, ui.follow]);

  // frame the whole offer (driver → A → B) when a new one arrives; follow resumes on accept
  const offerId = s.offer?.id;
  useEffect(() => {
    const map = mapRef;
    const st = engine.getState();
    if (!map || !st.offer || !offerId) return;
    const pts = [st.driver.pos, st.offer.pickup.pos, st.offer.dropoff.pos].map(ll);
    uiStore.set({ follow: false });
    map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [36, 150], paddingBottomRight: [36, (document.querySelector<HTMLElement>('.sheet')?.offsetHeight ?? 420) + 28], maxZoom: 16, animate: true });
  }, [offerId]);

  // surge zones
  useEffect(() => {
    const r = refs.current;
    if (!r.heat) return;
    const key = `${s.settings.heat}|${s.settings.city}|${Math.floor(s.simHour * 2)}|${s.scenarioId}`;
    if (r.heatKey === key) return;
    r.heatKey = key;
    r.heat.clearLayers();
    if (!s.settings.heat) return;
    for (const z of engine.surgeZones()) {
      if (z.surge < 1.25) continue;
      const k = Math.min(1, (z.surge - 1) / 1.5);
      L.circle(ll(z.pos), { radius: 500 + k * 700, stroke: false, fillColor: '#FFB224', fillOpacity: 0.1 + k * 0.2, interactive: false }).addTo(r.heat);
    }
  }, [s.settings.heat, s.settings.city, s.simHour, s.scenarioId]);

  // other virtual drivers
  useEffect(() => {
    const r = refs.current;
    if (!r.others) return;
    const seen = new Set<number>();
    for (const o of s.others) {
      seen.add(o.id);
      const m = r.otherMarkers.get(o.id);
      if (m) m.setLatLng(ll(o.pos));
      else r.otherMarkers.set(o.id, L.circleMarker(ll(o.pos), { radius: 5, weight: 2, color: '#0A0B0C', fillColor: '#E9ECE4', fillOpacity: 0.9, interactive: false }).addTo(r.others));
    }
    for (const [id, m] of r.otherMarkers) if (!seen.has(id)) { m.remove(); r.otherMarkers.delete(id); }
  }, [s.others]);

  // city change → recentre
  useEffect(() => { const c = getCity(s.settings.city).center; if (!engine.getState().offer) mapRef?.setView(ll(engine.getState().driver.pos ?? c), mapRef.getZoom(), { animate: false }); }, [s.settings.city]);

  return <div ref={el} className={`map${ui.pick ? ' picking' : ''}${filterDark && s.settings.theme === 'dark' ? ' tint-dark' : ''}`} data-testid="map" />;
}
