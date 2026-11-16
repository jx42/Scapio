/**
 * Quelle `franklin:<isin>`: Bestaende der Franklin-ETFs von www.franklintempleton.de.
 *
 * Katalog aus der Produkt-Sitemap (ISIN und `fundid` stehen im Pfad), Bestaende ueber die
 * GraphQL-Schnittstelle, die auch die Produktseite ruft. Die `fundid` gilt fuer alle
 * Anteilsklassen eines Fonds; die Bestaende sind dieselben.
 */

import type { Bestandteil } from '../../core/lookthrough.ts';
import type { Isin } from '../../core/typen.ts';
import type { Anbieterernte, Katalogeintrag } from '../anbieter.ts';
import { pruefeGewichtsSumme } from '../anbieter.ts';
import { entschaerfe } from '../fremdtext.ts';
import type { Ernte, Kontext } from '../importieren.ts';
import { holeText } from '../netz.ts';
import { GRENZE, ISIN_MUSTER, pruefe } from '../schema.ts';
import { FRANKLIN_FONDS_ID, FranklinAntwort, FranklinKatalog } from '../schema/franklin.ts';

export const quelleFuer = (isin: Isin): string => `franklin:${isin}`;

const BESTAENDE_ADRESSE = 'https://www.franklintempleton.de/api/pds/price-and-performance';

/** Die Verschachtelung `portfolio{…}` ist Pflicht; `fondsId` ist vorher als Ziffernfolge geprueft. */
const abfrage = (fondsId: string): string =>
  `{Portfolio(fundid:"${fondsId}",countrycode:"DE",languagecode:"de_DE"){portfolio{dailyholdings{` +
  'asofdate secname isinsecnbr pctofnetassets sctrname countrynme}}}}';

/** Franklin setzt `—` statt eines leeren Feldes. */
function feldOderNull(wert: string | null): string | null {
  const text = entschaerfe(wert ?? '').slice(0, GRENZE.name).trim();
  return text.length === 0 || /^[-–—]+$/.test(text) ? null : text;
}

async function holeFranklin(ctx: Kontext, isin: Isin, fondsId: string): Promise<Ernte<Anbieterernte>> {
  const quelle = quelleFuer(isin);
  const text = await holeText(BESTAENDE_ADRESSE, {
    erlaubteHosts: ctx.konfiguration.erlaubteHosts,
    zeitlimitMs: ctx.konfiguration.csvZeitlimitMs,
    groesstMb: ctx.konfiguration.csvGroesstMb,
    accept: 'application/json',
    json: { query: abfrage(fondsId) },
  });
  const antwort = pruefe(quelle, FranklinAntwort, JSON.parse(text));

  const teile: Bestandteil[] = [];
  const gesehen = new Set<string>();
  let summe = 0;
  let ohneIsin = 0;
  for (const zeile of antwort.data.Portfolio.portfolio.dailyholdings) {
    const teilIsin = zeile.isinsecnbr.toUpperCase();
    if (!ISIN_MUSTER.test(teilIsin) || zeile.pctofnetassets === null) {
      ohneIsin += 1;
      continue;
    }
    const gewicht = Number(zeile.pctofnetassets.replace(',', '.')) / 100;
    if (gesehen.has(teilIsin)) {
      const vorhanden = teile.findIndex((t) => t.unternehmenIsin === teilIsin);
      const alt = teile[vorhanden];
      if (alt !== undefined) teile[vorhanden] = { ...alt, gewicht: alt.gewicht + gewicht };
    } else {
      gesehen.add(teilIsin);
      teile.push({
        fondsIsin: isin,
        unternehmenIsin: teilIsin,
        name: entschaerfe(zeile.secname).slice(0, GRENZE.name),
        gewicht,
        sektor: feldOderNull(zeile.sctrname),
        land: feldOderNull(zeile.countrynme),
      });
    }
    summe += gewicht;
  }
  if (teile.length === 0) throw new Error(`franklin ${isin}: Antwort gelesen, aber keine verwertbare Zeile.`);
  pruefeGewichtsSumme(ctx, quelle, { isin, summe, positionen: teile.length, ohneIsin });
  return {
    daten: { teile, gewichtsSumme: summe },
    quelle,
    rohJson: JSON.stringify({ stand: ctx.jetzt, teile }),
  };
}

/**
 * Die `fundid` kommt aus dem Katalog oder aus `fonds_aufloesung.adresse` des letzten Laufs.
 * Sie wird in den GraphQL-Text eingesetzt, daher nur als reine Ziffernfolge.
 */
export async function bestandteileFranklin(
  ctx: Kontext,
  isin: Isin,
  eintrag: Katalogeintrag | null,
  cacheAdresse: string | null,
): Promise<{ readonly ernte: Ernte<Anbieterernte>; readonly adresse: string }> {
  const produktId = eintrag?.produktId ?? cacheAdresse;
  if (produktId === null || !FRANKLIN_FONDS_ID.test(produktId)) {
    throw new Error(`franklin ${isin}: keine Produkt-ID bekannt.`);
  }
  return { ernte: await holeFranklin(ctx, isin, produktId), adresse: produktId };
}

// ---------------------------------------------------------------------------
// Katalog: ISIN -> fundid aus der Produkt-Sitemap
// ---------------------------------------------------------------------------

const SITEMAP_ADRESSE =
  'https://www.franklintempleton.de/binaries/content/assets/global/sitemaps/google/de-de_product.xml';

/** Nur ETF-Seiten: `…/preise-etfs/produkt/<fundid>/<klasse>/<slug>/<ISIN>`. Kein XML-Parser. */
const EINTRAG_MUSTER =
  /<loc>https:\/\/www\.franklintempleton\.de\/[a-z0-9/-]{0,200}\/preise-etfs\/produkt\/(\d{1,9})\/[A-Za-z0-9]{1,20}\/[a-z0-9-]{1,200}\/([A-Z0-9]{12})<\/loc>/g;

export async function katalogFranklin(ctx: Kontext): Promise<ReadonlyMap<Isin, Katalogeintrag>> {
  const text = await holeText(SITEMAP_ADRESSE, {
    erlaubteHosts: ctx.konfiguration.erlaubteHosts,
    zeitlimitMs: ctx.konfiguration.csvZeitlimitMs,
    groesstMb: ctx.konfiguration.csvGroesstMb,
    accept: 'application/xml,text/xml;q=0.9,*/*;q=0.1',
  });

  const gefunden: { isin: string; fondsId: string }[] = [];
  for (const treffer of text.matchAll(EINTRAG_MUSTER)) {
    const [, fondsId, isin] = treffer;
    if (fondsId !== undefined && isin !== undefined && ISIN_MUSTER.test(isin)) gefunden.push({ isin, fondsId });
  }
  const eintraege = pruefe('franklin:sitemap', FranklinKatalog, gefunden);

  const katalog = new Map<Isin, Katalogeintrag>();
  for (const { isin, fondsId } of eintraege) {
    if (!katalog.has(isin)) katalog.set(isin, { produktId: fondsId });
  }
  return katalog;
}
