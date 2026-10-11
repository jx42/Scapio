/**
 * Quelle `ishares:<isin>`: die Bestandteile der ETFs, als JSON von www.ishares.com.
 *
 * Das ist der Blick durch die ETFs auf die tatsaechlich gehaltenen Unternehmen. Die
 * Produktseite ist eine JS-Anwendung; ihre Positionen kommen aus `get-product-data`
 * (component=holdings.all), das auch die Seite selbst ruft. Die frueheren `.ajax`-Endpunkte
 * und der Produktscreener sind mit dem Umbau der Seite entfallen (ADR-027). CSV- und
 * XLS-Downloads liefern nur den Ticker, keine ISIN, und sind fuer den Look-Through
 * unbrauchbar.
 *
 * Die Antwort ist spaltenweise: je Feld ein Array, alle zeilenweise parallel.
 * `IsharesAntwort` in `schema.ts` prueft die fuenf gelesenen Spalten [INV-12]; ungleich
 * lange Arrays weist `holeIshares` ab, statt Zeilen zu verschieben.
 *
 * Der Abruf geht ueber `netz.ts` — Allowlist, keine Umleitung ins private Netz, Groesse
 * stroemend begrenzt. Schlaegt er fehl, bleibt der alte Stand stehen und die Kachel zeigt
 * ihr Datum. Gewichte sind `number` (Anteile, kein Geld) und deshalb von [INV-02] nicht
 * beruehrt. Name, Sektor und Standort sind Fremdtext und laufen durch `entschaerfe()`,
 * bevor sie die Datenbank erreichen [INV-06].
 */

import { readFileSync } from 'node:fs';
import type { Bestandteil } from '../../core/lookthrough.ts';
import type { Isin } from '../../core/typen.ts';
import type { Katalogeintrag } from '../anbieter.ts';
import { pruefeGewichtsSumme } from '../anbieter.ts';
import { entschaerfe } from '../fremdtext.ts';
import type { Ernte, Kontext } from '../importieren.ts';
import { holeText } from '../netz.ts';
import type { Fonds, FondsIshares } from '../schema.ts';
import { FundsDatei, GRENZE, ISIN_MUSTER, IsharesAntwort, pruefe } from '../schema.ts';

export const quelleFuer = (isin: Isin): string => `ishares:${isin}`;

export function ladeFonds(datei: string): readonly Fonds[] {
  const inhalt = pruefe('funds.json', FundsDatei, JSON.parse(readFileSync(datei, 'utf8')));
  return inhalt.fonds;
}

export type Isharesernte = {
  readonly teile: readonly Bestandteil[];
  readonly gewichtsSumme: number;
};

const HOLDINGS_ADRESSE =
  'https://www.ishares.com/varnish-api/uk-retail01-product-data/product-data/api/v2/get-product-data';

/** Ohne `asOfDate` liefert die API den jeweils juengsten Stand. */
const holdingsAdresse = (produktId: string): string =>
  `${HOLDINGS_ADRESSE}?appSubType=ISHARES&appType=PRODUCT_PAGE&component=holdings.all&locale=de_DE` +
  `&portfolioId=${produktId}&targetSite=de-ishares-v2&userType=individual&excludeContent=true`;

export async function holeIshares(ctx: Kontext, fonds: FondsIshares): Promise<Ernte<Isharesernte>> {
  const quelle = quelleFuer(fonds.isin);
  const text = await holeText(holdingsAdresse(fonds.produktId), {
    erlaubteHosts: ctx.konfiguration.erlaubteHosts,
    zeitlimitMs: ctx.konfiguration.csvZeitlimitMs,
    groesstMb: ctx.konfiguration.csvGroesstMb,
    accept: 'application/json',
  });

  const antwort = pruefe(quelle, IsharesAntwort, JSON.parse(text));
  const spalten = antwort.componentsByNameMap.holdings.containersByNameMap.all.dataPointsByNameMap;
  const anzahl = spalten.isin.value.length;
  if (
    spalten.issueName.value.length !== anzahl ||
    spalten.holdingPercent.value.length !== anzahl ||
    spalten.sectorName.value.length !== anzahl ||
    spalten.countryOfRisk.value.length !== anzahl
  ) {
    throw new Error(`ishares ${fonds.isin}: Spalten der Antwort sind nicht gleich lang.`);
  }

  const teile: Bestandteil[] = [];
  const gesehen = new Set<string>();
  let summe = 0;
  let ohneIsin = 0;

  for (let i = 0; i < anzahl; i += 1) {
    const isin = (spalten.isin.value[i] ?? '').toUpperCase();
    const prozent = spalten.holdingPercent.value[i];
    if (!ISIN_MUSTER.test(isin) || prozent === null || prozent === undefined) {
      // Cash, Futures und Waehrungspositionen haben keine ISIN. Sie fehlen im
      // Look-Through und senken die Abdeckungsquote — genau so soll es sein.
      ohneIsin += 1;
      continue;
    }
    const gewicht = prozent / 100;

    // Ein Unternehmen kann mehrfach auftauchen (verschiedene Gattungen). Der
    // Primaerschluessel der Bestandteile laesst das nicht zu, also wird addiert.
    if (gesehen.has(isin)) {
      const vorhanden = teile.findIndex((t) => t.unternehmenIsin === isin);
      const alt = teile[vorhanden];
      if (alt !== undefined) teile[vorhanden] = { ...alt, gewicht: alt.gewicht + gewicht };
    } else {
      gesehen.add(isin);
      const sektor = entschaerfe(spalten.sectorName.value[i] ?? '').slice(0, GRENZE.name);
      const land = entschaerfe(spalten.countryOfRisk.value[i] ?? '').slice(0, GRENZE.name);
      teile.push({
        fondsIsin: fonds.isin,
        unternehmenIsin: isin,
        name: entschaerfe(spalten.issueName.value[i] ?? '').slice(0, GRENZE.name),
        gewicht,
        sektor: sektor.length > 0 ? sektor : null,
        land: land.length > 0 ? land : null,
      });
    }
    summe += gewicht;
  }

  if (teile.length === 0) {
    throw new Error(`ishares ${fonds.isin}: Antwort gelesen, aber keine verwertbare Zeile.`);
  }
  pruefeGewichtsSumme(ctx, quelle, { isin: fonds.isin, summe, positionen: teile.length, ohneIsin });

  return {
    daten: { teile, gewichtsSumme: summe },
    quelle,
    // Archiviert werden die geprueften Bestandteile, nicht der Rohtext: sie sind kleiner
    // und `npm run verify` rechnet genau darauf.
    rohJson: JSON.stringify({ stand: ctx.jetzt, teile }),
  };
}

/**
 * Holt die Bestandteile eines bereits aufgeloesten Fonds. Die Produkt-ID steht in
 * `fonds_aufloesung.adresse` (aeltere Zeilen tragen noch die alte `.ajax`-Adresse, aus der
 * die ID gelesen wird); ohne sie bleibt der Fonds diesen Lauf ohne Bestandteile.
 */
export async function bestandteileIshares(
  ctx: Kontext,
  isin: Isin,
  eintrag: Katalogeintrag | null,
  cacheAdresse: string | null,
): Promise<{ readonly ernte: Ernte<Isharesernte>; readonly adresse: string }> {
  const produktId = eintrag?.produktId ?? /(?:^|\/produkte\/)(\d{1,9})(?:\/|$)/.exec(cacheAdresse ?? '')?.[1];
  if (produktId === undefined) {
    throw new Error(`ishares ${isin}: keine Produkt-ID bekannt.`);
  }
  const ernte = await holeIshares(ctx, { anbieter: 'ishares', isin, name: '', produktId });
  return { ernte, adresse: produktId };
}
