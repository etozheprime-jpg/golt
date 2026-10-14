import { useEffect } from 'react';
import { MapView } from './MapView';
import { Dock } from './Dock';
import { TopBar } from './TopBar';
import { Menu } from './Menu';
import { Splash } from './Splash';
import { ScenariosScreen } from './screens/Scenarios';
import { StatsScreen } from './screens/Stats';
import { HistoryScreen } from './screens/History';
import { ProfileScreen } from './screens/Profile';
import { SettingsScreen } from './screens/Settings';
import { GpsScreen } from './screens/Gps';
import { AboutScreen } from './screens/About';
import { engine, toast, uiStore, useEngine, useUI } from '../store';
import { feedback } from '../services/sound';
import type { EngineEventKind, LatLng } from '../core/types';
import { translate } from '../i18n';

const TOASTS: Partial<Record<EngineEventKind, string>> = {
  accepted: 'toast.accepted', arrived: 'toast.arrived', tripStart: 'toast.tripStart', tripEnd: 'toast.tripEnd', expired: 'toast.expired',
  expiring: 'toast.expiring', cancelled: 'toast.cancelled', passengerCancel: 'toast.passengerCancel', noShow: 'toast.noShow',
  scenarioDone: 'toast.scenarioDone', offline: 'toast.offline',
};

function onMapClick(p: LatLng) {
  const u = uiStore.get();
  const t = (k: string) => translate(engine.getState().settings.lang, k);
  if (u.pick) {
    if (u.pick.target === 'start') engine.setStartPos(p);
    else engine.setManual({ startPos: p });
    uiStore.set({ pick: null, screen: u.pick.returnTo });
    toast(t('toast.startSet'));
    return;
  }
  if (engine.relocate(p)) { uiStore.set({ follow: true }); toast(t('toast.moving')); }
}

export function App() {
  const s = useEngine();
  const ui = useUI();

  useEffect(() => {
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      engine.tick(now - last);
      last = now;
    }, 100);
    const off = engine.on((k) => {
      const st = engine.getState().settings;
      feedback(k, { sound: st.sound, vibration: st.vibration });
      const key = TOASTS[k];
      if (key) toast(translate(st.lang, key));
    });
    const flush = () => engine.persistNow();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => document.hidden && flush());
    return () => { clearInterval(id); off(); window.removeEventListener('pagehide', flush); };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = s.settings.theme;
    document.documentElement.lang = s.settings.lang;
  }, [s.settings.theme, s.settings.lang]);

  const screen = ui.screen;
  return (
    <div className="stage">
      <div className="phone">
        <MapView onClick={onMapClick} />
        <TopBar />
        <Dock />
        {ui.toast && <div className="toast" role="status" key={ui.toast.id}>{ui.toast.text}</div>}
        <Menu />
        {screen === 'scenarios' && <ScenariosScreen />}
        {screen === 'stats' && <StatsScreen />}
        {screen === 'history' && <HistoryScreen />}
        {screen === 'profile' && <ProfileScreen />}
        {screen === 'settings' && <SettingsScreen />}
        {screen === 'gps' && <GpsScreen />}
        {screen === 'about' && <AboutScreen />}
        <Splash />
      </div>
    </div>
  );
}
