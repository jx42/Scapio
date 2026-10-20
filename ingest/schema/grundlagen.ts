import { z } from 'zod';
import type { Cent, KursE6, MengeE8 } from '../../core/dezimal.ts';
import { zuCent, zuKursE6, zuMengeE8 } from '../../core/dezimal.ts';

/** Obergrenzen an genau einer Stelle, damit sie nicht auseinanderlaufen. */
export const GRENZE = {
  isin: 12,
  id: 128,
  name: 200,
  typ: 64,
  text: 500,
  zeitstempel: 40,
  positionen: 500,
  transaktionenJeSeite: 200,
  kurspunkte: 20_000,
  sparplaene: 100,
  allocations: 200,
  fonds: 50,
  seedEintraege: 500,
  vpiMonate: 2_000,
  isharesZeilen: 20_000,
  xtrackersZeilen: 5_000,
  xtrackersSpalten: 20,
  amundiZeilen: 5_000,
  zinsTage: 10_000,
  xtrackersSitemapEintraege: 2_000,
  amundiKatalogProdukte: 2_000,
  /** Groesstes JSON, das eine MCP-Antwort haben darf, in Bytes. */
  nutzlastBytes: 16 * 1024 * 1024,
} as const;

/**
 * `z.record(...)` kennt kein `.max()` fuer die Eintragszahl — nur die Schluessel- und
 * Wertschemata werden geprueft. Ohne diese Pruefung bindet ein `z.record()` allein durch
 * seine Schluessellaenge keine Obergrenze an die Anzahl der Eintraege. [INV-12]
 */
export function hoechstensEintraege(grenze: number) {
  return (wert: Record<string, unknown>): boolean => Object.keys(wert).length <= grenze;
}

/** Eine ISIN ist zwoelf Zeichen mit Pruefziffer — nicht irgendeine Zeichenkette. */
export const ISIN_MUSTER = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

/**
 * Verpackt eine Umwandlung aus `core/dezimal.ts` so, dass eine unlesbare Zahl als
 * zod-Befund herauskommt und nicht als geworfene Ausnahme mitten im Schema.
 * Die Meldung nennt Typ und Laenge, nie den Inhalt — Betraege gehoeren nicht ins Protokoll.
 */
function sicher<T extends bigint>(um: (v: string | number) => T, feldart: string) {
  return (v: string | number, ctx: z.RefinementCtx): T => {
    try {
      return um(v);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${feldart} nicht lesbar (${typeof v}, Laenge ${String(v).length})`,
      });
      return z.NEVER as unknown as T;
    }
  };
}

/** Geld — nie `parseFloat`. [INV-02] */
export const Geld = z.union([z.number(), z.string().max(40)]).transform(sicher<Cent>(zuCent, 'Betrag'));
export const Menge = z.union([z.number(), z.string().max(40)]).transform(sicher<MengeE8>(zuMengeE8, 'Menge'));
export const Kurs = z.union([z.number(), z.string().max(40)]).transform(sicher<KursE6>(zuKursE6, 'Kurs'));

export const Isin = z.string().length(GRENZE.isin).regex(ISIN_MUSTER);
/** Fremdtext. Speichern, anzeigen — nie auswerten, nie loggen. [INV-06] */
export const Fremdtext = z.string().max(GRENZE.name);
export const Zeitstempel = z.string().min(4).max(GRENZE.zeitstempel);
