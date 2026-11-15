import { z } from 'zod';
import { GRENZE, Isin } from './grundlagen.ts';

// ---------------------------------------------------------------------------
// Goldman Sachs (am.gs.com, roh) — ohne `.strict()` [ADR-030]
// ---------------------------------------------------------------------------

/** PV103353 hat rund 340 Zeilen; Anleihefonds liegen darüber, aber weit unter dieser Grenze. */
const GOLDMANSACHS_ZEILEN = 5_000;
/** Die Sitemap trägt rund 2.100 Adressen, davon am 15.11. 46 ETF-Anteilsklassen. */
const GOLDMANSACHS_SITEMAP_EINTRAEGE = 2_000;

/** Prozent mit Punkt, etwa `"0.86"`. Erst nach dieser Prüfung wird `Number(...)` daraus. */
const Prozent = z
  .string()
  .max(20)
  .regex(/^-?\d{1,4}(?:\.\d{1,8})?$/)
  .transform((wert) => Number(wert));

/**
 * `POST /services/funds`, GraphQL `fundsDetail.allHoldings`. `allHoldings` ist ein Objekt, kein
 * Array. Cash-Zeilen tragen statt einer ISIN Kürzel wie `CSH_USD`; gefiltert wird in
 * `goldmansachs.ts` über `ISIN_MUSTER`. `level3` war am 15.11. in jeder Zeile `null`.
 */
const GoldmansachsBestandteil = z.object({
  holding: z.string().max(GRENZE.name).nullable(),
  isin: z.string().max(GRENZE.id).nullable(),
  portfolio: Prozent.nullable(),
  level3: z.string().max(GRENZE.name).nullable(),
});

export const GoldmansachsAntwort = z.object({
  data: z.object({
    fundsDetail: z.object({
      allHoldings: z.object({
        asAtDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        holdings: z.array(GoldmansachsBestandteil).max(GOLDMANSACHS_ZEILEN),
      }),
    }),
  }),
});

/** Sitemap: nur die ISINs aus `<loc>`-Adressen mit ETF-Muster, siehe `katalogGoldmansachs`. */
export const GoldmansachsKatalogIsins = z.array(Isin).max(GOLDMANSACHS_SITEMAP_EINTRAEGE);
