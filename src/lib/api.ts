/*
 * Der einzige Weg nach draussen — und "draussen" ist hier der eigene Server auf
 * 127.0.0.1. Jede Adresse beginnt mit "/api/"; eine absolute URL kommt in dieser
 * Datei nicht vor und darf nirgends im Frontend vorkommen. [INV-11]
 *
 * Die Typen kommen als `import type` aus `server/vertrag.ts` — der Zeile nach dem Bau
 * bleibt nichts: kein Serverpfad landet im Bundle. `server/vertrag.ts` ist die einzige
 * Quelle des Vertrags; diese Datei fuegt nur die Laufzeitseite hinzu (Fetch, Fehler,
 * Query-Schluessel).
 */

import type {
  Aufteilung,
  Drift,
  DriftStufe,
  Fenster,
  FehlenderFonds,
  FehlenderFondsFall,
  Fluesse,
  Fondsanteil,
  Health,
  Hinweis,
  KennzahlenAntwort,
  Lauf,
  LaufHinweis,
  LaufSchritt,
  Marke,
  MarkenTyp,
  MarkenVorgang,
  MaxDrawdownErgebnis,
  McpAnmeldung,
  MitStand,
  Monatsfluss,
  PositionZeile,
  Rebalancing,
  RebalancingZeile,
  RealisierteZeile,
  Sparplan,
  Sparplaene,
  SharpeErgebnis,
  Top25,
  UnternehmenZeile,
  VolatilitaetErgebnis,
  XirrErgebnis,
  Zeitpunkt,
  Zeitraum,
  Zeitreihe,
  ErtragsZeile,
} from '../../server/vertrag.ts';

import { BENCHMARKS, RISIKOFREI, RISIKOFREI_ISIN, STANDARD_BENCHMARK } from '../../shared/benchmarks.ts';
import type { BenchmarkIsin } from '../../shared/benchmarks.ts';
import { LESENDE_ROUTEN, MUTIERENDE_ROUTEN } from '../../shared/routen.ts';
import { FENSTER, ZEITRAEUME } from '../../shared/zeitfenster.ts';

import type { ReactNode } from 'react';

import { de } from '@/i18n/de';
import type { KachelZustand } from '@/components/Kachel';
import { sessionToken } from '@/lib/token';

export { BENCHMARKS, FENSTER, RISIKOFREI, RISIKOFREI_ISIN, STANDARD_BENCHMARK, ZEITRAEUME };
export type { BenchmarkIsin };

export type {
  Aufteilung,
  Drift,
  DriftStufe,
  Fenster,
  FehlenderFonds,
  FehlenderFondsFall,
  Fluesse,
  Fondsanteil,
  Health,
  Hinweis,
  KennzahlenAntwort,
  Lauf,
  LaufHinweis,
  LaufSchritt,
  Marke,
  MarkenTyp,
  MarkenVorgang,
  MaxDrawdownErgebnis,
  McpAnmeldung,
  MitStand,
  Monatsfluss,
  PositionZeile,
  Rebalancing,
  RebalancingZeile,
  RealisierteZeile,
  Sparplan,
  Sparplaene,
  SharpeErgebnis,
  Top25,
  UnternehmenZeile,
  VolatilitaetErgebnis,
  XirrErgebnis,
  Zeitpunkt,
  Zeitraum,
  Zeitreihe,
  ErtragsZeile,
};

/** Ein fester Zeitraum aus der Segmentleiste oder ein frei gewaehlter aus dem Zeitraumregler. */
export type ZeitraumAuswahl = Zeitraum | { readonly von: string; readonly bis: string };

function zeitraumParameter(auswahl: ZeitraumAuswahl): string {
  return typeof auswahl === 'string'
    ? `zeitraum=${encodeURIComponent(auswahl)}`
    : `von=${encodeURIComponent(auswahl.von)}&bis=${encodeURIComponent(auswahl.bis)}`;
}

export type RefreshGestartet = { readonly art: 'gestartet'; readonly laufId: number };
export type RefreshBelegt = {
  readonly art: 'belegt';
  readonly laufId: number;
  readonly quelle: string | null;
  readonly seit: string | null;
};
export type RefreshErgebnis = RefreshGestartet | RefreshBelegt;

/** Vollstaendiger Ausgangswert, falls `mcpAnmeldenStarten` keinen `drift` im Rumpf findet. */
const DRIFT_OK: Drift = {
  stufe: 'ok',
  abweichung: 0,
  cashAbweichung: 0,
  berechnetGesamtCent: 0,
  gemeldetGesamtCent: 0,
  grund: null,
  positionen: [],
};

/* ----------------------------------------------------------------------- Fehler */

export class ApiFehler extends Error {
  readonly code: string;
  readonly hinweis: string | null;
  readonly status: number;

  constructor(code: string, text: string, hinweis: string | null, status: number) {
    super(text);
    this.name = 'ApiFehler';
    this.code = code;
    this.hinweis = hinweis;
    this.status = status;
  }
}

type FehlerRumpf = {
  fehler?: { code?: unknown; text?: unknown; hinweis?: unknown };
};

/** Ob der lokale Server fehlt. Das meldet die Seite einmal (`App.tsx`), nicht jede Kachel. */
export function istNetzFehler(fehler: Error | null): boolean {
  return fehler instanceof ApiFehler && fehler.code === 'E_NETZ';
}

/** Kachelzustand zu einer Abfrage, die gescheitert ist — mit Hinweis, wenn die API einen mitgibt. */
export function fehlerZustand(fehler: Error): { art: 'fehler'; text: string; hinweis: string | null; still: boolean } {
  return {
    art: 'fehler',
    text: fehler.message,
    hinweis: fehler instanceof ApiFehler ? fehler.hinweis : null,
    still: istNetzFehler(fehler),
  };
}

/**
 * Der Zustand einer Kachel aus ihrer Hauptabfrage. Ohne Daten gilt sie als leer, auch
 * wenn `leer` sie nicht fuer leer hielte.
 */
export function kachelZustand<T>(
  abfrage: { readonly isPending: boolean; readonly isError: boolean; readonly error: Error | null; readonly data: T | undefined },
  leer: (daten: T) => boolean,
  leerText?: ReactNode,
): KachelZustand {
  if (abfrage.isPending) return { art: 'laedt' };
  if (abfrage.isError && abfrage.error !== null) return fehlerZustand(abfrage.error);
  if (abfrage.data === undefined || leer(abfrage.data)) {
    return leerText === undefined ? { art: 'leer' } : { art: 'leer', text: leerText };
  }
  return { art: 'bereit' };
}

async function fehlerAus(antwort: Response): Promise<ApiFehler> {
  let code = 'E_UNBEKANNT';
  let text: string = de.fehler.unbekannt;
  let hinweis: string | null = null;
  try {
    const rumpf = (await antwort.json()) as FehlerRumpf;
    if (rumpf.fehler !== undefined) {
      if (typeof rumpf.fehler.code === 'string') code = rumpf.fehler.code;
      if (typeof rumpf.fehler.text === 'string') text = rumpf.fehler.text;
      if (typeof rumpf.fehler.hinweis === 'string') hinweis = rumpf.fehler.hinweis;
    }
  } catch {
    // Kein lesbarer Rumpf: der Statuscode ist alles, was wir haben.
  }
  // 502/503/504 kommen vom Zustellweg, nicht von der Anwendung: dann steht der Server
  // nicht, und genau das soll dort stehen — nicht "unbekannter Fehler".
  if (code === 'E_UNBEKANNT' && antwort.status >= 502 && antwort.status <= 504) {
    return new ApiFehler('E_NETZ', de.fehler.netz, de.fehler.netzHinweis, antwort.status);
  }
  return new ApiFehler(code, text, hinweis, antwort.status);
}

/* ------------------------------------------------------------------------ Holen */

async function holen<T>(pfad: string): Promise<T> {
  let antwort: Response;
  try {
    antwort = await fetch(pfad, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiFehler('E_NETZ', de.fehler.netz, de.fehler.netzHinweis, 0);
  }
  if (!antwort.ok) throw await fehlerAus(antwort);
  try {
    return (await antwort.json()) as T;
  } catch {
    throw new ApiFehler('E_FORMAT', de.fehler.format, null, antwort.status);
  }
}

/**
 * Token holen und pruefen, dann `POST` ohne Rumpf schicken — beiden mutierenden Routen
 * gemeinsam. [INV-08]
 */
async function postMitToken(pfad: string): Promise<Response> {
  const token = sessionToken();
  if (token === null) {
    throw new ApiFehler('E_KEIN_TOKEN', de.aktualisieren.keinToken, null, 0);
  }
  try {
    return await fetch(pfad, {
      method: 'POST',
      headers: { Accept: 'application/json', 'X-Portfolio-Token': token },
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiFehler('E_NETZ', de.fehler.netz, de.fehler.netzHinweis, 0);
  }
}

export const api = {
  health: () => holen<Health>(LESENDE_ROUTEN.health.pfad),

  zeitreihe: (auswahl: ZeitraumAuswahl, benchmark: string | null) =>
    holen<Zeitreihe>(
      `${LESENDE_ROUTEN.zeitreihe.pfad}?${zeitraumParameter(auswahl)}` +
        (benchmark === null ? '' : `&benchmark=${encodeURIComponent(benchmark)}`),
    ),

  kennzahlen: () => holen<KennzahlenAntwort>(LESENDE_ROUTEN.kennzahlen.pfad),

  aufteilung: () => holen<Aufteilung>(LESENDE_ROUTEN.aufteilung.pfad),

  rebalancing: (ziel: string) => holen<Rebalancing>(`${LESENDE_ROUTEN.rebalancing.pfad}?ziel=${encodeURIComponent(ziel)}`),

  top25: () => holen<Top25>(LESENDE_ROUTEN.top25.pfad),

  fluesse: (fenster: Fenster) =>
    holen<Fluesse>(`${LESENDE_ROUTEN.fluesse.pfad}?fenster=${encodeURIComponent(fenster)}`),

  sparplaene: () => holen<Sparplaene>(LESENDE_ROUTEN.sparplaene.pfad),

  lauf: () => holen<Lauf>(LESENDE_ROUTEN.lauf.pfad),

  mcpAnmeldung: () => holen<McpAnmeldung>(LESENDE_ROUTEN.mcpAnmeldung.pfad),

  /**
   * Die erste der beiden mutierenden Routen. Kein Rumpf, keine Parameter, Token
   * ausschliesslich im Header. [INV-08]
   *
   * 202 heisst "gestartet", 409 heisst "laeuft schon" — und 409 ist kein Fehler,
   * sondern eine Antwort: die Oberflaeche zeigt den laufenden Lauf und startet
   * keinen zweiten.
   */
  refresh: async (): Promise<RefreshErgebnis> => {
    const antwort = await postMitToken(MUTIERENDE_ROUTEN.refresh);

    if (antwort.status === 409) {
      const rumpf = (await antwort.json().catch(() => ({}))) as {
        laufId?: number;
        quelle?: string;
        seit?: string;
      };
      return {
        art: 'belegt',
        laufId: typeof rumpf.laufId === 'number' ? rumpf.laufId : 0,
        quelle: typeof rumpf.quelle === 'string' ? rumpf.quelle : null,
        seit: typeof rumpf.seit === 'string' ? rumpf.seit : null,
      };
    }

    if (!antwort.ok) throw await fehlerAus(antwort);

    const rumpf = (await antwort.json().catch(() => ({}))) as { laufId?: number };
    return { art: 'gestartet', laufId: typeof rumpf.laufId === 'number' ? rumpf.laufId : 0 };
  },

  /**
   * Die zweite mutierende Route. Wie `refresh`: kein Rumpf, keine Parameter, Token
   * ausschliesslich im Header. [INV-08, ADR-012]
   *
   * 202 heisst "der Browser oeffnet sich gleich", 409 heisst "es laeuft schon eine
   * Anmeldung". Den Ausgang liefert erst der spaetere GET auf dieselbe Adresse.
   */
  mcpAnmeldenStarten: async (): Promise<McpAnmeldung> => {
    const antwort = await postMitToken(MUTIERENDE_ROUTEN.mcpAnmeldung);

    // 409 ist kein Fehler, sondern eine Antwort: es laeuft bereits eine Anmeldung.
    if (antwort.status !== 409 && !antwort.ok) throw await fehlerAus(antwort);

    const rumpf = (await antwort.json().catch(() => ({}))) as Partial<McpAnmeldung>;
    return {
      angemeldet: rumpf.angemeldet === true,
      laeuft: antwort.status === 409 ? true : rumpf.laeuft === true,
      fehler: rumpf.fehler ?? null,
      stand: rumpf.stand ?? null,
      drift: rumpf.drift ?? DRIFT_OK,
    };
  },
};

/** Query-Schluessel an einer Stelle, damit `invalidateQueries` nichts uebersieht. */
export const schluessel = {
  health: ['health'] as const,
  zeitreihe: (auswahl: ZeitraumAuswahl, benchmark: string | null) => ['zeitreihe', auswahl, benchmark] as const,
  kennzahlen: ['kennzahlen'] as const,
  aufteilung: ['aufteilung'] as const,
  rebalancing: (ziel: string) => ['rebalancing', ziel] as const,
  top25: ['top25'] as const,
  fluesse: (fenster: Fenster) => ['fluesse', fenster] as const,
  sparplaene: ['sparplaene'] as const,
  lauf: ['lauf'] as const,
  mcpAnmeldung: ['mcpAnmeldung'] as const,
};
