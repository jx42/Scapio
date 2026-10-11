/** `ingest/quellen/art.ts`: was die Quelle aus einer Antwort macht. Rahmen in `hilfen.ts`. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SchemaFehler } from '../../../ingest/schema.ts';
import { HEUTE, antwort, kontext, mcp, netz } from './hilfen.ts';

vi.mock('../../../ingest/mcp.ts', () => ({ mcpAufrufRoh: vi.fn() }));
vi.mock('../../../ingest/netz.ts', () => ({ holeText: vi.fn() }));

const { holeArt } = await import('../../../ingest/quellen/art.ts');

beforeEach(() => {
  mcp.mockReset();
  netz.mockReset();
});

describe('holeArt', () => {
  const ISIN = 'US67066G1040';
  const quote = (securityType: string | null, extra: Record<string, unknown> = {}) => ({
    security: { securityId: 'x', isin: ISIN, name: 'NVIDIA Corp.', securityType, quote: null, ...extra },
  });

  it('liefert die Art in Grossbuchstaben und stempelt den Tag', async () => {
    mcp.mockResolvedValue(antwort(quote('stock')));
    expect(await holeArt(kontext(), ISIN)).toEqual({ isin: ISIN, art: 'STOCK', geprueftAm: HEUTE });
    expect(mcp.mock.calls[0]![1]).toMatchObject({ ergaenzung: { isin: ISIN } });
  });

  it('liefert null, wenn die Bank keine Art nennt', async () => {
    mcp.mockResolvedValue(antwort(quote(null)));
    expect(await holeArt(kontext(), ISIN)).toBeNull();
  });

  it('bricht bei einem unbekannten Feld mit SchemaFehler ab', async () => {
    mcp.mockResolvedValue(antwort(quote('STOCK', { sector: 'tech' })));
    await expect(holeArt(kontext(), ISIN)).rejects.toThrow(SchemaFehler);
  });
});
