/**
 * Das Vergleichsdepot fuer Verlauf und Jahresuebersicht: dieselben externen Fluesse, am
 * selben Tag in die gewaehlte Benchmark-ISIN investiert statt ins echte Depot. Raster ueber
 * die volle Historie (`erster`..`letzter`), nicht nur das Fenster — `baueBenchmarkreihe`
 * simuliert selbst ab dem ersten Fluss und braucht dafuer Kurse vor `von`.
 */

import type { DatabaseSync } from 'node:sqlite';
import { baueBenchmarkreihe, risikofreiesRaster } from '../core/benchmark.ts';
import type { Tag } from '../core/kalender.ts';
import { rasterFuer, verschmelzeKurse } from '../core/kursraster.ts';
import type { DepotTag, Fluss } from '../core/typen.ts';
import * as repository from '../db/repository/index.ts';
import { BENCHMARKS, RISIKOFREI, RISIKOFREI_ISIN } from './vertrag.ts';

/** Unbekannt oder fehlend wird still zu `null` — eine kaputte gespeicherte Auswahl im
 * localStorage soll die Kachel nicht sperren, anders als ein ungueltiger `zeitraum`. */
export function alsBenchmarkIsin(wert: unknown): string | null {
  if (typeof wert !== 'string') return null;
  if (wert === RISIKOFREI_ISIN) return wert;
  return BENCHMARKS.some((b) => b.isin === wert) ? wert : null;
}

export type Vergleichsdepot = {
  readonly info: { readonly isin: string; readonly name: string };
  /** null, wenn es fuer die Benchmark keine Kurse (bzw. keine Zinsen) gibt. */
  readonly reihe: DepotTag[] | null;
};

export function vergleichsdepot(
  db: DatabaseSync,
  isin: string,
  fluesse: readonly Fluss[],
  erster: Tag,
  letzter: Tag,
  von: Tag,
  bis: Tag,
): Vergleichsdepot | null {
  if (isin === RISIKOFREI_ISIN) {
    const raster = risikofreiesRaster(repository.zins.alsKarte(db), erster, letzter);
    return { info: RISIKOFREI, reihe: raster.size === 0 ? null : baueBenchmarkreihe({ fluesse, raster, von, bis }) };
  }
  const eintrag = BENCHMARKS.find((b) => b.isin === isin);
  if (eintrag === undefined) return null;
  const kurspunkte = repository.kurs.fuerIsin(db, isin);
  if (kurspunkte.length === 0) return { info: eintrag, reihe: null };
  const raster = rasterFuer(verschmelzeKurse(kurspunkte), erster, letzter);
  return { info: eintrag, reihe: baueBenchmarkreihe({ fluesse, raster, von, bis }) };
}
