import { z } from 'zod';
import { GRENZE, ISIN_MUSTER, Kurs, Zeitstempel } from './grundlagen.ts';

// ---------------------------------------------------------------------------
// get_security_chart
// ---------------------------------------------------------------------------

/** Die vier Fenster aus Abschnitt 7.3. Die Enum ist die des MCP, nicht unsere. */
export const ZEITFENSTER = ['one_month', 'three_months', 'one_year', 'max'] as const;
export type Zeitfenster = (typeof ZEITFENSTER)[number];

export const Chartpunkt = z
  .object({
    timestampUtc: Zeitstempel,
    midPrice: Kurs,
  })
  .strict();

export const ChartAntwort = z
  .object({
    isin: z.string().regex(ISIN_MUSTER),
    timeframe: z.string().max(GRENZE.typ),
    currency: z.string().max(8),
    source: z.string().max(GRENZE.typ),
    closingReferencePoint: Chartpunkt,
    dataPoints: z.array(Chartpunkt).max(GRENZE.kurspunkte),
  })
  .strict();

export type Chart = z.infer<typeof ChartAntwort>;
