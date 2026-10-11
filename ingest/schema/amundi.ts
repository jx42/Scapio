import { z } from 'zod';
import { GRENZE } from './grundlagen.ts';

// ---------------------------------------------------------------------------
// Amundi/Lyxor-Holdings (ProductAPI, roh von www.amundietf.de)
// ---------------------------------------------------------------------------

/**
 * Verifiziert per echtem POST gegen https://www.amundietf.de/mapi/ProductAPI/getProductsData
 * mit `composition.compositionFields: ['name','isin','weight','sector','countryOfRisk']` —
 * genau diese fuenf Felder liefert `compositionCharacteristics` dann auch, deshalb hier
 * `.strict()`. `sector`/`countryOfRisk` sind an echten Antworten vereinzelt `null`
 * (nicht kategorisierte Position), `isin` an einer Cash-Position leer statt zwoelfstellig —
 * deshalb `z.string()` statt der strengen `Isin`, gefiltert wird in `amundi.ts` wie bei
 * iShares ueber `ISIN_MUSTER`. `products[]` traegt daneben `currencies`, `metrics`,
 * `historics`, `passportingCountries`, `breakDowns` — nicht angefragte Felder, deren Form
 * je nach Produktart variiert; sie bleiben ungeprueft.
 */
const AmundiBestandteil = z
  .object({
    name: z.string().max(GRENZE.name),
    isin: z.string().max(GRENZE.isin),
    weight: z.number().finite(),
    sector: z.string().max(GRENZE.name).nullable(),
    countryOfRisk: z.string().max(GRENZE.name).nullable(),
  })
  .strict();

const AmundiKomposition = z
  .object({
    totalNumberOfInstruments: z.number().int().min(0),
    compositionData: z
      .array(z.object({ compositionCharacteristics: AmundiBestandteil }))
      .max(GRENZE.amundiZeilen),
  })
  .strict();

const AmundiProdukt = z.object({
  productId: z.string().max(GRENZE.isin),
  composition: AmundiKomposition,
});

export const AmundiAntwort = z.object({ products: z.array(AmundiProdukt).max(5) });

// ---------------------------------------------------------------------------
// Amundi-Produktkatalog (ProductAPI mit leerem `productIds`, roh von www.amundietf.de)
// ---------------------------------------------------------------------------

/**
 * Dieselbe Adresse wie `AmundiAntwort`, aber mit `productIds: []` angefragt: die Antwort
 * listet dann ALLE Produkte, dafuer ohne `composition` — `characteristics` kommt fuer
 * jedes Produkt leer zurueck (kein `characteristics.ISIN`, anders als die Doku es nahelegt).
 * Die ISIN steht stattdessen direkt in `productId` — an echten Antworten geprueft: alle
 * Werte passen auf `ISIN_MUSTER` und sind untereinander eindeutig.
 */
const AmundiKatalogProdukt = z.object({ productId: z.string().max(GRENZE.isin) });

export const AmundiKatalogAntwort = z.object({
  products: z.array(AmundiKatalogProdukt).max(GRENZE.amundiKatalogProdukte),
});
