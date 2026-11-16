/** `ingest/quellen/jpmorgan.ts`: was die Quelle aus einer Antwort macht. Rahmen in `hilfen.ts`. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Isin } from '../../../core/typen.ts';
import { SchemaFehler } from '../../../ingest/schema.ts';
import { json } from '../../fixtures/index.ts';
import { kontext, mcp, netz } from './hilfen.ts';

vi.mock('../../../ingest/mcp.ts', () => ({ mcpAufrufRoh: vi.fn() }));
vi.mock('../../../ingest/netz.ts', () => ({ holeText: vi.fn() }));

const { bestandteileJpmorgan, katalogJpmorgan } = await import('../../../ingest/quellen/jpmorgan.ts');

const FONDS = 'IE00BF4G6Y48' as Isin;

type Zeile = Record<string, unknown>;
type Antwort = { fundData: { dailyHoldingsAll: { data: Zeile[] } } };

/** Das Fixture, mit `aendere` an den Zeilen veraendert. */
function antwortMit(aendere: (zeilen: Zeile[]) => Zeile[]): string {
  const antwort = json('jpmorgan.json') as Antwort;
  antwort.fundData.dailyHoldingsAll.data = aendere(antwort.fundData.dailyHoldingsAll.data);
  return JSON.stringify(antwort);
}

beforeEach(() => {
  mcp.mockReset();
  netz.mockReset();
});

describe('bestandteileJpmorgan', () => {
  it('rechnet Prozent in Anteile um, summiert doppelte ISINs und ueberspringt Cash ohne ISIN', async () => {
    netz.mockResolvedValue(JSON.stringify(json('jpmorgan.json')));

    const ctx = kontext();
    const ernte = await bestandteileJpmorgan(ctx, FONDS);

    expect(ernte.quelle).toBe(`jpmorgan:${FONDS}`);
    expect(netz.mock.calls[0]?.[0]).toContain(`cusip=${FONDS}`);
    expect(ernte.daten.teile).toHaveLength(4);

    const apple = ernte.daten.teile.find((t) => t.unternehmenIsin === 'US0378331005');
    expect(apple).toMatchObject({ fondsIsin: FONDS, name: 'APPLE INC', land: 'United States', sektor: null });
    expect(apple?.gewicht).toBeCloseTo(0.3, 9);

    const microsoft = ernte.daten.teile.find((t) => t.unternehmenIsin === 'US5949181045');
    expect(microsoft?.gewicht).toBeCloseTo(0.3, 9);

    expect(ernte.daten.teile.find((t) => t.unternehmenIsin === 'BMG0450A1053')?.land).toBeNull();
    expect(ernte.daten.gewichtsSumme).toBeCloseTo(0.96, 9);
    expect(ctx.befunde.leer).toBe(true);
    expect(JSON.parse(ernte.rohJson)).toMatchObject({ stand: ctx.jetzt });
  });

  it('speichert leeren Sektor und leeres Land als null', async () => {
    netz.mockResolvedValue(antwortMit((zeilen) => zeilen.map((z) => ({ ...z, sector: '', country: '' }))));
    const ernte = await bestandteileJpmorgan(kontext(), FONDS);
    expect(ernte.daten.teile.every((t) => t.sektor === null && t.land === null)).toBe(true);
  });

  it('meldet Zeilen ohne ISIN im Hinweis, wenn die Summe ungenau ist', async () => {
    netz.mockResolvedValue(
      antwortMit((zeilen) => zeilen.map((z) => (z.securityIsin === 'BMG0450A1053' ? { ...z, securityIsin: '' } : z))),
    );
    const ctx = kontext();
    const ernte = await bestandteileJpmorgan(ctx, FONDS);
    expect(ernte.daten.teile).toHaveLength(3);
    expect(ernte.daten.gewichtsSumme).toBeCloseTo(0.8, 9);
    expect(ctx.befunde.leer).toBe(false);
  });

  it('wirft einen SchemaFehler, wenn ein Gewicht Text statt Zahl ist', async () => {
    netz.mockResolvedValue(JSON.stringify(json('kaputt/jpmorgan.json')));
    await expect(bestandteileJpmorgan(kontext(), FONDS)).rejects.toThrow(SchemaFehler);
  });

  it('wirft einen SchemaFehler, wenn die Gewichte schon Anteile sind (Summe unter 50 %)', async () => {
    netz.mockResolvedValue(
      antwortMit((zeilen) =>
        zeilen.map((z) => ({ ...z, marketValuePercent: (z.marketValuePercent as number) / 100 })),
      ),
    );
    await expect(bestandteileJpmorgan(kontext(), FONDS)).rejects.toThrow(SchemaFehler);
  });

  it('wirft einen SchemaFehler, wenn die Summe ueber 150 % liegt', async () => {
    netz.mockResolvedValue(
      antwortMit((zeilen) => zeilen.map((z) => ({ ...z, marketValuePercent: (z.marketValuePercent as number) * 2 }))),
    );
    await expect(bestandteileJpmorgan(kontext(), FONDS)).rejects.toThrow(SchemaFehler);
  });

  it('wirft, wenn keine Zeile eine ISIN hat', async () => {
    netz.mockResolvedValue(antwortMit((zeilen) => zeilen.filter((z) => z.securityIsin === null)));
    await expect(bestandteileJpmorgan(kontext(), FONDS)).rejects.toThrow(/keine verwertbare Zeile/);
  });
});

describe('katalogJpmorgan', () => {
  it('nimmt nur ETFs auf, produktId ist die ISIN', async () => {
    netz.mockResolvedValue(JSON.stringify(json('jpmorgan-katalog.json')));

    const katalog = await katalogJpmorgan(kontext());

    expect([...katalog.keys()].sort()).toEqual(['IE000P334X90', 'IE00BF4G6Y48', 'IE00BMDV7354']);
    expect(katalog.get(FONDS)).toEqual({ produktId: FONDS });
    expect(katalog.has('LU0000000009' as Isin)).toBe(false);
  });

  it('ueberspringt Eintraege ohne gueltige ISIN', async () => {
    const eintraege = json('jpmorgan-katalog.json') as Record<string, unknown>[];
    netz.mockResolvedValue(
      JSON.stringify([...eintraege, { identifier: 'kein-isin', fundTypeCode: 'N_ETF' }, { identifier: null, fundTypeCode: 'N_ETF' }]),
    );
    expect((await katalogJpmorgan(kontext())).size).toBe(3);
  });

  it('wirft einen SchemaFehler, wenn die Antwort keine Liste ist', async () => {
    netz.mockResolvedValue(JSON.stringify({ fundType: 'etf' }));
    await expect(katalogJpmorgan(kontext())).rejects.toThrow(SchemaFehler);
  });
});
