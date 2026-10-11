/**
 * Kontrast der Farb-Tokens — keine der zwoelf Invarianten, laeuft aber mit ihnen, weil
 * weder axe (Glas-Kante, ADR-029) noch jsdom ihn messen. Rechnung: `start/kontrast.ts`.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DOKUMENT_DATEI, THEME_DATEI, messe, tabelle, tabelleImDokument, tokens, verhaeltnis } from '../../start/kontrast.ts';

const CSS = readFileSync(THEME_DATEI, 'utf8');

describe('Kontrast der Farb-Tokens', () => {
  it('liest die Tokens aus theme.css', () => {
    expect(tokens(CSS).size).toBeGreaterThan(20);
  });

  it('rechnet OKLCH wie der Browser: Weiss auf Schwarz ist 21 : 1', () => {
    const farben = tokens('--color-a: oklch(1 0 0); --color-b: oklch(0 0 0);');
    const [a, b] = [farben.get('a'), farben.get('b')];
    if (a === undefined || b === undefined) throw new Error('Tokens nicht gelesen');
    expect(verhaeltnis(a, b)).toBeCloseTo(21, 1);
  });

  it.each(messe(CSS).map(({ paarung, wert }) => [paarung.vorne, paarung.hinten, paarung.mindestens, wert] as const))(
    '--color-%s auf --color-%s erreicht %s : 1',
    (_vorne, _hinten, mindestens, wert) => {
      expect(wert).toBeGreaterThanOrEqual(mindestens);
    },
  );

  it('die Tabelle in docs/BARRIEREFREIHEIT.md ist aktuell (sonst `npm run kontrast`)', () => {
    expect(tabelleImDokument(readFileSync(DOKUMENT_DATEI, 'utf8'))).toBe(tabelle(CSS));
  });
});
