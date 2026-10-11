/**
 * Quelle `zins`: der risikofreie Zins (Euro Short-Term Rate, €STR), taeglich.
 *
 * Er ist die Basis der Sharpe-Ratio (`core/risiko.ts`) — ohne ihn misst die Kennzahl
 * "Rendite pro Risiko" gegen null Zins, was bei den aktuellen Leitzinsen eine schlechtere
 * Naeherung ist als eine echte Zinsreihe.
 *
 * ANNAHMEN, die HIER geprueft werden — nicht durch `npm run vertrag`: das Werkzeug deckt
 * nur Scalable-MCP-Tools ab (siehe `ingest/quellen/vpi.ts`). Diese Form wurde per echtem
 * GET gegen die Adresse unten verifiziert, siehe den Kommentar bei `EzbZinsAntwort` in
 * `ingest/schema.ts`:
 *
 *   1. Die EZB liefert SDMX-JSON unter
 *      https://data-api.ecb.europa.eu/service/data/EST/B.EU000A2X2A25.WT
 *      mit `format=jsondata&startPeriod=...`. `B.EU000A2X2A25.WT` pinnt Frequenz (taeglich,
 *      Geschaeftswoche), Referenzsatz (€STR) und Berechnungsart (volumengewichteter
 *      getrimmter Mittelwert) auf je einen Wert.
 *   2. Damit hat `dataSets[0].series` genau einen Schluessel und jede Serien-Dimension unter
 *      `structure.dimensions.series` genau einen Wert. Beides wird unten GEPRUEFT: waere
 *      eine Serien-Dimension mehrdeutig, koennte eine Beobachtung dem falschen Tag
 *      zugeordnet werden.
 *   3. `structure.dimensions.observation[0]` (TIME_PERIOD) listet die Tage in derselben
 *      Reihenfolge, in der `series[...].observations` sie ueber ihren Positionsindex
 *      ("0", "1", …) referenziert.
 *   4. Der Rohwert ist Prozent (`UNIT_MEASURE: "PC"`), das Depot speichert ein Verhaeltnis
 *      — deshalb wird durch 100 geteilt.
 *
 * `zinsquelle: "keine"` ist in der Konfiguration vorgesehen: steht sie so in `config.json`,
 * wird die Quelle mit einem Hinweis uebersprungen, nicht mit einem Fehler — Sharpe-Ratio
 * fehlt dann, der Rest des Dashboards funktioniert weiter.
 */

import type { Zinswert } from '../../db/repository/zins.ts';
import type { Ernte, Kontext } from '../importieren.ts';
import { holeText } from '../netz.ts';
import { EzbZinsAntwort, GRENZE, pruefe } from '../schema.ts';
import { hinweis, hinweisKurz, type Hinweis } from '../../shared/hinweise.ts';
import type { LaufFehlerCode } from '../../shared/laufFehler.ts';

export const QUELLE = 'zins';

/** Erster veroeffentlichter €STR-Geschaeftstag. */
const SEIT = '2019-10-01';

const SERIE = 'B.EU000A2X2A25.WT';

const ECB = `https://data-api.ecb.europa.eu/service/data/EST/${SERIE}?format=jsondata&startPeriod=${SEIT}`;

export class ZinsUebersprungen extends Error {
  readonly code = 'E_ZINS_QUELLE' satisfies LaufFehlerCode;
  readonly hinweis: Hinweis;
  constructor(hinweis: Hinweis) {
    super(hinweisKurz(hinweis));
    this.hinweis = hinweis;
  }
}

export async function holeZins(ctx: Kontext): Promise<Ernte<readonly Zinswert[]>> {
  if (ctx.konfiguration.zinsquelle !== 'ecb') {
    throw new ZinsUebersprungen(hinweis('zinsNichtAngebunden', { quelle: ctx.konfiguration.zinsquelle }));
  }

  const text = await holeText(ECB, {
    erlaubteHosts: ctx.konfiguration.erlaubteHosts,
    zeitlimitMs: ctx.konfiguration.csvZeitlimitMs,
    groesstMb: ctx.konfiguration.csvGroesstMb,
    accept: 'application/json',
  });

  const antwort = pruefe(QUELLE, EzbZinsAntwort, JSON.parse(text));

  // Annahme 2 pruefen: jede Serien-Dimension muss auf einen Wert gepinnt sein.
  const mehrdeutig = antwort.structure.dimensions.series
    .filter((dim) => dim.values.length !== 1)
    .map((dim) => dim.id ?? dim.name ?? '?');
  if (mehrdeutig.length > 0) {
    throw new Error(`EZB liefert mehrere Auspraegungen fuer ${mehrdeutig.join(', ')} — Zuordnung waere mehrdeutig.`);
  }

  const dataSet = antwort.dataSets[0];
  if (dataSet === undefined) {
    throw new Error('EZB-Antwort enthaelt kein dataSet.');
  }
  const serienSchluessel = Object.keys(dataSet.series);
  if (serienSchluessel.length !== 1) {
    throw new Error(`EZB liefert ${String(serienSchluessel.length)} Serien statt einer — Zuordnung waere mehrdeutig.`);
  }
  const serie = dataSet.series[serienSchluessel[0]!]!;

  const zeit = antwort.structure.dimensions.observation[0];
  if (zeit === undefined) {
    throw new Error('EZB-Antwort hat keine Zeitdimension.');
  }

  const tage: Zinswert[] = [];
  let uebersprungen = 0;

  for (const [position, wert] of zeit.values.entries()) {
    const tag = wert.id ?? wert.name;
    if (tag === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(tag)) {
      uebersprungen += 1;
      continue;
    }
    const roh = serie.observations[String(position)]?.[0];
    if (roh === null || roh === undefined || !Number.isFinite(roh)) {
      uebersprungen += 1;
      continue;
    }
    tage.push({ tag, zinsProJahr: roh / 100, quelle: 'ezb:EST' });
  }

  if (tage.length === 0) {
    throw new Error('EZB-Antwort enthaelt keinen einzigen brauchbaren Tag.');
  }
  if (tage.length > GRENZE.zinsTage) {
    throw new Error(`EZB liefert ${String(tage.length)} Tage, erlaubt sind ${String(GRENZE.zinsTage)}.`);
  }
  if (uebersprungen > 0) {
    ctx.befunde.hinweis('zinsLuecken', { tage: uebersprungen });
  }

  tage.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));

  return {
    daten: tage,
    quelle: QUELLE,
    // Archiviert wird die ausgewertete Reihe, nicht die Rohantwort: sie ist zehnmal
    // kleiner und enthaelt genau das, was `npm run verify` wieder braucht.
    rohJson: JSON.stringify({ abgerufenAm: ctx.jetzt, tage }),
  };
}
