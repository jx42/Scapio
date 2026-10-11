/**
 * Die Demo als statischer Abzug [ADR-048]: welche API-Anfragen es gibt und unter welchem
 * Dateipfad ihre Antwort liegt. `start/demoExport.ts` schreibt die Dateien, `demo-worker/`
 * bildet eine Anfrage darauf ab — beide über diese eine Liste.
 */

import { BENCHMARKS, RISIKOFREI_ISIN } from './benchmarks.ts';
import { FENSTER, ZEITRAEUME } from './zeitfenster.ts';

const OHNE_PARAMETER = ['health', 'kennzahlen', 'aufteilung', 'top25', 'sparplaene', 'lauf', 'mcp-anmeldung'] as const;
const BENCHMARK_WAHL: readonly string[] = [...BENCHMARKS.map((b) => b.isin), RISIKOFREI_ISIN];
const OHNE_BENCHMARK = 'ohne';

/** Ein Parameter, der genau einmal und mit erlaubtem Wert vorkommt; sonst `null`. */
function einzeln(parameter: URLSearchParams, name: string, erlaubt: readonly string[], vorgabe: string): string | null {
  const werte = parameter.getAll(name);
  if (werte.length === 0) return vorgabe;
  if (werte.length > 1) return null;
  return erlaubt.includes(werte[0]!) ? werte[0]! : null;
}

function nurErlaubte(parameter: URLSearchParams, erlaubt: readonly string[]): boolean {
  return [...parameter.keys()].every((k) => erlaubt.includes(k));
}

/**
 * Dateipfad der Antwort auf `GET <pfad>?<parameter>`, oder `null`, wenn der Abzug sie
 * nicht hat. Die Vorgaben folgen dem Server (`server/zeitraum.ts`); einen unbekannten
 * Benchmark beantwortet der Server ohne Vergleichslinie, der Abzug ebenso.
 */
export function abzugPfad(pfad: string, parameter: URLSearchParams): string | null {
  const name = pfad.startsWith('/api/') ? pfad.slice('/api/'.length) : null;
  if (name === null) return null;

  if ((OHNE_PARAMETER as readonly string[]).includes(name)) {
    return [...parameter.keys()].length === 0 ? `/api/${name}.json` : null;
  }
  if (name === 'zeitreihe') {
    if (!nurErlaubte(parameter, ['zeitraum', 'benchmark'])) return null;
    const zeitraum = einzeln(parameter, 'zeitraum', ZEITRAEUME, 'max');
    const benchmarke = parameter.getAll('benchmark');
    if (zeitraum === null || benchmarke.length > 1) return null;
    const benchmark = benchmarke[0] !== undefined && BENCHMARK_WAHL.includes(benchmarke[0]) ? benchmarke[0] : OHNE_BENCHMARK;
    return `/api/zeitreihe/${zeitraum}/${benchmark}.json`;
  }
  if (name === 'fluesse') {
    if (!nurErlaubte(parameter, ['fenster'])) return null;
    const fenster = einzeln(parameter, 'fenster', FENSTER, '12m');
    return fenster === null ? null : `/api/fluesse/${fenster}.json`;
  }
  return null;
}

/** Jede Anfrage, die die Oberfläche stellen kann, so wie `src/lib/api.ts` sie baut. */
export function abzugAnfragen(): string[] {
  const anfragen = OHNE_PARAMETER.map((n) => `/api/${n}`);
  for (const z of ZEITRAEUME) {
    anfragen.push(`/api/zeitreihe?zeitraum=${z}`);
    for (const b of BENCHMARK_WAHL) anfragen.push(`/api/zeitreihe?zeitraum=${z}&benchmark=${encodeURIComponent(b)}`);
  }
  for (const f of FENSTER) anfragen.push(`/api/fluesse?fenster=${f}`);
  return anfragen;
}
