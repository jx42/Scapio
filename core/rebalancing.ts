/**
 * Rebalancing: wie viel Euro je Zeile zur Zielaufteilung fehlen. [ADR-057]
 *
 * Das Ziel setzt der Nutzer, in Basispunkten (Summe 10 000). Ausgegeben wird ein Betrag
 * je Zeile, keine Stueckzahl und kein Auftrag — eine Rechnung, keine Empfehlung.
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
  readonly danachCent: Cent;
  readonly istAnteil: number;
  readonly anteilDanach: number;
};

export type RebalancingErgebnis = {
  /** `ohneWert`: Depot und Konto ohne positiven Wert; `zielUngueltig`: Basispunkte ergeben nicht 10 000. */
  readonly art: 'ok' | 'ohneWert' | 'zielUngueltig';
  readonly zeilen: readonly RebalancingZeile[];
  readonly gesamtCent: Cent;
  /** Was nach dem Umschichten noch bewegt werden muesste, um das Ziel zu erreichen. */
  readonly abstandDanachCent: Cent;
  readonly abstandDanach: number;
};

type Eingang = { readonly schluessel: Schluessel; readonly ist: Cent; readonly z: bigint };

/** Konto zuerst, dann nach Wert absteigend, dann nach ISIN — unabhaengig von der Eingabereihenfolge. */
function vergleicheZeilen(a: Eingang, b: Eingang): number {
  if (a.schluessel === KONTO) return -1;
  if (b.schluessel === KONTO) return 1;
  if (a.ist !== b.ist) return a.ist > b.ist ? -1 : 1;
  return a.schluessel < b.schluessel ? -1 : a.schluessel > b.schluessel ? 1 : 0;
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
 * Ohne Verkaeufe: das Kontoguthaben ueber dem Ziel-Cash fuellt die Positionen von unten auf.
 * Gesucht ist `L` mit `Σ max(0, L·z_i − ist_i) = B` — stueckweise linear und monoton, also
 * nach `ist_i / z_i` sortiert exakt loesbar. `L` bleibt unter `W / 10 000`, kein Kauf
 * schiesst damit ueber das Ziel hinaus.
 */
function fuelleAuf(positionen: readonly Eingang[], budget: Cent): Map<Schluessel, Cent> {
  const kaeufe = new Map<Schluessel, Cent>();
  const kandidaten = positionen
    .filter((p) => p.z > 0n)
    .sort((a, b) => {
      const l = a.ist * b.z;
      const r = b.ist * a.z;
      if (l !== r) return l < r ? -1 : 1;
      return a.schluessel < b.schluessel ? -1 : 1;
    });
  if (budget <= 0n || kandidaten.length === 0) return kaeufe;

  let lZaehler = budget;
  let lNenner = 0n;
  let k = 0;
  for (; k < kandidaten.length; k++) {
    const p = kandidaten[k]!;
    lZaehler += p.ist;
    lNenner += p.z;
    const naechste = kandidaten[k + 1];
    if (naechste === undefined || lZaehler * naechste.z <= naechste.ist * lNenner) break;
  }

  const gefuellt = kandidaten.slice(0, k + 1);
  const anteile = verteileNachGroesstemRest(
    gefuellt.map((p) => lZaehler * p.z - p.ist * lNenner),
    lNenner,
  );
  gefuellt.forEach((p, i) => kaeufe.set(p.schluessel, anteile[i]!));
  return kaeufe;
}

export function rebalanciere(
  ist: ReadonlyMap<Schluessel, Cent>,
  ziel: ReadonlyMap<Schluessel, number>,
  ohneVerkaeufe: boolean,
): RebalancingErgebnis {
  const schluessel = new Set<Schluessel>([KONTO, ...ist.keys(), ...ziel.keys()]);
  const eingaenge = [...schluessel]
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
      danachCent: e.ist,
      istAnteil: anteil(e.ist, gesamt),
      anteilDanach: anteil(e.ist, gesamt),
    })),
    gesamtCent: gesamt,
    abstandDanachCent: 0n,
    abstandDanach: 0,
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

  let deltas: Cent[];
  if (ohneVerkaeufe) {
    const konto = eingaenge[0]!;
    const budget = konto.ist - soll[0]!;
    const kaeufe = fuelleAuf(eingaenge.slice(1), budget);
    const ausgegeben = summe([...kaeufe.values()]);
    deltas = eingaenge.map((e, i) => (i === 0 ? -ausgegeben : (kaeufe.get(e.schluessel) ?? 0n)));
  } else {
    deltas = eingaenge.map((e, i) => soll[i]! - e.ist);
  }

  let abstand = 0n;
  const zeilen = eingaenge.map((e, i): RebalancingZeile => {
    const danach = e.ist + deltas[i]!;
    if (soll[i]! > danach) abstand += soll[i]! - danach;
    return {
      schluessel: e.schluessel,
      istCent: e.ist,
      zielBp: Number(e.z),
      sollCent: soll[i]!,
      deltaCent: deltas[i]!,
      danachCent: danach,
      istAnteil: anteil(e.ist, gesamt),
      anteilDanach: anteil(danach, gesamt),
    };
  });

  return { art: 'ok', zeilen, gesamtCent: gesamt, abstandDanachCent: abstand, abstandDanach: anteil(abstand, gesamt) };
}
