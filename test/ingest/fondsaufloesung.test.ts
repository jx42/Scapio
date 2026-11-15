import { describe, expect, it, vi } from 'vitest';
import { alsTag } from '../../core/kalender.ts';
import type { Isin } from '../../core/typen.ts';
import type { Anbieter, Katalogeintrag } from '../../ingest/anbieter.ts';
import { ANBIETER } from '../../ingest/anbieter.ts';
import type { KatalogErgebnis } from '../../ingest/fondsaufloesung.ts';
import { aufloese, katalogeAbrufen, sucheAbrufen } from '../../ingest/fondsaufloesung.ts';
import type { Kontext } from '../../ingest/importieren.ts';

const ctx = {} as Kontext;
const heute = alsTag('2026-09-27');

function anbieter(name: Anbieter['name'], katalog: Anbieter['katalog'], suche: Anbieter['suche'] = null): Anbieter {
  return { name, katalog, suche, bestandteile: () => Promise.reject(new Error('nicht gebraucht')) };
}

const isin = (n: number): Isin => `ZZ${String(n).padStart(9, '0')}0`;

function protokoll(): { meldungen: [string, KatalogErgebnis['art']][]; melde: (name: string, e: KatalogErgebnis) => void } {
  const meldungen: [string, KatalogErgebnis['art']][] = [];
  return { meldungen, melde: (name, e) => meldungen.push([name, e.art]) };
}

describe('ANBIETER', () => {
  it('jeder Anbieter hat Katalog oder Suche, nie beides', () => {
    for (const a of ANBIETER) expect([a.katalog === null, a.suche === null].filter(Boolean)).toHaveLength(1);
  });

  it('iShares sucht je ISIN, statt einen Katalog zu laden (ADR-027, ADR-065)', () => {
    const ishares = ANBIETER.find((a) => a.name === 'ishares');
    expect(ishares?.katalog).toBeNull();
    expect(ishares?.suche).not.toBeNull();
  });
});

describe('katalogeAbrufen', () => {
  it('meldet erfolg und fehler, Anbieter ohne Katalog gar nicht', async () => {
    const { meldungen, melde } = protokoll();
    const index = await katalogeAbrufen(
      ctx,
      [
        anbieter('ishares', null, () => Promise.resolve(null)),
        anbieter('xtrackers', () => Promise.resolve(new Map([['IE00B4L5Y983', { produktId: 'x' }]]))),
        anbieter('amundi', () => Promise.reject(new Error('Netz'))),
      ],
      melde,
    );
    expect(meldungen).toEqual([
      ['xtrackers', 'erfolg'],
      ['amundi', 'fehler'],
    ]);
    expect(index.get('IE00B4L5Y983')?.anbieter).toBe('xtrackers');
  });
});

describe('sucheAbrufen', () => {
  it('der erste Treffer beendet die Suche (Reihenfolge der Liste)', async () => {
    const amundi = vi.fn(() => Promise.resolve<Katalogeintrag | null>({ produktId: 'inv' }));
    const { meldungen, melde } = protokoll();
    const index = await sucheAbrufen(
      ctx,
      [anbieter('ishares', null, () => Promise.resolve({ produktId: '251882' })), anbieter('amundi', null, amundi)],
      [isin(1)],
      melde,
    );
    expect(index.get(isin(1))).toEqual({ anbieter: 'ishares', eintrag: { produktId: '251882' } });
    expect(amundi).not.toHaveBeenCalled();
    expect(meldungen).toEqual([['ishares', 'erfolg']]);
  });

  it('fragt den naechsten Anbieter, wenn der erste nichts findet', async () => {
    const { melde } = protokoll();
    const index = await sucheAbrufen(
      ctx,
      [anbieter('ishares', null, () => Promise.resolve(null)), anbieter('amundi', null, (_, i) => Promise.resolve({ produktId: i }))],
      [isin(1)],
      melde,
    );
    expect(index.get(isin(1))?.anbieter).toBe('amundi');
  });

  it('meldet einen Ausfall einmal je Lauf und fragt den Anbieter danach nicht mehr', async () => {
    const ishares = vi.fn(() => Promise.reject(new Error('Netz')));
    const { meldungen, melde } = protokoll();
    const index = await sucheAbrufen(
      ctx,
      [anbieter('ishares', null, ishares), anbieter('amundi', null, () => Promise.resolve(null))],
      [isin(1), isin(2), isin(3)],
      melde,
    );
    expect(ishares).toHaveBeenCalledTimes(1);
    expect(index.size).toBe(0);
    expect(meldungen).toEqual([
      ['ishares', 'fehler'],
      ['amundi', 'erfolg'],
    ]);
  });

  it('meldet nichts, wenn keine Suche noetig war', async () => {
    const { meldungen, melde } = protokoll();
    await sucheAbrufen(ctx, [anbieter('ishares', null, () => Promise.resolve(null))], [], melde);
    expect(meldungen).toEqual([]);
  });

  it('sucht nur, was kein Katalog kennt: zehn ISINs, acht Treffer, hoechstens zwei Abrufe je Anbieter', async () => {
    const gehalten = Array.from({ length: 10 }, (_, i) => isin(i));
    const katalog = new Map(gehalten.slice(0, 8).map((i) => [i, { produktId: i }]));
    const ishares = vi.fn(() => Promise.resolve(null));
    const amundi = vi.fn(() => Promise.resolve(null));
    const alle = [anbieter('xtrackers', () => Promise.resolve(katalog)), anbieter('ishares', null, ishares), anbieter('amundi', null, amundi)];
    const { melde } = protokoll();

    const katalogIndex = await katalogeAbrufen(ctx, alle, melde);
    await sucheAbrufen(ctx, alle, gehalten.filter((i) => !katalogIndex.has(i)), melde);

    expect(ishares).toHaveBeenCalledTimes(2);
    expect(amundi).toHaveBeenCalledTimes(2);
    expect(ishares.mock.calls.map((c) => (c as unknown[])[1])).toEqual([isin(8), isin(9)]);
  });
});

describe('aufloese', () => {
  const bestehend = {
    isin: 'IE00B4L5Y983',
    anbieter: 'ishares',
    durchsicht: 'moeglich',
    adresse: '251882',
    geprueftAm: '2026-09-01',
  } as const;

  it('behaelt ohne Treffer die bekannte Zeile, wenn diesen Lauf ein Anbieter gescheitert ist', () => {
    expect(aufloese('IE00B4L5Y983', new Map(), new Set(['amundi']), bestehend, heute)).toBe(bestehend);
    expect(aufloese('IE00B4L5Y983', new Map(), new Set(['amundi']), null, heute)).toBeNull();
  });

  it('kein Treffer ohne gescheiterten Anbieter setzt die Zeile auf unbekannt', () => {
    expect(aufloese('IE00B4L5Y983', new Map(), new Set(), bestehend, heute)).toEqual({
      isin: 'IE00B4L5Y983',
      anbieter: null,
      durchsicht: 'unbekannt',
      adresse: null,
      geprueftAm: heute,
    });
  });

  it('ein Treffer traegt die Produkt-ID als Adresse, ausser sie ist die ISIN', () => {
    const neu = new Map([['IE00B4L5Y983', { anbieter: 'ishares' as const, eintrag: { produktId: '251883' } }]]);
    expect(aufloese('IE00B4L5Y983', neu, new Set(), bestehend, heute)).toMatchObject({ durchsicht: 'moeglich', adresse: '251883' });
    const anderer = new Map([['IE00B4L5Y983', { anbieter: 'amundi' as const, eintrag: { produktId: 'IE00B4L5Y983' } }]]);
    expect(aufloese('IE00B4L5Y983', anderer, new Set(), bestehend, heute)).toMatchObject({ anbieter: 'amundi', adresse: null });
  });
});
