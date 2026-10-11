/** `ingest/quellen/holdings.ts`: was die Quelle aus einer Antwort macht. Rahmen in `hilfen.ts`. */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlausibilitaetsFehler } from '../../../ingest/plausibilitaet.ts';
import { SchemaFehler } from '../../../ingest/schema.ts';
import { FIXTURE, json } from '../../fixtures/index.ts';
import { WELT } from '../../hilfen.ts';
import { HEUTE, JETZT, antwort, kontext, mcp, netz } from './hilfen.ts';

vi.mock('../../../ingest/mcp.ts', () => ({ mcpAufrufRoh: vi.fn() }));
vi.mock('../../../ingest/netz.ts', () => ({ holeText: vi.fn() }));

const { holeHoldings } = await import('../../../ingest/quellen/holdings.ts');

beforeEach(() => {
  mcp.mockReset();
  netz.mockReset();
});

describe('holeHoldings', () => {
  it('uebertraegt Bestand und einen Kurspunkt fuer heute je Position', async () => {
    mcp.mockResolvedValue(antwort(json(FIXTURE.holdings)));

    const ernte = await holeHoldings(kontext());

    expect(ernte.quelle).toBe('holdings');
    expect(ernte.daten.bestaende).toHaveLength(3);
    expect(ernte.daten.bestaende[0]).toMatchObject({
      isin: 'ZZ0000000001',
      mengeE8: 1725000000n,
      kursE6: 123456700n,
      stand: JETZT,
    });
    expect(ernte.daten.kurspunkte).toHaveLength(3);
    expect(ernte.daten.kurspunkte[0]).toMatchObject({
      isin: 'ZZ0000000001',
      tag: HEUTE,
      kurs: 123456700n,
      herkunft: 'chart_1m',
      abgerufenAm: JETZT,
    });
    // Der juengste Kursstand geht mit — die Summenprobe entscheidet an ihm, ob sie
    // ueberhaupt vergleichen darf. [ADR-015]
    expect(ernte.daten.kurseAus).toBe('2026-05-14T09:00:00+02:00');
  });

  it('bricht bei einer kaputten Antwort mit SchemaFehler ab, statt stillschweigend zu ignorieren', async () => {
    mcp.mockResolvedValue(antwort(json(FIXTURE.holdingsFeld)));
    await expect(holeHoldings(kontext())).rejects.toThrow(SchemaFehler);
  });

  it('bricht bei negativer Menge ab, statt eine falsche Zahl weiterzureichen', async () => {
    mcp.mockResolvedValue(
      antwort({
        holdings: [
          {
            isin: WELT,
            name: 'Welt',
            currentQuote: { currency: 'EUR', midPrice: 100, timestamp: JETZT },
            savingsPlan: null,
            position: { blocked: 0, filled: -1, pending: 0 },
          },
        ],
        cryptoHoldings: [],
      }),
    );
    await expect(holeHoldings(kontext())).rejects.toThrow(PlausibilitaetsFehler);
  });

  it('bricht bei Kurs <= 0 ab, statt eine falsche Zahl weiterzureichen', async () => {
    mcp.mockResolvedValue(
      antwort({
        holdings: [
          {
            isin: WELT,
            name: 'Welt',
            currentQuote: { currency: 'EUR', midPrice: 0, timestamp: JETZT },
            savingsPlan: null,
            position: { blocked: 0, filled: 1, pending: 0 },
          },
        ],
        cryptoHoldings: [],
      }),
    );
    await expect(holeHoldings(kontext())).rejects.toThrow(PlausibilitaetsFehler);
  });
});
