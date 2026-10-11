/**
 * Loest gehaltene ISINs auf einen Anbieter auf, ohne `funds.json`.
 *
 * Ersetzt fuer die drei unterstuetzten Haeuser das Eintragen von Hand: ein Katalogabruf je
 * Haus traegt ein, was er ueber eine ISIN weiss. Diese Datei holt nur die Kataloge und baut
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

/** `ohne`: das Haus hat keinen Katalog — kein Fehler, also auch keine Meldung an den Nutzer. */
export type KatalogErgebnis = { readonly art: 'erfolg' } | { readonly art: 'ohne' } | { readonly art: 'fehler'; readonly fehler: unknown };

/**
 * Holt den Katalog jedes Anbieters genau einmal. Scheitert einer oder fehlt er, bleibt sein
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
    if (a.katalog === null) {
      melde(a.name, { art: 'ohne' });
      continue;
    }
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
 * Baut die neue Zeile aus dem frisch geholten Index. Ein Treffer bestimmt Anbieter und
 * Durchsicht `moeglich`; kein Treffer heisst `unbekannt` — ausser der bisher bekannte
 * Anbieter dieser ISIN hat diesen Lauf keinen Katalog geliefert (gescheitert oder keiner), dann bleibt
 * die alte Zeile stehen statt einen bekannten Fonds fuer die Frist als unbekannt zu markieren.
 */
export function aufloese(
  isin: Isin,
  index: KatalogIndex,
  ohneKatalog: ReadonlySet<Anbietername>,
  bestehend: Aufloesung | null,
  heute: Tag,
): Aufloesung {
  const treffer = index.get(isin);
  if (treffer !== undefined) {
    return { isin, anbieter: treffer.anbieter, durchsicht: 'moeglich', adresse: null, geprueftAm: heute };
  }
  if (bestehend !== null && bestehend.anbieter !== null && ohneKatalog.has(bestehend.anbieter)) {
    return bestehend;
  }
  return { isin, anbieter: null, durchsicht: 'unbekannt', adresse: null, geprueftAm: heute };
}
