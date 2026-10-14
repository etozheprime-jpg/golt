import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { useT } from '../store';

export function Panel({ title, onBack, children, right }: { title: string; onBack: () => void; children: ReactNode; right?: ReactNode }) {
  const t = useT();
  return (
    <div className="panel" role="dialog" aria-label={title}>
      <header className="panel-head">
        <button className="icon-btn" onClick={onBack} aria-label={t('common.back')}><Icon name="back" /></button>
        <h1>{title}</h1>
        <div className="panel-right">{right}</div>
      </header>
      <div className="panel-body">{children}</div>
    </div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.id)} role="radio" aria-checked={o.id === value} className={o.id === value ? 'on' : ''} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className="row toggle" role="switch" aria-checked={value} onClick={() => onChange(!value)}>
      <span className="row-text"><b>{label}</b>{hint && <small>{hint}</small>}</span>
      <span className={`switch${value ? ' on' : ''}`}><i /></span>
    </button>
  );
}

export function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string }) {
  return (
    <label className="row slider">
      <span className="row-text"><b>{label}</b></span>
      <span className="slider-val">{format(value)}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function NumField({ label, value, step = 1, min = 0, max = 999, onChange, suffix }: { label: string; value: number; step?: number; min?: number; max?: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <label className="row numfield">
      <span className="row-text"><b>{label}</b></span>
      <span className="numbox">
        <input type="number" inputMode="decimal" value={value} step={step} min={min} max={max} onChange={(e) => { const v = Number(e.target.value); if (!Number.isNaN(v)) onChange(Math.min(max, Math.max(min, v))); }} />
        {suffix && <em>{suffix}</em>}
      </span>
    </label>
  );
}

export const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="section"><h2>{title}</h2><div className="section-body">{children}</div></section>
);
