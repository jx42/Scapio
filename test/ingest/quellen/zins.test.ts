/** `ingest/quellen/zins.ts`: was die Quelle aus einer Antwort macht. Rahmen in `hilfen.ts`. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE, text } from '../../fixtures/index.ts';
import { kontext, konfiguration, mcp, netz } from './hilfen.ts';

vi.mock('../../../ingest/mcp.ts', () => ({ mcpAufrufRoh: vi.fn() }));
vi.mock('../../../ingest/netz.ts', () => ({ holeText: vi.fn() }));

const { holeZins, ZinsUebersprungen } = await import('../../../ingest/quellen/zins.ts');

beforeEach(() => {
  mcp.mockReset();
  netz.mockReset();
});

describe('holeZins', () => {
  it('liest die SDMX-JSON-Antwort, teilt durch 100 und ueberspringt Tage ohne Wert', async () => {
    netz.mockResolvedValue(text(FIXTURE.ezb));

    const ctx = kontext();
    const ernte = await holeZins(ctx);

    expect(ernte.quelle).toBe('zins');
    expect(ernte.daten.map((t) => t.tag)).toEqual(['2026-08-20', '2026-08-21', '2026-08-25', '2026-08-26']);
    expect(ernte.daten.every((t) => t.quelle === 'ezb:EST')).toBe(true);
    expect(ernte.daten.map((t) => t.zinsProJahr)).toEqual([
      expect.closeTo(-0.0055),
      expect.closeTo(-0.0056),
      expect.closeTo(-0.0054),
      expect.closeTo(-0.0053),
    ]);
    // Aufsteigend sortiert.
    const tage = ernte.daten.map((t) => t.tag);
    expect([...tage].sort()).toEqual(tage);
    expect(ctx.befunde.hinweise.some((h) => h.art === 'zinsLuecken')).toBe(true);
  });

  it('ueberspringt die Quelle, ohne das Netz zu bemuehen, wenn keine Zinsquelle konfiguriert ist', async () => {
    const ctx = kontext({ konfiguration: konfiguration({ zinsquelle: 'keine' }) });
    await expect(holeZins(ctx)).rejects.toThrow(ZinsUebersprungen);
    expect(netz).not.toHaveBeenCalled();
  });

  it('wirft bei einer Serien-Dimension mit mehr als einer Auspraegung, statt Tage falsch zuzuordnen', async () => {
    netz.mockResolvedValue(text(FIXTURE.ezbZweiSerien));
    await expect(holeZins(kontext())).rejects.toThrow(/mehrdeutig/);
  });
});
