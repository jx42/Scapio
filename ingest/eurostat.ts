/**
 * Lesen einer Eurostat-JSON-stat-2.0-Antwort.
 *
 * Zwei Quellen holen bei Eurostat monatliche Preisreihen — `vpi` (`prc_hicp_midx`) und
 * `vpiAktuell` (`ei_cphi_m`). Beide Antworten haben dieselbe Form, und beide haengen an
 * derselben Annahme: die Anfrage pinnt JEDE Dimension ausser `time` auf genau einen Wert,
 * nur dann entspricht die Position in `value` genau dem Index in
 * `dimension.time.category.index`. Waere sie verletzt, waere die Preisreihe um Monate
 * verschoben — und eine verschobene Inflationsreihe ist in der Oberflaeche nicht zu sehen.
 * Deshalb steht die Pruefung hier einmal, statt zweimal leicht verschieden.
 *
 * Die Antwort ist bereits durch zod gegangen; diese Datei holt nichts und prueft kein
 * Schema, sie liest nur aus. [INV-12]
 */

import type { Eurostat } from './schema.ts';

export type Monatswert = {
  /** YYYY-MM */
  readonly monat: string;
  readonly wert: number;
};

export type Monatsreihe = {
  readonly monate: readonly Monatswert[];
  /** Monate ohne brauchbaren Wert — bei Eurostat regelmaessig der aktuellste. */
  readonly uebersprungen: number;
};

/**
 * Die Monate einer Eurostat-Antwort, aufsteigend sortiert.
 *
 * @throws wenn eine Dimension ausser `time` mehrdeutig ist oder die Zeitdimension fehlt —
 *         beides wuerde Werte falschen Monaten zuordnen.
 */
export function monatsreihe(antwort: Eurostat): Monatsreihe {
  const mehrdeutig: string[] = [];
  for (const [name, dim] of Object.entries(antwort.dimension)) {
    if (name === 'time') continue;
    if (Object.keys(dim.category.index).length > 1) mehrdeutig.push(name);
  }
  if (mehrdeutig.length > 0) {
    throw new Error(
      `Eurostat liefert mehrere Auspraegungen fuer ${mehrdeutig.join(', ')} — Zuordnung waere mehrdeutig.`,
    );
  }

  const zeit = antwort.dimension['time'];
  if (zeit === undefined) {
    throw new Error('Eurostat-Antwort hat keine Zeitdimension.');
  }

  const werte = antwort.value;
  const holeWert = (position: number): number | null => {
    if (Array.isArray(werte)) return werte[position] ?? null;
    return werte[String(position)] ?? null;
  };

  const monate: Monatswert[] = [];
  let uebersprungen = 0;

  for (const [monat, position] of Object.entries(zeit.category.index)) {
    if (!/^\d{4}-\d{2}$/.test(monat)) {
      uebersprungen += 1;
      continue;
    }
    const wert = holeWert(position);
    if (wert === null || !Number.isFinite(wert) || wert <= 0) {
      uebersprungen += 1;
      continue;
    }
    monate.push({ monat, wert });
  }

  monate.sort((a, b) => (a.monat < b.monat ? -1 : a.monat > b.monat ? 1 : 0));

  return { monate, uebersprungen };
}
