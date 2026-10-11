import { z } from 'zod';
import { GRENZE, Geld, ISIN_MUSTER, Kurs, Menge, Zeitstempel } from './grundlagen.ts';

// ---------------------------------------------------------------------------
// get_portfolio_holdings
// ---------------------------------------------------------------------------

/**
 * Verifiziert gegen die echte Antwort von `npm run vertrag` (Bauanleitung 6.3, korrigiert —
 * der urspruengliche Auszug war eine Annahme, keine Beobachtung). Kein `cash` auf dieser
 * Ebene: der Kontostand kommt aus `get_portfolio_cash_breakdown`, siehe `CashBreakdownAntwort`.
 * `cryptoHoldings` wird deklariert, damit ein umbenanntes Feld auffaellt, aber nicht
 * ausgewertet — Krypto ist ausserhalb des Anwendungsbereichs.
 */
export const HoldingsAntwort = z
  .object({
    portfolioId: z.string().max(GRENZE.id).optional(),
    holdings: z
      .array(
        z
          .object({
            isin: z.string().regex(ISIN_MUSTER),
            name: z.string().max(200), // Fremdtext, nur Text  [INV-06]
            currentQuote: z
              .object({
                currency: z.string().max(8),
                midPrice: Kurs,
                timestamp: Zeitstempel,
              })
              .strict(),
            savingsPlan: z
              .object({
                amount: Geld,
                frequency: z.string().max(GRENZE.typ),
              })
              .strict()
              .nullable(),
            position: z
              .object({
                blocked: Menge,
                filled: Menge,
                pending: Menge,
              })
              .strict(),
          })
          .strict(),
      )
      .max(GRENZE.positionen),
    cryptoHoldings: z.array(z.unknown()).max(GRENZE.positionen),
  })
  .strict();

export type Holdings = z.infer<typeof HoldingsAntwort>;
