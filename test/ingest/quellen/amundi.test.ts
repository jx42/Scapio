/** `ingest/quellen/amundi.ts`: was die Quelle aus einer Antwort macht. Rahmen in `hilfen.ts`. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SchemaFehler } from '../../../ingest/schema.ts';
import type { FondsAmundi } from '../../../ingest/schema.ts';
import { FIXTURE, text } from '../../fixtures/index.ts';
import { kontext, mcp, netz } from './hilfen.ts';

vi.mock('../../../ingest/mcp.ts', () => ({ mcpAufrufRoh: vi.fn() }));
vi.mock('../../../ingest/netz.ts', () => ({ holeText: vi.fn() }));

const { holeAmundi } = await import('../../../ingest/quellen/amundi.ts');

beforeEach(() => {
  mcp.mockReset();
  netz.mockReset();
});

describe('holeAmundi', () => {
  const FONDS: FondsAmundi = {
    anbieter: 'amundi',
    isin: 'ZZ0000000002',
    name: 'Beispiel Zukunftsfonds',
  };

  it('liest compositionData, summiert doppelte ISINs und ueberspringt Cash ohne ISIN', async () => {
    netz.mockResolvedValue(text(FIXTURE.amundi));

    const ctx = kontext();
    const ernte = await holeAmundi(ctx, FONDS);

    expect(ernte.quelle).toBe(`amundi:${FONDS.isin}`);

    const nestle = ernte.daten.teile.find((t) => t.unternehmenIsin === 'CH0038863350');
    expect(nestle?.gewicht).toBeCloseTo(0.093, 6);
    expect(ernte.daten.teile.every((t) => t.unternehmenIsin !== '')).toBe(true);
    expect(ernte.daten.gewichtsSumme).toBeCloseTo(0.96, 6);
    expect(ctx.befunde.leer).toBe(true);
  });

  it('wirft einen SchemaFehler, wenn die Gewichte in Prozent statt als Anteil kommen', async () => {
    netz.mockResolvedValue(text(FIXTURE.amundiProzent));
    await expect(holeAmundi(kontext(), FONDS)).rejects.toThrow(SchemaFehler);
  });

  it('wirft einen SchemaFehler, wenn weight ein String statt einer Zahl ist', async () => {
    netz.mockResolvedValue(text(FIXTURE.amundiSchema));
    await expect(holeAmundi(kontext(), FONDS)).rejects.toThrow(SchemaFehler);
  });

  it('wirft, wenn das Produkt gelesen wird, aber keine Zeile eine ISIN hat', async () => {
    netz.mockResolvedValue(
      JSON.stringify({
        products: [
          {
            productId: FONDS.isin,
            composition: {
              totalNumberOfInstruments: 1,
              compositionData: [
                {
                  compositionCharacteristics: {
                    name: 'EUR CASH',
                    isin: '',
                    weight: 0.04,
                    sector: null,
                    countryOfRisk: null,
                  },
                },
              ],
            },
          },
        ],
      }),
    );
    await expect(holeAmundi(kontext(), FONDS)).rejects.toThrow(/keine verwertbare Zeile/);
  });
});
