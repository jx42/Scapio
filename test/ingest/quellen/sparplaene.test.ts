/** `ingest/quellen/sparplaene.ts`: was die Quelle aus einer Antwort macht. Rahmen in `hilfen.ts`. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SchemaFehler } from '../../../ingest/schema.ts';
import { FIXTURE, json } from '../../fixtures/index.ts';
import { SYNTHETISCHER_GLOBALFONDS, SYNTHETISCHER_ZUKUNFTSFONDS, JETZT, antwort, kontext, mcp, netz } from './hilfen.ts';

vi.mock('../../../ingest/mcp.ts', () => ({ mcpAufrufRoh: vi.fn() }));
vi.mock('../../../ingest/netz.ts', () => ({ holeText: vi.fn() }));

const { holeSparplaene } = await import('../../../ingest/quellen/sparplaene.ts');

beforeEach(() => {
  mcp.mockReset();
  netz.mockReset();
});

describe('holeSparplaene', () => {
  it('normalisiert Gross- und Kleinschreibung der Frequenz auf Grossbuchstaben', async () => {
    mcp.mockResolvedValue(antwort(json(FIXTURE.sparplaene)));

    const ernte = await holeSparplaene(kontext());

    expect(ernte.daten).toHaveLength(2);
    expect(ernte.daten[0]).toMatchObject({
      isin: SYNTHETISCHER_GLOBALFONDS,
      frequenz: 'MONTHLY',
      tagImMonat: 1,
      stand: JETZT,
    });
    expect(ernte.daten[1]).toMatchObject({
      isin: SYNTHETISCHER_ZUKUNFTSFONDS,
      frequenz: 'MONTHLY',
      tagImMonat: 15,
    });
  });

  it('bricht bei einem Sparplan ohne jede Frequenz mit SchemaFehler ab', async () => {
    mcp.mockResolvedValue(antwort(json(FIXTURE.sparplaeneFrequenz)));
    await expect(holeSparplaene(kontext())).rejects.toThrow(SchemaFehler);
  });
});
