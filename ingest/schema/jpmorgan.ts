import { z } from 'zod';
import { GRENZE, Isin } from './grundlagen.ts';

// ---------------------------------------------------------------------------
// JPMorgan (FundsMarketingHandler, roh von am.jpmorgan.com)
// ---------------------------------------------------------------------------

/** Am 15.11. 165 Katalogeintraege und 669 Positionen fuer IE00BF4G6Y48; Luft fuer Anleihefonds. */
export const GRENZE_JPMORGAN = { katalog: 2_000, zeilen: 10_000 } as const;

/**
 * Der Fund Explorer liefert je Eintrag rund 140 Felder Seitendaten; gebraucht werden nur die
 * ISIN (`identifier`) und die Fondsart. Ohne `.strict()` [ADR-030]. `identifier` ist hier
 * nur eine Zeichenkette: ein einzelner Eintrag ohne ISIN soll nicht den ganzen Katalog
 * reissen, `jpmorgan.ts` filtert ueber `ISIN_MUSTER` und prueft das Ergebnis mit
 * `JpmorganKatalogIsins`.
 */
const JpmorganKatalogeintrag = z.object({
  identifier: z.string().max(GRENZE.id).nullish(),
  fundTypeCode: z.string().max(GRENZE.typ).nullish(),
});

export const JpmorganKatalog = z.array(JpmorganKatalogeintrag).max(GRENZE_JPMORGAN.katalog);
export const JpmorganKatalogIsins = z.array(Isin).max(GRENZE_JPMORGAN.katalog);

/**
 * Eine Zeile aus `fundData.dailyHoldingsAll.data`. `marketValuePercent` ist Prozent.
 * Die Cash-Zeile hat `securityIsin: null`; `country` fehlt an einzelnen Titeln,
 * `sector` war am 15.11. an allen Zeilen `null`.
 */
const JpmorganZeile = z.object({
  securityIsin: z.string().max(GRENZE.typ).nullable(),
  securityDescription: z.string().max(GRENZE.name).nullable(),
  marketValuePercent: z.number().finite().nullable(),
  country: z.string().max(GRENZE.name).nullable(),
  sector: z.string().max(GRENZE.name).nullable(),
});

/** Das Datum wird geprueft, aber nicht uebernommen: der Stand ist `ctx.jetzt` wie bei iShares. */
export const JpmorganAntwort = z.object({
  fundData: z.object({
    dailyHoldingsAll: z.object({
      effectiveDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable(),
      data: z.array(JpmorganZeile).max(GRENZE_JPMORGAN.zeilen),
    }),
  }),
});
