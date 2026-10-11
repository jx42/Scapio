/**
 * Ein Anbieter kapselt Katalog und Bestandteile eines ETF-Hauses — genau das, was die
 * automatische Fondsaufloesung braucht, um einen gehaltenen Fonds ohne `funds.json`-Eintrag
 * zu erkennen und abzurufen.
 *
 * Ein neuer Anbieter ist eine neue Datei unter `ingest/quellen/` mit `katalogXxx`/
 * `bestandteileXxx`, dazu ein Eintrag in `ANBIETER` und einer in `ANBIETER_HOSTS`
 * (`hosts.ts`), aus dem die Host-Allowlist folgt.
 */

import type { Bestandteil } from '../core/lookthrough.ts';
import type { Isin } from '../core/typen.ts';
import type { Anbietername } from '../db/repository/fondsAufloesung.ts';
import type { Ernte, Kontext } from './importieren.ts';
import { SchemaFehler } from './schema/pruefe.ts';
import { holeAmundi, katalogAmundi } from './quellen/amundi.ts';
import { bestandteileIshares } from './quellen/ishares.ts';
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
  readonly name: Anbietername;
  /**
   * Ganze Produktliste in einem Abruf. ISIN -> Katalogeintrag fuer `bestandteile`. `null`:
   * das Haus bietet keinen Katalog an (iShares, ADR-027) — neue Fonds nur ueber `funds.json`.
   */
  readonly katalog: ((ctx: Kontext) => Promise<ReadonlyMap<Isin, Katalogeintrag>>) | null;
  /**
   * Positionen eines Fonds. `cacheAdresse` ist nur fuer iShares relevant (die zuletzt
   * aufgeloeste Holdings-Adresse); die Rueckgabe traegt die Adresse, die beim naechsten
   * Lauf zuerst probiert werden soll (bei den anderen Anbietern immer `null`). `eintrag`
   * ist `null`, wenn diesen Lauf kein Katalogabruf stattfand (die Zeile war noch frisch) —
   * iShares braucht ihn dann nur, falls `cacheAdresse` zugleich fehlschlaegt.
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
  bestandteile: async (ctx, isin, eintrag, cacheAdresse) => {
    const { ernte, adresse } = await bestandteileIshares(ctx, isin, eintrag, cacheAdresse);
    return { ernte, adresse };
  },
};

const xtrackers: Anbieter = {
  name: 'xtrackers',
  katalog: katalogXtrackers,
  bestandteile: async (ctx, isin) => ({
    ernte: await holeXtrackers(ctx, { anbieter: 'xtrackers', isin, name: '' }),
    adresse: null,
  }),
};

const amundi: Anbieter = {
  name: 'amundi',
  katalog: katalogAmundi,
  bestandteile: async (ctx, isin) => ({
    ernte: await holeAmundi(ctx, { anbieter: 'amundi', isin, name: '' }),
    adresse: null,
  }),
};

export const ANBIETER: readonly Anbieter[] = [ishares, xtrackers, amundi];
