/**
 * Quelle `vpi-aktuell`: der Rand der Preisreihe.
 *
 * Der amtliche Datensatz `prc_hicp_midx`, aus dem `vpi` die lange Reihe holt, wird nur in
 * groesseren Abstaenden fortgeschrieben und steht regelmaessig mehrere Monate still. Solange
 * er steht, fehlen dem Dashboard die Monate des laufenden Jahres — und ein fehlender Monat
 * ist in `core/inflation.ts` kein Loch, sondern eine unterstellte Nullinflation: die
 * Deflationierung schreibt den letzten bekannten Index fort, und `teuerungProJahr` endet
 * vor dem laufenden Jahr. Beides macht die ausgewiesene Realrendite zu guenstig.
 *
 * Diese Quelle fuellt genau diesen Rand aus dem Kurzfrist-Datensatz `ei_cphi_m` — derselbe
 * Host, dieselbe oeffentliche REST-Schnittstelle, weiterhin ohne Zugangsdaten (ADR-003
 * bleibt unberuehrt). Warum zwei Datensaetze verkettet werden und warum die Umbasierung im
 * Ingest sitzt und nicht im Rechenkern, steht in ADR-017.
 *
 * ANNAHMEN — wie bei `vpi` nicht geglaubt, sondern geprueft:
 *
 *   1. Eurostat liefert JSON-stat 2.0 unter
 *      https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/ei_cphi_m
 *      mit `format=JSON&lang=EN&freq=M&geo=DE&indic=TOTAL&unit=HICP2025`. Der Datensatz
 *      kennt `indic` statt `coicop`; `HICP2025` heisst: Index 2025 = 100.
 *   2. Jede Dimension ausser `time` ist auf genau einen Wert gepinnt — geprueft in
 *      `ingest/eurostat.ts`, gemeinsam mit `vpi`.
 *   3. Die beiden Reihen ueberlappen sich ueber viele Monate, und ihr Verhaeltnis ist in
 *      dieser Ueberlappung praktisch konstant — nur dann laesst sich die kurze Reihe auf
 *      die Basis 2015 = 100 der langen umrechnen. Auch das wird GEPRUEFT (siehe
 *      `MINDEST_UEBERLAPPUNG` und `HOECHSTE_STREUUNG`): eine stillschweigend um einen
 *      Faktor verschobene Preisreihe waere in der Oberflaeche nicht zu sehen, deshalb
 *      scheitert die Quelle lieber, als zu raten.
 *
 * Scheitert sie, ist das ein Hinweis und kein Fehler des Laufs: das Dashboard steht dann
 * genau da, wo es ohne diese Quelle stuende.
 */

import type { Vpiwert } from '../../db/repository/vpi.ts';
import type { Monatswert } from '../eurostat.ts';
import { monatsreihe } from '../eurostat.ts';
import type { Ernte, Kontext } from '../importieren.ts';
import { holeText } from '../netz.ts';
import { EurostatAntwort, GRENZE, pruefe } from '../schema.ts';
import { hinweis, hinweisKurz, type Hinweis } from '../../shared/hinweise.ts';
import type { LaufFehlerCode } from '../../shared/laufFehler.ts';

export const QUELLE = 'vpi-aktuell';

/** Steht so in `vpi.quelle` und unterscheidet die nachgefuellten Monate von den amtlichen. */
export const HERKUNFT = 'eurostat:ei_cphi_m';

/** Der Kurzfrist-Datensatz braucht keine Historie — er fuellt nur den Rand. */
const SEIT = '2020-01';

const EUROSTAT =
  'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/ei_cphi_m' +
  `?format=JSON&lang=EN&freq=M&geo=DE&indic=TOTAL&unit=HICP2025&sinceTimePeriod=${SEIT}`;

/**
 * So viele gemeinsame Monate muessen die beiden Reihen haben, damit der Umrechnungsfaktor
 * mehr ist als ein Zufall aus zwei Zahlen.
 */
export const MINDEST_UEBERLAPPUNG = 6;

/**
 * So weit duerfen die monatlichen Quotienten hoechstens auseinanderliegen. Gemessen am
 * 2026-09-07 waren es 0,08 ‰ ueber 24 Monate — die Schwelle ist also grosszuegig und
 * schlaegt erst an, wenn die Reihen methodisch nicht mehr zueinander passen.
 */
export const HOECHSTE_STREUUNG = 0.005;

export class VpiAktuellUebersprungen extends Error {
  readonly code = 'E_VPI_AKTUELL_QUELLE' satisfies LaufFehlerCode;
  readonly hinweis: Hinweis;
  constructor(hinweis: Hinweis) {
    super(hinweisKurz(hinweis));
    this.hinweis = hinweis;
  }
}

/** Der Index als REAL — vier Nachkommastellen, mehr traegt die Umrechnung nicht. */
function aufVierStellen(wert: number): number {
  return Math.round(wert * 10_000) / 10_000;
}

function median(zahlen: readonly number[]): number {
  const sortiert = [...zahlen].sort((a, b) => a - b);
  const mitte = Math.floor(sortiert.length / 2);
  return sortiert.length % 2 === 0 ? (sortiert[mitte - 1]! + sortiert[mitte]!) / 2 : sortiert[mitte]!;
}

/**
 * Rechnet die kurze Reihe auf die Basis der langen um.
 *
 * Der Faktor ist der Median der monatlichen Quotienten — der Median und nicht der
 * Mittelwert, damit ein einzelner revidierter Monat ihn nicht zieht.
 *
 * @throws wenn die Ueberlappung zu duenn oder die Quotienten zu uneinheitlich sind.
 */
export function umrechnungsfaktor(kurz: readonly Monatswert[], basis: readonly Vpiwert[]): number {
  const basisNach = new Map(basis.map((b) => [b.monat, b.indexWert]));

  const quotienten: number[] = [];
  for (const m of kurz) {
    const lang = basisNach.get(m.monat);
    if (lang === undefined || lang <= 0 || m.wert <= 0) continue;
    quotienten.push(lang / m.wert);
  }

  if (quotienten.length < MINDEST_UEBERLAPPUNG) {
    throw new Error(
      `Die beiden Preisreihen ueberlappen sich in ${String(quotienten.length)} Monaten, ` +
        `noetig sind ${String(MINDEST_UEBERLAPPUNG)} — ohne Ueberlappung waere die Umbasierung geraten.`,
    );
  }

  const mitte = median(quotienten);
  const spanne = (Math.max(...quotienten) - Math.min(...quotienten)) / mitte;
  if (!Number.isFinite(mitte) || mitte <= 0 || spanne > HOECHSTE_STREUUNG) {
    throw new Error(
      `Das Verhaeltnis der beiden Preisreihen schwankt um ${(spanne * 100).toFixed(2)} %, ` +
        `erlaubt sind ${String(HOECHSTE_STREUUNG * 100)} % — sie passen nicht mehr aneinander.`,
    );
  }

  return mitte;
}

/**
 * @param basis Die Monate, die `vpi` in diesem Lauf geholt hat. Sie liefern sowohl die
 *              Ueberlappung fuer die Umbasierung als auch die Grenze, ab der nachgefuellt
 *              wird: zurueckgegeben werden nur Monate NACH dem letzten amtlichen. Holt der
 *              amtliche Datensatz eines Tages auf, verschwindet diese Quelle von allein
 *              wieder aus der Datenbank.
 */
export async function holeVpiAktuell(
  ctx: Kontext,
  basis: readonly Vpiwert[],
): Promise<Ernte<readonly Vpiwert[]>> {
  if (ctx.konfiguration.inflationsquelle !== 'eurostat') {
    throw new VpiAktuellUebersprungen(
      hinweis('vpiRandNichtAngebunden', { quelle: ctx.konfiguration.inflationsquelle }),
    );
  }
  if (basis.length === 0) {
    throw new VpiAktuellUebersprungen(hinweis('vpiRandOhneBasis', {}));
  }

  const text = await holeText(EUROSTAT, {
    erlaubteHosts: ctx.konfiguration.erlaubteHosts,
    zeitlimitMs: ctx.konfiguration.csvZeitlimitMs,
    groesstMb: ctx.konfiguration.csvGroesstMb,
    accept: 'application/json',
  });

  const antwort = pruefe(QUELLE, EurostatAntwort, JSON.parse(text));
  const { monate: kurz, uebersprungen } = monatsreihe(antwort);

  const faktor = umrechnungsfaktor(kurz, basis);

  let letzterAmtlicher = basis[0]!.monat;
  for (const b of basis) if (b.monat > letzterAmtlicher) letzterAmtlicher = b.monat;

  const monate: Vpiwert[] = kurz
    .filter((m) => m.monat > letzterAmtlicher)
    .map((m) => ({ monat: m.monat, indexWert: aufVierStellen(m.wert * faktor), quelle: HERKUNFT }));

  if (monate.length > GRENZE.vpiMonate) {
    throw new Error(`Eurostat liefert ${String(monate.length)} Monate, erlaubt sind ${String(GRENZE.vpiMonate)}.`);
  }
  if (uebersprungen > 0) {
    ctx.befunde.hinweis('vpiRandLuecken', { monate: uebersprungen });
  }
  // Wie viele Monate nachgefuellt wurden, ist KEIN Befund — auch nicht null und auch nicht
  // acht. Nachfuellen ist die Aufgabe dieser Quelle, und ein Band in der Oberflaeche, das
  // nach jedem Lauf dasselbe meldet, erzieht dazu, Baender zu ueberlesen. Die Zahl steht im
  // Protokoll (`ingest/lauf.ts`) und in `raw_snapshot`; auffaellig wird die Naht erst durch
  // `pruefeVpiReihe`, und die schlaegt dann auch an.

  return {
    daten: monate,
    quelle: QUELLE,
    // Wie bei `vpi`: archiviert wird die ausgewertete Reihe. Der Faktor gehoert dazu — ohne
    // ihn liesse sich spaeter nicht nachvollziehen, wie aus 103,36 die 136,3634 wurden.
    rohJson: JSON.stringify({ abgerufenAm: ctx.jetzt, faktor, abMonat: letzterAmtlicher, monate }),
  };
}
