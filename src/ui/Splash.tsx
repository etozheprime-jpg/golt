import { useEffect } from 'react';
import { engine, toast, uiStore, useEngine, useT, useUI } from '../store';
import { gps } from '../services/gps';
import { unlockAudio } from '../services/sound';
import { Wordmark } from './Icon';

export function enableGps() {
  gps.start((pos, meta) => engine.setDriverPos(pos, meta));
}

export function Splash() {
  const ui = useUI();
  const s = useEngine();
  const t = useT();
  const onboarded = s.settings.onboarded;

  useEffect(() => {
    if (!ui.splash || !onboarded) return;
    if (s.settings.movement === 'gps') enableGps();
    const id = setTimeout(() => uiStore.set({ splash: false }), 1300);
    return () => clearTimeout(id);
  }, [ui.splash, onboarded, s.settings.movement]);

  if (!ui.splash) return null;

  const begin = (useGps: boolean) => {
    unlockAudio();
    engine.setSettings({ onboarded: true, movement: useGps ? 'gps' : 'virtual' });
    if (useGps) {
      enableGps();
      if (!window.isSecureContext) toast(t('gps.s.insecure'));
    }
    uiStore.set({ splash: false });
  };

  return (
    <div className="splash">
      <div className="splash-grid" aria-hidden />
      <div className="splash-top"><span className="sim-chip">{t('sim.mode')}</span></div>
      <div className="splash-center">
        <Wordmark size={92} />
        <p className="splash-tag">{t('splash.title')}</p>
      </div>
      <div className="splash-bottom">
        {!onboarded ? (
          <>
            <button className="btn primary" onClick={() => begin(true)}>{t('splash.gps')}</button>
            <button className="btn ghost" onClick={() => begin(false)}>{t('splash.demo')}</button>
            <p className="fine">{t('splash.note')}</p>
          </>
        ) : (
          <p className="fine">{t('app.tag')} · Vilnius</p>
        )}
      </div>
    </div>
  );
}
