import { uiStore, useEngine, useT } from '../../store';
import { Panel } from '../controls';
import { money, num } from '../format';

export function HistoryScreen() {
  const s = useEngine();
  const t = useT();
  const { lang, city } = s.settings;
  const loc = lang === 'ru' ? 'ru-RU' : lang === 'lt' ? 'lt-LT' : 'en-GB';
  return (
    <Panel title={t('hist.title')} onBack={() => uiStore.set({ screen: 'map' })}>
      {s.history.length === 0 ? <p className="muted empty">{t('hist.empty')}</p> : (
        <ul className="hist">
          {s.history.map((h) => (
            <li key={`${h.id}-${h.ts}`} className={`st-${h.status}`}>
              <div className="hist-top">
                <span className="mono">{new Date(h.ts).toLocaleString(loc, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                <b className="hist-fare">{h.fare > 0 ? money(h.fare, lang, city) : '—'}</b>
              </div>
              <div className="hist-route">{h.from} <span aria-hidden>→</span> {h.to}</div>
              <div className="hist-meta">
                <span className={`chip st`}>{t(`st.${h.status}`)}</span>
                {h.km > 0 && <span className="muted">{num(h.km, lang)} {t('unit.km')} · {h.min} {t('unit.min')} · {h.passenger}</span>}
                <span className="muted mono">{h.id}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
