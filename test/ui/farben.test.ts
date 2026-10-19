/*
 * lib/farben.ts nennt Tokens als Zeichenkette. Seit `--color-*: initial` in theme.css
 * erzeugt ein vertippter Name weder eine Klasse noch eine Farbe — er faellt nur hier auf.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FARBE, richtungBgTon, richtungFarbe, richtungTon } from '@/lib/farben';

const THEME = readFileSync(join(process.cwd(), 'src/styles/theme.css'), 'utf8');
const TOKENS = new Set([...THEME.matchAll(/^\s*--color-([\w-]+)\s*:/gm)].map((m) => m[1]));

describe('lib/farben.ts', () => {
  it('liest die Tokens aus theme.css', () => {
    expect(TOKENS.size).toBeGreaterThan(10);
  });

  it('nennt in FARBE und richtungFarbe nur Variablen, die theme.css definiert', () => {
    for (const wert of [...Object.values(FARBE), ...Object.values(richtungFarbe)]) {
      const name = /^var\(--color-([\w-]+)\)$/.exec(wert)?.[1];
      expect(name, wert).toBeDefined();
      expect(TOKENS.has(name!), `--color-${name} fehlt in theme.css`).toBe(true);
    }
  });

  it('nennt in den Ton-Maps nur Klassen auf bestehenden Tokens', () => {
    for (const klasse of [...Object.values(richtungTon), ...Object.values(richtungBgTon)]) {
      const name = /^(?:text|bg)-([\w-]+)$/.exec(klasse)?.[1];
      expect(name, klasse).toBeDefined();
      expect(TOKENS.has(name!), `${klasse}: --color-${name} fehlt in theme.css`).toBe(true);
    }
  });
});
