/**
 * Kursentwicklung je Position, ab dem eigenen ersten Kurs im Fenster gleich 0 %, dazu die
 * Lage jedes Kaufs auf der Linie. Nicht geldgewichtet, damit Positionen untereinander
 * vergleichbar bleiben (ADR-063).
 */

import type { KursE6 } from './dezimal.ts';
import { entwicklung } from './dezimal.ts';
import type { Tag } from './kalender.ts';
import { alsTag, tageZwischen, vergleiche } from './kalender.ts';
import type { Kurspunkt, Rasterwert } from './kursraster.ts';
import { rasterFuer } from './kursraster.ts';
import type { Isin } from './typen.ts';

export type PositionsEingabe = {
  readonly isin: Isin;
  readonly name: string;
  /** Verschmolzen (`verschmelzeKurse`): je Tag höchstens ein Punkt. */
  readonly kurse: readonly Kurspunkt[];
  readonly kaufTage: readonly Tag[];
};

export type VerlaufKauf = {
  readonly tag: Tag;
  /** Zeile in `punkte`, auf der der Kauf liegt; älter als ein Jahr oft nicht der Kauftag selbst. */
  readonly punktTag: Tag;
};

export type VerlaufLinie = {
  readonly isin: Isin;
  readonly name: string;
  readonly kaeufe: readonly VerlaufKauf[];
};

export type VerlaufPunkt = {
  readonly tag: Tag;
  readonly werte: Readonly<Record<string, number | null>>;
};

export type PositionsverlaufErgebnis = {
  readonly linien: readonly VerlaufLinie[];
  readonly punkte: readonly VerlaufPunkt[];
};

type Reihe = VerlaufLinie & {
  readonly basis: KursE6 | null;
  readonly raster: ReadonlyMap<Tag, Rasterwert>;
};

const ERSTER_MONTAG = alsTag('1970-01-05');

function kalenderwoche(tag: Tag): number {
  return Math.floor(tageZwischen(ERSTER_MONTAG, tag) / 7);
}

/** Letzter gemessener Tag bis zum Kauf, sonst der erste danach. `gemessen` ist sortiert und nicht leer. */
function kaeufeAufLinie(kaufTage: readonly Tag[], gemessen: readonly Tag[], von: Tag, bis: Tag): VerlaufKauf[] {
  const sortiert = [...new Set(kaufTage)]
    .filter((t) => vergleiche(t, von) >= 0 && vergleiche(t, bis) <= 0)
    .sort(vergleiche);

  const kaeufe: VerlaufKauf[] = [];
  let bisKauf = 0;
  for (const tag of sortiert) {
    while (bisKauf < gemessen.length && vergleiche(gemessen[bisKauf]!, tag) <= 0) bisKauf += 1;
    kaeufe.push({ tag, punktTag: gemessen[Math.max(bisKauf - 1, 0)]! });
  }
  return kaeufe;
}

/**
 * `ausduennen` behält je Kalenderwoche die letzte Zeile, nicht jeden siebten Tag: so überleben
 * die Monatsenden älterer Jahre. Erste und letzte Zeile, der erste Wert jeder Linie und jeder
 * Kauf-Punkt bleiben immer, weil Linie und Tooltip sie über genau diese Zeile finden.
 */
export function berechnePositionsverlauf(
  positionen: readonly PositionsEingabe[],
  von: Tag,
  bis: Tag,
  ausduennen: boolean,
): PositionsverlaufErgebnis {
  const tage = new Set<Tag>();
  const behalten = new Set<Tag>();

  const reihen = positionen.map((p): Reihe => {
    const kurse = p.kurse
      .filter((k) => k.kurs > 0n && vergleiche(k.tag, von) >= 0 && vergleiche(k.tag, bis) <= 0)
      .sort((a, b) => vergleiche(a.tag, b.tag));
    const erster = kurse[0];
    if (erster === undefined) return { isin: p.isin, name: p.name, kaeufe: [], basis: null, raster: new Map() };

    const gemessen = kurse.map((k) => k.tag);
    for (const tag of gemessen) tage.add(tag);
    behalten.add(erster.tag);
    const kaeufe = kaeufeAufLinie(p.kaufTage, gemessen, von, bis);
    for (const k of kaeufe) behalten.add(k.punktTag);

    return { isin: p.isin, name: p.name, kaeufe, basis: erster.kurs, raster: rasterFuer(kurse, von, bis) };
  });

  const alle = [...tage].sort(vergleiche);
  const letzteJeWoche = new Map<number, Tag>();
  for (const tag of alle) letzteJeWoche.set(kalenderwoche(tag), tag);
  const zeilen = ausduennen
    ? alle.filter((tag) => behalten.has(tag) || letzteJeWoche.get(kalenderwoche(tag)) === tag)
    : alle;

  return {
    linien: reihen.map(({ isin, name, kaeufe }) => ({ isin, name, kaeufe })),
    punkte: zeilen.map((tag) => {
      const werte: Record<string, number | null> = {};
      for (const r of reihen) {
        const wert = r.raster.get(tag);
        werte[r.isin] = wert === undefined || r.basis === null ? null : entwicklung(wert.kurs, r.basis);
      }
      return { tag, werte };
    }),
  };
}
