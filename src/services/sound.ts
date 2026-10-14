import type { EngineEventKind } from '../core/types';

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.18) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = c.currentTime + start;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

const PATTERNS: Partial<Record<EngineEventKind, { notes: [number, number, number][]; vib: number | number[] }>> = {
  offer: { notes: [[880, 0, 0.14], [1175, 0.16, 0.14], [880, 0.34, 0.14], [1175, 0.5, 0.2]], vib: [200, 100, 200] },
  expiring: { notes: [[440, 0, 0.12], [440, 0.18, 0.12]], vib: [80, 60, 80] },
  accepted: { notes: [[660, 0, 0.1], [990, 0.1, 0.18]], vib: 90 },
  tripStart: { notes: [[523, 0, 0.1], [659, 0.1, 0.1], [784, 0.2, 0.18]], vib: 120 },
  tripEnd: { notes: [[784, 0, 0.12], [988, 0.12, 0.12], [1319, 0.24, 0.3]], vib: [120, 60, 220] },
  passengerCancel: { notes: [[392, 0, 0.2], [294, 0.2, 0.3]], vib: [200, 80, 200] },
  arrived: { notes: [[740, 0, 0.14]], vib: 80 },
};

export function feedback(kind: EngineEventKind, opts: { sound: boolean; vibration: boolean }) {
  const p = PATTERNS[kind];
  if (!p) return;
  if (opts.sound) p.notes.forEach(([f, s, d]) => tone(f, s, d, kind === 'offer' ? 'triangle' : 'sine'));
  if (opts.vibration && 'vibrate' in navigator) {
    try { navigator.vibrate(p.vib); } catch { /* unsupported */ }
  }
}

/** Browsers block audio until a gesture; call from a click handler once. */
export const unlockAudio = () => { ac(); };
