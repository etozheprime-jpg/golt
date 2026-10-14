import { engine, toast, uiStore, useEngine, useT, useUI } from '../store';
import { ARRIVE_RADIUS_M, NOSHOW_WAIT_SEC } from '../core/engine';
import { getCity } from '../core/cities';
import { haversineKm } from '../core/geo';
import { SCENARIOS } from '../core/scenarios';
import type { Order } from '../core/types';
import { unlockAudio } from '../services/sound';
import { Icon } from './Icon';
import { clockHM, dist, hm, money, num } from './format';
import { Segmented } from './controls';
import { mapApi } from './MapView';

const dow = (d: number, lang: string) => new Date(2024, 0, 7 + d).toLocaleDateString(lang === 'ru' ? 'ru-RU' : lang === 'lt' ? 'lt-LT' : 'en-GB', { weekday: 'short' });

function SpeedControl() {
  const s = useEngine();
  const t = useT();
  return (
    <div className="speed">
      <span className="eyebrow">{t('sheet.speed')}</span>
      <Segmented<number> value={s.settings.speed} label={t('sheet.speed')} options={[1, 2, 5].map((n) => ({ id: n, label: `${n}×` }))} onChange={(v) => engine.setSettings({ speed: v as 1 | 2 | 5 })} />
    </div>
  );
}

function Timeline({ a, b, t, onlyB }: { a: Order['pickup']; b: Order['dropoff']; t: (k: string) => string; onlyB?: boolean }) {
  const nm = (p: Order['pickup']) => (p.nameKey ? t(p.nameKey) : p.name);
  return (
    <ol className="timeline">
      {!onlyB && <li><i className="dot a">A</i><div><b>{nm(a)}</b><small>{a.district}{a.approx ? ` · ${t('offer.virtualPoint')}` : ''}</small></div></li>}
      <li><i className="dot b">B</i><div><b>{nm(b)}</b><small>{b.district}{b.approx ? ` · ${t('offer.virtualPoint')}` : ''}</small></div></li>
    </ol>
  );
}

function Ring({ left, total }: { left: number; total: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const urgent = left <= 5;
  return (
    <div className={`ring${urgent ? ' urgent' : ''}`} aria-label={`${Math.ceil(left)}s`}>
      <svg viewBox="0 0 52 52" width="52" height="52">
        <circle cx="26" cy="26" r={r} className="ring-bg" />
        <circle cx="26" cy="26" r={r} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, left) / total)} transform="rotate(-90 26 26)" />
      </svg>
      <b>{Math.ceil(left)}</b>
    </div>
  );
}

function OfferCard({ o }: { o: Order }) {
  const s = useEngine();
  const t = useT();
  const { lang, city } = s.settings;
  return (
    <div className="card offer">
      <div className="card-head">
        <div>
          <span className="eyebrow">{t('offer.new')} <em className="sim-chip">{t('offer.sim')}</em></span>
          <div className="chips">
            <span className="chip">{t(`type.${o.type}`)}</span>
            {o.surge > 1 && <span className="chip hot"><Icon name="bolt" size={12} fill stroke={0} /> ×{num(o.surge, lang)}</span>}
            {o.longPickup && <span className="chip warn">{t('offer.longPickup')}</span>}
          </div>
        </div>
        <Ring left={s.offerLeft} total={o.ttl} />
      </div>
      <div className="fare-row">
        <div>
          <span className="eyebrow">{t('offer.fare')}</span>
          <div className="fare">{money(o.fare, lang, city)}</div>
        </div>
        <div className="pax">
          <b>{o.passenger}</b>
          <span><Icon name="star" size={13} fill stroke={0} /> {num(o.rating, lang, 2)}</span>
        </div>
      </div>
      <div className="metrics">
        <div><span className="eyebrow">{t('offer.pickup')}</span><b>{num(o.pickupKm, lang)} {t('unit.km')} · {o.pickupMin} {t('unit.min')}</b></div>
        <div><span className="eyebrow">{t('offer.trip')}</span><b>{num(o.tripKm, lang)} {t('unit.km')} · {o.tripMin} {t('unit.min')}</b></div>
      </div>
      <Timeline a={o.pickup} b={o.dropoff} t={t} />
      <div className="btn-row">
        <button className="btn ghost" onClick={() => engine.skipOffer()}>{t('offer.skip')}</button>
        <button className="btn primary grow" onClick={() => { unlockAudio(); engine.acceptOffer(); uiStore.set({ follow: true }); }}>{t('offer.accept')}</button>
      </div>
    </div>
  );
}

function ActiveCard({ o }: { o: Order }) {
  const s = useEngine();
  const t = useT();
  const { lang, city } = s.settings;
  const near = s.remainingM <= ARRIVE_RADIUS_M;
  const etaMin = Math.max(1, Math.ceil(s.etaSec / 60));
  const pct = Math.round(s.legProgress * 100);
  const title = s.phase === 'toPickup' ? t('active.toPickup') : s.phase === 'waiting' ? t('active.waiting') : t('active.inTrip');
  const busy = (ok: boolean) => { if (!ok) toast(t('toast.busy')); };

  return (
    <div className="card active">
      <div className="card-head">
        <div>
          <span className="eyebrow">{title} <em className="sim-chip">{t('offer.sim')}</em></span>
          <div className="pax-inline"><b>{o.passenger}</b><span><Icon name="star" size={13} fill stroke={0} /> {num(o.rating, lang, 2)}</span><span className="muted"> · {o.id}</span></div>
        </div>
        <div className="fare sm">{money(o.fare, lang, city)}</div>
      </div>

      {s.phase !== 'waiting' && (
        <>
          <div className="progress"><i style={{ width: `${pct}%` }} /></div>
          <div className="metrics">
            {s.phase === 'toPickup' ? (
              <>
                <div><span className="eyebrow">ETA</span><b>{t('active.eta', { m: etaMin })}</b></div>
                <div><span className="eyebrow">{t('offer.pickup')}</span><b>{dist(s.remainingM, t)}</b></div>
              </>
            ) : (
              <>
                <div><span className="eyebrow">{t('active.inTrip')}</span><b>{t('active.left', { km: num(s.remainingM / 1000, lang), m: etaMin })}</b></div>
                <div><span className="eyebrow">{t('offer.surge')}</span><b>×{num(o.surge, lang)}</b></div>
              </>
            )}
          </div>
          {s.jam && <div className="notice warn"><Icon name="warn" size={16} /> {t('sheet.jam')}</div>}
        </>
      )}

      {s.phase === 'waiting' && (
        <div className="metrics">
          <div><span className="eyebrow">{t('active.waiting')}</span><b className="mono">{hm(s.waitSec)}</b></div>
          <div><span className="eyebrow">{t('active.noShow')}</span><b>{s.waitSec >= NOSHOW_WAIT_SEC ? '✓' : t('active.noShowWait', { s: Math.ceil(NOSHOW_WAIT_SEC - s.waitSec) })}</b></div>
        </div>
      )}

      <Timeline a={o.pickup} b={o.dropoff} t={t} onlyB={s.phase === 'inTrip'} />

      {s.phase === 'toPickup' && (
        <>
          {!near && <p className="hint">{t('active.far', { d: dist(s.remainingM, t) })}</p>}
          <div className="btn-row">
            <button className="btn danger" onClick={() => busy(engine.cancelTrip())}>{t('active.cancel')}</button>
            <button className="btn primary grow" disabled={!near} onClick={() => busy(engine.arrive())}>{t('active.arrive')}</button>
          </div>
        </>
      )}
      {s.phase === 'waiting' && (
        <div className="stack">
          <button className="btn primary" onClick={() => engine.startTrip()}>{t('active.inCar')}</button>
          <div className="btn-row">
            <button className="btn danger" onClick={() => engine.cancelTrip()}>{t('active.cancel')}</button>
            <button className="btn ghost grow" disabled={s.waitSec < NOSHOW_WAIT_SEC} onClick={() => engine.noShow()}>{t('active.noShow')}</button>
          </div>
        </div>
      )}
      {s.phase === 'inTrip' && (
        <>
          {!near && <p className="hint">{t('active.completeFar', { d: dist(s.remainingM, t) })}</p>}
          <button className="btn primary" disabled={!near} onClick={() => engine.completeTrip()}>{t('active.complete')}</button>
        </>
      )}
    </div>
  );
}

function SummaryCard() {
  const s = useEngine();
  const t = useT();
  const sm = s.summary;
  if (!sm) return null;
  const { lang, city } = s.settings;
  return (
    <div className="card summary">
      <span className="eyebrow">{sm.kind === 'completed' ? t('summary.done') : t('summary.noShow')} <em className="sim-chip">{t('offer.sim')}</em></span>
      <div className="fare big">{money(sm.fare, lang, city)}</div>
      <p className="muted">{sm.passenger}{sm.kind === 'completed' ? ` · ${num(sm.km, lang)} ${t('unit.km')} · ${sm.min} ${t('unit.min')}` : ''}</p>
      <p className="hint">{t('summary.note')}</p>
      <button className="btn primary" onClick={() => engine.dismissSummary()}>{t('summary.ok')}</button>
    </div>
  );
}

function IdleBody() {
  const s = useEngine();
  const t = useT();
  const ui = useUI();
  const city = getCity(s.settings.city);
  const sc = SCENARIOS[s.scenarioId];
  const awayFromAirport = sc.airportQueue && city.airport && haversineKm(s.driver.pos, city.airport.pos) > 1.5;
  if (s.scenarioDone) {
    return (
      <div className="card">
        <b className="h3">{t('sheet.scenarioDone')}</b>
        <p className="muted">{t('sheet.scenarioDoneHint', { n: s.manual.orderCount })}</p>
        <div className="btn-row">
          <button className="btn ghost grow" onClick={() => uiStore.set({ screen: 'scenarios' })}>{t('menu.scenarios')}</button>
          <button className="btn primary grow" onClick={() => uiStore.set({ screen: 'stats' })}>{t('menu.stats')}</button>
        </div>
      </div>
    );
  }
  return (
    <div className="card calm">
      <div className="status-line"><span className="pulse-dot" /><b>{t('sheet.searching')}</b>
        <span className="clock mono">{dow(s.simDow, s.settings.lang)} {clockHM(s.simHour)}</span></div>
      <p className="muted">{s.dry ? t('sheet.dry') : t('sheet.searchHint')}</p>
      {s.queuePos !== null && <div className="notice"><Icon name="plane" size={16} /> {s.queuePos > 0 ? t('sheet.queue', { n: s.queuePos }) : t('sheet.queueNext')}</div>}
      {awayFromAirport && <button className="btn ghost sm" onClick={() => { if (city.airport) engine.relocate(city.airport.pos); uiStore.set({ follow: true }); toast(t('toast.moving')); }}>{t('sheet.toAirport')}</button>}
      {s.settings.movement === 'virtual' && <p className="hint"><Icon name="gps" size={13} /> {t('sheet.tapMap')}</p>}
      {!ui.follow && <button className="btn ghost sm" onClick={mapApi.center}>{t('map.locate')}</button>}
      <SpeedControl />
    </div>
  );
}

export function Dock() {
  const s = useEngine();
  const ui = useUI();
  const t = useT();
  const { phase } = s;
  const idleish = phase === 'offline' || phase === 'idle';
  const expanded = ui.sheetOpen || phase === 'offer' || phase === 'summary';

  let body;
  if (phase === 'offline') {
    body = (
      <div className="card calm">
        <b className="h3">{t('sheet.offline')}</b>
        <p className="muted">{t('sheet.offlineHint')}</p>
        <SpeedControl />
      </div>
    );
  } else if (phase === 'idle') body = <IdleBody />;
  else if (phase === 'offer' && s.offer) body = <OfferCard o={s.offer} />;
  else if (phase === 'summary') body = <SummaryCard />;
  else if (s.active) body = <ActiveCard o={s.active} />;

  return (
    <div className="dock">
      {idleish && !s.scenarioDone && (
        <button
          className={`cta${phase === 'idle' ? ' ghost' : ''}`}
          onClick={() => { unlockAudio(); if (phase === 'offline') engine.goOnline(); else engine.goOffline(); }}
        >
          {phase === 'offline' ? t('cta.online') : t('cta.offline')}
        </button>
      )}
      <section className={`sheet${expanded ? '' : ' collapsed'}`} aria-live="polite">
        <button className="grab" aria-label={t('sheet.offers')} aria-expanded={expanded} onClick={() => uiStore.set({ sheetOpen: !ui.sheetOpen })}><i /></button>
        <div className="sheet-title"><h2>{t('sheet.offers')}</h2><span className="sim-chip">{t('sim.mode')}</span></div>
        {expanded && <div className="sheet-body">{body}</div>}
      </section>
    </div>
  );
}
