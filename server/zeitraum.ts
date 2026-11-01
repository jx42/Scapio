/**
 * Kalendarische Auswahl fuer die Routen: Anfrageparameter gegen die Listen aus
 * `zeitfenster.ts` pruefen und den Beginn eines Zeitraums bestimmen. Zeitraeume werden
 * ueber Kalenderfunktionen bestimmt, nie ueber Millisekundenarithmetik. [INV-03]
 */

import type { Tag } from '../core/kalender.ts';
import { alsTag, tageImMonat } from '../core/kalender.ts';
import type { Fenster, Zeitraum } from '../shared/zeitfenster.ts';
import { FENSTER, ZEITRAEUME } from '../shared/zeitfenster.ts';
import { parameterAbgelehnt } from './fehler.ts';

export function alsZeitraum(roh: unknown): Zeitraum {
  if (typeof roh === 'string' && (ZEITRAEUME as readonly string[]).includes(roh)) return roh as Zeitraum;
  if (roh === undefined) return 'max';
  throw parameterAbgelehnt('zeitraum');
}

/**
 * Ein Tag aus der Adresszeile, fuer den frei gewaehlten Zeitraum. Ungueltig heisst
 * `E_PARAMETER` — der `KalenderFehler` traegt den Fremdtext und bleibt deshalb hier.
 */
export function alsTagParameter(roh: unknown, name: string): Tag {
  if (typeof roh !== 'string') throw parameterAbgelehnt(name);
  try {
    return alsTag(roh);
  } catch {
    throw parameterAbgelehnt(name);
  }
}

export function alsFenster(roh: unknown): Fenster {
  if (typeof roh === 'string' && (FENSTER as readonly string[]).includes(roh)) return roh as Fenster;
  if (roh === undefined) return '12m';
  throw parameterAbgelehnt('fenster');
}

/**
 * Kalendarische Monatsverschiebung. `core/kalender.ts` hat keine — deshalb hier, aus
 * `tageImMonat` und `alsTag` gebaut, ohne eine einzige Millisekunde. [INV-03]
 * Der 31. minus einen Monat ist der 28./29./30. — nie ein Ueberlauf in den Folgemonat.
 */
export function minusMonate(t: Tag, monate: number): Tag {
  const jahr = Number(t.slice(0, 4));
  const monat = Number(t.slice(5, 7));
  const tag = Number(t.slice(8, 10));

  const gesamt = jahr * 12 + (monat - 1) - monate;
  const zielJahr = Math.floor(gesamt / 12);
  const zielMonat = gesamt - zielJahr * 12 + 1;
  const grenze = tageImMonat(zielJahr, zielMonat);
  const zielTag = Math.min(tag, grenze);

  return alsTag(
    `${String(zielJahr).padStart(4, '0')}-${String(zielMonat).padStart(2, '0')}-${String(zielTag).padStart(2, '0')}`,
  );
}

/** Erster Tag eines Zeitraums, kalendarisch bestimmt. */
export function beginnVon(zeitraum: Zeitraum, heute: Tag, erster: Tag): Tag {
  switch (zeitraum) {
    case '1m':
      return minusMonate(heute, 1);
    case 'ytd':
      return alsTag(`${heute.slice(0, 4)}-01-01`);
    case '1j':
      return minusMonate(heute, 12);
    case '3j':
      return minusMonate(heute, 36);
    case '5j':
      return minusMonate(heute, 60);
    case 'max':
      return erster;
  }
}
