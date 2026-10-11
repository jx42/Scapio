import { z } from 'zod';
import { GRENZE, hoechstensEintraege, Isin } from './grundlagen.ts';

// ---------------------------------------------------------------------------
// Xtrackers-Holdings (Tabellen-Widget, roh von etf.dws.com)
// ---------------------------------------------------------------------------

/**
 * DWS liefert keine benannten Felder, sondern eine allgemeine Tabellen-Widget-Antwort:
 * `columns` beschreibt, was jede Spalte BEDEUTET (per `value`-Label wie "ISIN" oder
 * "% Weight"), `values` sind die Zeilen mit denselben Spaltenschluesseln. Welche
 * Schluessel das sind (`header`, `column_0`, `column_1`, ...) ist nicht stabil —
 * `xtrackers.ts` sucht die Spalte anhand ihres Labels, nie anhand der Position.
 *
 * Die Antwort ist eine Seiten-Komponente, keine dedizierte Datenschnittstelle: es gibt
 * viele weitere, rein optische Felder (Ueberschriften, Sortierhinweise, Disclaimer-Text),
 * die sich aendern koennen, ohne dass sich an den Bestandteilen etwas aendert. Deshalb ist
 * `.strict()` nur dort gesetzt, wo der eigentliche Wert steht (jede Zelle) — nicht auf der
 * Tabelle oder der Antwort selbst, sonst reisst eine neue Praesentations-Eigenschaft den
 * Ingest grundlos ab.
 */
const XtrackersSpalte = z.object({
  key: z.string().max(GRENZE.typ),
  value: z.string().max(GRENZE.name),
});

const XtrackersZelle = z
  .object({
    value: z.string().max(GRENZE.name),
    type: z.string().max(GRENZE.typ),
    sortValue: z.number().finite().optional(),
  })
  .strict();

const XtrackersZeile = z
  .record(z.string().max(GRENZE.typ), XtrackersZelle)
  .refine(hoechstensEintraege(GRENZE.xtrackersSpalten));

const XtrackersTabelle = z.object({
  columns: z.array(XtrackersSpalte).max(GRENZE.xtrackersSpalten),
  values: z.array(XtrackersZeile).max(GRENZE.xtrackersZeilen),
});

export const XtrackersAntwort = z.object({ tables: z.array(XtrackersTabelle).min(1).max(20) });

export type Xtrackerstabelle = z.infer<typeof XtrackersTabelle>;
export type Xtrackerszeile = z.infer<typeof XtrackersZeile>;

// ---------------------------------------------------------------------------
// Xtrackers-Produktkatalog (Sitemap, roh von etf.dws.com)
// ---------------------------------------------------------------------------

/**
 * Die Sitemap ist XML, kein JSON — dafuer gibt es hier keinen Parser: `xtrackers.ts` liest
 * nur die ISIN aus jeder passenden `<loc>`-Adresse per Muster
 * (`https://etf.dws.com/de-de/<ISIN>-<slug>/`) heraus und wirft den Rest des Dokuments weg.
 * [INV-12] wird ueber die Obergrenze auf der Ergebnisliste UND die strenge `Isin` je Eintrag
 * erfuellt — nicht ueber einen XML-Baum, den ohnehin niemand braucht.
 */
export const XtrackersKatalogIsins = z.array(Isin).max(GRENZE.xtrackersSitemapEintraege);
