import { uiStore, useEngine, useT } from '../../store';
import { Wordmark } from '../Icon';
import { Panel } from '../controls';
import { money, num } from '../format';

export function ProfileScreen() {
  const s = useEngine();
  const t = useT();
  const { lang, city } = s.settings;
  const rating = Math.max(4, 5 - (s.stats.cancelled + s.stats.expired) * 0.01);
  return (
    <Panel title={t('profile.title')} onBack={() => uiStore.set({ screen: 'map' })}>
      <div className="profile-card">
        <span className="avatar xl">AD</span>
        <div>
          <Wordmark size={22} />
          <h2>{t('profile.name')}</h2>
          <span className="sim-chip">{t('sim.fictional')}</span>
        </div>
      </div>
      <dl className="kpis one">
        <div><dt>{t('profile.id')}</dt><dd className="mono">GL-DEMO-0001</dd></div>
        <div><dt>{t('profile.car')}</dt><dd>{t('profile.carName')}</dd></div>
        <div><dt>{t('profile.rating')}</dt><dd>{num(rating, lang, 2)} ★</dd></div>
        <div><dt>{t('profile.trips')}</dt><dd>{s.stats.completed}</dd></div>
        <div><dt>{t('stats.income')}</dt><dd>{money(s.stats.gross, lang, city)}</dd></div>
        <div><dt>{t('profile.since')}</dt><dd className="mono">0.1.0</dd></div>
      </dl>
      <p className="hint">{t('profile.note')}</p>
    </Panel>
  );
}
