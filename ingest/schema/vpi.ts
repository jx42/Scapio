import { z } from 'zod';
import { GRENZE, Zeitstempel, hoechstensEintraege } from './grundlagen.ts';

// ---------------------------------------------------------------------------
// Eurostat JSON-stat 2.0 (prc_hicp_midx)
// ---------------------------------------------------------------------------

/**
 * ANNAHME (Abschnitt 6.5): Eurostat liefert JSON-stat 2.0. Die Anfrage pinnt jede
 * Dimension ausser `time` auf genau einen Wert (`geo=DE`, `coicop=CP00`, `unit=I15`,
 * `freq=M`), daher entspricht der laufende Index in `value` genau dem Index in
 * `dimension.time.category.index`. `lauf.ts` prueft diese Annahme, bevor es rechnet:
 * ist irgendeine andere Dimension groesser als eins, wird die Quelle als Fehler
 * vermerkt statt falsche Monate zuzuordnen. `npm run vertrag` ruft dieselbe Adresse
 * einmal ab und prueft dieses Schema dagegen.
 */
const JsonStatKategorie = z
  .object({
    index: z.record(z.string().max(20), z.number().int().min(0)).refine(hoechstensEintraege(GRENZE.vpiMonate)),
    label: z
      .record(z.string().max(20), z.string().max(GRENZE.name))
      .refine(hoechstensEintraege(GRENZE.vpiMonate))
      .optional(),
    unit: z.unknown().optional(),
  })
  .strict();

const JsonStatDimension = z
  .object({
    label: z.string().max(GRENZE.name).optional(),
    category: JsonStatKategorie,
    link: z.unknown().optional(),
    extension: z.unknown().optional(),
    note: z.unknown().optional(),
  })
  .strict();

export const EurostatAntwort = z
  .object({
    version: z.string().max(20).optional(),
    class: z.literal('dataset').optional(),
    label: z.string().max(GRENZE.text).optional(),
    source: z.string().max(GRENZE.text).optional(),
    updated: Zeitstempel.optional(),
    href: z.string().max(1000).optional(),
    id: z.array(z.string().max(40)).max(20),
    size: z.array(z.number().int().min(0)).max(20),
    role: z.unknown().optional(),
    note: z.unknown().optional(),
    warning: z.unknown().optional(),
    extension: z.unknown().optional(),
    dimension: z.record(z.string().max(40), JsonStatDimension).refine(hoechstensEintraege(20)),
    value: z.union([
      z.record(z.string().max(12), z.number().nullable()).refine(hoechstensEintraege(GRENZE.vpiMonate)),
      z.array(z.number().nullable()).max(GRENZE.vpiMonate),
    ]),
    status: z.unknown().optional(),
  })
  .strict();

export type Eurostat = z.infer<typeof EurostatAntwort>;
