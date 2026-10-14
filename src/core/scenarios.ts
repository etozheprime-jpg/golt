import type { PlaceKind, ScenarioId, TripType } from './types';

export interface ScenarioDef {
  id: ScenarioId;
  startHour: number | 'now';
  startDow: number | 'now';
  meanIntervalSec: number;
  typeWeights: Record<TripType, number>;
  pickupKm: [number, number];
  longPickupChance: number;
  surgeBoost: number;
  traffic: number;
  jamChance: number;
  cancelProb: number;
  dryChance: number;
  ttl: number;
  clusterChance: number;
  airportQueue: boolean;
  start: 'center' | 'airport' | 'current';
}

export const SCENARIOS: Record<ScenarioId, ScenarioDef> = {
  normal: {
    id: 'normal', startHour: 13, startDow: 2, meanIntervalSec: 100,
    typeWeights: { short: 3, standard: 4, long: 1.5, suburb: 2, airport_out: 0.4, airport_in: 0 },
    pickupKm: [0.4, 2.2], longPickupChance: 0.08, surgeBoost: 1, traffic: 1, jamChance: 0.02, cancelProb: 0.06, dryChance: 0.06, ttl: 15, clusterChance: 0.15, airportQueue: false, start: 'center',
  },
  rush: {
    id: 'rush', startHour: 17.6, startDow: 5, meanIntervalSec: 100,
    typeWeights: { short: 3, standard: 4, long: 2.5, suburb: 3, airport_out: 0.6, airport_in: 0 },
    pickupKm: [0.3, 1.8], longPickupChance: 0.05, surgeBoost: 1.25, traffic: 0.85, jamChance: 0.25, cancelProb: 0.08, dryChance: 0.02, ttl: 12, clusterChance: 0.3, airportQueue: false, start: 'center',
  },
  night: {
    id: 'night', startHour: 2.5, startDow: 6, meanIntervalSec: 100,
    typeWeights: { short: 1, standard: 2, long: 4, suburb: 3, airport_out: 1.5, airport_in: 0 },
    pickupKm: [0.8, 3.5], longPickupChance: 0.15, surgeBoost: 1.1, traffic: 1.15, jamChance: 0, cancelProb: 0.05, dryChance: 0.15, ttl: 18, clusterChance: 0.05, airportQueue: false, start: 'center',
  },
  airport: {
    id: 'airport', startHour: 10, startDow: 3, meanIntervalSec: 110,
    typeWeights: { short: 0.5, standard: 2, long: 1, suburb: 1, airport_out: 3, airport_in: 6 },
    pickupKm: [0.5, 2.5], longPickupChance: 0.05, surgeBoost: 1, traffic: 1, jamChance: 0.03, cancelProb: 0.05, dryChance: 0.04, ttl: 15, clusterChance: 0.1, airportQueue: true, start: 'airport',
  },
  free: {
    id: 'free', startHour: 'now', startDow: 'now', meanIntervalSec: 100,
    typeWeights: { short: 3, standard: 4, long: 1.5, suburb: 2, airport_out: 0.4, airport_in: 0 },
    pickupKm: [0.4, 2.5], longPickupChance: 0.08, surgeBoost: 1, traffic: 1, jamChance: 0.04, cancelProb: 0.06, dryChance: 0.06, ttl: 15, clusterChance: 0.15, airportQueue: false, start: 'current',
  },
  manual: {
    id: 'manual', startHour: 12, startDow: 3, meanIntervalSec: 100,
    typeWeights: { short: 3, standard: 4, long: 1.5, suburb: 2, airport_out: 0.4, airport_in: 0 },
    pickupKm: [0.4, 2.5], longPickupChance: 0.05, surgeBoost: 1, traffic: 1, jamChance: 0, cancelProb: 0.05, dryChance: 0, ttl: 15, clusterChance: 0.1, airportQueue: false, start: 'current',
  },
};

export const DEFAULT_SEEDS: Record<ScenarioId, number> = { normal: 1101, rush: 2202, night: 3303, airport: 4404, free: 5505, manual: 6606 };

/** Relative order demand by hour of day (1 = ordinary daytime). */
export function demandAt(hour: number, dow: number): number {
  const h = Math.floor(hour) % 24;
  const fri = dow === 5;
  const weekendNight = dow === 5 || dow === 6;
  if (h < 4) return weekendNight ? 0.5 : 0.3;
  if (h < 6) return 0.35;
  if (h < 7) return 0.7;
  if (h < 10) return 1.5;
  if (h < 16) return 0.95;
  if (h < 21) return fri ? 2.3 : 1.6;
  if (h < 23) return fri ? 1.6 : 0.9;
  return weekendNight ? 1 : 0.6;
}

export function trafficSpeedKmh(hour: number, scenarioTraffic: number): number {
  const h = Math.floor(hour) % 24;
  const base = (h >= 7 && h < 10) || (h >= 16 && h < 20) ? 21 : h < 6 ? 40 : 30;
  return Math.max(12, base * scenarioTraffic);
}

export function districtSurge(placeId: string, kind: PlaceKind, hour: number, dow: number, boost: number): number {
  const h = Math.floor(hour) % 24;
  let s = 1;
  let hash = 0;
  for (const c of placeId + Math.floor(hour * 2)) hash = (hash * 31 + c.charCodeAt(0)) % 1000;
  s += (hash / 1000) * 0.25;
  const rush = (h >= 7 && h < 10) || (h >= 16 && h < 20);
  if (rush && (kind === 'center' || kind === 'business' || kind === 'transit')) s += 0.45;
  if (rush && kind === 'residential' && h < 10) s += 0.3;
  if (dow === 5 && h >= 17 && h < 23 && (kind === 'center' || kind === 'leisure')) s += 0.7;
  if (h < 5 && (kind === 'airport' || kind === 'center' || kind === 'leisure')) s += 0.35;
  s *= boost;
  return Math.round(Math.min(3, Math.max(1, s)) * 10) / 10;
}
