export type LatLng = { lat: number; lng: number };
export type Rng = () => number;

export type Phase = 'offline' | 'idle' | 'offer' | 'toPickup' | 'waiting' | 'inTrip' | 'summary';
export type TripType = 'short' | 'standard' | 'long' | 'suburb' | 'airport_out' | 'airport_in';
export type ScenarioId = 'normal' | 'rush' | 'night' | 'airport' | 'free' | 'manual';
export type PlaceKind = 'center' | 'residential' | 'business' | 'transit' | 'airport' | 'leisure';

export interface Place {
  id: string;
  name: string;
  nameKey?: string;
  district: string;
  pos: LatLng;
  kind: PlaceKind;
  weight: number;
  streets?: string[];
}

export interface Tariff { base: number; perKm: number; perMin: number; min: number; airportFee: number }

export interface CityConfig {
  id: string;
  name: string;
  country: string;
  center: LatLng;
  currency: 'EUR' | 'PLN';
  tariff: Tariff;
  places: Place[];
  airport?: Place;
  beta?: boolean;
}

export interface OrderPlace { name: string; nameKey?: string; district: string; pos: LatLng; approx: boolean }

export interface Order {
  id: string;
  passenger: string;
  rating: number;
  pickup: OrderPlace;
  dropoff: OrderPlace;
  pickupKm: number;
  pickupMin: number;
  tripKm: number;
  tripMin: number;
  fare: number;
  surge: number;
  type: TripType;
  ttl: number;
  longPickup: boolean;
  district: string;
}

export interface Settings {
  lang: 'ru' | 'en' | 'lt';
  theme: 'dark' | 'light';
  sound: boolean;
  vibration: boolean;
  city: string;
  speed: 1 | 2 | 5;
  intensity: number;
  difficulty: 'easy' | 'normal' | 'hard';
  movement: 'virtual' | 'gps';
  virtualDrivers: boolean;
  autoComplete: boolean;
  demo: boolean;
  commissionPct: number;
  fuelPerKm: number;
  otherPerHour: number;
  startPos: LatLng | null;
  seedMode: 'fixed' | 'random';
  seed: number;
  onboarded: boolean;
  heat: boolean;
}

export interface ManualParams { orderCount: number; avgFare: number; perHour: number; startPos: LatLng | null }

export interface ShiftStats {
  accepted: number;
  completed: number;
  skipped: number;
  expired: number;
  cancelled: number;
  passengerCancels: number;
  noShows: number;
  distanceKm: number;
  pickupKmTotal: number;
  pickupCount: number;
  gross: number;
  onlineSimSec: number;
  generated: number;
}

export type TripStatus = 'completed' | 'cancelled' | 'passenger_cancelled' | 'no_show';

export interface TripRecord {
  id: string;
  ts: number;
  simHour: number;
  scenario: ScenarioId;
  passenger: string;
  from: string;
  to: string;
  km: number;
  pickupKm: number;
  min: number;
  fare: number;
  surge: number;
  status: TripStatus;
}

export interface Summary { kind: 'completed' | 'no_show'; fare: number; km: number; min: number; passenger: string; surge: number }

export type EngineEventKind =
  | 'offer' | 'expiring' | 'expired' | 'accepted' | 'arrived' | 'tripStart' | 'tripEnd'
  | 'passengerCancel' | 'cancelled' | 'skipped' | 'noShow' | 'scenarioDone' | 'online' | 'offline';
