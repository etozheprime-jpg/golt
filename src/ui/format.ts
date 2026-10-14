import { getCity } from '../core/cities';
import type { Lang } from '../i18n/dict';

const LOC: Record<Lang, string> = { ru: 'ru-RU', en: 'en-GB', lt: 'lt-LT' };

export function money(n: number, lang: Lang, cityId: string): string {
  const cur = getCity(cityId).currency;
  return new Intl.NumberFormat(LOC[lang], { style: 'currency', currency: cur, minimumFractionDigits: 2 }).format(n);
}
export const num = (n: number, lang: Lang, d = 1) => new Intl.NumberFormat(LOC[lang], { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
export function hm(sec: number): string {
  const m = Math.floor(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` : `${m}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}
export const dist = (m: number, t: (k: string) => string) => (m >= 1000 ? `${(m / 1000).toFixed(1)} ${t('unit.km')}` : `${Math.round(m)} ${t('unit.m')}`);
export const clockHM = (hour: number) => `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`;
