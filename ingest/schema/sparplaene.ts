import { z } from 'zod';
import { Fremdtext, GRENZE, Geld, ISIN_MUSTER, Zeitstempel } from './grundlagen.ts';

// ---------------------------------------------------------------------------
// list_savings_plans
// ---------------------------------------------------------------------------

const Sparplanzeile = z
  .object({
    kind: z.string().max(GRENZE.typ),
    instrument: z
      .object({
        identifier: z.string().regex(ISIN_MUSTER),
        name: Fremdtext,
        securityType: z.string().max(GRENZE.typ),
      })
      .strict(),
    amount: Geld,
    configuration: z
      .object({
        frequency: z.string().min(1).max(GRENZE.typ),
        dayOfMonth: z.number().int().min(1).max(31).nullable(),
        dynamizationRate: z.union([z.number(), z.string().max(40)]),
        paymentMethod: z.string().max(GRENZE.typ),
        nextExecutionDate: Zeitstempel.nullable(),
      })
      .strict(),
  })
  .strict();

export const SparplaeneAntwort = z
  .object({
    portfolioId: z.string().max(GRENZE.id).optional(),
    totalSavingsPlanAmount: Geld,
    items: z.array(Sparplanzeile).max(GRENZE.sparplaene),
  })
  .strict();

export type Sparplaene = z.infer<typeof SparplaeneAntwort>;
