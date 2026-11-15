/** `ingest/quellen/ishares.ts`: was die Quelle aus einer Antwort macht. Rahmen in `hilfen.ts`. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Isin } from '../../../core/typen.ts';
import { SchemaFehler } from '../../../ingest/schema.ts';
import type { FondsIshares } from '../../../ingest/schema.ts';
import { FIXTURE, json, text } from '../../fixtures/index.ts';
import { kontext, mcp, netz } from './hilfen.ts';

vi.mock('../../../ingest/mcp.ts', () => ({ mcpAufrufRoh: vi.fn() }));
vi.mock('../../../ingest/netz.ts', () => ({ holeText: vi.fn() }));

const { holeIshares, sucheIshares } = await import('../../../ingest/quellen/ishares.ts');
const { pruefeGewichtsSumme } = await import('../../../ingest/anbieter.ts');

beforeEach(() => {
  mcp.mockReset();
  netz.mockReset();
});

describe('holeIshares', () => {
  const FONDS: FondsIshares = {
    anbieter: 'ishares',
    isin: 'ZZ0000000001',
    name: 'Beispiel Globalfonds A',
    produktId: '307557',
  };

  it('liest die Spalten, summiert doppelte ISINs und ueberspringt Cash/Futures', async () => {
    netz.mockResolvedValue(text(FIXTURE.ishares));

    const ctx = kontext();
    const ernte = await holeIshares(ctx, FONDS);

    expect(ernte.quelle).toBe(`ishares:${FONDS.isin}`);

    const nestle = ernte.daten.teile.find((t) => t.unternehmenIsin === 'CH0038863350');
    expect(nestle?.gewicht).toBeCloseTo(0.093, 6);
    expect(ernte.daten.teile.every((t) => t.unternehmenIsin !== '-')).toBe(true);
    expect(ernte.daten.gewichtsSumme).toBeCloseTo(0.96, 6);
    // 0,96 liegt innerhalb der 5-%-Toleranz von holeIshares — kein Hinweis.
    expect(ctx.befunde.leer).toBe(true);
  });

  it('wirft einen SchemaFehler, wenn die Gewichte als Anteil statt in Prozent kommen', async () => {
    netz.mockResolvedValue(text(FIXTURE.isharesAnteile));
    const ctx = kontext();
    await expect(holeIshares(ctx, FONDS)).rejects.toThrow(/Gewichtssumme 1 %/);
    expect(ctx.befunde.leer).toBe(true);
  });

  it('wirft, wenn die Spalten nicht gleich lang sind', async () => {
    netz.mockResolvedValue(text(FIXTURE.isharesSchema));
    await expect(holeIshares(kontext(), FONDS)).rejects.toThrow(/nicht gleich lang/);
  });

  it('wirft einen SchemaFehler, wenn eine Spalte fehlt', async () => {
    netz.mockResolvedValue(JSON.stringify({ componentsByNameMap: { holdings: { containersByNameMap: { all: { dataPointsByNameMap: {} } } } } }));
    await expect(holeIshares(kontext(), FONDS)).rejects.toThrow(SchemaFehler);
  });

  it('wirft, wenn keine Zeile eine ISIN hat', async () => {
    const punkte = (value: unknown[]) => ({ value });
    netz.mockResolvedValue(
      JSON.stringify({
        componentsByNameMap: {
          holdings: {
            containersByNameMap: {
              all: {
                dataPointsByNameMap: {
                  isin: punkte([null]),
                  issueName: punkte(['EUR CASH']),
                  holdingPercent: punkte([4.0]),
                  sectorName: punkte(['Cash']),
                  countryOfRisk: punkte([null]),
                },
              },
            },
          },
        },
      }),
    );
    await expect(holeIshares(kontext(), FONDS)).rejects.toThrow(/keine verwertbare Zeile/);
  });
});

describe('sucheIshares', () => {
  const ISIN = 'IE00B4L5Y983' as Isin;
  const roh = (name: string) => JSON.stringify(json(name));

  it('loest die ISIN ueber Suche und Fondskopf in die portfolioId auf', async () => {
    netz.mockResolvedValueOnce(roh('ishares-suche.json')).mockResolvedValueOnce(roh('ishares-kopf.json'));

    expect(await sucheIshares(kontext(), ISIN)).toEqual({ produktId: '251882' });
    expect(netz.mock.calls[0]?.[0]).toContain(`query=${ISIN}`);
    expect(netz.mock.calls[1]?.[0]).toMatch(/component=fundHeader&.*portfolioId=251882&/);
  });

  it('liefert null ohne Treffer und fragt den Fondskopf gar nicht erst', async () => {
    netz.mockResolvedValueOnce(roh('ishares-suche-leer.json'));
    expect(await sucheIshares(kontext(), 'IE00B3YCGJ38' as Isin)).toBeNull();
    expect(netz).toHaveBeenCalledTimes(1);
  });

  it('verwirft einen Treffer, dessen Fondskopf eine fremde ISIN nennt', async () => {
    const kopf = roh('ishares-kopf.json').replace(ISIN, 'IE00B3YCGJ38');
    netz.mockResolvedValueOnce(roh('ishares-suche.json')).mockResolvedValueOnce(kopf);
    expect(await sucheIshares(kontext(), ISIN)).toBeNull();
  });

  it('nimmt bei mehreren Treffern den, dessen Fondskopf die ISIN nennt', async () => {
    const suche = { totalResults: 2, results: [{ portfolioId: '251881' }, { portfolioId: '251882' }] };
    const fremd = roh('ishares-kopf.json').replace(ISIN, 'IE00B3YCGJ38');
    netz
      .mockResolvedValueOnce(JSON.stringify(suche))
      .mockResolvedValueOnce(fremd)
      .mockResolvedValueOnce(roh('ishares-kopf.json'));
    expect(await sucheIshares(kontext(), ISIN)).toEqual({ produktId: '251882' });
    expect(netz).toHaveBeenCalledTimes(3);
  });

  it('wirft einen SchemaFehler, wenn die portfolioId als Zahl kommt', async () => {
    netz.mockResolvedValueOnce(roh('kaputt/ishares-suche-portfolioid.json'));
    await expect(sucheIshares(kontext(), ISIN)).rejects.toThrow(SchemaFehler);
  });

  it('wirft einen SchemaFehler, wenn dem Fondskopf die ISIN fehlt', async () => {
    netz.mockResolvedValueOnce(roh('ishares-suche.json')).mockResolvedValueOnce(JSON.stringify({ componentsByNameMap: {} }));
    await expect(sucheIshares(kontext(), ISIN)).rejects.toThrow(SchemaFehler);
  });
});

describe('pruefeGewichtsSumme', () => {
  const befund = (summe: number) => ({ isin: 'ZZ0000000001', summe, positionen: 10, ohneIsin: 1 });

  it.each([0.96, 1, 1.04])('nimmt %s still hin', (summe) => {
    const ctx = kontext();
    pruefeGewichtsSumme(ctx, 'q', befund(summe));
    expect(ctx.befunde.leer).toBe(true);
  });

  it.each([0.5, 0.9, 1.2, 1.5])('meldet %s als ungenau, uebernimmt aber', (summe) => {
    const ctx = kontext();
    pruefeGewichtsSumme(ctx, 'q', befund(summe));
    expect(ctx.befunde.hinweise.map((h) => h.art)).toEqual(['bestandteileSumme']);
  });

  it.each([0, 0.0096, 0.49, 1.51, 96, Number.NaN])('verwirft %s als Einheitenwechsel', (summe) => {
    expect(() => pruefeGewichtsSumme(kontext(), 'q', befund(summe))).toThrow(SchemaFehler);
  });
});
