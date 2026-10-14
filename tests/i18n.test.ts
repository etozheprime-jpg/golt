import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DICT } from '../src/i18n/dict';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') || p.endsWith('.ts') ? [p] : [];
  });
}

describe('i18n', () => {
  const keys = new Set<string>();
  for (const f of walk('src')) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) keys.add(m[1]);
    for (const m of readFileSync(f, 'utf8').matchAll(/nameKey:\s*'([a-zA-Z0-9_.]+)'/g)) keys.add(m[1]);
  }
  it('every used key exists in ru and en', () => {
    const missing = [...keys].filter((k) => !(k in DICT.ru) || !(k in DICT.en));
    expect(missing).toEqual([]);
  });
});
