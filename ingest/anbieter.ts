/**
 * Ein Anbieter kapselt Katalog oder Suche und Bestandteile eines ETF-Hauses — genau das, was
 * die automatische Fondsaufloesung braucht, um einen gehaltenen Fonds ohne `funds.json`-Eintrag
 * zu erkennen und abzurufen [ADR-065].
 *
 * Ein neuer Anbieter ist eine neue Datei unter `ingest/quellen/` mit `katalogXxx` oder
 * `sucheXxx` und `bestandteileXxx`, dazu ein Eintrag in `ANBIETER` und einer in
 * `ANBIETER_HOSTS` (`hosts.ts`), aus dem die Host-Allowlist folgt.
 */

import type { Bestandteil } from '../core/lookthrough.ts';
import type { Isin } from '../core/typen.ts';
import type { AutomatischerAnbieter } from '../db/repository/fondsAufloesung.ts';
import type { Ernte, Kontext } from './importieren.ts';
import { SchemaFehler } from './schema/pruefe.ts';
import { holeAmundi, katalogAmundi } from './quellen/amundi.ts';
import { bestandteileFranklin, katalogFranklin } from './quellen/franklin.ts';
import { bestandteileGoldmansachs, katalogGoldmansachs } from './quellen/goldmansachs.ts';
import { bestandteileInvesco, sucheInvesco } from './quellen/invesco.ts';
import { bestandteileIshares, sucheIshares } from './quellen/ishares.ts';
import { bestandteileJpmorgan, katalogJpmorgan } from './quellen/jpmorgan.ts';
import { holeXtrackers, katalogXtrackers } from './quellen/xtrackers.ts';

/**
 * Was ein Katalog je ISIN weiss: `produktId` ist der Schluessel, den `bestandteile` braucht
 * (bei iShares die `portfolioId`, sonst die ISIN selbst); `produktSeite` traegt nur iShares
 * ein — der Fallback fuer die Asset-Versions-ID-Aufloesung.
 */
export type Katalogeintrag = {
  readonly produktId: string;
  readonly produktSeite?: string;
};

export type Anbieterernte = { readonly teile: readonly Bestandteil[]; readonly gewichtsSumme: number };

/** Abweichung von 100 %, ab der ein Hinweis entsteht: Cash, Derivate und Rundung bleiben darunter. */
const SUMME_TOLERANZ = 0.05;
/**
 * Ausserhalb davon hat der Anbieter die Einheit gewechselt (Prozent statt Anteil oder
 * umgekehrt, Faktor 100) — `core/lookthrough.ts` normiert nicht, also wird nichts uebernommen.
 */
const SUMME_GRENZEN = { min: 0.5, max: 1.5 } as const;

/**
 * Gemeinsame Pruefung der Gewichtssumme fuer alle Anbieter [ADR-030]. Wirft `SchemaFehler`,
 * wenn die Summe unplausibel ist; meldet `bestandteileSumme`, wenn sie nur ungenau ist.
 */
export function pruefeGewichtsSumme(
  ctx: Kontext,
  quelle: string,
  befund: { readonly isin: string; readonly summe: number; readonly positionen: number; readonly ohneIsin: number },
): void {
  const { isin, summe, positionen, ohneIsin } = befund;
  if (!(summe >= SUMME_GRENZEN.min && summe <= SUMME_GRENZEN.max)) {
    throw new SchemaFehler(quelle, [`Gewichtssumme ${String(Math.round(summe * 100))} %`]);
  }
  if (Math.abs(summe - 1) > SUMME_TOLERANZ) {
    ctx.befunde.hinweis('bestandteileSumme', { isin, prozent: summe * 100, positionen, ohneIsin });
  }
}

export type Anbieter = {
  readonly name: AutomatischerAnbieter;
  /**
   * Ganze Produktliste in einem Abruf. ISIN -> Katalogeintrag fuer `bestandteile`. `null`:
   * das Haus bietet keinen Katalog an (iShares, ADR-027) und hat stattdessen eine `suche`.
   */
  readonly katalog: ((ctx: Kontext) => Promise<ReadonlyMap<Isin, Katalogeintrag>>) | null;
  /**
   * Suche je ISIN, fuer Haeuser ohne Katalog. `null` als Ergebnis: kein Treffer; ein Fehler
   * wird geworfen. Laeuft nur fuer ISINs, die kein Katalog kennt — eine Suche ohne Treffer
   * verraet dem Haus die ISIN eines fremden Fonds [ADR-065].
   */
  readonly suche: ((ctx: Kontext, isin: Isin) => Promise<Katalogeintrag | null>) | null;
  /**
   * Positionen eines Fonds. `cacheAdresse` ist die zuletzt gespeicherte Produkt-ID (iShares,
   * Goldman Sachs, Franklin); die Rueckgabe traegt die, die beim naechsten Lauf gilt (bei
   * Haeusern, deren Produkt-ID die ISIN ist, `null`). `eintrag` ist `null`, wenn diesen Lauf
   * weder Katalog noch Suche die ISIN getroffen haben (die Zeile war noch frisch) — dann
   * zaehlt `cacheAdresse`.
   */
  readonly bestandteile: (
    ctx: Kontext,
    isin: Isin,
    eintrag: Katalogeintrag | null,
    cacheAdresse: string | null,
  ) => Promise<{ readonly ernte: Ernte<Anbieterernte>; readonly adresse: string | null }>;
};

const ishares: Anbieter = {
  name: 'ishares',
  katalog: null,
  suche: sucheIshares,
  bestandteile: async (ctx, isin, eintrag, cacheAdresse) => {
    const { ernte, adresse } = await bestandteileIshares(ctx, isin, eintrag, cacheAdresse);
    return { ernte, adresse };
  },
};

const xtrackers: Anbieter = {
  name: 'xtrackers',
  katalog: katalogXtrackers,
  suche: null,
  bestandteile: async (ctx, isin) => ({
    ernte: await holeXtrackers(ctx, { anbieter: 'xtrackers', isin, name: '' }),
    adresse: null,
  }),
};

const amundi: Anbieter = {
  name: 'amundi',
  katalog: katalogAmundi,
  suche: null,
  bestandteile: async (ctx, isin) => ({
    ernte: await holeAmundi(ctx, { anbieter: 'amundi', isin, name: '' }),
    adresse: null,
  }),
};

const invesco: Anbieter = {
  name: 'invesco',
  katalog: null,
  suche: sucheInvesco,
  bestandteile: async (ctx, isin) => ({ ernte: await bestandteileInvesco(ctx, isin), adresse: null }),
};

const jpmorgan: Anbieter = {
  name: 'jpmorgan',
  katalog: katalogJpmorgan,
  suche: null,
  bestandteile: async (ctx, isin) => ({ ernte: await bestandteileJpmorgan(ctx, isin), adresse: null }),
};

const goldmansachs: Anbieter = {
  name: 'goldmansachs',
  katalog: katalogGoldmansachs,
  suche: null,
  bestandteile: bestandteileGoldmansachs,
};

const franklin: Anbieter = {
  name: 'franklin',
  katalog: katalogFranklin,
  suche: null,
  bestandteile: bestandteileFranklin,
};

/** Reihenfolge zaehlt fuer die Suche: der erste Treffer beendet sie (iShares vor Invesco). */
export const ANBIETER: readonly Anbieter[] = [ishares, xtrackers, amundi, invesco, jpmorgan, goldmansachs, franklin];
