import { describe, expect, it } from 'vitest';
import { alsTag } from '../../core/kalender.ts';
import type { Anbieter } from '../../ingest/anbieter.ts';
import { ANBIETER } from '../../ingest/anbieter.ts';
import type { KatalogErgebnis } from '../../ingest/fondsaufloesung.ts';
import { aufloese, katalogeAbrufen } from '../../ingest/fondsaufloesung.ts';
import type { Kontext } from '../../ingest/importieren.ts';

const ctx = {} as Kontext;
const heute = alsTag('2026-09-27');

function anbieter(name: Anbieter['name'], katalog: Anbieter['katalog']): Anbieter {
  return { name, katalog, bestandteile: () => Promise.reject(new Error('nicht gebraucht')) };
}

describe('katalogeAbrufen', () => {
  it('iShares hat keinen Katalog (ADR-027)', () => {
    const ishares = ANBIETER.find((a) => a.name === 'ishares');
    expect(ishares?.katalog).toBeNull();
  });

  it('unterscheidet erfolg, ohne und fehler', async () => {
    const meldungen: [string, KatalogErgebnis['art']][] = [];
    const index = await katalogeAbrufen(
      ctx,
      [
        anbieter('ishares', null),
        anbieter('xtrackers', () => Promise.resolve(new Map([['IE00B4L5Y983', { produktId: 'x' }]]))),
        anbieter('amundi', () => Promise.reject(new Error('Netz'))),
      ],
      (name, ergebnis) => meldungen.push([name, ergebnis.art]),
    );
    expect(meldungen).toEqual([
      ['ishares', 'ohne'],
      ['xtrackers', 'erfolg'],
      ['amundi', 'fehler'],
    ]);
    expect(index.get('IE00B4L5Y983')?.anbieter).toBe('xtrackers');
  });
});

describe('aufloese', () => {
  it('behaelt die bekannte Zeile eines Hauses ohne Katalog', () => {
    const bestehend = {
      isin: 'IE00B4L5Y983',
      anbieter: 'ishares',
      durchsicht: 'moeglich',
      adresse: '251882',
      geprueftAm: '2026-09-01',
    } as const;
    expect(aufloese('IE00B4L5Y983', new Map(), new Set(['ishares']), bestehend, heute)).toBe(bestehend);
    expect(aufloese('IE00B4L5Y983', new Map(), new Set(), bestehend, heute).durchsicht).toBe('unbekannt');
  });
});
