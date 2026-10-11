/** `ingest/quellen/gesamtwert.ts`: was die Quelle aus einer Antwort macht. Rahmen in `hilfen.ts`. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { zuCent } from '../../../core/dezimal.ts';
import { SchemaFehler } from '../../../ingest/schema.ts';
import { FIXTURE, json } from '../../fixtures/index.ts';
import { antwort, kontext, mcp, netz } from './hilfen.ts';

vi.mock('../../../ingest/mcp.ts', () => ({ mcpAufrufRoh: vi.fn() }));
vi.mock('../../../ingest/netz.ts', () => ({ holeText: vi.fn() }));

const { holeGesamtwert } = await import('../../../ingest/quellen/gesamtwert.ts');

beforeEach(() => {
  mcp.mockReset();
  netz.mockReset();
});

describe('holeGesamtwert', () => {
  it('uebertraegt Gesamtwert und Stand der Bank', async () => {
    mcp.mockResolvedValue(antwort(json(FIXTURE.overview)));
    const ernte = await holeGesamtwert(kontext());
    expect(ernte.daten.gesamtCent).toBe(zuCent('3160.62'));
    expect(ernte.daten.gesamtAus).toBe('2026-05-13T20:00:00.000Z');
  });

  it('bricht bei einem unbekannten Feld mit SchemaFehler ab', async () => {
    mcp.mockResolvedValue(antwort(json(FIXTURE.overviewFeld)));
    await expect(holeGesamtwert(kontext())).rejects.toThrow(SchemaFehler);
  });
});
