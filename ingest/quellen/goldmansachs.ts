import type { Bestandteil } from '../../core/lookthrough.ts';
import type { Isin } from '../../core/typen.ts';
import type { Anbieterernte, Katalogeintrag } from '../anbieter.ts';
import { pruefeGewichtsSumme } from '../anbieter.ts';
import { entschaerfe } from '../fremdtext.ts';
import type { Ernte, Kontext } from '../importieren.ts';
import { holeText } from '../netz.ts';
import { GRENZE, ISIN_MUSTER, pruefe } from '../schema.ts';
import { GoldmansachsAntwort, GoldmansachsKatalogIsins } from '../schema/goldmansachs.ts';

export const quelleFuer = (isin: Isin): string => `goldmansachs:${isin}`;

const PV_NUMMER = /^PV\d{6,8}$/;

const ABFRAGE =
  'query($r: FundDetailRequest){fundsDetail(fundDetailRequest:$r){fundName shareClassId ' +
  'allHoldings{asAtDate holdings{holding isin portfolio level3}}}}';

async function holeGoldmansachs(ctx: Kontext, isin: Isin, pvNummer: string): Promise<Ernte<Anbieterernte>> {
  const quelle = quelleFuer(isin);
  const text = await holeText('https://am.gs.com/services/funds', {
    erlaubteHosts: ctx.konfiguration.erlaubteHosts,
    zeitlimitMs: ctx.konfiguration.csvZeitlimitMs,
    groesstMb: ctx.konfiguration.csvGroesstMb,
    accept: 'application/json',
    json: {
      query: ABFRAGE,
      variables: { r: { country: 'de', language: 'de', audience: 'advisors', pvNumber: pvNummer, shareClassId: isin } },
    },
  });
  const antwort = pruefe(quelle, GoldmansachsAntwort, JSON.parse(text));

  const teile: Bestandteil[] = [];
  const gesehen = new Set<string>();
  let summe = 0;
  let ohneIsin = 0;
  for (const zeile of antwort.data.fundsDetail.allHoldings.holdings) {
    const teilIsin = (zeile.isin ?? '').toUpperCase();
    if (!ISIN_MUSTER.test(teilIsin) || zeile.portfolio === null) {
      ohneIsin += 1;
      continue;
    }
    const gewicht = zeile.portfolio / 100;
    if (gesehen.has(teilIsin)) {
      const vorhanden = teile.findIndex((t) => t.unternehmenIsin === teilIsin);
      const alt = teile[vorhanden];
      if (alt !== undefined) teile[vorhanden] = { ...alt, gewicht: alt.gewicht + gewicht };
    } else {
      gesehen.add(teilIsin);
      const sektor = entschaerfe(zeile.level3 ?? '').slice(0, GRENZE.name);
      teile.push({
        fondsIsin: isin,
        unternehmenIsin: teilIsin,
        name: entschaerfe(zeile.holding ?? '').slice(0, GRENZE.name),
        gewicht,
        sektor: sektor.length > 0 ? sektor : null,
        land: null,
      });
    }
    summe += gewicht;
  }
  if (teile.length === 0) throw new Error(`goldmansachs ${isin}: Antwort gelesen, aber keine verwertbare Zeile.`);
  pruefeGewichtsSumme(ctx, quelle, { isin, summe, positionen: teile.length, ohneIsin });
  return {
    daten: { teile, gewichtsSumme: summe },
    quelle,
    rohJson: JSON.stringify({ stand: ctx.jetzt, teile }),
  };
}

/** Die PV-Nummer kommt aus dem Katalog oder, wenn diesen Lauf keiner abgerufen wurde, aus `fonds_aufloesung.adresse`. */
export async function bestandteileGoldmansachs(
  ctx: Kontext,
  isin: Isin,
  eintrag: Katalogeintrag | null,
  cacheAdresse: string | null,
): Promise<{ readonly ernte: Ernte<Anbieterernte>; readonly adresse: string }> {
  const produktId = eintrag?.produktId ?? cacheAdresse;
  if (produktId === null || !PV_NUMMER.test(produktId)) {
    throw new Error(`goldmansachs ${isin}: keine Produkt-ID bekannt.`);
  }
  const ernte = await holeGoldmansachs(ctx, isin, produktId);
  return { ernte, adresse: produktId };
}

// ---------------------------------------------------------------------------
// Katalog: ISIN -> PV-Nummer aus der Sitemap
// ---------------------------------------------------------------------------

const SITEMAP_ADRESSE = 'https://am.gs.com/sitemap/de-de.xml';

/**
 * Fondsseiten haben die Form `/de-de/advisors/funds/detail/<PV-Nummer>/<ISIN>/<slug>`; nur ein
 * Slug mit dem Wort `etf` gilt. Die Sitemap ist rund 9 MB groß, deshalb kein XML-Parser,
 * sondern nur `<loc>` per Muster. [INV-12] über `GoldmansachsKatalogIsins` und `PV_NUMMER`.
 */
const EINTRAG_MUSTER =
  /<loc>https:\/\/am\.gs\.com\/de-de\/advisors\/funds\/detail\/(PV\d{6,8})\/([A-Z0-9]{12})\/(?:[a-z0-9-]*-)?etf(?:-[a-z0-9-]*)?<\/loc>/g;

export async function katalogGoldmansachs(ctx: Kontext): Promise<ReadonlyMap<Isin, Katalogeintrag>> {
  const text = await holeText(SITEMAP_ADRESSE, {
    erlaubteHosts: ctx.konfiguration.erlaubteHosts,
    zeitlimitMs: ctx.konfiguration.csvZeitlimitMs,
    groesstMb: ctx.konfiguration.csvGroesstMb,
    accept: 'application/xml,text/xml;q=0.9,*/*;q=0.1',
  });

  const pvJeIsin = new Map<string, string>();
  for (const treffer of text.matchAll(EINTRAG_MUSTER)) {
    const [, pv, isin] = treffer;
    if (pv !== undefined && isin !== undefined && ISIN_MUSTER.test(isin)) pvJeIsin.set(isin, pv);
  }
  const isins = pruefe('goldmansachs:sitemap', GoldmansachsKatalogIsins, [...pvJeIsin.keys()]);

  const katalog = new Map<Isin, Katalogeintrag>();
  for (const isin of isins) {
    const pv = pvJeIsin.get(isin);
    if (pv !== undefined) katalog.set(isin, { produktId: pv });
  }
  return katalog;
}
