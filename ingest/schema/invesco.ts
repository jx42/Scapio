import { z } from 'zod';
import { GRENZE, Isin } from './grundlagen.ts';

// ---------------------------------------------------------------------------
// Invesco (dng-api.invesco.com, roh) — ohne `.strict()` [ADR-030]
// ---------------------------------------------------------------------------

/** EQQQ hat rund 100 Zeilen; breite Indexfonds liegen weit darunter. */
const INVESCO_ZEILEN = 5_000;

const Stichtag = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * `shareclasses/<ISIN>?idType=isin`: ein Treffer ist die Anteilsklasse mit `aliases.isin`,
 * eine fremde ISIN liefert `{}`. Das leere Objekt ist `.strict()`, weil „leer“ hier die
 * Bedeutung ist: jede andere Form (Fehlerobjekt, Array) wird `SchemaFehler` statt
 * stillschweigend „kein Treffer“.
 */
const InvescoAnteilsklasse = z.object({
  effectiveDate: Stichtag,
  aliases: z.object({ isin: Isin }),
});

export const InvescoShareclassAntwort = z.union([InvescoAnteilsklasse, z.object({}).strict()]);

/**
 * `shareclasses/<ISIN>/holdings/index?idType=isin`. `weight` in Prozent. Die Cash-Zeile hat
 * keine `isin`; gefiltert wird in `invesco.ts` über `ISIN_MUSTER`. `cusip` bleibt ungelesen.
 */
const InvescoBestandteil = z.object({
  name: z.string().max(GRENZE.name),
  isin: z.string().max(GRENZE.id).nullish(),
  weight: z.number().finite(),
});

export const InvescoAntwort = z.object({
  effectiveDate: Stichtag,
  holdings: z.array(InvescoBestandteil).max(INVESCO_ZEILEN),
});
