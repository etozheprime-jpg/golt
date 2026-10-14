import { useEffect, useState, useSyncExternalStore } from 'react';
import { engine, toast, uiStore, useEngine, useT } from '../../store';
import { gps } from '../../services/gps';
import { isBusy } from '../../core/machine';
import { getCity } from '../../core/cities';
import { Panel, Section } from '../controls';
import { enableGps } from '../Splash';
import { num } from '../format';

export function GpsScreen() {
  const g = useSyncExternalStore(gps.subscribe, gps.getState);
  const s = useEngine();
  const t = useT();
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id); }, []);
  const city = getCity(s.settings.city);
  const on = g.status === 'active' || g.status === 'requesting';
  const ago = g.ts ? Math.max(0, Math.round((Date.now() - g.ts) / 1000)) : null;
  const sp = s.settings.startPos;

  return (
    <Panel title={t('gps.title')} onBack={() => uiStore.set({ screen: 'map' })}>
      <div className={`gps-status st-${g.status}`}>
        <span className="eyebrow">{t('gps.status')}</span>
        <b>{t(`gps.s.${g.status}`)}</b>
      </div>

      <div className="btn-row">
        {!on ? (
          <button className="btn primary grow" onClick={() => {
            if (isBusy(s.phase)) return toast(t('toast.busy'));
            engine.setSettings({ movement: 'gps' });
            enableGps();
            uiStore.set({ follow: true });
          }}>{t('gps.enable')}</button>
        ) : (
          <button className="btn ghost grow" onClick={() => { gps.stop(); engine.setSettings({ movement: 'virtual' }); }}>{t('gps.disable')}</button>
        )}
      </div>

      <dl className="kpis one">
        <div><dt>{t('gps.coords')}</dt><dd className="mono">{g.lat !== undefined ? `${g.lat.toFixed(5)}, ${g.lng!.toFixed(5)}` : t('gps.never')}</dd></div>
        <div><dt>{t('gps.accuracy')}</dt><dd>{g.accuracy !== undefined ? `±${Math.round(g.accuracy)} ${t('unit.m')}` : '—'}</dd></div>
        <div><dt>{t('gps.updated')}</dt><dd>{ago !== null ? t('gps.ago', { s: ago }) : t('gps.never')}</dd></div>
        <div><dt>{t('gps.heading')}</dt><dd>{g.heading != null && !Number.isNaN(g.heading) ? `${Math.round(g.heading)}°` : '—'}</dd></div>
        <div><dt>{t('gps.speed')}</dt><dd>{g.speed != null ? `${num(g.speed * 3.6, s.settings.lang, 0)} ${t('unit.kmh')}` : '—'}</dd></div>
      </dl>
      <p className="hint">{t('gps.privacy')}</p>
      <p className="hint">{t('gps.hereNote')}</p>

      <Section title={t('gps.manualStart')}>
        <div className="row col">
          <b>{t('gps.preset')}</b>
          <select className="select" value="" onChange={(e) => {
            const p = [...city.places, ...(city.airport ? [city.airport] : [])].find((x) => x.id === e.target.value);
            if (p) { engine.setStartPos(p.pos); toast(t('toast.startSet')); }
          }}>
            <option value="">—</option>
            {[...city.places, ...(city.airport ? [city.airport] : [])].map((p) => <option key={p.id} value={p.id}>{p.district} · {p.name}</option>)}
          </select>
        </div>
        <div className="btn-row">
          <button className="btn ghost grow" onClick={() => uiStore.set({ pick: { target: 'start', returnTo: 'gps' }, screen: 'map', follow: false })}>{t('gps.pick')}</button>
          {sp && <button className="btn ghost" onClick={() => engine.setStartPos(null)}>{t('gps.clearStart')}</button>}
        </div>
        {sp && <p className="muted mono small">{sp.lat.toFixed(5)}, {sp.lng.toFixed(5)}</p>}
      </Section>
    </Panel>
  );
}
