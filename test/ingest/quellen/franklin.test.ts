/** `ingest/quellen/franklin.ts`: was die Quelle aus einer Antwort macht. Rahmen in `hilfen.ts`. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Isin } from '../../../core/typen.ts';
import { SchemaFehler } from '../../../ingest/schema.ts';
import { json, text } from '../../fixtures/index.ts';
import { kontext, mcp, netz } from './hilfen.ts';

vi.mock('../../../ingest/mcp.ts', () => ({ mcpAufrufRoh: vi.fn() }));
vi.mock('../../../ingest/netz.ts', () => ({ holeText: vi.fn() }));

const { bestandteileFranklin, katalogFranklin } = await import('../../../ingest/quellen/franklin.ts');

const FONDS = 'IE00BFWXDV39' as Isin;

type Zeile = Record<string, unknown>;
function zeilen(): Zeile[] {
  const roh = json('franklin.json') as { data: { Portfolio: { portfolio: { dailyholdings: Zeile[] } } } };
  return roh.data.Portfolio.portfolio.dailyholdings;
}
const antwortMit = (z: Zeile[]): string => JSON.stringify({ data: { Portfolio: { portfolio: { dailyholdings: z } } } });

beforeEach(() => {
  mcp.mockReset();
  netz.mockReset();
});

describe('bestandteileFranklin', () => {
  it('liest Dezimalkomma als Anteil, summiert doppelte ISINs und zaehlt Zeilen ohne ISIN nicht mit', async () => {
    netz.mockResolvedValue(text('franklin.json'));
    const ctx = kontext();

    const { ernte, adresse } = await bestandteileFranklin(ctx, FONDS, { produktId: '27046' }, null);

    expect(adresse).toBe('27046');
    expect(ernte.quelle).toBe(`franklin:${FONDS}`);
    const tsmc = ernte.daten.teile.filter((t) => t.unternehmenIsin === 'TW0002330008');
    expect(tsmc).toHaveLength(1);
    expect(tsmc[0]?.gewicht).toBeCloseTo(0.4551, 6);
    expect(ernte.daten.teile.find((t) => t.unternehmenIsin === 'KR7005930003')?.gewicht).toBeCloseTo(0.184, 6);
    expect(ernte.daten.teile).toHaveLength(6);
    expect(ernte.daten.gewichtsSumme).toBeCloseTo(0.96, 6);
    // `—` und leere Felder werden null.
    expect(ernte.daten.teile.every((t) => t.sektor === null && t.land === null)).toBe(true);
    expect(JSON.parse(ernte.rohJson)).toMatchObject({ stand: ctx.jetzt });
    expect(ctx.befunde.leer).toBe(true);

    const [adresseAufruf, optionen] = netz.mock.calls[0] ?? [];
    expect(adresseAufruf).toBe('https://www.franklintempleton.de/api/pds/price-and-performance');
    expect((optionen?.json as { query: string }).query).toContain('fundid:"27046"');
  });

  it('uebernimmt Sektor und Land, wenn Franklin sie liefert', async () => {
    const z = zeilen();
    z[0] = { ...z[0], sctrname: 'Informationstechnologie', countrynme: 'Taiwan' };
    netz.mockResolvedValue(antwortMit(z));
    const { ernte } = await bestandteileFranklin(kontext(), FONDS, { produktId: '27046' }, null);
    const tsmc = ernte.daten.teile.find((t) => t.unternehmenIsin === 'TW0002330008');
    expect(tsmc).toMatchObject({ sektor: 'Informationstechnologie', land: 'Taiwan' });
  });

  it('nimmt die Produkt-ID aus der Adresse des letzten Laufs', async () => {
    netz.mockResolvedValue(text('franklin.json'));
    const { adresse } = await bestandteileFranklin(kontext(), FONDS, null, '27046');
    expect(adresse).toBe('27046');
    expect((netz.mock.calls[0]?.[1]?.json as { query: string }).query).toContain('fundid:"27046"');
  });

  it.each([
    ['ohne Eintrag und Adresse', null, null],
    ['mit Anfuehrungszeichen in der Adresse', null, '27046"){x}'],
    ['mit Buchstaben im Eintrag', { produktId: 'abc' }, null],
    ['leer', null, ''],
  ])('wirft ohne gueltige Produkt-ID (%s) und ruft nichts ab', async (_, eintrag, cacheAdresse) => {
    await expect(bestandteileFranklin(kontext(), FONDS, eintrag, cacheAdresse)).rejects.toThrow(/keine Produkt-ID bekannt/);
    expect(netz).not.toHaveBeenCalled();
  });

  it('wirft einen SchemaFehler bei Dezimalpunkt statt -komma', async () => {
    netz.mockResolvedValue(text('kaputt/franklin.json'));
    await expect(bestandteileFranklin(kontext(), FONDS, { produktId: '27046' }, null)).rejects.toThrow(SchemaFehler);
  });

  it('wirft einen SchemaFehler bei einem Datum ausserhalb von DD.MM.YYYY', async () => {
    const z = zeilen();
    z[0] = { ...z[0], asofdate: '2026-11-13' };
    netz.mockResolvedValue(antwortMit(z));
    await expect(bestandteileFranklin(kontext(), FONDS, { produktId: '27046' }, null)).rejects.toThrow(SchemaFehler);
  });

  it.each([
    ['unter 50 %', '0,40'],
    ['ueber 150 %', '99,00'],
  ])('wirft bei einer Gewichtssumme %s', async (_, gewicht) => {
    const z = zeilen().map((zeile) => ({ ...zeile, pctofnetassets: gewicht }));
    netz.mockResolvedValue(antwortMit(z));
    await expect(bestandteileFranklin(kontext(), FONDS, { produktId: '27046' }, null)).rejects.toThrow(SchemaFehler);
  });

  it('wirft, wenn keine Zeile eine ISIN hat', async () => {
    const z = zeilen().map((zeile) => ({ ...zeile, isinsecnbr: '—' }));
    netz.mockResolvedValue(antwortMit(z));
    await expect(bestandteileFranklin(kontext(), FONDS, { produktId: '27046' }, null)).rejects.toThrow(/keine verwertbare Zeile/);
  });
});

describe('katalogFranklin', () => {
  it('nimmt nur ETF-Adressen auf, mit der fundid als Produkt-ID', async () => {
    netz.mockResolvedValue(text('franklin-sitemap.xml'));
    const katalog = await katalogFranklin(kontext());

    expect([...katalog.keys()].sort()).toEqual(['IE0004I037N4', 'IE000GTF7GF4', 'IE00BFWXDV39']);
    expect(katalog.get('IE00BFWXDV39' as Isin)).toEqual({ produktId: '27046' });
    expect(katalog.get('IE000GTF7GF4' as Isin)).toEqual({ produktId: '40163' });
    expect(katalog.has('LU2129689431' as Isin)).toBe(false);
    expect(katalog.has('LU0052767562' as Isin)).toBe(false);
  });

  it('verwirft eine ETF-Adresse ohne gueltige ISIN', async () => {
    netz.mockResolvedValue(
      '<urlset><url><loc>https://www.franklintempleton.de/produkte/preise-und-wertentwicklung-fonds/preise-etfs/produkt/1/ETA/x-etf/ie00bfwxdv39</loc></url></urlset>',
    );
    expect((await katalogFranklin(kontext())).size).toBe(0);
  });
});
