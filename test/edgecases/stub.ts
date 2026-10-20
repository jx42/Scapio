/*
 * Ersetzt `fetch` im Rahmen eines Falls. Die App merkt davon nichts: sie ruft dieselben
 * Pfade wie im Betrieb und geht durch denselben Fehlerpfad in `src/lib/api.ts`.
 */

import type { Drift } from '../../server/vertrag.ts';
import { LESENDE_ROUTEN, MUTIERENDE_ROUTEN, ROUTEN_NAMEN } from '../../shared/routen.ts';
import { POST_STANDARD, type Antwort, type Fall, type Route } from './faelle.ts';

export type Basis = Readonly<Record<'demo' | 'leer', Readonly<Record<string, unknown>>>>;

const ROUTEN: Readonly<Record<string, Route>> = Object.fromEntries(
  ROUTEN_NAMEN.map((name) => [LESENDE_ROUTEN[name].pfad, name]),
);

/** Ohne eigene Angabe gilt jeder Fall als angemeldet — sonst stuende ueberall der Anmeldehinweis. */
const ANGEMELDET: Antwort = {
  art: 'aendern',
  aendern: (b) => ({ ...(b as object), angemeldet: true, laeuft: false, fehler: null }),
};

type Antworter = (a: Antwort, pfad: string) => Promise<Response>;

function antworter(quelle: Readonly<Record<string, unknown>>, drift?: Drift): Antworter {
  const zaehler = new Map<Antwort, number>();
  const mitDrift = (rumpf: unknown): unknown =>
    drift !== undefined && typeof rumpf === 'object' && rumpf !== null && 'drift' in rumpf ? { ...rumpf, drift } : rumpf;

  const antworte: Antworter = async (a, pfad) => {
    switch (a.art) {
      case 'folge': {
        const n = zaehler.get(a) ?? 0;
        zaehler.set(a, n + 1);
        const schritt = a.schritte[Math.min(n, a.schritte.length - 1)];
        if (schritt === undefined) throw new Error('Leere Folge');
        return antworte(schritt, pfad);
      }
      case 'haengt':
        return new Promise<Response>(() => {});
      case 'netz':
        throw new TypeError('Failed to fetch');
      case 'roh':
        return new Response(a.text, { status: a.status });
      case 'json':
        return antwortJson(mitDrift(a.rumpf), a.status);
      case 'aendern': {
        const b = quelle[pfad];
        if (b === undefined) return antwortJson({ fehler: { code: 'E_TESTSEITE', text: `Keine Basis für ${pfad}`, hinweis: '' } }, 500);
        return antwortJson(mitDrift(a.aendern(structuredClone(b))), 200);
      }
    }
  };
  return antworte;
}

function pfadAus(eingabe: RequestInfo | URL): string {
  return typeof eingabe === 'string' ? eingabe : eingabe instanceof URL ? eingabe.pathname + eingabe.search : eingabe.url;
}

export function installiereStub(fall: Fall, basis: Basis): void {
  const antworte = antworter(basis[fall.basis ?? 'demo'], fall.drift);

  window.fetch = async (eingabe: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const pfad = pfadAus(eingabe);
    const ohneQuery = pfad.split('?')[0] ?? pfad;

    if ((init?.method ?? 'GET').toUpperCase() === 'POST') {
      const route: Route = ohneQuery === MUTIERENDE_ROUTEN.refresh ? 'refresh' : 'anmelden';
      return antworte(fall.routen?.[route] ?? POST_STANDARD, pfad);
    }
    const route = ROUTEN[ohneQuery];
    if (route === undefined) return antwortJson({ fehler: { code: 'E_NICHT_GEFUNDEN', text: pfad, hinweis: '' } }, 404);
    const eigene = fall.routen?.[route] ?? (route === 'mcpAnmeldung' ? ANGEMELDET : undefined);
    return antworte(eigene ?? { art: 'aendern', aendern: (b) => b }, pfad);
  };
}

/**
 * Der Fehler, den `src/lib/api.ts` aus einer Antwort macht — ohne Text und Hinweis hier
 * nachzubauen. `aufruf` muss `fetch` synchron anstossen, wie jeder Aufruf in `api`.
 */
export async function echterFehler(aufruf: () => Promise<unknown>, antwort: Antwort): Promise<Error> {
  const vorher = window.fetch;
  const antworte = antworter({});
  window.fetch = (eingabe) => antworte(antwort, pfadAus(eingabe));
  let laufend: Promise<unknown>;
  try {
    laufend = aufruf();
  } finally {
    window.fetch = vorher;
  }
  try {
    await laufend;
    return new Error('Kein Fehler — die Antwort wurde angenommen.');
  } catch (fehler) {
    return fehler instanceof Error ? fehler : new Error(String(fehler));
  }
}

function antwortJson(rumpf: unknown, status: number): Response {
  return new Response(JSON.stringify(rumpf), { status, headers: { 'Content-Type': 'application/json' } });
}
