import { z } from 'zod';
import { GRENZE, ISIN_MUSTER, Zeitstempel } from './grundlagen.ts';

// ---------------------------------------------------------------------------
// get_security_quote
// ---------------------------------------------------------------------------

/**
 * Gebraucht wird nur `securityType`. Der Rest der Antwort steht trotzdem strikt da, damit
 * ein umbenanntes Feld auffaellt, statt still durchzulaufen — Kurse liest die Anwendung aus
 * `get_security_chart`, nicht von hier, deshalb bleiben die Zahlen ungeprueft `number`.
 */
export const Wertpapierantwort = z
  .object({
    portfolioId: z.string().max(GRENZE.id).optional(),
    security: z
      .object({
        securityId: z.string().max(GRENZE.id),
        isin: z.string().regex(ISIN_MUSTER),
        name: z.string().max(GRENZE.name), // Fremdtext, nur Text  [INV-06]
        securityType: z.string().min(1).max(GRENZE.typ).nullable(),
        quote: z
          .object({
            quoteTickId: z.string().max(GRENZE.id).nullable(),
            midPrice: z.number().nullable(),
            bidPrice: z.number().nullable(),
            askPrice: z.number().nullable(),
            currency: z.string().max(8).nullable(),
            timestampUtc: Zeitstempel.nullable(),
            isOutdated: z.boolean().nullable(),
            performanceDate: Zeitstempel.nullable(),
            performances: z
              .array(
                z
                  .object({
                    timeframe: z.string().max(GRENZE.typ),
                    performance: z.number().nullable(),
                    simpleAbsoluteReturn: z.number().nullable(),
                  })
                  .strict(),
              )
              .max(GRENZE.allocations),
          })
          .strict()
          .nullable(),
      })
      .strict(),
  })
  .strict();

export type Wertpapier = z.infer<typeof Wertpapierantwort>;
