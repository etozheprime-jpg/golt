import { engine, toast, uiStore, useEngine, useT } from '../../store';
import { CITIES } from '../../core/cities';
import { isBusy } from '../../core/machine';
import { gps } from '../../services/gps';
import { LANGS } from '../../i18n';
import { Panel, Section, Segmented, Toggle, Slider, NumField } from '../controls';
import { enableGps } from '../Splash';
import { num } from '../format';

export function SettingsScreen() {
  const s = useEngine();
  const t = useT();
  const set = s.settings;
  const cur = set.city === 'warsaw' ? 'zł' : '€';
  return (
    <Panel title={t('set.title')} onBack={() => uiStore.set({ screen: 'map' })}>
      <Section title={t('set.general')}>
        <div className="row col"><b>{t('set.language')}</b>
          <Segmented value={set.lang} options={LANGS.map((l) => ({ id: l.id, label: l.label }))} onChange={(v) => engine.setSettings({ lang: v })} /></div>
        <div className="row col"><b>{t('set.theme')}</b>
          <Segmented value={set.theme} options={[{ id: 'dark', label: t('set.dark') }, { id: 'light', label: t('set.light') }]} onChange={(v) => engine.setSettings({ theme: v })} /></div>
        <Toggle label={t('set.sound')} value={set.sound} onChange={(v) => engine.setSettings({ sound: v })} />
        <Toggle label={t('set.vibration')} value={set.vibration} onChange={(v) => engine.setSettings({ vibration: v })} />
        <div className="row col"><b>{t('set.city')}</b>
          <div className="city-list">
            {CITIES.map((c) => (
              <button key={c.id} className={`city${c.id === set.city ? ' on' : ''}`} onClick={() => { if (isBusy(s.phase)) return toast(t('toast.busy')); engine.setSettings({ city: c.id }); }}>
                <b>{c.name}</b><small>{c.country}{c.beta ? ` · ${t('set.cityBeta')}` : ''}</small>
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title={t('set.sim')}>
        <div className="row col"><b>{t('set.movement')}</b>
          <Segmented value={set.movement} options={[{ id: 'virtual', label: t('set.virtual') }, { id: 'gps', label: t('set.gps') }]}
            onChange={(v) => {
              if (isBusy(s.phase)) return toast(t('toast.busy'));
              engine.setSettings({ movement: v });
              if (v === 'gps') enableGps(); else gps.stop();
            }} /></div>
        <Slider label={t('sc.intensity')} value={set.intensity} min={0.5} max={3} step={0.25} onChange={(v) => engine.setSettings({ intensity: v })} format={(v) => `×${num(v, set.lang, 2)}`} />
        <div className="row col"><b>{t('sc.difficulty')}</b>
          <Segmented value={set.difficulty} options={[{ id: 'easy', label: t('diff.easy') }, { id: 'normal', label: t('diff.normal') }, { id: 'hard', label: t('diff.hard') }]} onChange={(v) => engine.setSettings({ difficulty: v })} /></div>
        <Toggle label={t('set.vdrivers')} value={set.virtualDrivers} onChange={(v) => engine.setSettings({ virtualDrivers: v })} />
        <Toggle label={t('set.heat')} value={set.heat} onChange={(v) => engine.setSettings({ heat: v })} />
        <Toggle label={t('set.autoComplete')} value={set.autoComplete} onChange={(v) => engine.setSettings({ autoComplete: v })} />
        <Toggle label={t('set.seed')} hint={t('set.seedHint')} value={set.seedMode === 'fixed'} onChange={(v) => engine.setSettings({ seedMode: v ? 'fixed' : 'random' })} />
        <Toggle label={t('set.demo')} hint={t('set.demoHint')} value={set.demo} onChange={(v) => engine.setSettings({ demo: v })} />
      </Section>

      <Section title={t('set.economy')}>
        <NumField label={t('set.commission')} value={set.commissionPct} min={0} max={60} onChange={(v) => engine.setSettings({ commissionPct: v })} suffix="%" />
        <NumField label={t('set.fuelKm')} value={set.fuelPerKm} min={0} max={2} step={0.01} onChange={(v) => engine.setSettings({ fuelPerKm: v })} suffix={cur} />
        <NumField label={t('set.otherHour')} value={set.otherPerHour} min={0} max={50} step={0.5} onChange={(v) => engine.setSettings({ otherPerHour: v })} suffix={cur} />
      </Section>

      <Section title={t('set.data')}>
        <button className="btn danger" onClick={() => { if (confirm(t('set.resetConfirm'))) { engine.resetStats(); toast(t('set.resetStats')); } }}>{t('set.resetStats')}</button>
      </Section>
    </Panel>
  );
}
