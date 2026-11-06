/** `ingest/quellen/kurse.ts`: was die Quelle aus einer Antwort macht. Rahmen in `hilfen.ts`. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FIXTURE, json } from '../../fixtures/index.ts';
import { WELT } from '../../hilfen.ts';
import { EM, SYNTHETISCHER_GLOBALFONDS, antwort, kontext, leeresFenster, mcp, netz } from './hilfen.ts';

vi.mock('../../../ingest/mcp.ts', () => ({ mcpAufrufRoh: vi.fn() }));
vi.mock('../../../ingest/netz.ts', () => ({ holeText: vi.fn() }));

const { holeKurse } = await import('../../../ingest/quellen/kurse.ts');

beforeEach(() => {
  mcp.mockReset();
  netz.mockReset();
});

describe('holeKurse', () => {
  it('sammelt Punkte aus allen vier Fenstern mit der jeweils richtigen Herkunft', async () => {
    mcp.mockImplementation(async (_tool: string, optionen?: { ergaenzung?: { fenster?: string } }) => {
      const fenster = optionen?.ergaenzung?.fenster;
      if (fenster === 'max') return antwort(json(FIXTURE.chartMax));
      if (fenster === 'one_month') return antwort(json(FIXTURE.chart1m));
      return antwort(leeresFenster(SYNTHETISCHER_GLOBALFONDS, fenster));
    });

    const ctx = kontext();
    const ernte = await holeKurse(ctx, SYNTHETISCHER_GLOBALFONDS);

    expect(ernte.daten.fehlendeFenster).toEqual([]);
    expect(ernte.daten.kurspunkte).toHaveLength(8 + 5);
    expect(ernte.daten.kurspunkte.filter((p) => p.herkunft === 'chart_max')).toHaveLength(8);
    expect(ernte.daten.kurspunkte.filter((p) => p.herkunft === 'chart_1m')).toHaveLength(5);
    expect(ctx.befunde.leer).toBe(true);
  });

  it('isoliert einen fehlgeschlagenen Abruf auf sein Fenster, statt die Quelle abzubrechen', async () => {
    mcp.mockImplementation(async (_tool: string, optionen?: { ergaenzung?: { fenster?: string } }) => {
      const fenster = optionen?.ergaenzung?.fenster;
      if (fenster === 'one_year' || fenster === 'three_months') throw new Error('E_MCP_ABGELEHNT');
      return antwort(leeresFenster(WELT, fenster));
    });

    const ctx = kontext();
    const ernte = await holeKurse(ctx, WELT);

    expect(ernte.daten.fehlendeFenster).toEqual(['one_year', 'three_months']);
    expect(ctx.befunde.hinweise).toContainEqual({
      art: 'kursfensterNichtAbrufbar',
      werte: { fenster: 'one_year', isin: WELT, grund: 'Error' },
    });
  });

  it('verwirft ein Fenster, dessen Antwort nicht zum Schema passt', async () => {
    mcp.mockImplementation(async (_tool: string, optionen?: { ergaenzung?: { fenster?: string } }) => {
      const fenster = optionen?.ergaenzung?.fenster;
      if (fenster === 'max') return antwort(json(FIXTURE.chartPunkt));
      return antwort(leeresFenster(WELT, fenster));
    });

    const ctx = kontext();
    const ernte = await holeKurse(ctx, WELT);

    expect(ernte.daten.fehlendeFenster).toContain('max');
    expect(ctx.befunde.hinweise).toContainEqual({ art: 'kursfensterSchema', werte: { fenster: 'max', isin: WELT } });
  });

  it('verwirft ein Fenster, dessen Antwort eine andere ISIN betrifft', async () => {
    mcp.mockResolvedValue(antwort(leeresFenster(EM, 'max')));

    const ctx = kontext();
    const ernte = await holeKurse(ctx, WELT);

    expect(ernte.daten.fehlendeFenster).toHaveLength(4);
    expect(ctx.befunde.hinweise).toContainEqual({ art: 'kursfensterAndereIsin', werte: { fenster: 'max', isin: WELT } });
  });

  it('verwirft einen Kurs <= 0 einzeln und behaelt die uebrigen Punkte des Fensters', async () => {
    mcp.mockImplementation(async (_tool: string, optionen?: { ergaenzung?: { fenster?: string } }) => {
      const fenster = optionen?.ergaenzung?.fenster;
      const dataPoints =
        fenster === 'max'
          ? [
              { timestampUtc: '2026-01-02T00:00:00+01:00', midPrice: 0 },
              { timestampUtc: '2026-01-05T00:00:00+01:00', midPrice: 101.5 },
              { timestampUtc: '2026-01-06T00:00:00+01:00', midPrice: -3 },
            ]
          : fenster === 'one_year'
            ? [{ timestampUtc: '2026-01-07T00:00:00+01:00', midPrice: 0 }]
            : [];
      return antwort({ ...leeresFenster(WELT, fenster), dataPoints });
    });

    const ctx = kontext();
    const ernte = await holeKurse(ctx, WELT);

    expect(ernte.daten.kurspunkte.map((p) => p.tag)).toEqual(['2026-01-05']);
    expect(ernte.daten.fehlendeFenster).toEqual([]);
    expect(ctx.befunde.hinweise).toEqual([{ art: 'kurspunkteUngueltig', werte: { isin: WELT, anzahl: 3 } }]);
  });
});
