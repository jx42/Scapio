import type { Bestandteil } from '../../core/lookthrough.ts';
import type { Isin } from '../../core/typen.ts';
import type { Katalogeintrag } from '../anbieter.ts';
import { pruefeGewichtsSumme } from '../anbieter.ts';
import { entschaerfe } from '../fremdtext.ts';
import type { Ernte, Kontext } from '../importieren.ts';
import { holeText } from '../netz.ts';
import type { FondsAmundi } from '../schema.ts';
import { AmundiAntwort, AmundiKatalogAntwort, GRENZE, ISIN_MUSTER, pruefe } from '../schema.ts';

export const quelleFuer = (isin: Isin): string => `amundi:${isin}`;

export type Amundiernte = { readonly teile: readonly Bestandteil[]; readonly gewichtsSumme: number };

/**
 * Ein fester Host und ein fester Kontext (`countryCode: 'DEU'`) beantworten JEDE
 * Amundi/Lyxor-ISIN korrekt, unabhaengig vom tatsaechlichen Fondsdomizil — an echten
 * Antworten fuer luxemburgische und franzoesische Fonds gleichermassen geprueft. Keine
 * Land/TLD-Angabe je Fonds noetig.
 */
export async function holeAmundi(ctx: Kontext, fonds: FondsAmundi): Promise<Ernte<Amundiernte>> {
  const quelle = quelleFuer(fonds.isin);
  const text = await holeText('https://www.amundietf.de/mapi/ProductAPI/getProductsData', {
    erlaubteHosts: ctx.konfiguration.erlaubteHosts,
    zeitlimitMs: ctx.konfiguration.csvZeitlimitMs,
    groesstMb: ctx.konfiguration.csvGroesstMb,
    accept: 'application/json',
    json: {
      context: {
        countryCode: 'DEU',
        countryName: 'Germany',
        languageCode: 'de',
        languageName: 'German',
        userProfileName: 'RETAIL',
      },
      productIds: [fonds.isin],
      characteristics: ['ISIN', 'SHARE_MARKETING_NAME'],
      composition: { compositionFields: ['name', 'isin', 'weight', 'sector', 'countryOfRisk'] },
      productType: 'PRODUCT',
      historics: [],
    },
  });
  const antwort = pruefe(quelle, AmundiAntwort, JSON.parse(text));
  const produkt = antwort.products[0];
  if (produkt === undefined) throw new Error(`amundi ${fonds.isin}: Antwort ohne Produkt.`);

  const teile: Bestandteil[] = [];
  const gesehen = new Set<string>();
  let summe = 0;
  let ohneIsin = 0;
  for (const eintrag of produkt.composition.compositionData) {
    const merkmale = eintrag.compositionCharacteristics;
    const isin = merkmale.isin.toUpperCase();
    if (!ISIN_MUSTER.test(isin)) {
      ohneIsin += 1;
      continue;
    }
    const gewicht = merkmale.weight;
    if (gesehen.has(isin)) {
      const vorhanden = teile.findIndex((t) => t.unternehmenIsin === isin);
      const alt = teile[vorhanden];
      if (alt !== undefined) teile[vorhanden] = { ...alt, gewicht: alt.gewicht + gewicht };
    } else {
      gesehen.add(isin);
      const sektor = entschaerfe(merkmale.sector ?? '').slice(0, GRENZE.name);
      const land = entschaerfe(merkmale.countryOfRisk ?? '').slice(0, GRENZE.name);
      teile.push({
        fondsIsin: fonds.isin,
        unternehmenIsin: isin,
        name: entschaerfe(merkmale.name).slice(0, GRENZE.name),
        gewicht,
        sektor: sektor.length > 0 ? sektor : null,
        land: land.length > 0 ? land : null,
      });
    }
    summe += gewicht;
  }
  if (teile.length === 0) throw new Error(`amundi ${fonds.isin}: Antwort gelesen, aber keine verwertbare Zeile.`);
  pruefeGewichtsSumme(ctx, quelle, { isin: fonds.isin, summe, positionen: teile.length, ohneIsin });
  return {
    daten: { teile, gewichtsSumme: summe },
    quelle,
    rohJson: JSON.stringify({ stand: ctx.jetzt, teile }),
  };
}

// ---------------------------------------------------------------------------
// Katalog: ISIN -> nichts weiter, dieselbe Adresse wie oben, aber mit leerem `productIds`
// ---------------------------------------------------------------------------

/**
 * Dieselbe Adresse wie `holeAmundi`, aber `productIds: []` fragt ALLE Produkte ab — ohne
 * `composition`, die haengt an einer einzelnen ISIN. `characteristics` kommt dabei fuer
 * jedes Produkt leer zurueck; die ISIN steht stattdessen direkt in `productId`
 * (`AmundiKatalogAntwort`, an einer echten Antwort geprueft: alle 669 Werte passen auf
 * `ISIN_MUSTER` und sind untereinander eindeutig).
 */
export async function katalogAmundi(ctx: Kontext): Promise<ReadonlyMap<Isin, Katalogeintrag>> {
  const text = await holeText('https://www.amundietf.de/mapi/ProductAPI/getProductsData', {
    erlaubteHosts: ctx.konfiguration.erlaubteHosts,
    zeitlimitMs: ctx.konfiguration.csvZeitlimitMs,
    groesstMb: ctx.konfiguration.csvGroesstMb,
    accept: 'application/json',
    json: { productIds: [] },
  });
  const antwort = pruefe('amundi:katalog', AmundiKatalogAntwort, JSON.parse(text));

  const katalog = new Map<Isin, Katalogeintrag>();
  for (const produkt of antwort.products) {
    const isin = produkt.productId.toUpperCase();
    if (!ISIN_MUSTER.test(isin)) continue;
    katalog.set(isin, { produktId: isin });
  }
  return katalog;
}
