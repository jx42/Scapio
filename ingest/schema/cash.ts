import { z } from 'zod';
import { GRENZE, Geld, Zeitstempel } from './grundlagen.ts';

// ---------------------------------------------------------------------------
// get_portfolio_overview · get_portfolio_cash_breakdown
// ---------------------------------------------------------------------------

/**
 * `get_portfolio_overview` liefert den Gesamtwert fuer die Summenprobe
 * (`ingest/quellen/gesamtwert.ts`, ADR-032).
 *
 * `get_portfolio_cash_breakdown` liefert den Kontostand — der Bestand hat, anders als
 * urspruenglich angenommen, kein `cash`-Feld. Siehe `ingest/quellen/cash.ts`.
 */
export const OverviewAntwort = z
  .object({
    portfolioId: z.string().max(GRENZE.id).optional(),
    valuation: z
      .object({
        total: Geld,
        securities: Geld,
        crypto: Geld,
      })
      .strict(),
    timestamps: z
      .object({
        valuationTimestampUtc: Zeitstempel,
        inventoryTimestampUtc: Zeitstempel,
      })
      .strict(),
    performance: z
      .array(
        z
          .object({
            timeframe: z.string().max(GRENZE.typ),
            simpleAbsoluteReturn: z.number(),
          })
          .strict(),
      )
      .max(GRENZE.allocations),
  })
  .strict();

export const CashBreakdownAntwort = z
  .object({
    portfolioId: z.string().max(GRENZE.id).optional(),
    cash: z
      .object({
        cashBalance: Geld,
        buyingPower: Geld,
        buyingPowerWithoutCredit: Geld,
        pendingBuyOrdersAmount: Geld,
        estimatedTaxes: Geld,
      })
      .strict(),
    credit: z
      .object({
        availableCreditLine: Geld,
        loaned: Geld,
      })
      .strict(),
    derivatives: z
      .object({
        buyingPower: Geld,
        availableForDerivatives: Geld,
      })
      .strict(),
  })
  .strict();
