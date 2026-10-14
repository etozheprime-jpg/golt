import { CITIES, getCity } from './cities';
import { generateOrder } from './generator';
import { bearing, destination, fallbackRoute, haversineKm, pointAt, type Route } from './geo';
import { canTransition, isBusy } from './machine';
import { DEFAULT_SEEDS, SCENARIOS, demandAt, districtSurge, trafficSpeedKmh } from './scenarios';
import { expo, mulberry32, range } from './rng';
import type {
  EngineEventKind, LatLng, ManualParams, Order, Phase, Rng, ScenarioId, Settings, ShiftStats, Summary, TripRecord, TripStatus, TripType,
} from './types';

export const ARRIVE_RADIUS_M = 150;
export const NOSHOW_WAIT_SEC = 90;
export const EXPIRING_AT_SEC = 5;

export const DEFAULT_SETTINGS: Settings = {
  lang: 'ru', theme: 'dark', sound: true, vibration: true, city: 'vilnius', speed: 1, intensity: 1, difficulty: 'normal',
  movement: 'virtual', virtualDrivers: true, autoComplete: true, demo: false, commissionPct: 15, fuelPerKm: 0.09, otherPerHour: 0,
  startPos: null, seedMode: 'fixed', seed: 0, onboarded: false, heat: true,
};
export const DEFAULT_MANUAL: ManualParams = { orderCount: 8, avgFare: 8, perHour: 20, startPos: null };

export const emptyStats = (): ShiftStats => ({
  accepted: 0, completed: 0, skipped: 0, expired: 0, cancelled: 0, passengerCancels: 0, noShows: 0,
  distanceKm: 0, pickupKmTotal: 0, pickupCount: 0, gross: 0, onlineSimSec: 0, generated: 0,
});

export interface OtherDriver { id: number; pos: LatLng; heading: number }
export interface Persisted { settings: Settings; stats: ShiftStats; history: TripRecord[]; seq: number; manual: ManualParams }

export interface EngineState {
  phase: Phase;
  settings: Settings;
  manual: ManualParams;
  scenarioId: ScenarioId;
  scenarioDone: boolean;
  ordersGenerated: number;
  simTime: number;
  simHour: number;
  simDow: number;
  driver: { pos: LatLng; heading: number; speedKmh: number };
  offer: Order | null;
  offerLeft: number;
  active: Order | null;
  waitSec: number;
  remainingM: number;
  etaSec: number;
  legProgress: number;
  legKind: 'pickup' | 'trip' | 'relocate' | null;
  routes: { pickup: LatLng[] | null; trip: LatLng[] | null };
  summary: Summary | null;
  queuePos: number | null;
  dry: boolean;
  jam: boolean;
  others: OtherDriver[];
  stats: ShiftStats;
  history: TripRecord[];
}

export type Router = (a: LatLng, b: LatLng) => Promise<Route | null>;
export interface EngineOptions { persisted?: Partial<Persisted>; router?: Router | null; persist?: (p: Persisted) => void; now?: () => number }

export class Engine {
  private s: EngineState;
  private listeners = new Set<() => void>();
  private evListeners = new Set<(k: EngineEventKind, d?: unknown) => void>();
  private rng: Rng = mulberry32(1);
  private fx: Rng = mulberry32(99);
  private route: Route | null = null;
  private progressM = 0;
  private legTotal = 1;
  private legSpeedMps = 8;
  private legTarget: LatLng | null = null;
  private legToken = 0;
  private nextOfferAt = Infinity;
  private cancelAtFrac: number | null = null;
  private clusterLeft = 0;
  private clusterDistrict: string | undefined;
  private recent: LatLng[] = [];
  private jamLeft = 0;
  private warned = false;
  private queueTimer = 0;
  private forceNext: TripType | undefined;
  private seq: number;
  private startHour = 13;
  private startDow = 2;
  private tripStartSim = 0;
  private lastGps: LatLng | null = null;
  private othersCenter: LatLng | null = null;
  private dirty = false;
  private lastPersist = 0;
  private router: Router | null;
  private persistFn?: (p: Persisted) => void;
  private now: () => number;

  constructor(opts: EngineOptions = {}) {
    const p = opts.persisted ?? {};
    const settings = { ...DEFAULT_SETTINGS, ...p.settings };
    const city = getCity(settings.city);
    this.router = opts.router ?? null;
    this.persistFn = opts.persist;
    this.now = opts.now ?? Date.now;
    this.seq = p.seq ?? 0;
    this.s = {
      phase: 'offline', settings, manual: { ...DEFAULT_MANUAL, ...p.manual }, scenarioId: 'normal', scenarioDone: false, ordersGenerated: 0,
      simTime: 0, simHour: 13, simDow: 2,
      driver: { pos: settings.startPos ?? city.center, heading: 0, speedKmh: 0 },
      offer: null, offerLeft: 0, active: null, waitSec: 0, remainingM: 0, etaSec: 0, legProgress: 0, legKind: null,
      routes: { pickup: null, trip: null }, summary: null, queuePos: null, dry: false, jam: false, others: [],
      stats: { ...emptyStats(), ...p.stats }, history: p.history ?? [],
    };
    this.seedRng('normal');
    this.syncClock();
    this.spawnOthers();
  }

  // ---------- store API
  getState = () => this.s;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  on = (fn: (k: EngineEventKind, d?: unknown) => void) => { this.evListeners.add(fn); return () => { this.evListeners.delete(fn); }; };
  setRouter(r: Router | null) { this.router = r; }

  private set(p: Partial<EngineState>) { this.s = { ...this.s, ...p }; }
  private emit() { this.listeners.forEach((l) => l()); }
  private fire(k: EngineEventKind, d?: unknown) { this.evListeners.forEach((l) => l(k, d)); }
  private touch() { this.dirty = true; }
  private get sc() { return SCENARIOS[this.s.scenarioId]; }
  private get city() { return getCity(this.s.settings.city); }

  persistNow() {
    this.dirty = false;
    this.lastPersist = this.now();
    this.persistFn?.({ settings: this.s.settings, stats: this.s.stats, history: this.s.history, seq: this.seq, manual: this.s.manual });
  }

  // ---------- clock & schedule
  private seedRng(id: ScenarioId) {
    const { seedMode, seed } = this.s.settings;
    const base = seedMode === 'random' ? this.now() : DEFAULT_SEEDS[id] + seed;
    this.rng = mulberry32(base);
    this.fx = mulberry32(base ^ 0x9e3779b9);
  }

  private syncClock() {
    const secs = this.startHour * 3600 + this.s.simTime;
    this.s = { ...this.s, simHour: (secs / 3600) % 24, simDow: (this.startDow + Math.floor(secs / 86400)) % 7 };
  }

  private scheduleNext(first = false) {
    const sc = this.sc;
    const { settings, manual, simTime, simHour, simDow } = this.s;
    let mean = this.s.scenarioId === 'manual' ? 3600 / Math.max(1, manual.perHour) : sc.meanIntervalSec / demandAt(simHour, simDow);
    mean /= settings.intensity;
    if (settings.demo) mean *= 0.25;
    let gap = first ? range(this.rng, 3, 9) : Math.min(600, Math.max(8, expo(this.rng, mean)));
    if (first && settings.demo) gap = 2;
    let dry = false;
    if (!first && !settings.demo && this.rng() < sc.dryChance) { gap += range(this.rng, 150, 360); dry = true; }
    this.nextOfferAt = simTime + gap;
    this.set({ dry });
  }

  // ---------- legs / routes
  private setLeg(kind: 'pickup' | 'trip' | 'relocate', from: LatLng, to: LatLng) {
    const token = ++this.legToken;
    const r = fallbackRoute(from, to);
    this.route = r;
    this.progressM = 0;
    this.legTotal = r.totalM || 1;
    this.legTarget = to;
    const { simHour } = this.s;
    const base = kind === 'relocate' ? 35 * this.sc.traffic : trafficSpeedKmh(simHour, this.sc.traffic) * (kind === 'trip' && this.s.active && this.s.active.tripKm > 8 ? 1.3 : 1);
    this.legSpeedMps = Math.max(3, base / 3.6);
    this.set({ legKind: kind, routes: this.withRoute(kind, r.pts) });
    if (this.router && kind !== 'relocate') {
      this.router(from, to).then((rr) => {
        if (token !== this.legToken || !rr || rr.totalM < 30) return;
        const frac = this.progressM / this.legTotal;
        this.route = rr;
        this.legTotal = rr.totalM;
        this.progressM = frac * rr.totalM;
        const a = this.s.active;
        const km = Math.round(rr.totalM / 100) / 10;
        const spd = this.legSpeedMps * 3.6;
        if (a && kind === 'pickup') this.set({ active: { ...a, pickupKm: km, pickupMin: Math.max(1, Math.ceil((km / spd) * 60)) } });
        if (a && kind === 'trip') this.set({ active: { ...a, tripKm: km, tripMin: Math.max(3, Math.ceil((km / spd) * 60)) } });
        this.set({ routes: this.withRoute(kind, rr.pts) });
        this.refresh();
        this.emit();
      }).catch(() => undefined);
    }
  }

  private withRoute(kind: 'pickup' | 'trip' | 'relocate', pts: LatLng[]) {
    const r = { ...this.s.routes };
    if (kind === 'pickup') r.pickup = pts;
    else if (kind === 'trip') { r.pickup = null; r.trip = pts; }
    return r;
  }

  private clearLeg() { this.legToken++; this.route = null; this.legTarget = null; this.set({ legKind: null, remainingM: 0, etaSec: 0, legProgress: 0 }); }

  private remainingM(): number {
    if (!this.legTarget) return 0;
    if (this.s.settings.movement === 'gps') return haversineKm(this.s.driver.pos, this.legTarget) * 1000;
    return this.route ? Math.max(0, this.route.totalM - this.progressM) : 0;
  }

  private refresh() {
    const remaining = this.remainingM();
    const spd = this.legSpeedMps * (this.jamLeft > 0 ? 0.4 : 1);
    const total = this.s.settings.movement === 'gps' ? Math.max(this.legTotal, remaining) : this.legTotal;
    this.set({ remainingM: remaining, etaSec: remaining / spd, legProgress: this.legTarget ? Math.min(1, Math.max(0, 1 - remaining / (total || 1))) : 0, jam: this.jamLeft > 0 });
  }

  private moveAlong(sdt: number) {
    if (!this.route || this.s.settings.movement !== 'virtual') return;
    const spd = this.legSpeedMps * (this.jamLeft > 0 ? 0.4 : 1);
    const dm = Math.min(spd * sdt, this.route.totalM - this.progressM);
    if (dm <= 0) return;
    this.progressM += dm;
    const { pos, heading } = pointAt(this.route, this.progressM);
    const stats = { ...this.s.stats, distanceKm: this.s.stats.distanceKm + dm / 1000 };
    this.set({ driver: { pos, heading, speedKmh: spd * 3.6 }, stats });
  }

  // ---------- virtual drivers
  private spawnOthers() {
    const { settings, driver } = this.s;
    if (!settings.virtualDrivers) { this.set({ others: [] }); return; }
    const airportScene = this.sc.airportQueue && this.city.airport && haversineKm(driver.pos, this.city.airport.pos) < 2;
    const c = airportScene ? this.city.airport!.pos : driver.pos;
    this.othersCenter = c;
    const n = airportScene ? 7 : 10;
    const others = Array.from({ length: n }, (_, i) => ({
      id: i, pos: destination(c, airportScene ? range(this.fx, 0.1, 0.45) : range(this.fx, 0.6, 4), this.fx() * 360), heading: this.fx() * 360,
    }));
    this.set({ others });
  }

  private stepOthers(sdt: number) {
    if (!this.s.others.length) return;
    const air = this.sc.airportQueue && this.city.airport && this.othersCenter && haversineKm(this.othersCenter, this.city.airport.pos) < 0.1;
    if (this.othersCenter && haversineKm(this.s.driver.pos, this.othersCenter) > 8 && !air) this.spawnOthers();
    const others = this.s.others.map((o) => {
      if (air) return o;
      const heading = (o.heading + (this.fx() - 0.5) * 40 + 360) % 360;
      return { ...o, heading, pos: destination(o.pos, (7 * Math.min(sdt, 5)) / 1000, heading) };
    });
    this.set({ others });
  }

  // ---------- tick
  tick(dtMs: number) {
    const dt = Math.min(dtMs, 1000) / 1000;
    const speed = this.s.settings.speed;
    const sdt = dt * speed;
    const phase = this.s.phase;
    if (phase !== 'offline') {
      this.set({ simTime: this.s.simTime + sdt, stats: { ...this.s.stats, onlineSimSec: this.s.stats.onlineSimSec + sdt } });
      this.syncClock();
    }
    if ((phase === 'toPickup' || phase === 'inTrip') && this.sc.jamChance > 0) {
      if (this.jamLeft > 0) this.jamLeft -= sdt;
      else if (this.fx() < (this.sc.jamChance * sdt) / 60) this.jamLeft = range(this.fx, 25, 50);
    } else this.jamLeft = 0;

    switch (phase) {
      case 'offline': this.moveAlong(sdt); this.afterRelocate(); break;
      case 'idle': this.tickIdle(sdt); break;
      case 'offer': this.tickOffer(dt); break;
      case 'toPickup': this.moveAlong(sdt); this.tickToPickup(); break;
      case 'waiting': this.set({ waitSec: this.s.waitSec + sdt }); break;
      case 'inTrip': this.moveAlong(sdt); this.tickInTrip(); break;
      default: break;
    }
    this.stepOthers(sdt);
    this.refresh();
    this.emit();
    if (this.dirty && this.now() - this.lastPersist > 1500) this.persistNow();
  }

  private afterRelocate() {
    if (this.s.legKind === 'relocate' && this.remainingM() < 8) { this.clearLeg(); this.spawnOthers(); }
  }

  private tickIdle(sdt: number) {
    this.moveAlong(sdt);
    this.afterRelocate();
    const { city } = this;
    const sc = this.sc;
    if (sc.airportQueue && city.airport) {
      const at = haversineKm(this.s.driver.pos, city.airport.pos) < 1.5;
      if (at && this.s.queuePos === null) { this.set({ queuePos: 3 + Math.floor(this.rng() * 6) }); this.queueTimer = range(this.rng, 20, 40); }
      if (!at && this.s.queuePos !== null) this.set({ queuePos: null });
      const q = this.s.queuePos;
      if (q !== null && q > 0) {
        this.queueTimer -= sdt;
        if (this.queueTimer <= 0) {
          const nq = q - 1;
          this.queueTimer = range(this.rng, 20, 40);
          this.set({ queuePos: nq });
          if (nq === 0) { this.forceNext = 'airport_in'; this.nextOfferAt = this.s.simTime + 3; }
        }
        return;
      }
    }
    if (this.s.scenarioId === 'manual' && this.s.ordersGenerated >= this.s.manual.orderCount) {
      if (!this.s.scenarioDone) { this.set({ scenarioDone: true }); this.nextOfferAt = Infinity; this.fire('scenarioDone'); }
      return;
    }
    if (this.s.simTime >= this.nextOfferAt) this.makeOffer();
  }

  private makeOffer() {
    const { settings, manual, driver, simHour, simDow } = this.s;
    const sc = this.sc;
    const forced = this.forceNext;
    this.forceNext = undefined;
    this.seq += 1;
    const order = generateOrder({
      rng: this.rng, city: this.city, driver: driver.pos, scenario: sc, hour: simHour, dow: simDow, seq: this.seq, recent: this.recent,
      difficulty: settings.difficulty, fareScale: this.s.scenarioId === 'manual' ? manual.avgFare / 8 : 1, forceType: forced,
      clusterDistrict: this.clusterLeft > 0 ? this.clusterDistrict : undefined,
    });
    if (this.clusterLeft > 0) this.clusterLeft -= 1;
    else if (this.rng() < sc.clusterChance) { this.clusterLeft = 2 + Math.floor(this.rng() * 2); this.clusterDistrict = order.district; }
    this.recent = [...this.recent.slice(-5), order.pickup.pos];
    this.warned = false;
    this.set({
      phase: 'offer', offer: order, offerLeft: order.ttl, ordersGenerated: this.s.ordersGenerated + 1, dry: false,
      routes: { pickup: fallbackRoute(driver.pos, order.pickup.pos).pts, trip: fallbackRoute(order.pickup.pos, order.dropoff.pos).pts },
      stats: { ...this.s.stats, generated: this.s.stats.generated + 1 },
    });
    this.touch();
    this.fire('offer', order);
  }

  private tickOffer(dt: number) {
    const left = this.s.offerLeft - dt;
    if (left <= EXPIRING_AT_SEC && !this.warned) { this.warned = true; this.fire('expiring'); }
    if (left <= 0) { this.expire(); return; }
    this.set({ offerLeft: left });
  }

  private tickToPickup() {
    if (this.cancelAtFrac !== null) {
      this.refresh();
      if (this.s.legProgress >= this.cancelAtFrac) this.passengerCancel();
    }
  }

  private tickInTrip() {
    this.refresh();
    const done = this.s.settings.movement === 'virtual' ? this.remainingM() <= 5 : this.remainingM() <= 60;
    if (done && this.s.settings.autoComplete) this.completeTrip();
  }

  // ---------- helpers for transitions
  private go(e: Parameters<typeof canTransition>[1]): boolean { return canTransition(this.s.phase, e); }
  private record(status: TripStatus, o: Order, fare: number, min: number, km: number) {
    const rec: TripRecord = {
      id: o.id, ts: this.now(), simHour: this.s.simHour, scenario: this.s.scenarioId, passenger: o.passenger,
      from: o.pickup.name, to: o.dropoff.name, km, pickupKm: o.pickupKm, min, fare, surge: o.surge, status,
    };
    this.set({ history: [rec, ...this.s.history].slice(0, 500) });
  }
  private toIdle(extra: Partial<EngineState> = {}) {
    this.clearLeg();
    this.cancelAtFrac = null;
    this.set({ phase: 'idle', offer: null, active: null, summary: null, waitSec: 0, routes: { pickup: null, trip: null }, ...extra });
    this.scheduleNext();
    this.touch();
  }

  // ---------- public actions
  goOnline(): boolean {
    if (!this.go('GO_ONLINE')) return false;
    this.set({ phase: 'idle', scenarioDone: false });
    this.scheduleNext(true);
    this.fire('online');
    this.touch();
    this.emit();
    return true;
  }

  goOffline(): boolean {
    if (!this.go('GO_OFFLINE')) return false;
    this.clearLeg();
    this.set({ phase: 'offline', queuePos: null, dry: false });
    this.fire('offline');
    this.touch();
    this.emit();
    return true;
  }

  acceptOffer(): boolean {
    const o = this.s.offer;
    if (!o || !this.go('ACCEPT')) return false;
    this.cancelAtFrac = this.rng() < this.sc.cancelProb ? range(this.rng, 0.25, 0.85) : null;
    this.set({
      phase: 'toPickup', active: o, offer: null, waitSec: 0, summary: null,
      stats: { ...this.s.stats, accepted: this.s.stats.accepted + 1 },
    });
    this.setLeg('pickup', this.s.driver.pos, o.pickup.pos);
    if (this.router) {
      this.router(o.pickup.pos, o.dropoff.pos).then((r) => {
        if (r && this.s.active?.id === o.id && this.s.phase !== 'inTrip') this.set({ routes: { ...this.s.routes, trip: r.pts } }), this.emit();
      }).catch(() => undefined);
    }
    this.refresh();
    this.fire('accepted', o);
    this.touch();
    this.emit();
    return true;
  }

  skipOffer(): boolean {
    if (!this.s.offer || !this.go('SKIP')) return false;
    this.set({ stats: { ...this.s.stats, skipped: this.s.stats.skipped + 1 } });
    this.toIdle();
    this.fire('skipped');
    this.emit();
    return true;
  }

  private expire() {
    if (!this.go('EXPIRE')) return;
    this.set({ stats: { ...this.s.stats, expired: this.s.stats.expired + 1 } });
    this.toIdle();
    this.fire('expired');
  }

  arrive(): boolean {
    const o = this.s.active;
    if (!o || !this.go('ARRIVE')) return false;
    if (this.remainingM() > ARRIVE_RADIUS_M) return false;
    this.cancelAtFrac = null;
    const v = this.s.settings.movement === 'virtual';
    this.clearLeg();
    this.set({
      phase: 'waiting', waitSec: 0, driver: v ? { ...this.s.driver, pos: o.pickup.pos, speedKmh: 0 } : this.s.driver,
      stats: { ...this.s.stats, pickupKmTotal: this.s.stats.pickupKmTotal + o.pickupKm, pickupCount: this.s.stats.pickupCount + 1 },
      routes: { pickup: null, trip: this.s.routes.trip },
    });
    this.fire('arrived');
    this.touch();
    this.emit();
    return true;
  }

  startTrip(): boolean {
    const o = this.s.active;
    if (!o || !this.go('START_TRIP')) return false;
    this.tripStartSim = this.s.simTime;
    this.set({ phase: 'inTrip', waitSec: 0 });
    this.setLeg('trip', this.s.driver.pos, o.dropoff.pos);
    this.refresh();
    this.fire('tripStart');
    this.emit();
    return true;
  }

  completeTrip(): boolean {
    const o = this.s.active;
    if (!o || !this.go('COMPLETE')) return false;
    if (this.remainingM() > ARRIVE_RADIUS_M) return false;
    const min = Math.max(1, Math.round((this.s.simTime - this.tripStartSim) / 60));
    const v = this.s.settings.movement === 'virtual';
    this.record('completed', o, o.fare, min, o.tripKm);
    this.clearLeg();
    this.set({
      phase: 'summary', waitSec: 0, summary: { kind: 'completed', fare: o.fare, km: o.tripKm, min, passenger: o.passenger, surge: o.surge },
      driver: v ? { ...this.s.driver, pos: o.dropoff.pos, speedKmh: 0 } : this.s.driver,
      stats: { ...this.s.stats, completed: this.s.stats.completed + 1, gross: this.s.stats.gross + o.fare },
      routes: { pickup: null, trip: null },
    });
    this.fire('tripEnd');
    this.touch();
    this.emit();
    return true;
  }

  noShowFee(o: Order) { return Math.round(Math.min(2, o.fare * 0.2) * 10) / 10; }

  noShow(): boolean {
    const o = this.s.active;
    if (!o || !this.go('NO_SHOW') || this.s.waitSec < NOSHOW_WAIT_SEC) return false;
    const fee = this.noShowFee(o);
    this.record('no_show', o, fee, 0, 0);
    this.set({
      phase: 'summary', summary: { kind: 'no_show', fare: fee, km: 0, min: 0, passenger: o.passenger, surge: 1 },
      stats: { ...this.s.stats, noShows: this.s.stats.noShows + 1, gross: this.s.stats.gross + fee },
      routes: { pickup: null, trip: null },
    });
    this.fire('noShow');
    this.touch();
    this.emit();
    return true;
  }

  cancelTrip(): boolean {
    const o = this.s.active;
    if (!o || !this.go('DRIVER_CANCEL')) return false;
    this.record('cancelled', o, 0, 0, 0);
    this.set({ stats: { ...this.s.stats, cancelled: this.s.stats.cancelled + 1 } });
    this.toIdle();
    this.fire('cancelled');
    this.emit();
    return true;
  }

  private passengerCancel() {
    const o = this.s.active;
    if (!o || !this.go('PASSENGER_CANCEL')) return;
    this.record('passenger_cancelled', o, 0, 0, 0);
    this.set({ stats: { ...this.s.stats, passengerCancels: this.s.stats.passengerCancels + 1 } });
    this.toIdle();
    this.fire('passengerCancel');
  }

  dismissSummary(): boolean {
    if (!this.go('DISMISS')) return false;
    this.toIdle();
    this.emit();
    return true;
  }

  // ---------- movement / location
  relocate(pos: LatLng): boolean {
    const { phase, settings } = this.s;
    if ((phase !== 'idle' && phase !== 'offline') || settings.movement !== 'virtual') return false;
    this.setLeg('relocate', this.s.driver.pos, pos);
    this.refresh();
    this.emit();
    return true;
  }

  teleport(pos: LatLng): boolean {
    if (isBusy(this.s.phase) || this.s.phase === 'offer') return false;
    this.clearLeg();
    this.set({ driver: { pos, heading: this.s.driver.heading, speedKmh: 0 } });
    this.spawnOthers();
    this.emit();
    return true;
  }

  setDriverPos(pos: LatLng, meta: { heading?: number | null; speedMps?: number | null; accuracy?: number } = {}) {
    if (this.s.settings.movement !== 'gps') return;
    let stats = this.s.stats;
    if (this.lastGps && this.s.phase !== 'offline' && (meta.accuracy ?? 0) <= 60) {
      const d = haversineKm(this.lastGps, pos);
      if (d > 0.005 && d < 1) stats = { ...stats, distanceKm: stats.distanceKm + d };
    }
    const heading = meta.heading != null && !Number.isNaN(meta.heading) ? meta.heading : this.lastGps && haversineKm(this.lastGps, pos) > 0.005 ? bearing(this.lastGps, pos) : this.s.driver.heading;
    this.lastGps = pos;
    this.set({ driver: { pos, heading, speedKmh: (meta.speedMps ?? 0) * 3.6 }, stats });
    if (!this.s.others.length || (this.othersCenter && haversineKm(pos, this.othersCenter) > 8)) this.spawnOthers();
    this.refresh();
    this.emit();
  }

  // ---------- scenarios & settings
  startScenario(id: ScenarioId, manual?: Partial<ManualParams>): boolean {
    if (isBusy(this.s.phase) || this.s.phase === 'offer' || this.s.phase === 'summary') return false;
    const sc = SCENARIOS[id];
    const m = { ...this.s.manual, ...manual };
    const { city } = this;
    let pos = this.s.driver.pos;
    if (id === 'manual') pos = m.startPos ?? this.s.settings.startPos ?? pos;
    else if (sc.start === 'center') pos = city.center;
    else if (sc.start === 'airport') pos = city.airport?.pos ?? city.center;
    else if (this.s.settings.movement === 'virtual' && this.s.settings.startPos) pos = this.s.settings.startPos;
    const settings = { ...this.s.settings };
    if ((id === 'manual' || sc.start !== 'current') && settings.movement === 'gps') settings.movement = 'virtual';
    this.startHour = sc.startHour === 'now' ? new Date().getHours() + new Date().getMinutes() / 60 : sc.startHour;
    this.startDow = sc.startDow === 'now' ? new Date().getDay() : sc.startDow;
    if (id === 'manual') { this.startHour = 12; this.startDow = 3; }
    this.clearLeg();
    this.recent = [];
    this.clusterLeft = 0;
    this.forceNext = undefined;
    this.s = { ...this.s, settings, manual: m };
    this.seedRng(id);
    this.set({
      scenarioId: id, scenarioDone: false, ordersGenerated: 0, simTime: 0, queuePos: null, offer: null, active: null, summary: null,
      driver: settings.movement === 'virtual' || id !== 'free' ? { pos, heading: 0, speedKmh: 0 } : this.s.driver,
      routes: { pickup: null, trip: null },
    });
    this.syncClock();
    this.spawnOthers();
    if (this.s.phase === 'offline') this.goOnline();
    else { this.set({ phase: 'idle' }); this.scheduleNext(true); }
    this.touch();
    this.emit();
    return true;
  }

  setSettings(patch: Partial<Settings>) {
    const prev = this.s.settings;
    const settings = { ...prev, ...patch };
    this.set({ settings });
    if (patch.city && patch.city !== prev.city && !isBusy(this.s.phase)) {
      const c = getCity(patch.city);
      this.clearLeg();
      this.recent = [];
      this.set({ driver: { pos: c.center, heading: 0, speedKmh: 0 }, settings: { ...settings, startPos: null } });
      this.spawnOthers();
    }
    if (patch.virtualDrivers !== undefined && patch.virtualDrivers !== prev.virtualDrivers) this.spawnOthers();
    if (patch.movement && patch.movement !== prev.movement) { this.lastGps = null; if (patch.movement === 'virtual') this.refresh(); }
    this.touch();
    this.persistNow();
    this.emit();
  }

  setManual(patch: Partial<ManualParams>) { this.set({ manual: { ...this.s.manual, ...patch } }); this.touch(); this.emit(); }

  setStartPos(pos: LatLng | null) {
    this.set({ settings: { ...this.s.settings, startPos: pos } });
    if (pos && this.s.settings.movement === 'virtual') this.teleport(pos);
    this.persistNow();
    this.emit();
  }

  resetStats() {
    this.set({ stats: emptyStats(), history: [] });
    this.seq = 0;
    this.persistNow();
    this.emit();
  }

  /** Surge multipliers for map heat layer / "surge near me" pill. */
  surgeZones(): { id: string; pos: LatLng; surge: number }[] {
    const { simHour, simDow } = this.s;
    return this.city.places.map((p) => ({ id: p.id, pos: p.pos, surge: districtSurge(p.id, p.kind, simHour, simDow, this.sc.surgeBoost) }));
  }
}

export { CITIES };
