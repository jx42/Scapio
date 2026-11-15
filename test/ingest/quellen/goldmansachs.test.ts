/** `ingest/quellen/goldmansachs.ts`: was die Quelle aus einer Antwort macht. Rahmen in `hilfen.ts`. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Isin } from '../../../core/typen.ts';
import { SchemaFehler } from '../../../ingest/schema.ts';
import { text } from '../../fixtures/index.ts';
import { kontext, mcp, netz } from './hilfen.ts';

vi.mock('../../../ingest/mcp.ts', () => ({ mcpAufrufRoh: vi.fn() }));
vi.mock('../../../ingest/netz.ts', () => ({ holeText: vi.fn() }));

const { bestandteileGoldmansachs, katalogGoldmansachs } = await import('../../../ingest/quellen/goldmansachs.ts');

const FONDS = 'IE00BJ5CNR11' as Isin;
const PV = 'PV103353';

beforeEach(() => {
  mcp.mockReset();
  netz.mockReset();
});

type Zeile = { holding: string | null; isin: string | null; portfolio: string | null; level3: string | null };

function antwortMit(holdings: Zeile[]): string {
  return JSON.stringify({
    data: { fundsDetail: { fundName: 'Beispiel', shareClassId: FONDS, allHoldings: { asAtDate: '2026-11-12', holdings } } },
  });
}

describe('bestandteileGoldmansachs', () => {
  it('liest die Bestände, rechnet Prozent in Anteile um und überspringt Cash', async () => {
    netz.mockResolvedValue(text('goldmansachs.json'));
    const ctx = kontext();
    const { ernte, adresse } = await bestandteileGoldmansachs(ctx, FONDS, { produktId: PV }, null);

    expect(adresse).toBe(PV);
    expect(ernte.quelle).toBe(`goldmansachs:${FONDS}`);
    expect(ernte.daten.teile).toHaveLength(5);
    const abbvie = ernte.daten.teile.find((t) => t.unternehmenIsin === 'US00287Y1091');
    expect(abbvie).toMatchObject({ fondsIsin: FONDS, name: 'ABBVIE INC.', sektor: null, land: null });
    expect(abbvie?.gewicht).toBeCloseTo(0.255, 9);
    expect(ernte.daten.gewichtsSumme).toBeCloseTo(0.9975, 9);
    expect(ernte.rohJson).toContain('"stand"');
    expect(ctx.befunde.leer).toBe(true);

    const [adresseAbruf, optionen] = netz.mock.calls[0]!;
    expect(adresseAbruf).toBe('https://am.gs.com/services/funds');
    expect(optionen.json).toMatchObject({ variables: { r: { pvNumber: PV, shareClassId: FONDS } } });
  });

  it('nimmt die PV-Nummer aus der Cache-Adresse, wenn kein Katalogeintrag vorliegt', async () => {
    netz.mockResolvedValue(text('goldmansachs.json'));
    const { adresse } = await bestandteileGoldmansachs(kontext(), FONDS, null, PV);
    expect(adresse).toBe(PV);
    expect(netz.mock.calls[0]?.[1].json).toMatchObject({ variables: { r: { pvNumber: PV } } });
  });

  it('wirft ohne PV-Nummer oder mit einer fremden Cache-Adresse, ohne abzurufen', async () => {
    await expect(bestandteileGoldmansachs(kontext(), FONDS, null, null)).rejects.toThrow(/keine Produkt-ID bekannt/);
    await expect(bestandteileGoldmansachs(kontext(), FONDS, null, 'https://am.gs.com/x')).rejects.toThrow(
      /keine Produkt-ID bekannt/,
    );
    expect(netz).not.toHaveBeenCalled();
  });

  it('summiert doppelte ISINs, übernimmt level3 als Sektor und zählt Zeilen ohne ISIN', async () => {
    netz.mockResolvedValue(
      antwortMit([
        { holding: 'A', isin: 'US0028241000', portfolio: '40.00', level3: 'Gesundheit' },
        { holding: 'A', isin: 'US0028241000', portfolio: '10.50', level3: 'Gesundheit' },
        { holding: 'B', isin: 'IE00B4BNMY34', portfolio: '49.00', level3: '' },
        { holding: 'EURO', isin: null, portfolio: '0.50', level3: null },
        { holding: 'US DOLLAR', isin: 'CSH_USD', portfolio: '0.30', level3: null },
      ]),
    );
    const { ernte } = await bestandteileGoldmansachs(kontext(), FONDS, { produktId: PV }, null);
    expect(ernte.daten.teile).toHaveLength(2);
    const a = ernte.daten.teile.find((t) => t.unternehmenIsin === 'US0028241000');
    expect(a?.gewicht).toBeCloseTo(0.505, 9);
    expect(a?.sektor).toBe('Gesundheit');
    expect(ernte.daten.teile.find((t) => t.unternehmenIsin === 'IE00B4BNMY34')?.sektor).toBeNull();
  });

  it('wirft einen SchemaFehler, wenn ein Gewicht kein Prozent-String ist', async () => {
    netz.mockResolvedValue(text('kaputt/goldmansachs-gewicht-text.json'));
    await expect(bestandteileGoldmansachs(kontext(), FONDS, { produktId: PV }, null)).rejects.toThrow(SchemaFehler);
  });

  it('wirft einen SchemaFehler, wenn die Summe außerhalb von 50–150 % liegt', async () => {
    netz.mockResolvedValue(antwortMit([{ holding: 'A', isin: 'US0028241000', portfolio: '1.87', level3: null }]));
    await expect(bestandteileGoldmansachs(kontext(), FONDS, { produktId: PV }, null)).rejects.toThrow(
      /Gewichtssumme 2 %/,
    );
    netz.mockResolvedValue(antwortMit([{ holding: 'A', isin: 'US0028241000', portfolio: '187', level3: null }]));
    await expect(bestandteileGoldmansachs(kontext(), FONDS, { produktId: PV }, null)).rejects.toThrow(SchemaFehler);
  });

  it('wirft, wenn keine Zeile eine ISIN hat', async () => {
    netz.mockResolvedValue(antwortMit([{ holding: 'US DOLLAR', isin: 'CSH_USD', portfolio: '100', level3: null }]));
    await expect(bestandteileGoldmansachs(kontext(), FONDS, { produktId: PV }, null)).rejects.toThrow(
      /keine verwertbare Zeile/,
    );
  });
});

describe('katalogGoldmansachs', () => {
  it('nimmt nur ETF-Adressen und ordnet jeder ISIN ihre PV-Nummer zu', async () => {
    netz.mockResolvedValue(text('goldmansachs-sitemap.xml'));
    const katalog = await katalogGoldmansachs(kontext());

    expect(netz.mock.calls[0]?.[0]).toBe('https://am.gs.com/sitemap/de-de.xml');
    expect([...katalog.keys()].sort()).toEqual(['IE000L0X6L81', 'IE000SYQFJV2', 'IE00BJ5CNR11']);
    expect(katalog.get(FONDS)).toEqual({ produktId: PV });
    expect(katalog.get('IE000L0X6L81' as Isin)).toEqual({ produktId: 'PV105256' });
    expect(katalog.has('LU1137489743' as Isin)).toBe(false);
  });

  it('übergeht eine ETF-Adresse mit ungültiger ISIN', async () => {
    netz.mockResolvedValue(
      '<urlset><url><loc>https://am.gs.com/de-de/advisors/funds/detail/PV100001/IE00BJ5CNR1X/x-ucits-etf</loc></url></urlset>',
    );
    expect((await katalogGoldmansachs(kontext())).size).toBe(0);
  });
});
