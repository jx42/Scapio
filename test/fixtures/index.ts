/**
 * Zugriff auf die Fixtures. Eine Stelle, damit kein Test einen eigenen Pfad baut.
 *
 * `json()` und `text()` lesen bei jedem Aufruf neu von der Platte: ein zwischen zwei
 * Tests geteiltes Objekt waere ein gemeinsamer Zustand, und der erste Test, der daran
 * etwas aendert, macht den zweiten unerklaerlich rot.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HIER = fileURLToPath(new URL('.', import.meta.url));

export function text(name: string): string {
  return readFileSync(`${HIER}${name}`, 'utf8');
}

export function json(name: string): unknown {
  return JSON.parse(text(name));
}

/** Die Namen, die mehrere Suiten brauchen — Tippfehler fallen so beim Typcheck auf. */
export const FIXTURE = {
  holdings: 'holdings.json',
  holdingsIsin: 'kaputt/holdings-isin.json',
  holdingsFeld: 'kaputt/holdings-feld.json',
  transaktionen: 'transaktionen.json',
  transaktionenOhneZeit: 'kaputt/transaktionen-ohne-zeit.json',
  transaktionenBetrag: 'kaputt/transaktionen-betrag.json',
  chartMax: 'chart-max.json',
  chart1m: 'chart-1m.json',
  chartPunkt: 'kaputt/chart-punkt.json',
  sparplaene: 'sparplaene.json',
  sparplaeneFrequenz: 'kaputt/sparplaene-frequenz.json',
  overview: 'overview.json',
  overviewFeld: 'kaputt/overview-feld.json',
  ishares: 'ishares.json',
  isharesSchema: 'kaputt/ishares-schema.json',
  isharesAnteile: 'kaputt/ishares-anteile.json',
  xtrackers: 'xtrackers.json',
  xtrackersSchema: 'kaputt/xtrackers-schema.json',
  amundi: 'amundi.json',
  amundiSchema: 'kaputt/amundi-schema.json',
  amundiProzent: 'kaputt/amundi-prozent.json',
  eurostat: 'eurostat.json',
  eurostatZweiLaender: 'kaputt/eurostat-zwei-laender.json',
  eurostatKurzfrist: 'eurostat-kurzfrist.json',
  eurostatKurzfristKurz: 'kaputt/eurostat-kurzfrist-kurz.json',
  eurostatKurzfristStreuung: 'kaputt/eurostat-kurzfrist-streuung.json',
  ezb: 'ezb.json',
  ezbZweiSerien: 'kaputt/ezb-zwei-serien.json',
  ezbFeld: 'kaputt/ezb-feld.json',
  strom: 'strom.ndjson',
  stromFremdesTool: 'kaputt/strom-fremdes-tool.ndjson',
} as const;
