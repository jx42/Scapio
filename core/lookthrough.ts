/**
 * Blick durch die ETFs auf die tatsaechlich gehaltenen Unternehmen.
 *
 *   Exposure(c) = Summe_f  V_f × w_(f,c)
 *
 * Aggregiert wird strikt ueber die ISIN des Unternehmens, NIE ueber den Namen — nur so
 * faellt zusammen, was zusammengehoert: Nestlé steckt im World- und im Europe-ETF, und
 * erst die Summe zeigt die echte Position. Der Name der ersten Fundstelle gewinnt fuer
 * die Anzeige. [P-05]
 *
 * Gold und Cash haben keine Bestandteile. Die Abdeckungsquote nennt genau das —
 * ohne sie waeren die Prozentwerte irrefuehrend.
 *
 * Laender und Sektoren laufen ueber ALLE Bestandteile, nicht nur ueber die Top 25, und
 * beziehen sich auf den durchschauten Teil: ein Gold-ETC hat kein Land. Gruppiert wird
 * nach dem Rohtext des Anbieters; die Uebersetzung ist Sache der Oberflaeche.
 */

import { summeAnteile } from './anteile.ts';
import type { Cent } from './dezimal.ts';
import { rundeAufCent } from './dezimal.ts';
import { vergleiche } from './kalender.ts';
import type { Isin } from './typen.ts';

export type Bestandteil = {
  readonly fondsIsin: Isin;
  readonly unternehmenIsin: string;
  /** Fremdtext aus der iShares-Antwort. Nur Text, nie Markup. [INV-06] */
  readonly name: string;
  /** Anteil am Fonds, 0..1. */
  readonly gewicht: number;
  readonly sektor: string | null;
  readonly land: string | null;
};

export type Fondsanteil = {
  readonly isin: Isin;
  readonly anteil: Cent;
};

export type Unternehmenszeile = {
  readonly unternehmenIsin: string;
  readonly name: string;
  readonly exposure: Cent;
  /** Anteil am gesamten Depot, 0..1. */
  readonly anteilDepot: number;
  readonly ausFonds: readonly Fondsanteil[];
  readonly sektor: string | null;
  readonly land: string | null;
};

export type Gruppe = {
  /** Rohtext des Anbieters; `null` sammelt den Rest und alles ohne Angabe. */
  readonly name: string | null;
  readonly exposure: Cent;
  /** Anteil am durchschauten Exposure, 0..1. */
  readonly anteil: number;
};

export type LookThroughErgebnis = {
  readonly top: readonly Unternehmenszeile[];
  /** Summe von `anteilDepot` ueber `top` — nicht ueber alle Unternehmen. */
  readonly topAnteil: number;
  /** Anteil des Depots mit bekannten Bestandteilen, 0..1. */
  readonly abdeckung: number;
  /** Depotwert, der durchschaut werden konnte. */
  readonly durchschautCent: Cent;
  /** Alle Unternehmen mit Exposure > 0, dedupliziert ueber die ISIN — vor der Grenze. */
  readonly anzahlUnternehmen: number;
  readonly laender: readonly Gruppe[];
  readonly sektoren: readonly Gruppe[];
};

export const LEERES_ERGEBNIS: LookThroughErgebnis = {
  top: [],
  topAnteil: 0,
  abdeckung: 0,
  durchschautCent: 0n,
  anzahlUnternehmen: 0,
  laender: [],
  sektoren: [],
};

/** So viele wie die Oberflaeche Chartfarben hat — sonst stuenden zwei gleichfarbige Segmente in einem Ring. */
export const GRUPPEN_GRENZE = 10;

/** Gewichte werden in 1e-9 gerechnet, damit die Multiplikation in bigint bleibt. */
const GEWICHT_SKALA = 1_000_000_000n;

function gewichtAlsGanzzahl(gewicht: number): bigint {
  if (!Number.isFinite(gewicht) || gewicht <= 0) return 0n;
  return BigInt(Math.round(gewicht * Number(GEWICHT_SKALA)));
}

/**
 * @param werte        Depotwert je Fonds-ISIN, in Cent.
 * @param bestandteile Alle bekannten Bestandteile aller Fonds.
 * @param gesamtCent   Gesamter Depotwert inklusive Gold und Cash — die Bezugsgroesse
 *                     fuer `anteilDepot` und `abdeckung`.
 * @param grenze       Wie viele Zeilen zurueckkommen. 25 fuer Kachel 4.
 */
export function lookThrough(
  werte: ReadonlyMap<Isin, Cent>,
  bestandteile: readonly Bestandteil[],
  gesamtCent: Cent,
  grenze = 25,
): LookThroughErgebnis {
  const gesammelt = new Map<
    string,
    { name: string; exposure: Cent; ausFonds: Map<Isin, Cent>; sektor: string | null; land: string | null }
  >();

  const fondsMitBestandteilen = new Set<Isin>();
  const laender = new Map<string | null, Cent>();
  const sektoren = new Map<string | null, Cent>();

  for (const b of bestandteile) {
    const fondswert = werte.get(b.fondsIsin);
    if (fondswert === undefined || fondswert === 0n) continue;

    fondsMitBestandteilen.add(b.fondsIsin);

    const gewicht = gewichtAlsGanzzahl(b.gewicht);
    if (gewicht === 0n) continue;

    const anteil = rundeAufCent(fondswert * gewicht, GEWICHT_SKALA);
    if (anteil === 0n) continue;

    let eintrag = gesammelt.get(b.unternehmenIsin);
    if (eintrag === undefined) {
      // Der Name der ersten Fundstelle gewinnt.
      eintrag = {
        name: b.name,
        exposure: 0n,
        ausFonds: new Map(),
        sektor: b.sektor,
        land: b.land,
      };
      gesammelt.set(b.unternehmenIsin, eintrag);
    }

    laender.set(gruppenName(b.land), (laender.get(gruppenName(b.land)) ?? 0n) + anteil);
    sektoren.set(gruppenName(b.sektor), (sektoren.get(gruppenName(b.sektor)) ?? 0n) + anteil);

    eintrag.exposure += anteil;
    eintrag.ausFonds.set(b.fondsIsin, (eintrag.ausFonds.get(b.fondsIsin) ?? 0n) + anteil);
  }

  let durchschaut = 0n;
  for (const isin of fondsMitBestandteilen) durchschaut += werte.get(isin) ?? 0n;

  const alle = [...gesammelt.entries()].map(([unternehmenIsin, e]) => ({
    unternehmenIsin,
    name: e.name,
    exposure: e.exposure,
    anteilDepot: gesamtCent === 0n ? 0 : Number(e.exposure) / Number(gesamtCent),
    ausFonds: [...e.ausFonds.entries()]
      .map(([isin, anteil]) => ({ isin, anteil }))
      .sort((a, b) => vergleiche(b.anteil, a.anteil)),
    sektor: e.sektor,
    land: e.land,
  }));

  alle.sort((a, b) => vergleiche(b.exposure, a.exposure) || vergleiche(a.unternehmenIsin, b.unternehmenIsin));

  const top = alle.slice(0, grenze);

  return {
    top,
    topAnteil: summeAnteile(top.map((z) => z.anteilDepot)),
    abdeckung: gesamtCent === 0n ? 0 : Number(durchschaut) / Number(gesamtCent),
    durchschautCent: durchschaut,
    anzahlUnternehmen: gesammelt.size,
    laender: gruppen(laender),
    sektoren: gruppen(sektoren),
  };
}

function gruppenName(roh: string | null): string | null {
  const name = roh?.trim() ?? '';
  return name === '' ? null : name;
}

/** Die groessten `GRUPPEN_GRENZE` Gruppen einzeln, der Rest samt fehlender Angaben als `null` am Ende. */
function gruppen(summen: ReadonlyMap<string | null, Cent>): Gruppe[] {
  let gesamt = 0n;
  for (const exposure of summen.values()) gesamt += exposure;
  if (gesamt === 0n) return [];

  const benannt = [...summen.entries()]
    .filter((e): e is [string, Cent] => e[0] !== null)
    .sort((a, b) => vergleiche(b[1], a[1]) || vergleiche(a[0], b[0]));
  const einzeln = benannt.slice(0, GRUPPEN_GRENZE);
  let rest = summen.get(null) ?? 0n;
  for (const [, exposure] of benannt.slice(GRUPPEN_GRENZE)) rest += exposure;

  const anteil = (exposure: Cent) => Number(exposure) / Number(gesamt);
  const ergebnis: Gruppe[] = einzeln.map(([name, exposure]) => ({ name, exposure, anteil: anteil(exposure) }));
  if (rest > 0n) ergebnis.push({ name: null, exposure: rest, anteil: anteil(rest) });
  return ergebnis;
}

/**
 * Summe der Gewichte je Fonds. Der Ingest prueft damit die Plausibilitaet:
 * 1 ± 0,005, sonst ein Hinweis. [P-08]
 */
export function gewichtsSumme(bestandteile: readonly Bestandteil[], fondsIsin: Isin): number {
  let summe = 0;
  for (const b of bestandteile) if (b.fondsIsin === fondsIsin) summe += b.gewicht;
  return summe;
}
