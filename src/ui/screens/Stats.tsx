import { engine, uiStore, useEngine, useT } from '../../store';
import { net } from '../../core/pricing';
import { Panel } from '../controls';
import { money, num } from '../format';
import type { TripRecord } from '../../core/types';

function Bars({ data, labels, fmt, empty }: { data: number[]; labels: string[]; fmt: (v: number) => string; empty: string }) {
  const max = Math.max(...data, 0);
  if (max <= 0) return <p className="muted chart-empty">{empty}</p>;
  const w = 320;
  const h = 120;
  const bw = w / data.length;
  const every = data.length > 12 ? 3 : 1;
  return (
    <svg className="bars" viewBox={`0 0 ${w} ${h + 22}`} role="img">
      <line x1="0" x2={w} y1={h} y2={h} className="axis" />
      {data.map((v, i) => {
        const bh = Math.max(v > 0 ? 3 : 0, (v / max) * (h - 18));
        return (
          <g key={i}>
            <rect x={i * bw + bw * 0.18} y={h - bh} width={bw * 0.64} height={bh} rx="1.5" className={v === max ? 'peak' : ''}><title>{`${labels[i]}: ${fmt(v)}`}</title></rect>
            {i % every === 0 && <text x={i * bw + bw / 2} y={h + 15} textAnchor="middle">{labels[i]}</text>}
          </g>
        );
      })}
      <text x={w} y="10" textAnchor="end" className="peak-label">{fmt(max)}</text>
    </svg>
  );
}

const earned = (h: TripRecord) => h.status === 'completed' || h.status === 'no_show';

export function StatsScreen() {
  const s = useEngine();
  const t = useT();
  const { lang, city, commissionPct, fuelPerKm, otherPerHour } = s.settings;
  const st = s.stats;
  const hours = st.onlineSimSec / 3600;
  const fuel = st.distanceKm * fuelPerKm;
  const other = hours * otherPerHour;
  const n = net(st.gross, commissionPct, fuel, other);
  const m = (v: number) => money(v, lang, city);
  const trips = s.history.filter(earned);

  const byHour = Array.from({ length: 24 }, () => 0);
  trips.forEach((h) => { byHour[Math.floor(h.simHour) % 24] += h.fare; });
  const days: { label: string; v: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const end = d.getTime() + 86400000;
    days.push({ label: d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : lang === 'lt' ? 'lt-LT' : 'en-GB', { weekday: 'short' }), v: trips.filter((h) => h.ts >= d.getTime() && h.ts < end).reduce((a, h) => a + h.fare, 0) });
  }
  const hh = Math.floor(st.onlineSimSec / 3600);
  const mm = Math.floor((st.onlineSimSec % 3600) / 60);
  const kpis: [string, string][] = [
    [t('stats.accepted'), String(st.accepted)],
    [t('stats.completed'), String(st.completed)],
    [t('stats.skipped'), String(st.skipped + st.expired)],
    [t('stats.cancels'), String(st.cancelled + st.passengerCancels)],
    [t('stats.noShows'), String(st.noShows)],
    [t('stats.distance'), `${num(st.distanceKm, lang)} ${t('unit.km')}`],
    [t('stats.online'), `${hh}${t('unit.h')} ${String(mm).padStart(2, '0')}${t('unit.min')}`],
    [t('stats.avgFare'), st.completed ? m(st.gross / st.completed) : '—'],
    [t('stats.perHour'), hours > 0.01 ? m(st.gross / hours) : '—'],
    [t('stats.avgPickup'), st.pickupCount ? `${num(st.pickupKmTotal / st.pickupCount, lang)} ${t('unit.km')}` : '—'],
  ];

  return (
    <Panel title={t('stats.title')} onBack={() => uiStore.set({ screen: 'map' })}>
      <div className="hero">
        <span className="eyebrow">{t('stats.earnings')} <em className="sim-chip">{t('offer.sim')}</em></span>
        <div className="hero-num">{m(st.gross)}</div>
      </div>

      <div className="ledger">
        <div><span>{t('stats.income')}</span><b>{m(st.gross)}</b></div>
        <div><span>− {t('stats.commission')} ({commissionPct}%)</span><b>{m(n.commission)}</b></div>
        <div><span>− {t('stats.fuel')}</span><b>{m(fuel)}</b></div>
        <div><span>− {t('stats.other')}</span><b>{m(other)}</b></div>
        <div className="total"><span>= {t('stats.profit')}</span><b className={n.profit < 0 ? 'neg' : ''}>{m(n.profit)}</b></div>
      </div>

      <dl className="kpis">
        {kpis.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
      </dl>

      <section className="chart"><h2>{t('stats.byHour')}</h2>
        <Bars data={byHour} labels={byHour.map((_, i) => String(i))} fmt={m} empty={t('stats.empty')} /></section>
      <section className="chart"><h2>{t('stats.byDay')}</h2>
        <Bars data={days.map((d) => d.v)} labels={days.map((d) => d.label)} fmt={m} empty={t('stats.empty')} /></section>

      <button className="btn ghost" onClick={() => uiStore.set({ screen: 'history' })}>{t('stats.history')}</button>
      <p className="hint">{t('stats.disclaimer')}</p>
      <button className="link-danger" onClick={() => { if (confirm(t('set.resetConfirm'))) engine.resetStats(); }}>{t('set.resetStats')}</button>
    </Panel>
  );
}
