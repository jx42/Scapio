/** `ingest/quellen/vpi.ts`: was die Quelle aus einer Antwort macht. Rahmen in `hilfen.ts`. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE, text } from '../../fixtures/index.ts';
import { kontext, konfiguration, mcp, netz } from './hilfen.ts';

vi.mock('../../../ingest/mcp.ts', () => ({ mcpAufrufRoh: vi.fn() }));
vi.mock('../../../ingest/netz.ts', () => ({ holeText: vi.fn() }));

const { holeVpi, VpiUebersprungen } = await import('../../../ingest/quellen/vpi.ts');

beforeEach(() => {
  mcp.mockReset();
  netz.mockReset();
});

describe('holeVpi', () => {
  it('liest die JSON-stat-Antwort und ueberspringt Monate ohne Wert', async () => {
    netz.mockResolvedValue(text(FIXTURE.eurostat));

    const ctx = kontext();
    const ernte = await holeVpi(ctx);

    expect(ernte.quelle).toBe('vpi');
    expect(ernte.daten.length).toBeGreaterThan(0);
    expect(ernte.daten.every((m) => m.quelle === 'eurostat:prc_hicp_midx')).toBe(true);
    // Aufsteigend sortiert.
    const monate = ernte.daten.map((m) => m.monat);
    expect([...monate].sort()).toEqual(monate);
    expect(ctx.befunde.hinweise.some((h) => h.art === 'vpiLuecken')).toBe(true);
  });

  it('ueberspringt die Quelle, ohne das Netz zu bemuehen, wenn eine andere Inflationsquelle konfiguriert ist', async () => {
    const ctx = kontext({ konfiguration: konfiguration({ inflationsquelle: 'destatis' }) });
    await expect(holeVpi(ctx)).rejects.toThrow(VpiUebersprungen);
    expect(netz).not.toHaveBeenCalled();
  });

  it('wirft bei einer Dimension mit mehr als einer Auspraegung, statt Monate falsch zuzuordnen', async () => {
    netz.mockResolvedValue(text(FIXTURE.eurostatZweiLaender));
    await expect(holeVpi(kontext())).rejects.toThrow(/mehrdeutig/);
  });
});
