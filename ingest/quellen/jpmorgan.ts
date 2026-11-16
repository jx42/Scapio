/**
 * Quelle `jpmorgan:<isin>`: Katalog und Bestandteile der JPMorgan-ETFs, als JSON von
 * am.jpmorgan.com. Katalog ist der Fund Explorer der Website (ein Abruf, rund 1 MB), die
 * Bestandteile kommen aus `product-data` mit `fundDataType=dailyHoldings`. produktId ist die
 * ISIN. Die Sitemap taugt nicht als Katalog, weil keine ihrer URLs eine ISIN enthaelt.
 */

import type { Bestandteil } from '../../core/lookthrough.ts';
import type { Isin } from '../../core/typen.ts';
import type { Anbieterernte, Katalogeintrag } from '../anbieter.ts';
import { pruefeGewichtsSumme } from '../anbieter.ts';
import { entschaerfe } from '../fremdtext.ts';
import type { Ernte, Kontext } from '../importieren.ts';
import { holeText } from '../netz.ts';
import { GRENZE, ISIN_MUSTER, pruefe } from '../schema.ts';
import { JpmorganAntwort, JpmorganKatalog, JpmorganKatalogIsins } from '../schema/jpmorgan.ts';

export const quelleFuer = (isin: Isin): string => `jpmorgan:${isin}`;

const BASIS = 'https://am.jpmorgan.com/FundsMarketingHandler';
/** Ohne `fundType` antwortet der Fund Explorer mit 400. */
const KATALOG_ADRESSE = `${BASIS}/fund-explorer?country=de&role=per&language=de&fundType=etf`;
const bestaendeAdresse = (isin: Isin): string =>
  `${BASIS}/product-data?cusip=${isin}&country=de&role=per&language=de&fundDataType=dailyHoldings`;

/** Leerer Fremdtext wird `null`, damit die Kachel „unbekannt“ zeigt statt einer leeren Gruppe. */
function textOderNull(wert: string | null): string | null {
  const sauber = entschaerfe(wert ?? '').slice(0, GRENZE.name);
  return sauber.length > 0 ? sauber : null;
}

export async function bestandteileJpmorgan(ctx: Kontext, isin: Isin): Promise<Ernte<Anbieterernte>> {
  const quelle = quelleFuer(isin);
  const text = await holeText(bestaendeAdresse(isin), {
    erlaubteHosts: ctx.konfiguration.erlaubteHosts,
    zeitlimitMs: ctx.konfiguration.csvZeitlimitMs,
    groesstMb: ctx.konfiguration.csvGroesstMb,
    accept: 'application/json',
  });
  const zeilen = pruefe(quelle, JpmorganAntwort, JSON.parse(text)).fundData.dailyHoldingsAll.data;

  const teile: Bestandteil[] = [];
  const gesehen = new Set<string>();
  let summe = 0;
  let ohneIsin = 0;
  for (const zeile of zeilen) {
    const unternehmenIsin = (zeile.securityIsin ?? '').toUpperCase();
    if (!ISIN_MUSTER.test(unternehmenIsin) || zeile.marketValuePercent === null) {
      // Cash hat keine ISIN; es fehlt im Look-Through und senkt die Abdeckungsquote.
      ohneIsin += 1;
      continue;
    }
    const gewicht = zeile.marketValuePercent / 100;
    if (gesehen.has(unternehmenIsin)) {
      const vorhanden = teile.findIndex((t) => t.unternehmenIsin === unternehmenIsin);
      const alt = teile[vorhanden];
      if (alt !== undefined) teile[vorhanden] = { ...alt, gewicht: alt.gewicht + gewicht };
    } else {
      gesehen.add(unternehmenIsin);
      teile.push({
        fondsIsin: isin,
        unternehmenIsin,
        name: entschaerfe(zeile.securityDescription ?? '').slice(0, GRENZE.name),
        gewicht,
        sektor: textOderNull(zeile.sector),
        land: textOderNull(zeile.country),
      });
    }
    summe += gewicht;
  }

  if (teile.length === 0) throw new Error(`jpmorgan ${isin}: Antwort gelesen, aber keine verwertbare Zeile.`);
  pruefeGewichtsSumme(ctx, quelle, { isin, summe, positionen: teile.length, ohneIsin });
  return {
    daten: { teile, gewichtsSumme: summe },
    quelle,
    rohJson: JSON.stringify({ stand: ctx.jetzt, teile }),
  };
}

export async function katalogJpmorgan(ctx: Kontext): Promise<ReadonlyMap<Isin, Katalogeintrag>> {
  const text = await holeText(KATALOG_ADRESSE, {
    erlaubteHosts: ctx.konfiguration.erlaubteHosts,
    zeitlimitMs: ctx.konfiguration.csvZeitlimitMs,
    groesstMb: ctx.konfiguration.csvGroesstMb,
    accept: 'application/json',
  });
  const eintraege = pruefe('jpmorgan:katalog', JpmorganKatalog, JSON.parse(text));

  const gefunden: string[] = [];
  for (const eintrag of eintraege) {
    const isin = (eintrag.identifier ?? '').toUpperCase();
    if (eintrag.fundTypeCode === 'N_ETF' && ISIN_MUSTER.test(isin)) gefunden.push(isin);
  }
  const isins = pruefe('jpmorgan:katalog', JpmorganKatalogIsins, gefunden);

  const katalog = new Map<Isin, Katalogeintrag>();
  for (const isin of isins) katalog.set(isin, { produktId: isin });
  return katalog;
}
