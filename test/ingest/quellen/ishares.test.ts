/** `ingest/quellen/ishares.ts`: was die Quelle aus einer Antwort macht. Rahmen in `hilfen.ts`. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SchemaFehler } from '../../../ingest/schema.ts';
import type { FondsIshares } from '../../../ingest/schema.ts';
import { FIXTURE, text } from '../../fixtures/index.ts';
import { kontext, mcp, netz } from './hilfen.ts';

vi.mock('../../../ingest/mcp.ts', () => ({ mcpAufrufRoh: vi.fn() }));
vi.mock('../../../ingest/netz.ts', () => ({ holeText: vi.fn() }));

const { holeIshares } = await import('../../../ingest/quellen/ishares.ts');
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
