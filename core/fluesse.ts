/**
 * Monatliche Zu- und Abfluesse, durchschnittliche Sparrate, rollierender Schnitt.
 *
 * Generisch ueber `Fluss[]` — was als Zu- und Abfluss zaehlt, entscheidet die
 * aufrufende Stelle, nicht diese Datei. `core/kennzahlen.ts` speist die Sparrate mit
 * `externeFluesse` (echte Ueberweisungen), `server/lesemodell.ts` speist Kachel 5 mit
 * `investitionsFluesse` (Kaeufe und Verkaeufe). Siehe ADR-008.
 */

import type { Cent } from './dezimal.ts';
import { rundeAufCent } from './dezimal.ts';
import type { Tag } from './kalender.ts';
import { monatsSpanne, monatVon } from './kalender.ts';
import type { Fluss } from './typen.ts';

export type Monatsfluss = {
  readonly monat: string;
  /** Zufluesse des Monats, positiv. */
  readonly zu: Cent;
  /** Abfluesse des Monats, positiv dargestellt. */
  readonly ab: Cent;
};

export type Flussuebersicht = {
  readonly monate: readonly Monatsfluss[];
  /** Durchschnittlicher Nettozufluss ueber alle Monate seit dem ersten. */
  readonly schnitt: Cent;
  /** Rollierender Schnitt der letzten zwoelf Monate — die heutige Sparrate. */
  readonly schnitt12: Cent;
  readonly median: Cent;
};

export const LEERE_UEBERSICHT: Flussuebersicht = {
  monate: [],
  schnitt: 0n,
  schnitt12: 0n,
  median: 0n,
};

/**
 * Monate lueckenlos von der ersten bis zur letzten Bewegung, mit `bis` bis zu diesem Tag.
 * Monate ohne Bewegung erscheinen mit null — ein fehlender Monat im Balkendiagramm
 * saehe aus wie ein kuerzerer Zeitraum, nicht wie eine Pause. Aus demselben Grund
 * reicht die Sparrate bis heute: wer vor zwei Jahren aufgehoert hat einzuzahlen, spart
 * heute nichts mehr, auch wenn die letzten zwoelf Monate *mit* Zahlung anderes sagen.
 */
export function monatsFluesse(externe: readonly Fluss[], bis?: Tag): Flussuebersicht {
  if (externe.length === 0) return LEERE_UEBERSICHT;

  const jeMonat = new Map<string, { zu: Cent; ab: Cent }>();
  let ersterMonat: string | null = null;
  let letzterMonat: string | null = null;

  for (const f of externe) {
    const monat = monatVon(f.tag);
    if (ersterMonat === null || monat < ersterMonat) ersterMonat = monat;
    if (letzterMonat === null || monat > letzterMonat) letzterMonat = monat;

    let eintrag = jeMonat.get(monat);
    if (eintrag === undefined) {
      eintrag = { zu: 0n, ab: 0n };
      jeMonat.set(monat, eintrag);
    }
    if (f.betrag >= 0n) eintrag.zu += f.betrag;
    else eintrag.ab += -f.betrag;
  }

  if (bis !== undefined && monatVon(bis) > letzterMonat!) letzterMonat = monatVon(bis);

  const monate: Monatsfluss[] = monatsSpanne(ersterMonat!, letzterMonat!).map((monat) => {
    const eintrag = jeMonat.get(monat);
    return { monat, zu: eintrag?.zu ?? 0n, ab: eintrag?.ab ?? 0n };
  });

  const netto = monate.map((m) => m.zu - m.ab);

  const anzahl = BigInt(monate.length);
  let summe = 0n;
  for (const n of netto) summe += n;
  const schnitt = anzahl === 0n ? 0n : rundeAufCent(summe, anzahl);

  const letzteZwoelf = netto.slice(-12);
  let summe12 = 0n;
  for (const n of letzteZwoelf) summe12 += n;
  const schnitt12 =
    letzteZwoelf.length === 0 ? 0n : rundeAufCent(summe12, BigInt(letzteZwoelf.length));

  return { monate, schnitt, schnitt12, median: medianVon(netto) };
}

function medianVon(werte: readonly Cent[]): Cent {
  if (werte.length === 0) return 0n;
  const sortiert = [...werte].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mitte = sortiert.length >> 1;
  if (sortiert.length % 2 === 1) return sortiert[mitte]!;
  return rundeAufCent(sortiert[mitte - 1]! + sortiert[mitte]!, 2n);
}

/** Durchschnittlicher Nettozufluss pro Monat ueber genau die uebergebenen Monate (Fenster von Kachel 5). */
export function schnittDerMonate(monate: readonly Monatsfluss[]): Cent {
  if (monate.length === 0) return 0n;
  let summe = 0n;
  for (const m of monate) summe += m.zu - m.ab;
  return rundeAufCent(summe, BigInt(monate.length));
}

/** Die letzten `anzahl` Monate der Uebersicht, fuer das 12-Monats-Fenster in Kachel 5. */
export function letzteMonate(uebersicht: Flussuebersicht, anzahl: number): Monatsfluss[] {
  return uebersicht.monate.slice(-anzahl);
}
