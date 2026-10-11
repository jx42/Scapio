/** `ingest/quellen/vpiAktuell.ts`: was die Quelle aus einer Antwort macht. Rahmen in `hilfen.ts`. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Vpiwert } from '../../../db/repository/vpi.ts';
import { FIXTURE, text } from '../../fixtures/index.ts';
import { kontext, konfiguration, mcp, netz } from './hilfen.ts';

vi.mock('../../../ingest/mcp.ts', () => ({ mcpAufrufRoh: vi.fn() }));
vi.mock('../../../ingest/netz.ts', () => ({ holeText: vi.fn() }));

const { holeVpi } = await import('../../../ingest/quellen/vpi.ts');
const { holeVpiAktuell, VpiAktuellUebersprungen } = await import('../../../ingest/quellen/vpiAktuell.ts');

beforeEach(() => {
  mcp.mockReset();
  netz.mockReset();
});

describe('holeVpiAktuell', () => {
  /** Die lange Reihe, wie `holeVpi` sie aus `eurostat.json` liefert: bis 2026-06. */
  async function amtlich(): Promise<readonly Vpiwert[]> {
    netz.mockResolvedValue(text(FIXTURE.eurostat));
    const ernte = await holeVpi(kontext());
    netz.mockReset();
    return ernte.daten;
  }

  it('rechnet die kurze Reihe auf die Basis der langen um und fuellt nur den Rand', async () => {
    const basis = await amtlich();
    netz.mockResolvedValue(text(FIXTURE.eurostatKurzfrist));

    const ctx = kontext();
    const ernte = await holeVpiAktuell(ctx, basis);

    expect(ernte.quelle).toBe('vpi-aktuell');
    // Die lange Reihe endet bei 2026-06; alles davor bleibt amtlich.
    expect(ernte.daten.map((m) => m.monat)).toEqual(['2026-07', '2026-08']);
    expect(ernte.daten.every((m) => m.quelle === 'eurostat:ei_cphi_m')).toBe(true);
    // Der Faktor ist in der Fixture exakt 1,25: 103,68 → 129,60 und 103,84 → 129,80.
    expect(ernte.daten.map((m) => m.indexWert)).toEqual([129.6, 129.8]);
    // Nachfuellen ist der Normalfall und darf kein Band in der Oberflaeche erzeugen.
    expect(ctx.befunde.hinweise).toEqual([]);
  });

  it('nennt den Umrechnungsfaktor im Archiv — ohne ihn waere die Naht nicht nachvollziehbar', async () => {
    const basis = await amtlich();
    netz.mockResolvedValue(text(FIXTURE.eurostatKurzfrist));

    const ernte = await holeVpiAktuell(kontext(), basis);

    expect(JSON.parse(ernte.rohJson)).toMatchObject({ faktor: 1.25, abMonat: '2026-06' });
  });

  it('scheitert bei zu duenner Ueberlappung, statt die Umbasierung zu raten', async () => {
    const basis = await amtlich();
    netz.mockResolvedValue(text(FIXTURE.eurostatKurzfristKurz));
    await expect(holeVpiAktuell(kontext(), basis)).rejects.toThrow(/ueberlappen/);
  });

  it('scheitert, wenn das Verhaeltnis der beiden Reihen schwankt', async () => {
    const basis = await amtlich();
    netz.mockResolvedValue(text(FIXTURE.eurostatKurzfristStreuung));
    await expect(holeVpiAktuell(kontext(), basis)).rejects.toThrow(/schwankt/);
  });

  it('ueberspringt sich ohne amtliche Reihe — ohne Basis gaebe es nichts umzurechnen', async () => {
    await expect(holeVpiAktuell(kontext(), [])).rejects.toThrow(VpiAktuellUebersprungen);
    expect(netz).not.toHaveBeenCalled();
  });

  it('ueberspringt sich, ohne das Netz zu bemuehen, wenn eine andere Inflationsquelle konfiguriert ist', async () => {
    const ctx = kontext({ konfiguration: konfiguration({ inflationsquelle: 'destatis' }) });
    await expect(holeVpiAktuell(ctx, [{ monat: '2026-06', indexWert: 129.4, quelle: 'x' }])).rejects.toThrow(
      VpiAktuellUebersprungen,
    );
    expect(netz).not.toHaveBeenCalled();
  });

  it('gibt nichts zurueck und meldet nichts, wenn die amtliche Reihe bis ans Ende reicht', async () => {
    netz.mockResolvedValue(text(FIXTURE.eurostatKurzfrist));
    const basis = [
      ...(await amtlich()),
      { monat: '2026-07', indexWert: 129.6, quelle: 'eurostat:prc_hicp_midx' },
      { monat: '2026-08', indexWert: 129.8, quelle: 'eurostat:prc_hicp_midx' },
    ];
    netz.mockResolvedValue(text(FIXTURE.eurostatKurzfrist));

    const ctx = kontext();
    const ernte = await holeVpiAktuell(ctx, basis);

    expect(ernte.daten).toEqual([]);
    expect(ctx.befunde.hinweise).toEqual([]);
  });
});
