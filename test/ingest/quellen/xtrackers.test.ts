/** `ingest/quellen/xtrackers.ts`: was die Quelle aus einer Antwort macht. Rahmen in `hilfen.ts`. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SchemaFehler } from '../../../ingest/schema.ts';
import type { FondsXtrackers } from '../../../ingest/schema.ts';
import { FIXTURE, text } from '../../fixtures/index.ts';
import { kontext, mcp, netz } from './hilfen.ts';

vi.mock('../../../ingest/mcp.ts', () => ({ mcpAufrufRoh: vi.fn() }));
vi.mock('../../../ingest/netz.ts', () => ({ holeText: vi.fn() }));

const { holeXtrackers } = await import('../../../ingest/quellen/xtrackers.ts');

beforeEach(() => {
  mcp.mockReset();
  netz.mockReset();
});

describe('holeXtrackers', () => {
  const FONDS: FondsXtrackers = {
    anbieter: 'xtrackers',
    isin: 'ZZ0000000003',
    name: 'Beispiel Globalfonds B',
  };

  it('liest die Tabelle per Spaltenlabel, summiert doppelte ISINs und ueberspringt Cash', async () => {
    netz.mockResolvedValue(text(FIXTURE.xtrackers));

    const ctx = kontext();
    const ernte = await holeXtrackers(ctx, FONDS);

    expect(ernte.quelle).toBe(`xtrackers:${FONDS.isin}`);

    const nestle = ernte.daten.teile.find((t) => t.unternehmenIsin === 'CH0038863350');
    expect(nestle?.gewicht).toBeCloseTo(0.093, 6);
    expect(ernte.daten.teile.every((t) => t.unternehmenIsin !== '-')).toBe(true);
    expect(ernte.daten.gewichtsSumme).toBeCloseTo(0.96, 6);
    expect(ctx.befunde.leer).toBe(true);
  });

  it('wirft einen SchemaFehler, wenn eine Zelle das type-Feld nicht hat', async () => {
    netz.mockResolvedValue(text(FIXTURE.xtrackersSchema));
    await expect(holeXtrackers(kontext(), FONDS)).rejects.toThrow(SchemaFehler);
  });

  it('wirft, wenn die Tabelle gelesen wird, aber keine Zeile eine ISIN hat', async () => {
    netz.mockResolvedValue(
      JSON.stringify({
        tables: [
          {
            columns: [
              { key: 'header', value: 'ISIN' },
              { key: 'column_0', value: 'Name' },
              { key: 'column_1', value: '% Weight' },
            ],
            values: [
              {
                header: { value: '-', type: 'text' },
                column_0: { value: 'EUR CASH', type: 'text' },
                column_1: { value: '4.000%', sortValue: 4.0, type: 'text' },
              },
            ],
          },
        ],
      }),
    );
    await expect(holeXtrackers(kontext(), FONDS)).rejects.toThrow(/keine verwertbare Zeile/);
  });
});
