import { z } from 'zod';
import { Fremdtext, GRENZE, Geld, Isin, Menge, Zeitstempel } from './grundlagen.ts';

// ---------------------------------------------------------------------------
// Eigene Dateien: funds.json und seed.json
// ---------------------------------------------------------------------------

/**
 * Eigene Dateien, trotzdem durch zod: sie werden von Hand bearbeitet, und eine
 * vertippte Adresse soll beim Laden auffallen und nicht erst im Netzstapel.
 *
 * `anbieter` unterscheidet, wie ein Fonds seine Bestandteile liefert: iShares braucht die
 * Produkt-ID des Fonds (`produktId`, die Zahl in der Adresse der Produktseite), Xtrackers und
 * Amundi werden ueber eine feste, anbieterweite Adresse anhand der ISIN abgefragt und
 * brauchen deshalb keine. Fehlt `anbieter` in der Datei, gilt `'ishares'` — bestehende
 * `funds.json`-Dateien ohne dieses Feld bleiben gueltig.
 */
const FondsEintragIshares = z
  .object({
    anbieter: z.literal('ishares'),
    isin: Isin,
    name: Fremdtext,
    produktId: z.string().regex(/^\d{1,9}$/),
  })
  .strict();

const FondsEintragXtrackers = z
  .object({
    anbieter: z.literal('xtrackers'),
    isin: Isin,
    name: Fremdtext,
  })
  .strict();

const FondsEintragAmundi = z
  .object({
    anbieter: z.literal('amundi'),
    isin: Isin,
    name: Fremdtext,
  })
  .strict();

export const FondsEintrag = z.preprocess(
  (roh) =>
    typeof roh === 'object' && roh !== null && !('anbieter' in roh) ? { ...roh, anbieter: 'ishares' } : roh,
  z.discriminatedUnion('anbieter', [FondsEintragIshares, FondsEintragXtrackers, FondsEintragAmundi]),
);

export const FundsDatei = z
  .object({
    hinweis: z.string().max(GRENZE.text).optional(),
    fonds: z.array(FondsEintrag).max(GRENZE.fonds),
  })
  .strict();

export type Fonds = z.infer<typeof FondsEintrag>;
export type FondsIshares = z.infer<typeof FondsEintragIshares>;
export type FondsXtrackers = z.infer<typeof FondsEintragXtrackers>;
export type FondsAmundi = z.infer<typeof FondsEintragAmundi>;

/** Anfangsbestand [P-13]: nur, wenn die Bank die Historie nicht weit genug liefert. */
export const SeedEintrag = z
  .object({
    id: z.string().min(1).max(GRENZE.id),
    ts: Zeitstempel,
    art: z.enum(['WERTPAPIER', 'CASH']),
    typ: z.string().min(1).max(GRENZE.typ),
    isin: Isin.nullable().optional(),
    menge: Menge.nullable().optional(),
    betrag: Geld,
    beschreibung: z.string().max(GRENZE.text).nullable().optional(),
  })
  .strict();

export const SeedDatei = z
  .object({
    hinweis: z.string().max(GRENZE.text).optional(),
    anfangsbestand: z.array(SeedEintrag).max(GRENZE.seedEintraege),
  })
  .strict();

export type Seedzeile = z.infer<typeof SeedEintrag>;
