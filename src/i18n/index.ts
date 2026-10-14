import { DICT, type Lang } from './dict';

export function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
  let s = DICT[lang]?.[key] ?? DICT.en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
  return s;
}

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'ru', label: 'Русский' },
  { id: 'en', label: 'English' },
  { id: 'lt', label: 'Lietuvių' },
];
