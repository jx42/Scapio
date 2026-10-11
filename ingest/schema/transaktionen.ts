import { z } from 'zod';
import { Fremdtext, GRENZE, Geld, ISIN_MUSTER, Kurs, Menge, Zeitstempel } from './grundlagen.ts';

// ---------------------------------------------------------------------------
// list_portfolio_transactions
// ---------------------------------------------------------------------------

export const TRANSAKTIONSSTATUS = ['EXECUTED', 'PENDING', 'CANCELED'] as const;

const SecurityZweig = z
  .object({
    isin: z.string().regex(ISIN_MUSTER),
    transactionType: z.string().min(1).max(GRENZE.typ),
    quantity: Menge,
    amount: Geld,
    side: z.string().max(GRENZE.typ).nullable(),
    limitPrice: Kurs.nullable(),
    stopPrice: Kurs.nullable(),
  })
  .strict();

const CashZweig = z
  .object({
    relatedIsin: z.string().regex(ISIN_MUSTER).nullable(),
    transactionType: z.string().min(1).max(GRENZE.typ),
    amount: Geld,
  })
  .strict();

const NonTradeSecurityZweig = z
  .object({
    isin: z.string().regex(ISIN_MUSTER),
    transactionType: z.string().min(1).max(GRENZE.typ),
    quantity: Menge,
    amount: Geld,
  })
  .strict();

/**
 * Eine Transaktion. Genau EINER der drei Zweige `security`/`cash`/`nonTradeSecurity` ist
 * gesetzt, passend zu `kind` — der Rest ist `null`. `amount` und `quantity` im jeweiligen
 * Zweig sind die beiden Felder, aus deren Quotient der tatsaechlich ausgefuehrte Kurs
 * entsteht [P-02]. `eltif` wurde in keiner beobachteten Zeile befuellt; `z.null()` statt
 * `z.unknown()`, damit ein kuenftig gefuellter vierter Zweig hier als Schemafehler auffaellt
 * statt stillschweigend durchzugehen.
 */
export const Transaktionszeile = z
  .object({
    id: z.string().min(1).max(GRENZE.id),
    kind: z.enum(['security', 'cash', 'non_trade_security']),
    category: z.string().min(1).max(GRENZE.typ),
    status: z.string().min(1).max(GRENZE.typ),
    currency: z.string().max(8),
    isCancellation: z.boolean(),
    lastEventAt: Zeitstempel,
    description: Fremdtext.nullable(),
    custodian: z.string().max(GRENZE.typ),
    security: SecurityZweig.nullable(),
    cash: CashZweig.nullable(),
    nonTradeSecurity: NonTradeSecurityZweig.nullable(),
    eltif: z.null(),
  })
  .strict()
  .refine(
    (t) =>
      (t.kind === 'security' ? t.security !== null : t.security === null) &&
      (t.kind === 'cash' ? t.cash !== null : t.cash === null) &&
      (t.kind === 'non_trade_security' ? t.nonTradeSecurity !== null : t.nonTradeSecurity === null),
    { message: 'kind passt nicht zum gesetzten Zweig' },
  );

export type Transaktionszeile = z.infer<typeof Transaktionszeile>;

const Seite = z
  .object({
    nextCursor: z.string().max(GRENZE.id).nullable(),
    totalCount: z.number().int().min(0),
    returnedCount: z.number().int().min(0),
  })
  .strict();

export const TransaktionenAntwort = z
  .object({
    portfolioId: z.string().max(GRENZE.id).optional(),
    page: Seite,
    transactions: z.array(Transaktionszeile).max(GRENZE.transaktionenJeSeite),
    // Krypto-Transaktionen: bislang in jeder beobachteten Antwort leer und ausserhalb des
    // Anwendungsbereichs. Deklariert, damit ein umbenanntes Feld auffaellt, nicht ausgewertet.
    crypto: z
      .object({
        page: Seite,
        transactions: z.array(z.unknown()).max(GRENZE.transaktionenJeSeite),
      })
      .strict()
      .optional(),
  })
  .strict();

export type Transaktionsseite = z.infer<typeof TransaktionenAntwort>;
