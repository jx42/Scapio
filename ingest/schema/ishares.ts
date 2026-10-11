import { z } from 'zod';
import { GRENZE } from './grundlagen.ts';

// ---------------------------------------------------------------------------
// iShares-Holdings (get-product-data v2, roh von www.ishares.com)
// ---------------------------------------------------------------------------

/**
 * Die Produktseite laedt ihre Positionen ueber `get-product-data` (component=holdings.all).
 * Jede Spalte ist ein Datenpunkt mit einem `value`-Array, alle Arrays gleich lang und
 * zeilenweise parallel. Gelesen werden fuenf Spalten; alles andere schneidet zod weg
 * statt abzulehnen, weil iShares dort laufend Felder ergaenzt [ADR-030]. Ein fehlender oder anders
 * getypter Datenpunkt faellt hier durch, nicht erst zwei Zeilen weiter [INV-12]; die
 * Gleichlaenge der Arrays prueft `holeIshares`.
 */
const spalte = <T extends z.ZodType>(wert: T) =>
  z.object({ value: z.array(wert).max(GRENZE.isharesZeilen) });

export const IsharesAntwort = z.object({
  componentsByNameMap: z.object({
    holdings: z.object({
      containersByNameMap: z.object({
        all: z.object({
          dataPointsByNameMap: z.object({
            isin: spalte(z.string().max(GRENZE.isin).nullable()),
            issueName: spalte(z.string().max(GRENZE.name).nullable()),
            holdingPercent: spalte(z.number().finite().nullable()),
            sectorName: spalte(z.string().max(GRENZE.name).nullable()),
            countryOfRisk: spalte(z.string().max(GRENZE.name).nullable()),
          }),
        }),
      }),
    }),
  }),
});
