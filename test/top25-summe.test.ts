/**
 * Verifiziert die Summe der Top25-Depotanteile ueber den echten Lesepfad:
 * `depot_tag.positionen_json` (Kachel-4-Cache) → `etf_bestandteil` → `lookThrough`.
 */

import { describe, expect, it } from 'vitest';
import type { Cent } from '../core/dezimal.ts';
import type { Isin } from '../core/typen.ts';
import { konfiguration } from './api/hilfen.ts';
import { testDatenbank } from '../db/verbindung.ts';
import { depotTag, EUROPA, WELT } from './hilfen.ts';
import { baueLesemodell } from '../server/lesemodell.ts';
import * as depotTagRepo from '../db/repository/depotTag.ts';
import * as etfBestandteilRepo from '../db/repository/etfBestandteil.ts';

describe('Top25-Summe ueberpruefen', () => {
  it('Summe der anteilDepot bleibt innerhalb der Abdeckung', async () => {
    const db = await testDatenbank();
    const k = konfiguration();

    const positionen = new Map<Isin, Cent>([
      [WELT, 80_000_00n as Cent],
      [EUROPA, 20_000_00n as Cent],
    ]);
    depotTagRepo.schreibe(db, {
      ...depotTag('2026-08-26', '1000', { gesamtCent: 100_000_00n as Cent }),
      kernVersion: 1,
      eingabeHash: 'test',
      berechnetAm: '2026-08-26T18:00:00+02:00',
      positionen,
    });

    etfBestandteilRepo.ersetzeFuerStand(db, WELT, '2026-08-01', [
      { fondsIsin: WELT, unternehmenIsin: 'US0000000001', name: 'Firma A', gewicht: 0.6, sektor: null, land: null },
      { fondsIsin: WELT, unternehmenIsin: 'US0000000002', name: 'Firma B', gewicht: 0.3, sektor: null, land: null },
    ]);
    etfBestandteilRepo.ersetzeFuerStand(db, EUROPA, '2026-08-01', [
      // Firma A steckt auch im Europa-Fonds — die Summe muss ueber die ISIN aggregieren.
      { fondsIsin: EUROPA, unternehmenIsin: 'US0000000001', name: 'Firma A', gewicht: 0.4, sektor: null, land: null },
    ]);

    const lm = baueLesemodell(db, k);
    const d = lm.durchblick();

    for (const zeile of d.top) {
      expect(zeile.anteilDepot).toBeGreaterThanOrEqual(0);
      expect(zeile.anteilDepot).toBeLessThanOrEqual(1);
    }

    const summe = d.top.reduce((s, z) => s + z.anteilDepot, 0);
    expect(summe).toBeLessThanOrEqual(d.abdeckung + 1e-10);
    expect(d.topAnteil).toBeCloseTo(summe, 12);

    db.close();
  });
});
