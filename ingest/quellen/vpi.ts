/**
 * Quelle `vpi`: der harmonisierte Verbraucherpreisindex fuer Deutschland, monatlich.
 *
 * Er ist die Grundlage der Realrendite [P-11] — die einzige Zahl im Dashboard, die
 * beantwortet, ob das Depot tatsaechlich Kaufkraft gewonnen hat. Ohne sie ist eine
 * Nominalrendite eine Behauptung.
 *
 * ANNAHMEN, die `npm run vertrag` prueft:
 *
 *   1. Eurostat liefert JSON-stat 2.0 unter
 *      https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_midx
 *      mit den Parametern `format=JSON&lang=EN&freq=M&geo=DE&coicop=CP00&unit=I15`.
 *      `unit=I15` heisst: Index 2015 = 100. Der Absolutwert ist gleichgueltig — die
 *      Realrechnung benutzt nur Verhaeltnisse zweier Monate.
 *   2. Die Anfrage pinnt JEDE Dimension ausser `time` auf genau einen Wert. Nur dann
 *      entspricht der Index in `dimension.time.category.index` genau der Position in
 *      `value`. Diese Annahme wird GEPRUEFT, nicht geglaubt — in `ingest/eurostat.ts`,
 *      gemeinsam mit `vpiAktuell`: hat irgendeine andere Dimension mehr als einen Wert,
 *      scheitert die Quelle, statt Monate falsch zuzuordnen. Eine um einen Monat
 *      verschobene Inflationsreihe waere nicht zu sehen.
 *   3. `value` kommt als Objekt {"0": 97.4, …} — JSON-stat erlaubt auch ein Array;
 *      beides wird gelesen.
 *
 * Diese Quelle liefert die amtliche, lange Reihe — sie steht regelmaessig einige Monate
 * still. Den Rand fuellt `vpiAktuell` aus dem Kurzfrist-Datensatz nach
 * (ADR-017); diese Quelle schreibt zuerst, damit der amtliche Wert gewinnt.
 *
 * `inflationsquelle: "destatis"` ist in der Konfiguration vorgesehen, aber nicht
 * implementiert: die Destatis-Schnittstelle verlangt eine Registrierung, und Zugangsdaten
 * gehoeren nicht in dieses Projekt. Steht sie in `config.json`, wird die Quelle mit einem
 * Hinweis uebersprungen — nicht mit einem Fehler, denn das Dashboard funktioniert ohne
 * Realrendite weiter.
 */

import type { Vpiwert } from '../../db/repository/vpi.ts';
import type { Ernte, Kontext } from '../importieren.ts';
import { monatsreihe } from '../eurostat.ts';
import { holeText } from '../netz.ts';
import { EurostatAntwort, GRENZE, pruefe } from '../schema.ts';
import { hinweis, hinweisKurz, type Hinweis } from '../../shared/hinweise.ts';
import type { LaufFehlerCode } from '../../shared/laufFehler.ts';
import type { QuellenArt } from '../../shared/quellen.ts';

export const QUELLE = 'vpi' satisfies QuellenArt;

/** Steht so in `vpi.quelle` — ADR-003 haelt die Spalte bewusst als Textfeld offen. */
export const HERKUNFT = 'eurostat:prc_hicp_midx';

/** Fruehester Monat. Vor 2015 gibt es in diesem Depot nichts zu deflationieren. */
const SEIT = '2010-01';

const EUROSTAT =
  'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_midx' +
  `?format=JSON&lang=EN&freq=M&geo=DE&coicop=CP00&unit=I15&sinceTimePeriod=${SEIT}`;

export class VpiUebersprungen extends Error {
  readonly code = 'E_VPI_QUELLE' satisfies LaufFehlerCode;
  readonly hinweis: Hinweis;
  constructor(hinweis: Hinweis) {
    super(hinweisKurz(hinweis));
    this.hinweis = hinweis;
  }
}

export async function holeVpi(ctx: Kontext): Promise<Ernte<readonly Vpiwert[]>> {
  if (ctx.konfiguration.inflationsquelle !== 'eurostat') {
    throw new VpiUebersprungen(hinweis('vpiNichtAngebunden', { quelle: ctx.konfiguration.inflationsquelle }));
  }

  const text = await holeText(EUROSTAT, {
    erlaubteHosts: ctx.konfiguration.erlaubteHosts,
    zeitlimitMs: ctx.konfiguration.csvZeitlimitMs,
    groesstMb: ctx.konfiguration.csvGroesstMb,
    accept: 'application/json',
  });

  const antwort = pruefe(QUELLE, EurostatAntwort, JSON.parse(text));
  const { monate: gelesen, uebersprungen } = monatsreihe(antwort);

  const monate: Vpiwert[] = gelesen.map((m) => ({
    monat: m.monat,
    indexWert: m.wert,
    quelle: HERKUNFT,
  }));

  if (monate.length === 0) {
    throw new Error('Eurostat-Antwort enthaelt keinen einzigen brauchbaren Monat.');
  }
  if (monate.length > GRENZE.vpiMonate) {
    throw new Error(`Eurostat liefert ${String(monate.length)} Monate, erlaubt sind ${String(GRENZE.vpiMonate)}.`);
  }
  if (uebersprungen > 0) {
    // Der aktuellste Monat ist bei Eurostat regelmaessig noch leer.
    ctx.befunde.hinweis('vpiLuecken', { monate: uebersprungen });
  }

  return {
    daten: monate,
    quelle: QUELLE,
    // Archiviert wird die ausgewertete Reihe, nicht die Rohantwort: sie ist zehnmal
    // kleiner und enthaelt genau das, was `npm run verify` wieder braucht.
    rohJson: JSON.stringify({ abgerufenAm: ctx.jetzt, monate }),
  };
}
