/**
 * Rebalancing: wie viel Euro je Zeile zur Zielaufteilung fehlen. [ADR-057]
 *
 * Das Ziel setzt der Nutzer, in Basispunkten (Summe 10 000), fuer die Zeilen, die er
 * einbezieht. Ausgegeben wird ein Betrag je Zeile, keine Stueckzahl und kein Auftrag —
 * eine Rechnung, keine Empfehlung.
 */

import type { Cent } from './dezimal.ts';
import { anteil, summe, verteileNachGroesstemRest } from './dezimal.ts';
import type { Isin } from './typen.ts';

/** Das Verrechnungskonto als eigene Zeile neben den ISINs. */
export const KONTO = 'KONTO';
export type Schluessel = Isin | typeof KONTO;

export const BP_GANZ = 10_000;

export type RebalancingZeile = {
  readonly schluessel: Schluessel;
  readonly istCent: Cent;
  readonly zielBp: number;
  /** Ziel in Cent, nach groesstem Rest auf `gesamtCent` verteilt. */
  readonly sollCent: Cent;
  /** Positiv: kaufen bzw. einzahlen; negativ: verkaufen bzw. vom Konto nehmen. */
  readonly deltaCent: Cent;
  readonly istAnteil: number;
};

export type RebalancingErgebnis = {
  /** `ohneWert`: die einbezogenen Zeilen ohne positiven Wert; `zielUngueltig`: Basispunkte ergeben nicht 10 000. */
  readonly art: 'ok' | 'ohneWert' | 'zielUngueltig';
  readonly zeilen: readonly RebalancingZeile[];
  /** Summe der einbezogenen Zeilen, nicht des ganzen Depots. */
  readonly gesamtCent: Cent;
};

type Eingang = { readonly schluessel: Schluessel; readonly ist: Cent; readonly z: bigint };

/** Konto zuerst, dann nach Wert absteigend, dann nach ISIN — unabhaengig von der Eingabereihenfolge. */
function vergleicheZeilen(a: Eingang, b: Eingang): number {
  if (a.schluessel === KONTO) return -1;
  if (b.schluessel === KONTO) return 1;
  if (a.ist !== b.ist) return a.ist > b.ist ? -1 : 1;
  return vergleicheSchluessel(a, b);
}

function vergleicheSchluessel(a: Eingang, b: Eingang): number {
  return a.schluessel < b.schluessel ? -1 : a.schluessel > b.schluessel ? 1 : 0;
}

function zielGueltig(ziel: ReadonlyMap<Schluessel, number>): boolean {
  let s = 0;
  for (const bp of ziel.values()) {
    if (!Number.isInteger(bp) || bp < 0 || bp > BP_GANZ) return false;
    s += bp;
  }
  return s === BP_GANZ;
}

/**
 * Einbezogen sind genau die Zeilen des Ziels; was nur in `ist` steht, hat der Nutzer
 * ausgeschlossen und zaehlt weder zur Summe noch zum Ergebnis.
 */
export function rebalanciere(ist: ReadonlyMap<Schluessel, Cent>, ziel: ReadonlyMap<Schluessel, number>): RebalancingErgebnis {
  const eingaenge = [...ziel.keys()]
    .map((s) => ({ schluessel: s, ist: ist.get(s) ?? 0n, z: BigInt(Number.isInteger(ziel.get(s)) ? ziel.get(s)! : 0) }))
    .sort(vergleicheZeilen);
  const gesamt = summe(eingaenge.map((e) => e.ist));

  const unveraendert = (art: RebalancingErgebnis['art']): RebalancingErgebnis => ({
    art,
    zeilen: eingaenge.map((e) => ({
      schluessel: e.schluessel,
      istCent: e.ist,
      zielBp: Number(e.z),
      sollCent: 0n,
      deltaCent: 0n,
      istAnteil: anteil(e.ist, gesamt),
    })),
    gesamtCent: gesamt,
  });

  if (!zielGueltig(ziel)) return unveraendert('zielUngueltig');
  if (gesamt <= 0n) return unveraendert('ohneWert');

  // Gleichstand beim Rest nach Schluessel, nicht nach Wert: sonst kippte ein Cent zwischen
  // zwei Laeufen, sobald sich durch das Umschichten die Reihenfolge der Werte aendert.
  const nachSchluessel = eingaenge.map((_, i) => i).sort((a, b) => vergleicheSchluessel(eingaenge[a]!, eingaenge[b]!));
  const sollSortiert = verteileNachGroesstemRest(
    nachSchluessel.map((i) => gesamt * eingaenge[i]!.z),
    BigInt(BP_GANZ),
  );
  const soll: Cent[] = new Array<Cent>(eingaenge.length);
  nachSchluessel.forEach((i, k) => (soll[i] = sollSortiert[k]!));

  const zeilen = eingaenge.map((e, i): RebalancingZeile => ({
    schluessel: e.schluessel,
    istCent: e.ist,
    zielBp: Number(e.z),
    sollCent: soll[i]!,
    deltaCent: soll[i]! - e.ist,
    istAnteil: anteil(e.ist, gesamt),
  }));

  return { art: 'ok', zeilen, gesamtCent: gesamt };
}
