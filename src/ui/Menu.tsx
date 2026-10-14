import { uiStore, useEngine, useT, useUI } from '../store';
import { Icon, Wordmark } from './Icon';
import type { Screen } from '../store';

const ITEMS: { id: Screen; icon: string; key: string }[] = [
  { id: 'scenarios', icon: 'route', key: 'menu.scenarios' },
  { id: 'stats', icon: 'chart', key: 'menu.stats' },
  { id: 'history', icon: 'list', key: 'menu.history' },
  { id: 'profile', icon: 'user', key: 'menu.profile' },
  { id: 'settings', icon: 'gear', key: 'menu.settings' },
  { id: 'gps', icon: 'gps', key: 'menu.gps' },
  { id: 'about', icon: 'info', key: 'menu.about' },
];

export function Menu() {
  const ui = useUI();
  const s = useEngine();
  const t = useT();
  if (!ui.menu) return null;
  const close = () => uiStore.set({ menu: false });
  return (
    <div className="scrim" onClick={close}>
      <nav className="drawer" onClick={(e) => e.stopPropagation()} aria-label={t('menu.title')}>
        <div className="drawer-head">
          <Wordmark size={30} />
          <button className="icon-btn" onClick={close} aria-label={t('common.close')}><Icon name="close" /></button>
        </div>
        <span className="sim-chip wide">{t('sim.mode')}</span>
        <ul>
          {ITEMS.map((i) => (
            <li key={i.id}>
              <button onClick={() => uiStore.set({ menu: false, screen: i.id })}>
                <Icon name={i.icon} size={22} /><span>{t(i.key)}</span>
                {i.id === 'scenarios' && <em>{t(`sc.${s.scenarioId}`)}</em>}
                <Icon name="chev" size={16} />
              </button>
            </li>
          ))}
        </ul>
        <p className="muted small">{t('app.tag')} · v0.1</p>
      </nav>
    </div>
  );
}
