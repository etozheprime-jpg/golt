import { engine, toast, uiStore, useEngine, useT } from '../../store';
import { SCENARIOS } from '../../core/scenarios';
import { getCity } from '../../core/cities';
import type { ScenarioId } from '../../core/types';
import { Icon } from '../Icon';
import { NumField, Panel, Segmented, Slider } from '../controls';
import { clockHM, num } from '../format';

const ORDER: { id: ScenarioId; icon: string }[] = [
  { id: 'normal', icon: 'route' }, { id: 'rush', icon: 'bolt' }, { id: 'night', icon: 'clock' },
  { id: 'airport', icon: 'plane' }, { id: 'free', icon: 'nav' }, { id: 'manual', icon: 'gear' },
];

export function ScenariosScreen() {
  const s = useEngine();
  const t = useT();
  const close = () => uiStore.set({ screen: 'map' });
  const { lang } = s.settings;
  const city = getCity(s.settings.city);
  const dowName = (d: number) => new Date(2024, 0, 7 + d).toLocaleDateString(lang === 'ru' ? 'ru-RU' : lang === 'lt' ? 'lt-LT' : 'en-GB', { weekday: 'short' });

  const start = (id: ScenarioId) => {
    const ok = engine.startScenario(id);
    if (!ok) { toast(t('toast.busy')); return; }
    uiStore.set({ screen: 'map', follow: true });
  };

  const sp = s.manual.startPos;
  return (
    <Panel title={t('sc.title')} onBack={close}>
      <div className="speed in-panel">
        <span className="eyebrow">{t('sc.speed')}</span>
        <Segmented<number> value={s.settings.speed} options={[1, 2, 5].map((n) => ({ id: n, label: `${n}×` }))} onChange={(v) => engine.setSettings({ speed: v as 1 | 2 | 5 })} />
      </div>

      <ul className="sc-list">
        {ORDER.map(({ id, icon }, i) => {
          const def = SCENARIOS[id];
          const active = s.scenarioId === id && s.phase !== 'offline';
          return (
            <li key={id} className={`sc-card${active ? ' active' : ''}`}>
              <div className="sc-num mono">{String(i + 1).padStart(2, '0')}</div>
              <div className="sc-main">
                <div className="sc-title"><Icon name={icon} size={18} /><h3>{t(`sc.${id}`)}</h3>{active && <em className="chip on">{t('sc.running')}</em>}</div>
                <p>{t(`sc.${id}.d`)}</p>
                {typeof def.startHour === 'number' && id !== 'manual' && <div className="chips"><span className="chip mono">{dowName(def.startDow as number)} {clockHM(def.startHour)}</span></div>}

                {(id === 'free' || id === 'manual') && (
                  <div className="sc-opts">
                    {id === 'free' && <Slider label={t('sc.intensity')} value={s.settings.intensity} min={0.5} max={3} step={0.25} onChange={(v) => engine.setSettings({ intensity: v })} format={(v) => `×${num(v, lang, 2)}`} />}
                    {id === 'free' && <Segmented value={s.settings.difficulty} label={t('sc.difficulty')} options={[{ id: 'easy', label: t('diff.easy') }, { id: 'normal', label: t('diff.normal') }, { id: 'hard', label: t('diff.hard') }]} onChange={(v) => engine.setSettings({ difficulty: v })} />}
                    {id === 'manual' && (
                      <>
                        <NumField label={t('sc.orders')} value={s.manual.orderCount} min={1} max={200} onChange={(v) => engine.setManual({ orderCount: Math.round(v) })} />
                        <NumField label={t('sc.avgFare')} value={s.manual.avgFare} min={2} max={100} step={0.5} suffix={city.currency === 'EUR' ? '€' : 'zł'} onChange={(v) => engine.setManual({ avgFare: v })} />
                        <NumField label={t('sc.perHour')} value={s.manual.perHour} min={1} max={120} onChange={(v) => engine.setManual({ perHour: Math.round(v) })} />
                        <div className="row">
                          <span className="row-text"><b>{t('sc.startPoint')}</b><small>{sp ? `${sp.lat.toFixed(4)}, ${sp.lng.toFixed(4)}` : t('sc.useCurrent')}</small></span>
                          <button className="btn ghost sm" onClick={() => uiStore.set({ pick: { target: 'manual', returnTo: 'scenarios' }, screen: 'map', follow: false })}>{t('sc.pickOnMap')}</button>
                        </div>
                        {sp && <button className="btn ghost sm" onClick={() => engine.setManual({ startPos: null })}>{t('gps.clearStart')}</button>}
                      </>
                    )}
                  </div>
                )}
                <button className="btn ghost sm" onClick={() => start(id)}>{active ? t('common.reset') : t('sc.start')}</button>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
