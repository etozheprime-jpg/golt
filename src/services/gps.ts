export type GpsStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable' | 'timeout' | 'insecure' | 'unsupported';

export interface GpsState {
  status: GpsStatus;
  lat?: number;
  lng?: number;
  accuracy?: number;
  heading?: number | null;
  speed?: number | null;
  ts?: number;
  fixes: number;
}

type Fix = (pos: { lat: number; lng: number }, meta: { heading: number | null; speedMps: number | null; accuracy: number }) => void;

class Gps {
  private state: GpsState = { status: 'idle', fixes: 0 };
  private listeners = new Set<() => void>();
  private watchId: number | null = null;
  private onFix: Fix | null = null;

  getState = () => this.state;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private set(p: Partial<GpsState>) { this.state = { ...this.state, ...p }; this.listeners.forEach((l) => l()); }

  /** Starts watching only after an explicit user action; coordinates stay on-device. */
  start(onFix: Fix) {
    this.onFix = onFix;
    if (!('geolocation' in navigator)) return this.set({ status: 'unsupported' });
    if (!window.isSecureContext) return this.set({ status: 'insecure' });
    if (this.watchId !== null) return;
    this.set({ status: 'requesting' });
    this.watchId = navigator.geolocation.watchPosition(
      (p) => {
        const { latitude: lat, longitude: lng, accuracy, heading, speed } = p.coords;
        this.set({ status: 'active', lat, lng, accuracy, heading, speed, ts: p.timestamp, fixes: this.state.fixes + 1 });
        this.onFix?.({ lat, lng }, { heading, speedMps: speed, accuracy });
      },
      (err) => {
        const status: GpsStatus = err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable';
        this.set({ status });
        if (err.code === 1) this.stop(false);
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );
  }

  stop(resetStatus = true) {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    if (resetStatus) this.set({ status: 'idle' });
  }
}

export const gps = new Gps();
