import { engine, uiStore, useEngine, useT, useUI } from '../store';
import { haversineKm } from '../core/geo';
import { Icon } from './Icon';
import { money, num } from './format';
import { mapApi } from './MapView';

export function TopBar() {
  const s = useEngine();
  const ui = useUI();
  const t = useT();
  const { lang, city } = s.settings;
  const searching = s.phase === 'idle';
  const label = s.phase === 'offer' ? `${Math.ceil(s.offerLeft)}s` : searching ? t('top.searching') : s.phase === 'offline' ? t('top.menu') : '●';

  const near = engine.surgeZones().filter((z) => haversineKm(z.pos, s.driver.pos) < 8).map((z) => z.surge);
  const lo = near.length ? Math.min(...near) : 1;
  const hi = near.length ? Math.max(...near) : 1;

  return (
    <>
      <button className="simstrip" onClick={() => uiStore.set({ screen: 'about' })}>
        <i className="rec" /> {t('sim.strip')}
      </button>

      <div className="topbar">
        <div className="circle-wrap">
          <button className={`circle${searching ? ' scan' : ''}${s.phase === 'offer' ? ' alert' : ''}`} onClick={() => uiStore.set({ menu: true })} aria-label={t('menu.title')}>
            <Icon name="menu" size={26} stroke={2.4} />
          </button>
          <span className="circle-label">{label}</span>
        </div>
        <button className="earn" onClick={() => uiStore.set({ screen: 'stats' })} aria-label={t('menu.stats')}>
          <span className="earn-text">
            <b>{money(s.stats.gross, lang, city)}</b>
            <small>{t(`top.orders.${new Intl.PluralRules(lang === 'lt' ? 'lt' : lang).select(s.stats.completed)}`, { n: s.stats.completed })}</small>
          </span>
          <span className="avatar">AD</span>
        </button>
      </div>

      <div className="side left">
        <button className={`surge-pill${s.settings.heat ? ' on' : ''}`} onClick={() => engine.setSettings({ heat: !s.settings.heat })} aria-pressed={s.settings.heat}>
          <Icon name="bolt" size={18} fill stroke={0} />
          <b>{num(lo, lang)}</b>
          <span>…</span>
          <b>{num(hi, lang)}</b>
        </button>
      </div>

      <div className="side right">
        <div className="zoom">
          <button onClick={mapApi.zoomIn} aria-label={t('map.zoomIn')}><Icon name="plus" size={24} /></button>
          <button onClick={mapApi.zoomOut} aria-label={t('map.zoomOut')}><Icon name="minus" size={24} /></button>
        </div>
        <button className={`round${ui.follow ? ' on' : ''}`} onClick={mapApi.center} aria-label={t('map.locate')}><Icon name="nav" size={22} fill={ui.follow} /></button>
      </div>

      {ui.pick && (
        <div className="pick-banner">
          <span>{t('toast.pickMode')}</span>
          <button onClick={() => uiStore.set({ pick: null, screen: ui.pick!.returnTo })}>{t('common.cancel')}</button>
        </div>
      )}
    </>
  );
}
