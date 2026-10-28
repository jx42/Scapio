/*
 * Was an einem Knoten steht, wenn der Platz nicht reicht. Der Name geht vor: erst weicht der
 * Anteil, dann der Betrag — beide stehen auch in der Tabelle —, erst danach wird der Name
 * gekuerzt.
 */

import { de } from '@/i18n/de';
import { GEWINN_NAME_MINDESTZEICHEN } from '@/lib/chartmasse';
import { gekuerzt } from '@/lib/format';

/** Was neben dem Namen steht: 0 Betrag und Anteil, 1 nur Betrag, 2 nichts. */
export type Stufe = 0 | 1 | 2;

export type Beschriftung = {
  readonly name: string;
  /** `null`, wenn neben dem Namen kein Platz bleibt. */
  readonly wert: string | null;
};

export type BeschriftungEingabe = {
  readonly name: string;
  /** Formatiert, mit Pfeil. */
  readonly betrag: string;
  /** Formatiert; `null`, wenn kein Anteil gezeigt wird. */
  readonly anteil: string | null;
  /** Platz einer Zeile in Zeichen, aus `gewinnBeschriftungZeichen`. */
  readonly zeichen: number;
};

function werte({ betrag, anteil }: BeschriftungEingabe): readonly [string, string, null] {
  return [anteil === null ? betrag : de.gewinnquellen.betragUndAnteil(betrag, anteil), betrag, null];
}

function platz(zeichen: number, wert: string | null): number {
  return wert === null ? zeichen : zeichen - wert.length - 1;
}

/** Die erste Stufe, auf der der Name einzeilig nicht unter seine Mindestlaenge faellt. */
export function noetigeStufe(e: BeschriftungEingabe): Stufe {
  const mindestens = Math.min(e.name.length, GEWINN_NAME_MINDESTZEICHEN);
  const [mitAnteil, betrag] = werte(e);
  if (platz(e.zeichen, mitAnteil) >= mindestens) return 0;
  if (platz(e.zeichen, betrag) >= mindestens) return 1;
  return 2;
}

/**
 * Einzeilig gilt `stufe` fuer alle Knoten des Diagramms, sonst stuende neben einem Namen ein
 * Betrag und neben dem naechsten keiner. Zweizeilig hat der Wert seine eigene Zeile.
 */
export function beschriftung(e: BeschriftungEingabe, einzeilig: boolean, stufe: Stufe): Beschriftung {
  const w = werte(e);
  if (!einzeilig) return { name: gekuerzt(e.name, e.zeichen), wert: w[0].length <= e.zeichen ? w[0] : w[1] };
  const wert = w[stufe];
  return { name: gekuerzt(e.name, platz(e.zeichen, wert)), wert };
}
