import { describe, expect, it } from 'vitest';
import { Engine, NOSHOW_WAIT_SEC } from '../src/core/engine';
import { generateOrder } from '../src/core/generator';
import { getCity } from '../src/core/cities';
import { canTransition, transition } from '../src/core/machine';
import { SCENARIOS, demandAt } from '../src/core/scenarios';
import { haversineKm } from '../src/core/geo';
import { mulberry32 } from '../src/core/rng';
import { computeFare } from '../src/core/pricing';
import type { Phase, Settings } from '../src/core/types';

const make = (settings: Partial<Settings> = {}) =>
  new Engine({ persisted: { settings: { demo: true, virtualDrivers: false, ...settings } as Settings } });
/** Advance sim time in 100 ms ticks until predicate holds (or limit). */
function run(e: Engine, until: () => boolean, maxTicks = 40000) {
  let n = 0;
  while (!until() && n++ < maxTicks) e.tick(100);
  return n < maxTicks;
}
const toOffer = (e: Engine) => { e.goOnline(); expect(run(e, () => e.getState().phase === 'offer')).toBe(true); };
const toWaiting = (e: Engine) => { toOffer(e); e.acceptOffer(); expect(run(e, () => e.arrive())).toBe(true); };

describe('state machine', () => {
  it('forbids completing before starting and accepting twice', () => {
    expect(canTransition('toPickup', 'COMPLETE')).toBe(false);
    expect(canTransition('waiting', 'COMPLETE')).toBe(false);
    expect(canTransition('inTrip', 'ACCEPT')).toBe(false);
    expect(canTransition('toPickup', 'ACCEPT')).toBe(false);
    expect(canTransition('inTrip', 'GO_OFFLINE')).toBe(false);
    expect(canTransition('offline', 'OFFER')).toBe(false);
    expect(transition('inTrip', 'COMPLETE')).toBe('summary');
  });
  it('every non-offline phase has a way out', () => {
    for (const p of ['idle', 'offer', 'toPickup', 'waiting', 'inTrip', 'summary'] as Phase[]) {
      const outs = ['GO_OFFLINE', 'SKIP', 'ARRIVE', 'START_TRIP', 'COMPLETE', 'DISMISS'].filter((e) => canTransition(p, e as never));
      expect(outs.length).toBeGreaterThan(0);
    }
  });
});

describe('order generator', () => {
  const city = getCity('vilnius');
  const base = (seed: number, scen = SCENARIOS.normal) => ({
    rng: mulberry32(seed), city, driver: city.center, scenario: scen, hour: 13, dow: 2, seq: 1, recent: [], difficulty: 'normal' as const,
  });
  it('fills every required field with sane values', () => {
    const o = generateOrder(base(7));
    expect(o.id).toMatch(/^GL-/);
    expect(o.passenger.length).toBeGreaterThan(3);
    expect(o.rating).toBeGreaterThanOrEqual(4.1);
    expect(o.rating).toBeLessThanOrEqual(5);
    expect(o.fare).toBeGreaterThanOrEqual(city.tariff.min);
    expect(o.tripKm).toBeGreaterThan(0);
    expect(o.pickupMin).toBeGreaterThanOrEqual(1);
    expect(o.ttl).toBeGreaterThan(5);
  });
  it('is reproducible for the same seed', () => {
    expect(generateOrder(base(42))).toEqual(generateOrder(base(42)));
    expect(generateOrder(base(42)).id).not.toEqual(generateOrder(base(43)).id);
  });
  it('does not repeat pickup points', () => {
    const recent: { lat: number; lng: number }[] = [];
    const rng = mulberry32(5);
    for (let i = 0; i < 25; i++) {
      const win = recent.slice(-6);
      const o = generateOrder({ ...base(1), rng, recent: win, seq: i });
      expect(win.every((r) => haversineKm(r, o.pickup.pos) > 0.05)).toBe(true);
      recent.push(o.pickup.pos);
    }
  });
  it('airport orders go to / from the airport', () => {
    const out = generateOrder({ ...base(3), forceType: 'airport_out' });
    expect(haversineKm(out.dropoff.pos, city.airport!.pos)).toBeLessThan(0.2);
    const inn = generateOrder({ ...base(3, SCENARIOS.airport), driver: city.airport!.pos, forceType: 'airport_in' });
    expect(haversineKm(inn.pickup.pos, city.airport!.pos)).toBeLessThan(0.2);
    expect(haversineKm(inn.dropoff.pos, city.airport!.pos)).toBeGreaterThan(4);
  });
  it('works anywhere on Earth (GPS far from a configured city)', () => {
    const o = generateOrder({ ...base(9), driver: { lat: 40.4168, lng: -3.7038 } });
    expect(haversineKm(o.pickup.pos, { lat: 40.4168, lng: -3.7038 })).toBeLessThan(10);
    expect(o.pickup.approx).toBe(true);
  });
  it('friday evening is busier than early morning', () => {
    expect(demandAt(18, 5)).toBeGreaterThan(demandAt(4, 2) * 3);
  });
  it('surge multiplies fare', () => {
    expect(computeFare(city.tariff, 5, 12, 2, 'standard')).toBeGreaterThan(computeFare(city.tariff, 5, 12, 1, 'standard') * 1.9);
  });
});

describe('full ride lifecycle', () => {
  it('offer → accept → arrive → start → complete updates stats', () => {
    const e = make();
    toWaiting(e);
    expect(e.getState().phase).toBe('waiting');
    expect(e.completeTrip()).toBe(false); // cannot complete before start
    expect(e.startTrip()).toBe(true);
    expect(e.getState().phase).toBe('inTrip');
    expect(run(e, () => e.getState().phase === 'summary')).toBe(true);
    const s = e.getState();
    expect(s.summary?.kind).toBe('completed');
    expect(s.stats.completed).toBe(1);
    expect(s.stats.accepted).toBe(1);
    expect(s.stats.gross).toBeGreaterThan(0);
    expect(s.stats.distanceKm).toBeGreaterThan(0);
    expect(s.history[0].status).toBe('completed');
    e.dismissSummary();
    expect(e.getState().phase).toBe('idle');
  });
  it('cannot accept a second order while one is active; cannot go offline mid-ride', () => {
    const e = make();
    toOffer(e);
    expect(e.acceptOffer()).toBe(true);
    expect(e.acceptOffer()).toBe(false);
    expect(e.skipOffer()).toBe(false);
    expect(e.goOffline()).toBe(false);
    expect(e.startTrip()).toBe(false);
  });
  it('arrive is refused while far from pickup', () => {
    const e = make();
    toOffer(e);
    e.acceptOffer();
    expect(e.arrive()).toBe(false);
  });
  it('skip and expiry are counted separately', () => {
    const e = make();
    toOffer(e);
    e.skipOffer();
    expect(e.getState().stats.skipped).toBe(1);
    expect(run(e, () => e.getState().phase === 'offer')).toBe(true);
    expect(run(e, () => e.getState().phase === 'idle')).toBe(true);
    expect(e.getState().stats.expired).toBe(1);
    expect(e.getState().stats.accepted).toBe(0);
  });
  it('driver cancel before trip and no-show timing', () => {
    const e = make();
    toWaiting(e);
    expect(e.noShow()).toBe(false); // too early
    run(e, () => e.getState().waitSec >= NOSHOW_WAIT_SEC);
    expect(e.noShow()).toBe(true);
    expect(e.getState().stats.noShows).toBe(1);
    expect(e.getState().summary?.kind).toBe('no_show');
    e.dismissSummary();
    toOffer(e);
    e.acceptOffer();
    expect(e.cancelTrip()).toBe(true);
    expect(e.getState().stats.cancelled).toBe(1);
    expect(e.getState().phase).toBe('idle');
  });
  it('passenger cancellation happens en route (forced probability)', () => {
    const e = make();
    (SCENARIOS.normal as { cancelProb: number }).cancelProb = 1;
    try {
      toOffer(e);
      e.acceptOffer();
      expect(run(e, () => e.getState().phase === 'idle')).toBe(true);
      expect(e.getState().stats.passengerCancels).toBe(1);
      expect(e.getState().history[0].status).toBe('passenger_cancelled');
    } finally { (SCENARIOS.normal as { cancelProb: number }).cancelProb = 0.06; }
  });
  it('speed multiplier shortens real time to destination', () => {
    const t = (speed: 1 | 2 | 5) => {
      const e = make({ speed });
      toWaiting(e);
      e.startTrip();
      let n = 0;
      while (e.getState().phase === 'inTrip' && n < 100000) { e.tick(100); n++; }
      return n;
    };
    expect(t(5)).toBeLessThan(t(1) * 0.4);
  });
});

describe('scenarios', () => {
  it('night is slower than rush hour', () => {
    const count = (id: 'rush' | 'night') => {
      const e = make({ demo: false, speed: 5 });
      e.startScenario(id);
      let offers = 0;
      let simSec = 0;
      while (simSec < 3600 && offers < 500) {
        e.tick(100); simSec += 0.5;
        if (e.getState().phase === 'offer') { offers++; e.skipOffer(); }
      }
      return offers;
    };
    expect(count('rush')).toBeGreaterThan(count('night') * 2);
  });
  it('airport scenario starts at the airport with a queue, then offers an airport pickup', () => {
    const e = make({ demo: false, speed: 5 });
    e.startScenario('airport');
    const air = getCity('vilnius').airport!.pos;
    expect(haversineKm(e.getState().driver.pos, air)).toBeLessThan(0.1);
    run(e, () => e.getState().phase === 'offer', 100000);
    expect(e.getState().queuePos).toBe(0);
    expect(e.getState().offer?.type).toBe('airport_in');
  });
  it('manual scenario stops after N orders', () => {
    const e = make({ speed: 5 });
    e.startScenario('manual', { orderCount: 3, perHour: 120, avgFare: 12 });
    let seen = 0;
    run(e, () => { if (e.getState().phase === 'offer') { seen++; e.skipOffer(); } return e.getState().scenarioDone; }, 200000);
    expect(seen).toBe(3);
    expect(e.getState().scenarioDone).toBe(true);
  });
  it('same seed gives same first order; manual avg fare scales prices', () => {
    const first = () => { const e = make(); e.startScenario('normal'); run(e, () => e.getState().phase === 'offer'); return e.getState().offer!; };
    expect(first().id).toBe(first().id);
    const fare = (avg: number) => { const e = make(); e.startScenario('manual', { avgFare: avg }); run(e, () => e.getState().phase === 'offer'); return e.getState().offer!.fare; };
    expect(fare(16)).toBeGreaterThan(fare(4));
  });
  it('cannot switch scenario mid-ride', () => {
    const e = make();
    toOffer(e);
    e.acceptOffer();
    expect(e.startScenario('night')).toBe(false);
  });
});

describe('GPS movement', () => {
  it('accepts external positions only in gps mode and accumulates distance', () => {
    const e = make({ movement: 'gps' });
    e.goOnline();
    e.setDriverPos({ lat: 54.69, lng: 25.28 }, { accuracy: 10 });
    e.setDriverPos({ lat: 54.6905, lng: 25.28 }, { accuracy: 10 });
    expect(e.getState().stats.distanceKm).toBeGreaterThan(0.04);
    const v = make({ movement: 'virtual' });
    const before = v.getState().driver.pos;
    v.setDriverPos({ lat: 1, lng: 1 });
    expect(v.getState().driver.pos).toEqual(before);
  });
});
