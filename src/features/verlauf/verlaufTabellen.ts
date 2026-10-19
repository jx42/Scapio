/*
 * Kachel 1, Alternative zu den beiden Charts: die Datentabellen, verborgen fuer Screenreader.
 * Fertig formatierte Zellen — hier wird nichts gerechnet.
 *
 * Die Tabelle hat die Aufloesung, die das Fenster hat, nicht die der Reihe: ein Fenster ueber
 * ein Jahr taeglich vorzulesen waere fuer Screenreader keine Alternative, sondern eine zweite
 * Huerde (ueber 2.000 Zeilen, ueber 9.000 DOM-Knoten). Die Reihe ist eine Tagesreihe, also
 * genuegt die Punktzahl statt einer Kalenderrechnung.
 */

import { de } from '@/i18n/de';
import type { Marke, Zeitpunkt } from '@/lib/api';
import { datumKurz, euroAusCent, monatSchluessel, prozent } from '@/lib/format';
import type { ChartTabelle } from '@/components/ChartRahmen';

/** Bis hierhin (Punkte, das sind Tage) bleibt die Tabelle taeglich: 1W, 1M, ein junges YTD. */
const TAEGLICH_BIS_PUNKTE = 62;
/** Bis hierhin je Woche (YTD im Herbst, 1J); darueber je Monat (3J, 5J, MAX). */
const WOECHENTLICH_BIS_PUNKTE = 400;
const TAGE_JE_WOCHE = 7;

export type TabellenAufloesung = 'taeglich' | 'woechentlich' | 'monatlich';

export function tabellenAufloesung(anzahlPunkte: number): TabellenAufloesung {
  if (anzahlPunkte <= TAEGLICH_BIS_PUNKTE) return 'taeglich';
  return anzahlPunkte <= WOECHENTLICH_BIS_PUNKTE ? 'woechentlich' : 'monatlich';
}

/**
 * Die Punkte der Tabelle. Der letzte Punkt ist immer dabei — er ist der Kopfwert der Kachel —,
 * der erste ebenfalls, damit der Anfang des Fensters lesbar bleibt. Woechentlich zaehlt von hinten
 * (jeder siebte Punkt), monatlich nimmt den letzten Punkt je Kalendermonat.
 */
export function tabellenPunkte(punkte: readonly Zeitpunkt[]): { punkte: Zeitpunkt[]; aufloesung: TabellenAufloesung } {
  const aufloesung = tabellenAufloesung(punkte.length);
  if (aufloesung === 'taeglich') return { punkte: [...punkte], aufloesung };

  const letzterIndex = punkte.length - 1;
  const behalten = punkte.filter((punkt, index) => {
    if (index === 0 || index === letzterIndex) return true;
    if (aufloesung === 'woechentlich') return (letzterIndex - index) % TAGE_JE_WOCHE === 0;
    const naechster = punkte[index + 1];
    return naechster === undefined || monatSchluessel(naechster.tag) !== monatSchluessel(punkt.tag);
  });
  return { punkte: behalten, aufloesung };
}

/**
 * Die Vorgaenge je Tabellenzeile: bei verdichteter Tabelle alle seit der vorigen Zeile, damit
 * keiner zwischen zwei Zeilen verloren geht.
 */
function vorgaengeJeZeile(punkte: readonly Zeitpunkt[], marken: readonly Marke[]): string[] {
  return punkte.map((punkt, index) => {
    const vorher = index === 0 ? '' : (punkte[index - 1]?.tag ?? '');
    return marken
      .filter((marke) => marke.tag > vorher && marke.tag <= punkt.tag)
      .flatMap((marke) =>
        marke.vorgaenge.map((vorgang) =>
          de.verlauf.vorgangZelle(
            de.verlauf.markenTyp[marke.typ],
            vorgang.name ?? vorgang.isin,
            euroAusCent(vorgang.betragCent, true),
          ),
        ),
      )
      .join('; ');
  });
}

/** `marken` leer: keine Spalte „Vorgaenge“ — wie im Chart, wenn die Zufluesse aus sind. */
export function tabelleVermoegen(
  alle: readonly Zeitpunkt[],
  benchmarkName: string | null,
  marken: readonly Marke[] = [],
): ChartTabelle {
  const { punkte, aufloesung } = tabellenPunkte(alle);
  const vorgaenge = marken.length === 0 ? null : vorgaengeJeZeile(punkte, marken);
  return {
    hinweis: de.verlauf.tabelleAufloesung[aufloesung],
    beschriftung: de.verlauf.tabelleVermoegen,
    spalten: [
      de.verlauf.spalteTag,
      de.verlauf.spalteDepotwert,
      de.verlauf.spalteEinzahlung,
      ...(benchmarkName === null ? [] : [de.verlauf.spalteBenchmark]),
      ...(vorgaenge === null ? [] : [de.verlauf.spalteVorgaenge]),
    ],
    zeilen: punkte.map((punkt, index) => [
      datumKurz(punkt.tag),
      euroAusCent(punkt.gesamtCent),
      euroAusCent(punkt.einzahlungKumCent),
      ...(benchmarkName === null
        ? []
        : [punkt.benchmarkCent === undefined ? '' : euroAusCent(punkt.benchmarkCent)]),
      ...(vorgaenge === null ? [] : [vorgaenge[index] ?? '']),
    ]),
  };
}

export function tabelleRendite(alle: readonly Zeitpunkt[], benchmarkName: string | null): ChartTabelle {
  const { punkte, aufloesung } = tabellenPunkte(alle);
  return {
    hinweis: de.verlauf.tabelleAufloesung[aufloesung],
    beschriftung: de.verlauf.tabelleRendite,
    spalten:
      benchmarkName === null
        ? [de.verlauf.spalteTag, de.verlauf.spalteRendite]
        : [de.verlauf.spalteTag, de.verlauf.spalteRendite, de.verlauf.spalteBenchmark],
    zeilen: punkte.map((punkt) =>
      benchmarkName === null
        ? [datumKurz(punkt.tag), prozent(punkt.gewinnProzent, true)]
        : [
            datumKurz(punkt.tag),
            prozent(punkt.gewinnProzent, true),
            punkt.benchmarkProzent === undefined ? '' : prozent(punkt.benchmarkProzent, true),
          ],
    ),
  };
}
