import type { Tariff, TripType } from './types';

export function computeFare(t: Tariff, km: number, min: number, surge: number, type: TripType, scale = 1): number {
  const raw = t.base + t.perKm * km + t.perMin * min;
  const air = type === 'airport_in' || type === 'airport_out' ? t.airportFee : 0;
  const fare = Math.max(t.min, raw) * surge * scale + air;
  return Math.round(fare * 10) / 10;
}

export const net = (gross: number, commissionPct: number, fuel: number, other: number) => {
  const commission = (gross * commissionPct) / 100;
  return { commission, fuel, other, profit: gross - commission - fuel - other };
};
