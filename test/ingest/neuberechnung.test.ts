/**
 * Der Ingest meldet lueckenhafte Tage nur aus einem jungen Fenster.
 *
 * Die Gesamtzahl wird von der Fruehzeit des Depots beherrscht und ist deshalb keine
 * Meldung, sondern ein Dauerzustand. Diese Tests halten fest, was das Fenster leisten
 * soll: der Altbestand schweigt, ein frischer Kursausfall meldet sich.
 */

import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { zuKursE6 } from '../../core/dezimal.ts';
import type { Tag } from '../../core/kalender.ts';
import { plusTage, vergleiche } from '../../core/kalender.ts';
import {
  depotTag as depotTagRepo,
  kurs as kursRepo,
  inTransaktion,
  transaktion as txRepo,
} from '../../db/repository/index.ts';
import { testDatenbank } from '../../db/verbindung.ts';
import { JUNGE_SPANNE_TAGE } from '../../core/kennzahlen.ts';
import { berechneNeu } from '../../ingest/neuberechnung.ts';
import { T, WELT, kauf } from '../hilfen.ts';

let db: DatabaseSync;

beforeEach(async () => {
  db = await testDatenbank();
});

afterEach(() => {
  db.close();
});

const HEUTE = T('2026-09-01');
const KAUFTAG = T('2026-01-01');

/** Ein Kauf am `KAUFTAG` und Tageskurse von dort bis `bisKurse` — danach nichts mehr. */
function seede(bisKurse: Tag): void {
  inTransaktion(db, () => {
    txRepo.schreibeViele(db, [{ ...kauf('2026-01-01', WELT, '10', '1000'), gesehenAm: '2026-09-01T10:00:00+02:00' }]);
    const kurse = [];
    for (let t = KAUFTAG; vergleiche(t, bisKurse) <= 0; t = plusTage(t, 1)) {
      kurse.push({ isin: WELT, tag: t, kurs: zuKursE6('100'), herkunft: 'chart_1m' as const });
    }
    kursRepo.schreibeViele(db, kurse);
  });
}

describe('berechneNeu — lueckenhafte Tage', () => {
  it('meldet nichts als jung, solange die Kurse bis heute reichen', () => {
    seede(HEUTE);
    const neu = berechneNeu(db, HEUTE);
    expect(neu.lueckenhafteTage).toBe(0);
    expect(neu.lueckenhafteTageJung).toBe(0);
  });

  it('zaehlt einen frischen Kursausfall — und nur ihn', () => {
    // Kurse enden vor zehn Tagen. Die Fuellgrenze des Rasters ueberbrueckt fuenf davon,
    // der Rest ist lueckenhaft und faellt vollstaendig ins junge Fenster.
    seede(plusTage(HEUTE, -10));
    const neu = berechneNeu(db, HEUTE);
    expect(neu.lueckenhafteTage).toBeGreaterThan(0);
    expect(neu.lueckenhafteTageJung).toBe(neu.lueckenhafteTage);
  });

  it('schweigt zu alten Luecken, die aus dem Fenster herausgewandert sind', () => {
    // Eine Luecke mitten in der Historie, weit vor dem Fenster: sie zaehlt in die
    // Gesamtzahl, aber nicht in die Meldung.
    seede(HEUTE);
    inTransaktion(db, () => {
      db.prepare('DELETE FROM kurs WHERE tag >= ? AND tag <= ?').run('2026-03-01', '2026-03-31');
    });
    const neu = berechneNeu(db, HEUTE);
    expect(neu.lueckenhafteTage).toBeGreaterThan(0);
    expect(neu.lueckenhafteTageJung).toBe(0);
  });

  it('reicht genau JUNGE_SPANNE_TAGE weit zurueck, den heutigen Tag eingeschlossen', () => {
    seede(plusTage(HEUTE, -(JUNGE_SPANNE_TAGE + 20)));
    const neu = berechneNeu(db, HEUTE);
    expect(neu.lueckenhafteTageJung).toBe(JUNGE_SPANNE_TAGE);
    expect(neu.lueckenhafteTage).toBeGreaterThan(JUNGE_SPANNE_TAGE);
  });
});

/** Eine ISIN aus `benchmarks.ts`, aber ohne jede Transaktion — wie ein echter Vergleichs-ETF. */
const BENCHMARK_ISIN = 'IE00BKM4GZ66';

describe('berechneNeu — Benchmark-ISINs', () => {
  it('aendert den Depotwert nicht: Kurse ohne Bestand bleiben aussen vor', () => {
    seede(HEUTE);
    const ohneBenchmark = berechneNeu(db, HEUTE);
    const tagOhneBenchmark = depotTagRepo.fuerTag(db, HEUTE);

    inTransaktion(db, () => {
      const kurse = [];
      for (let t = KAUFTAG; vergleiche(t, HEUTE) <= 0; t = plusTage(t, 1)) {
        kurse.push({ isin: BENCHMARK_ISIN, tag: t, kurs: zuKursE6('50'), herkunft: 'chart_1m' as const });
      }
      kursRepo.schreibeViele(db, kurse);
    });
    const mitBenchmark = berechneNeu(db, HEUTE);
    const tagMitBenchmark = depotTagRepo.fuerTag(db, HEUTE);

    expect(tagOhneBenchmark).not.toBeNull();
    expect(tagMitBenchmark).not.toBeNull();
    expect(tagMitBenchmark?.gesamtCent).toBe(tagOhneBenchmark?.gesamtCent);
    expect(tagMitBenchmark?.wertpapiereCent).toBe(tagOhneBenchmark?.wertpapiereCent);
    expect(tagMitBenchmark?.positionen.has(BENCHMARK_ISIN)).toBe(false);
    expect(mitBenchmark.lueckenhafteTage).toBe(ohneBenchmark.lueckenhafteTage);
  });
});
