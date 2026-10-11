import { z } from 'zod';
import { GRENZE, Zeitstempel, hoechstensEintraege } from './grundlagen.ts';

// ---------------------------------------------------------------------------
// EZB SDMX-JSON (Euro Short-Term Rate, EST)
// ---------------------------------------------------------------------------

/**
 * Diese Form ist NICHT aus der Dokumentation geraten, sondern per echtem GET gegen
 * https://data-api.ecb.europa.eu/service/data/EST/B.EU000A2X2A25.WT abgerufen und
 * Feld fuer Feld nachgebaut (`npm run vertrag` deckt keine Eurostat/EZB-Quelle ab,
 * siehe `ingest/quellen/vpi.ts`). Die Anfrage pinnt alle drei Serien-Dimensionen
 * (FREQ, BENCHMARK_ITEM, DATA_TYPE_EST) auf genau einen Wert; `structure.dimensions.series`
 * hat deshalb je Eintrag genau einen Wert, und `dataSets[0].series` genau einen Schluessel.
 * `TIME_PERIOD` ist die einzige freie Dimension, unter `dimensions.observation`.
 *
 * Eigenheit gegenueber dem Eurostat-Schema: manche Attributwerte (z. B. TITLE,
 * TITLE_COMPL, COVERAGE) haben nur `name`, kein `id` — beide sind deshalb optional.
 */
const EzbBeobachtung = z.tuple([z.number().nullable()]).rest(z.union([z.number(), z.null()]));

const EzbSerie = z
  .object({
    attributes: z.array(z.union([z.number(), z.null()])).max(50),
    observations: z.record(z.string().max(12), EzbBeobachtung).refine(hoechstensEintraege(GRENZE.zinsTage)),
  })
  .strict();

const EzbDataSet = z
  .object({
    action: z.string().max(40).optional(),
    validFrom: Zeitstempel.optional(),
    series: z.record(z.string().max(40), EzbSerie).refine(hoechstensEintraege(20)),
  })
  .strict();

const EzbDimensionswert = z
  .object({
    id: z.string().max(GRENZE.name).optional(),
    name: z.string().max(GRENZE.name).optional(),
    start: Zeitstempel.optional(),
    end: Zeitstempel.optional(),
  })
  .strict();

const EzbDimension = z
  .object({
    id: z.string().max(40).optional(),
    name: z.string().max(GRENZE.name).optional(),
    role: z.string().max(40).optional(),
    values: z.array(EzbDimensionswert).max(GRENZE.zinsTage),
  })
  .strict();

const EzbAttributWert = z
  .object({
    id: z.string().max(GRENZE.name).optional(),
    name: z.string().max(GRENZE.text).optional(),
  })
  .strict();

const EzbAttribut = z
  .object({
    id: z.string().max(40).optional(),
    name: z.string().max(GRENZE.name).optional(),
    values: z.array(EzbAttributWert).max(50),
  })
  .strict();

const EzbStructure = z
  .object({
    links: z.unknown().optional(),
    name: z.string().max(GRENZE.name).optional(),
    dimensions: z
      .object({
        series: z.array(EzbDimension).max(20),
        observation: z.array(EzbDimension).max(5),
      })
      .strict(),
    attributes: z
      .object({
        series: z.array(EzbAttribut).max(50),
        observation: z.array(EzbAttribut).max(50),
      })
      .strict(),
  })
  .strict();

export const EzbZinsAntwort = z
  .object({
    header: z
      .object({
        id: z.string().max(GRENZE.id),
        test: z.boolean(),
        prepared: Zeitstempel,
        sender: z.object({ id: z.string().max(40) }).strict(),
      })
      .strict(),
    dataSets: z.array(EzbDataSet).max(5),
    structure: EzbStructure,
  })
  .strict();

export type EzbZins = z.infer<typeof EzbZinsAntwort>;
