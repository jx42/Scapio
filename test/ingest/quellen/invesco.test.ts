/** `ingest/quellen/invesco.ts`: was die Quelle aus einer Antwort macht. Rahmen in `hilfen.ts`. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Isin } from '../../../core/typen.ts';
import { SchemaFehler } from '../../../ingest/schema.ts';
import { json, text } from '../../fixtures/index.ts';
import { kontext, mcp, netz } from './hilfen.ts';

vi.mock('../../../ingest/mcp.ts', () => ({ mcpAufrufRoh: vi.fn() }));
vi.mock('../../../ingest/netz.ts', () => ({ holeText: vi.fn() }));

const { bestandteileInvesco, sucheInvesco } = await import('../../../ingest/quellen/invesco.ts');

const FONDS = 'IE0032077012' as Isin;

beforeEach(() => {
  mcp.mockReset();
  netz.mockReset();
});

describe('bestandteileInvesco', () => {
  it('rechnet Prozent in Anteile um, summiert doppelte ISINs und ueberspringt die Cash-Zeile', async () => {
    netz.mockResolvedValue(text('invesco.json'));

    const ctx = kontext();
    const ernte = await bestandteileInvesco(ctx, FONDS);

    expect(ernte.quelle).toBe(`invesco:${FONDS}`);
    expect(netz.mock.calls[0]?.[0]).toBe(
      `https://dng-api.invesco.com/cache/v1/accounts/de_DE/shareclasses/${FONDS}/holdings/index?idType=isin`,
    );
    expect(ernte.daten.teile).toHaveLength(6);
    const apple = ernte.daten.teile.find((t) => t.unternehmenIsin === 'US0378331005');
    expect(apple?.gewicht).toBeCloseTo(0.3575, 6);
    expect(apple).toMatchObject({ fondsIsin: FONDS, name: 'APPLE INC USD0.00001', sektor: null, land: null });
    expect(ernte.daten.teile.find((t) => t.unternehmenIsin === 'US67066G1040')?.gewicht).toBeCloseTo(0.2025, 6);
    expect(ernte.daten.gewichtsSumme).toBeCloseTo(0.96, 6);
    expect(ctx.befunde.leer).toBe(true);
    expect(JSON.parse(ernte.rohJson)).toMatchObject({ stand: ctx.jetzt });
  });

  it('wirft einen SchemaFehler, wenn ein Gewicht als Text kommt', async () => {
    netz.mockResolvedValue(text('kaputt/invesco-gewicht-text.json'));
    await expect(bestandteileInvesco(kontext(), FONDS)).rejects.toThrow(SchemaFehler);
  });

  it('wirft einen SchemaFehler, wenn die Gewichte als Anteil statt in Prozent kommen', async () => {
    const roh = json('invesco.json') as { holdings: { weight: number }[] };
    for (const z of roh.holdings) z.weight /= 100;
    netz.mockResolvedValue(JSON.stringify(roh));
    await expect(bestandteileInvesco(kontext(), FONDS)).rejects.toThrow(/Gewichtssumme 1 %/);
  });

  it('wirft einen SchemaFehler bei einer Summe ueber 150 %', async () => {
    const roh = json('invesco.json') as { holdings: { weight: number }[] };
    for (const z of roh.holdings) z.weight *= 2;
    netz.mockResolvedValue(JSON.stringify(roh));
    await expect(bestandteileInvesco(kontext(), FONDS)).rejects.toThrow(SchemaFehler);
  });

  it('wirft, wenn keine Zeile eine ISIN hat', async () => {
    netz.mockResolvedValue(
      JSON.stringify({ effectiveDate: '2026-11-12', holdings: [{ name: 'Cash and/or Derivatives', weight: 100 }] }),
    );
    await expect(bestandteileInvesco(kontext(), FONDS)).rejects.toThrow(/keine verwertbare Zeile/);
  });
});

describe('sucheInvesco', () => {
  it('liefert die ISIN als produktId, wenn die Anteilsklasse sie traegt', async () => {
    netz.mockResolvedValue(text('invesco-shareclass.json'));
    expect(await sucheInvesco(kontext(), FONDS)).toEqual({ produktId: FONDS });
    expect(netz.mock.calls[0]?.[0]).toBe(
      `https://dng-api.invesco.com/cache/v1/accounts/de_DE/shareclasses/${FONDS}?idType=isin`,
    );
  });

  it('liefert null fuer ein leeres Objekt', async () => {
    netz.mockResolvedValue('{}');
    expect(await sucheInvesco(kontext(), 'IE00B4L5Y983' as Isin)).toBeNull();
  });

  it('verwirft einen Treffer mit fremder ISIN', async () => {
    const roh = json('invesco-shareclass.json') as { aliases: { isin: string } };
    roh.aliases.isin = 'IE00B4L5Y983';
    netz.mockResolvedValue(JSON.stringify(roh));
    expect(await sucheInvesco(kontext(), FONDS)).toBeNull();
  });

  it('wirft einen SchemaFehler bei einer unbekannten Form statt „kein Treffer“', async () => {
    netz.mockResolvedValue(JSON.stringify({ message: 'not found' }));
    await expect(sucheInvesco(kontext(), FONDS)).rejects.toThrow(SchemaFehler);
  });
});
