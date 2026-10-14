import { uiStore, useT } from '../../store';
import { Wordmark } from '../Icon';
import { Panel } from '../controls';

export function AboutScreen() {
  const t = useT();
  return (
    <Panel title={t('about.title')} onBack={() => uiStore.set({ screen: 'map' })}>
      <div className="about-hero">
        <Wordmark size={54} />
        <span className="sim-chip wide">{t('sim.mode')}</span>
      </div>
      <p className="lead">{t('about.lead')}</p>
      <ol className="about-list">
        {['about.p1', 'about.p2', 'about.p3', 'about.p4'].map((k, i) => (
          <li key={k}><span className="mono">{String(i + 1).padStart(2, '0')}</span><p>{t(k)}</p></li>
        ))}
      </ol>
      <p className="hint">{t('about.map')}</p>
    </Panel>
  );
}
