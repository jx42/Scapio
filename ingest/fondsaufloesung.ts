/**
 * Loest gehaltene ISINs auf einen Anbieter auf, ohne `funds.json`.
 *
 * Ersetzt fuer die unterstuetzten Haeuser das Eintragen von Hand: ein Katalogabruf je Haus
 * oder, fuer Haeuser ohne Katalog, eine Suche je ISIN traegt ein, was es ueber eine ISIN weiss. Diese Datei holt nur die Kataloge und baut
 * die Zeilen der Aufloesungstabelle — `lauf.ts` haelt die Datenbank (liest den bisherigen
 * Stand, ruft danach `Anbieter.bestandteile` fuer jeden Treffer auf) und `importieren.ts`
 * schreibt. Quellen holen und pruefen, sie schreiben nicht.
 */

import type { Tag } from '../core/kalender.ts';
import { alsTag, tageZwischen } from '../core/kalender.ts';
import type { Isin } from '../core/typen.ts';
import type { Anbietername, Aufloesung } from '../db/repository/fondsAufloesung.ts';
import type { Anbieter, Katalogeintrag } from './anbieter.ts';
import type { Kontext } from './importieren.ts';

/** Gemeinsamer Index aller Kataloge: ISIN -> Haus + Produktschluessel. */
export type KatalogIndex = ReadonlyMap<Isin, { readonly anbieter: Anbietername; readonly eintrag: Katalogeintrag }>;

/** Eine fehlende Zeile ist abgelaufen; eine vorhandene, wenn sie aelter als die Frist ist. */
export function istAbgelaufen(vorhanden: Aufloesung | null, heute: Tag, frischeTage: number): boolean {
  if (vorhanden === null) return true;
  return tageZwischen(alsTag(vorhanden.geprueftAm), heute) >= frischeTage;
}

export type KatalogErgebnis = { readonly art: 'erfolg' } | { readonly art: 'fehler'; readonly fehler: unknown };

/**
 * Holt den Katalog jedes Anbieters, der einen hat, genau einmal. Scheitert einer, bleibt sein
 * Teil des Index leer — `melde` traegt das weiter, der Lauf geht weiter. Betroffene ISINs
 * fallen in `aufloese` unten auf die zuletzt bekannte Zeile zurueck statt auf `unbekannt`.
 */
export async function katalogeAbrufen(
  ctx: Kontext,
  anbieter: readonly Anbieter[],
  melde: (anbieter: Anbietername, ergebnis: KatalogErgebnis) => void,
): Promise<KatalogIndex> {
  const index = new Map<Isin, { anbieter: Anbietername; eintrag: Katalogeintrag }>();
  for (const a of anbieter) {
    if (a.katalog === null) continue;
    try {
      const katalog = await a.katalog(ctx);
      for (const [isin, eintrag] of katalog) index.set(isin, { anbieter: a.name, eintrag });
      melde(a.name, { art: 'erfolg' });
    } catch (fehler) {
      melde(a.name, { art: 'fehler', fehler });
    }
  }
  return index;
}

/**
 * Sucht jede ISIN der Reihe nach bei den Anbietern mit `suche`; der erste Treffer beendet die
 * Suche fuer diese ISIN. Nur fuer ISINs, die kein Katalog kennt: eine Suche ohne Treffer
 * verraet dem Haus die ISIN eines fremden Fonds [ADR-065]. Ein gescheiterter Anbieter wird
 * fuer den Rest des Laufs uebersprungen und einmal gemeldet, nicht je ISIN; wer gar nicht
 * suchen musste, wird nicht gemeldet.
 */
export async function sucheAbrufen(
  ctx: Kontext,
  anbieter: readonly Anbieter[],
  isins: readonly Isin[],
  melde: (anbieter: Anbietername, ergebnis: KatalogErgebnis) => void,
): Promise<KatalogIndex> {
  const index = new Map<Isin, { anbieter: Anbietername; eintrag: Katalogeintrag }>();
  const ergebnisse = new Map<Anbietername, KatalogErgebnis>();
  for (const isin of isins) {
    for (const a of anbieter) {
      if (a.suche === null || ergebnisse.get(a.name)?.art === 'fehler') continue;
      try {
        const eintrag = await a.suche(ctx, isin);
        ergebnisse.set(a.name, { art: 'erfolg' });
        if (eintrag !== null) {
          index.set(isin, { anbieter: a.name, eintrag });
          break;
        }
      } catch (fehler) {
        ergebnisse.set(a.name, { art: 'fehler', fehler });
      }
    }
  }
  for (const [name, ergebnis] of ergebnisse) melde(name, ergebnis);
  return index;
}

/**
 * Baut die neue Zeile aus dem frisch geholten Index (Kataloge und Suche). Ein Treffer bestimmt
 * Anbieter, Durchsicht `moeglich` und Adresse — die Produkt-ID, wo sie nicht die ISIN ist, damit
 * ein gescheiterter Bestandteil-Abruf sie nicht fuer die Frist verliert. Kein Treffer heisst
 * `unbekannt`, ausser ein Anbieter ist diesen Lauf gescheitert: dann bleibt die alte Zeile
 * (oder keine), statt einen vielleicht bekannten Fonds fuer die Frist als unbekannt zu markieren.
 */
export function aufloese(
  isin: Isin,
  index: KatalogIndex,
  gescheitert: ReadonlySet<Anbietername>,
  bestehend: Aufloesung | null,
  heute: Tag,
): Aufloesung | null {
  const treffer = index.get(isin);
  if (treffer !== undefined) {
    const { produktId } = treffer.eintrag;
    const adresse = produktId === isin ? null : produktId;
    return { isin, anbieter: treffer.anbieter, durchsicht: 'moeglich', adresse, geprueftAm: heute };
  }
  if (gescheitert.size > 0) return bestehend;
  return { isin, anbieter: null, durchsicht: 'unbekannt', adresse: null, geprueftAm: heute };
}
