/**
 * Zeitgewichtete Rendite.
 *
 * Unabhaengig davon, WANN wie viel eingezahlt wurde — die Kennzahl misst die Qualitaet
 * der Anlagen, nicht das Timing. Teilperioden werden an jedem externen Cashflow
 * geschnitten. Ein Zufluss zaehlt zum Periodenbeginn, ein Abfluss zum Periodenende:
 *
 *   r_i = (V_i - CF_i) / (V_(i-1) + Zufluss_i) - 1
 *   TWR = Produkt(1 + r_i) - 1
 *
 * Abfluesse ans Tagesende, weil sonst eine Entnahme an einem Kurstag die Basis gegen
 * null drueckt: 90 % entnommen bei +10 % ergaebe +1000 %, eine Aufloesung -100 %. [ADR-043]
 *
 * Unter einem Jahr wird NICHT annualisiert — sonst werden aus drei guten Wochen
 * 400 % im Jahr. `proJahr` ist dann `null`. [P-10]
 *
 * Ein luekenhafter Tag (`DepotTag.lueckenhaft`) hat keinen verlaesslichen Gesamtwert —
 * er wird nie als Periodenende verwendet, sonst wird aus einer fehlenden Kursnotierung
 * eine Rendite von nahe -100 % gefolgt von einer ebenso erfundenen Erholung. Ein
 * Cashflow, der auf so einen Tag faellt, reist bis zum naechsten brauchbaren Tag mit. [P-05]
 *
 * Eine so verlaengerte Periode rechnet nach Modified Dietz: jeder Cashflow zaehlt mit
 * dem Anteil der Periode, in dem er im Depot lag. Zum Periodenbeginn gerechnet haette
 * eine Einzahlung kurz vor Periodenende die ganze Periode mitverdienen sollen und die
 * Rendite verduennt. Ein Zufluss gilt zu Beginn seines Tages, ein Abfluss zu dessen
 * Ende; in einer eintaegigen Periode haben sie Gewicht 1 und 0, und die Formel faellt
 * auf die obige zurueck. [ADR-036, ADR-043]
 */

import type { Cent } from './dezimal.ts';
import type { Tag } from './kalender.ts';
import { tageZwischen, vergleiche } from './kalender.ts';
import type { DepotTag, Fluss } from './typen.ts';
import { TAGE_IM_JAHR } from './xirr.ts';

export type TwrErgebnis = {
  readonly gesamt: number;
  /** null unter einem Jahr — nicht hochgerechnet. */
  readonly proJahr: number | null;
  readonly teilperioden: number;
  /** true, sobald Teilperioden aus einem Monatsraster stammen. Die Oberflaeche zeigt die Fussnote. */
  readonly grob: boolean;
  /** Indexreihe, auf 100 zum ersten Tag normiert. Speist Volatilitaet, Max. Drawdown und Sharpe-Ratio. */
  readonly index: readonly { readonly tag: Tag; readonly wert: number }[];
};

export const LEERES_ERGEBNIS: TwrErgebnis = {
  gesamt: 0,
  proJahr: null,
  teilperioden: 0,
  grob: false,
  index: [],
};

/**
 * Ab wie vielen Tagen zwischen zwei gemessenen Werten gilt die Verkettung als grob?
 * Vor 08/2025 liegen nur Monatsendkurse vor — das entspricht der gaengigen
 * Modified-Dietz-Praxis und wird ausgewiesen statt kaschiert. [P-05]
 */
export const GROB_AB_TAGEN = 20;

export function twr(reihe: readonly DepotTag[], externeFluesse: readonly Fluss[]): TwrErgebnis {
  if (reihe.length < 2) return LEERES_ERGEBNIS;

  const sortiert = [...reihe].sort((a, b) => vergleiche(a.tag, b.tag));

  const flussJeTag = new Map<Tag, Cent>();
  for (const f of externeFluesse) flussJeTag.set(f.tag, (flussJeTag.get(f.tag) ?? 0n) + f.betrag);

  const index: { tag: Tag; wert: number }[] = [];
  let faktor = 1;
  let teilperioden = 0;
  let grob = false;

  const erste = sortiert[0]!;
  index.push({ tag: erste.tag, wert: 100 });

  let vorherWert = erste.gesamtCent;
  let vorherTag = erste.tag;
  // Cashflows seit dem letzten brauchbaren Tag, je mit ihrem Tag fuer die Gewichtung.
  let periodenFluesse: { tag: Tag; betrag: Cent }[] = [];

  for (let i = 1; i < sortiert.length; i += 1) {
    const heute = sortiert[i]!;
    const flussHeute = flussJeTag.get(heute.tag);
    if (flussHeute !== undefined) periodenFluesse.push({ tag: heute.tag, betrag: flussHeute });

    if (heute.lueckenhaft) {
      // Kein verlaesslicher Wert an diesem Tag: keine Teilperiode schneiden, sonst
      // wird aus einer fehlenden Kursnotierung eine erfundene Rendite. [P-05]
      index.push({ tag: heute.tag, wert: faktor * 100 });
      continue;
    }

    const periodenTage = tageZwischen(vorherTag, heute.tag);
    let cf = 0n;
    let gewichteterCf = 0;
    for (const f of periodenFluesse) {
      cf += f.betrag;
      const abTagesende = f.betrag < 0n ? 1 : 0;
      const imDepot = periodenTage - tageZwischen(vorherTag, f.tag) + 1 - abTagesende;
      gewichteterCf += (Number(f.betrag) * imDepot) / periodenTage;
    }
    periodenFluesse = [];

    const basis = Number(vorherWert) + gewichteterCf;

    if (basis > 0) {
      const r = Number(heute.gesamtCent - vorherWert - cf) / basis;
      if (Number.isFinite(r)) {
        faktor *= 1 + r;
        teilperioden += 1;
        if (periodenTage > GROB_AB_TAGEN) grob = true;
      }
    } else if (vorherWert !== 0n || cf !== 0n) {
      // Eine Basis <= 0 trotz Bestand oder Fluss — etwa ein Abfluss, der in einer langen
      // Periode den Anfangswert uebersteigt. Keine Rendite ist besser als eine erfundene;
      // die Luecke in der Kette wird als grob ausgewiesen. [ADR-043]
      grob = true;
    }
    // Leeres Depot ohne Fluss: eine Rendite auf nichts gibt es nicht, still uebersprungen.

    index.push({ tag: heute.tag, wert: faktor * 100 });
    vorherWert = heute.gesamtCent;
    vorherTag = heute.tag;
  }

  const gesamt = faktor - 1;
  const letzte = sortiert[sortiert.length - 1]!;
  const tage = tageZwischen(erste.tag, letzte.tag);

  const proJahr =
    tage >= TAGE_IM_JAHR && faktor > 0 ? Math.pow(faktor, TAGE_IM_JAHR / tage) - 1 : null;

  return { gesamt, proJahr, teilperioden, grob, index };
}
