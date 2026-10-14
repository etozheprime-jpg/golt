import { destination, haversineKm, jitter } from './geo';
import { computeFare } from './pricing';
import { districtSurge, trafficSpeedKmh, type ScenarioDef } from './scenarios';
import { pick, range, weighted } from './rng';
import type { CityConfig, LatLng, Order, OrderPlace, Place, Rng, Settings, TripType } from './types';

export interface GenCtx {
  rng: Rng;
  city: CityConfig;
  driver: LatLng;
  scenario: ScenarioDef;
  hour: number;
  dow: number;
  seq: number;
  recent: LatLng[];
  difficulty: Settings['difficulty'];
  fareScale?: number;
  forceType?: TripType;
  clusterDistrict?: string;
}

const FIRST = ['Tomas', 'Ieva', 'Lukas', 'Austėja', 'Mantas', 'Gabija', 'Jonas', 'Rūta', 'Darius', 'Milda', 'Andrius', 'Kotryna', 'Marek', 'Anna', 'Piotr', 'Elena', 'Viktor', 'Sofia', 'Daniel', 'Laura', 'Nikita', 'Aistė', 'Paulius', 'Emilija', 'Oskar', 'Maja', 'Rokas', 'Greta', 'Ethan', 'Nora'];
const LAST = 'ABDGJKLMNPRSTVZ'.split('');

export const NEAR_RADIUS_KM = 0.15;
const ROAD = 1.3;
const round1 = (n: number) => Math.round(n * 10) / 10;
const nearestPlace = (city: CityConfig, p: LatLng): { place: Place; km: number } => {
  let best = city.places[0];
  let bk = Infinity;
  for (const pl of [...city.places, ...(city.airport ? [city.airport] : [])]) {
    const k = haversineKm(p, pl.pos);
    if (k < bk) { bk = k; best = pl; }
  }
  return { place: best, km: bk };
};

const label = (place: Place, rng: Rng, pos: LatLng, approx = true): OrderPlace => ({
  name: place.streets ? pick(rng, place.streets) : place.name,
  district: place.district,
  pos,
  approx,
});

export function generateOrder(ctx: GenCtx): Order {
  const { rng, city, driver, scenario, hour, dow } = ctx;
  const airport = city.airport;
  const airportNear = !!airport && haversineKm(driver, airport.pos) < 3;
  const hard = ctx.difficulty === 'hard' ? 1.5 : ctx.difficulty === 'easy' ? 0.75 : 1;
  const inCity = nearestPlace(city, driver).km < 25;

  const types = (Object.keys(scenario.typeWeights) as TripType[]).filter((t) => {
    if (t === 'airport_in') return airportNear;
    if (t === 'airport_out') return !!airport && inCity && !airportNear;
    return scenario.typeWeights[t] > 0;
  });
  const type: TripType = ctx.forceType ?? weighted(rng, types, (t) => scenario.typeWeights[t]);

  // ---- pickup
  const longPickup = type !== 'airport_in' && rng() < scenario.longPickupChance;
  const [lo0, hi0] = longPickup ? [3.5, 7] : scenario.pickupKm;
  const lo = lo0 * hard;
  const hi = hi0 * hard;
  const near = (p: LatLng) => ctx.recent.some((r) => haversineKm(r, p) < 0.3);

  let pickup: OrderPlace;
  let pickupPlace: Place;
  if (type === 'airport_in' && airport) {
    pickupPlace = airport;
    pickup = { name: airport.name, district: airport.district, pos: jitter(airport.pos, 0.08, rng), approx: false };
  } else {
    const cands = inCity
      ? city.places.filter((p) => {
          const k = haversineKm(driver, p.pos);
          return k >= lo * 0.5 && k <= hi + 0.4;
        })
      : [];
    if (cands.length) {
      pickupPlace = weighted(rng, cands, (p) => {
        const s = districtSurge(p.id, p.kind, hour, dow, scenario.surgeBoost);
        return p.weight * s * (ctx.clusterDistrict && p.district === ctx.clusterDistrict ? 6 : 1);
      });
      let pos = jitter(pickupPlace.pos, 0.35, rng);
      for (let i = 0; i < 6 && near(pos); i++) pos = jitter(pickupPlace.pos, 0.45, rng);
      pickup = label(pickupPlace, rng, pos);
    } else {
      let pos = destination(driver, range(rng, lo, hi), rng() * 360);
      for (let i = 0; i < 6 && near(pos); i++) pos = destination(driver, range(rng, lo, hi), rng() * 360);
      const np = inCity ? nearestPlace(city, pos).place : null;
      pickupPlace = np ?? { id: 'virtual', name: 'Virtual point', district: 'Nearby', pos, kind: 'residential', weight: 1 };
      pickup = np
        ? { name: np.name, district: np.district, pos, approx: true }
        : { name: 'Virtual point', nameKey: 'place.virtual', district: 'Nearby', pos, approx: true };
    }
  }

  // ---- dropoff
  let drop: OrderPlace | null = null;
  let dropPlace: Place | null = null;
  const pool = city.places.filter((p) => p.id !== pickupPlace.id);
  const between = (a: number, b: number, from = pickup.pos) => pool.filter((p) => { const k = haversineKm(from, p.pos); return k >= a && k <= b; });
  const choose = (c: Place[]) => (c.length ? weighted(rng, c, (p) => p.weight) : null);

  if (type === 'airport_out' && airport) dropPlace = airport;
  else if (type === 'airport_in') dropPlace = choose(between(5, 16, airport!.pos));
  else if (inCity) {
    if (type === 'short') dropPlace = choose(between(0.9, 3.2)) ?? choose(between(0.5, 5));
    else if (type === 'standard') dropPlace = choose(between(3, 8)) ?? choose(between(1.5, 12));
    else if (type === 'long') dropPlace = choose(between(8, 25)) ?? choose(between(5, 30));
    else if (type === 'suburb') dropPlace = choose(between(4, 14).filter((p) => p.kind === 'residential')) ?? choose(between(3, 20));
  }
  if (dropPlace) {
    drop = { name: dropPlace.streets ? pick(rng, dropPlace.streets) : dropPlace.name, district: dropPlace.district, pos: dropPlace.kind === 'airport' ? jitter(dropPlace.pos, 0.08, rng) : jitter(dropPlace.pos, 0.35, rng), approx: dropPlace.kind !== 'airport' };
  } else {
    const km = type === 'short' ? range(rng, 1, 3) : type === 'long' ? range(rng, 9, 16) : range(rng, 3, 9);
    const pos = destination(pickup.pos, km, rng() * 360);
    drop = { name: 'Virtual point', nameKey: 'place.virtual', district: 'Nearby', pos, approx: true };
  }

  // ---- numbers
  const spd = trafficSpeedKmh(hour, scenario.traffic);
  const pickupKm = Math.max(0.2, round1(haversineKm(driver, pickup.pos) * ROAD));
  const tripKm = Math.max(0.6, round1(haversineKm(pickup.pos, drop.pos) * ROAD));
  const tripSpd = spd * (tripKm > 8 ? 1.3 : 1) * (type === 'airport_in' || type === 'airport_out' ? 1.2 : 1);
  const pickupMin = Math.max(1, Math.ceil((pickupKm / spd) * 60));
  const tripMin = Math.max(3, Math.ceil((tripKm / tripSpd) * 60));
  const surge = districtSurge(pickupPlace.id, pickupPlace.kind, hour, dow, scenario.surgeBoost);
  const diffScale = ctx.difficulty === 'hard' ? 0.88 : ctx.difficulty === 'easy' ? 1.1 : 1;
  const fare = computeFare(city.tariff, tripKm, tripMin, surge, type, (ctx.fareScale ?? 1) * diffScale);

  const rating = Math.round(Math.min(5, Math.max(4.1, 5 - Math.pow(rng(), 2.2) * 0.9)) * 100) / 100;
  const ttl = Math.round(scenario.ttl * (tripKm > 9 ? 1.3 : 1) * (ctx.difficulty === 'hard' ? 0.7 : 1));

  return {
    id: `GL-${String(ctx.seq).padStart(4, '0')}${Math.floor(rng() * 36 ** 2).toString(36).toUpperCase().padStart(2, '0')}`,
    passenger: `${pick(rng, FIRST)} ${pick(rng, LAST)}.`,
    rating,
    pickup,
    dropoff: drop,
    pickupKm,
    pickupMin,
    tripKm,
    tripMin,
    fare,
    surge,
    type,
    ttl,
    longPickup,
    district: pickupPlace.district,
  };
}
