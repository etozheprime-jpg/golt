import { useCallback, useSyncExternalStore } from 'react';
import { Engine, type EngineState } from './core/engine';
import { load, save } from './services/storage';
import { osrmRouter } from './services/routing';
import { translate } from './i18n';

export const engine = new Engine({ persisted: load(), router: osrmRouter, persist: save });

export const useEngine = (): EngineState => useSyncExternalStore(engine.subscribe, engine.getState);

// ---------------- UI store
export type Screen = 'map' | 'scenarios' | 'stats' | 'history' | 'profile' | 'settings' | 'gps' | 'about';
export interface UIState {
  screen: Screen;
  menu: boolean;
  splash: boolean;
  follow: boolean;
  sheetOpen: boolean;
  pick: null | { target: 'start' | 'manual'; returnTo: Screen };
  toast: { id: number; text: string } | null;
}

let ui: UIState = { screen: 'map', menu: false, splash: true, follow: true, sheetOpen: true, pick: null, toast: null };
const listeners = new Set<() => void>();
export const uiStore = {
  get: () => ui,
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
  set(p: Partial<UIState>) { ui = { ...ui, ...p }; listeners.forEach((l) => l()); },
};
export const useUI = (): UIState => useSyncExternalStore(uiStore.subscribe, uiStore.get);

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string) {
  const id = Date.now();
  uiStore.set({ toast: { id, text } });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { if (uiStore.get().toast?.id === id) uiStore.set({ toast: null }); }, 2600);
}

// ---------------- i18n hook
export function useT() {
  const lang = useEngine().settings.lang;
  return useCallback((key: string, params?: Record<string, string | number>) => translate(lang, key, params), [lang]);
}

if (import.meta.env.DEV) (window as unknown as { __golt: Engine }).__golt = engine;
