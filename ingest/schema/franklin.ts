import { z } from 'zod';
import { GRENZE, Isin } from './grundlagen.ts';

// ---------------------------------------------------------------------------
// Franklin-Bestaende (GraphQL `price-and-performance`, roh von www.franklintempleton.de)
// ---------------------------------------------------------------------------

/** Obergrenzen dieser Quelle; das Beispiel (27046) hatte 795 Zeilen, die Sitemap 49 ETFs. */
export const FRANKLIN_GRENZE = { zeilen: 5_000, sitemapEintraege: 2_000 } as const;

/** Prozent mit Dezimalkomma, z. B. `"0,02"` oder `"-0,03"` (Futures). */
const ProzentMitKomma = z.string().max(16).regex(/^-?\d{1,3}(?:,\d{1,6})?$/);

/** Ziffernfolge — sie wird in den GraphQL-Text eingesetzt, also nichts anderes. */
export const FRANKLIN_FONDS_ID = /^\d{1,9}$/;

/**
 * Gelesen werden nur `dailyholdings`; alles andere schneidet zod weg [ADR-030]. `asofdate`
 * wird geprueft, aber nicht uebernommen — der Stand ist `ctx.jetzt` wie bei iShares.
 */
const FranklinZeile = z.object({
  asofdate: z.string().regex(/^\d{2}\.\d{2}\.\d{4}$/),
  secname: z.string().max(GRENZE.name),
  isinsecnbr: z.string().max(GRENZE.typ),
  pctofnetassets: ProzentMitKomma.nullable(),
  sctrname: z.string().max(GRENZE.name).nullable(),
  countrynme: z.string().max(GRENZE.name).nullable(),
});

export const FranklinAntwort = z.object({
  data: z.object({
    Portfolio: z.object({
      portfolio: z.object({ dailyholdings: z.array(FranklinZeile).max(FRANKLIN_GRENZE.zeilen) }),
    }),
  }),
});

export type Franklinzeile = z.infer<typeof FranklinZeile>;

// ---------------------------------------------------------------------------
// Franklin-Produktkatalog (Sitemap)
// ---------------------------------------------------------------------------

/** Aus den `<loc>`-Adressen gelesene Paare; [INV-12] ueber Obergrenze, `Isin` und Ziffern-ID. */
export const FranklinKatalog = z
  .array(z.object({ isin: Isin, fondsId: z.string().regex(FRANKLIN_FONDS_ID) }))
  .max(FRANKLIN_GRENZE.sitemapEintraege);
