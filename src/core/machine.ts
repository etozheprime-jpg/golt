import type { Phase } from './types';

export type MachineEvent =
  | 'GO_ONLINE' | 'GO_OFFLINE' | 'OFFER' | 'ACCEPT' | 'SKIP' | 'EXPIRE'
  | 'ARRIVE' | 'START_TRIP' | 'COMPLETE' | 'NO_SHOW' | 'DRIVER_CANCEL' | 'PASSENGER_CANCEL' | 'DISMISS';

const TABLE: Record<Phase, Partial<Record<MachineEvent, Phase>>> = {
  offline: { GO_ONLINE: 'idle' },
  idle: { GO_OFFLINE: 'offline', OFFER: 'offer' },
  offer: { ACCEPT: 'toPickup', SKIP: 'idle', EXPIRE: 'idle' },
  toPickup: { ARRIVE: 'waiting', DRIVER_CANCEL: 'idle', PASSENGER_CANCEL: 'idle' },
  waiting: { START_TRIP: 'inTrip', NO_SHOW: 'summary', DRIVER_CANCEL: 'idle', PASSENGER_CANCEL: 'idle' },
  inTrip: { COMPLETE: 'summary' },
  summary: { DISMISS: 'idle' },
};

/** Returns the next phase, or null when the event is illegal in the current phase. */
export function transition(phase: Phase, event: MachineEvent): Phase | null {
  return TABLE[phase][event] ?? null;
}

export const canTransition = (p: Phase, e: MachineEvent) => transition(p, e) !== null;
export const isBusy = (p: Phase) => p === 'toPickup' || p === 'waiting' || p === 'inTrip';
