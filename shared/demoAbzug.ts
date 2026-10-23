/**
 * Die Demo als statischer Abzug [ADR-048]: welche API-Anfragen es gibt und unter welchem
 * Dateipfad ihre Antwort liegt. `start/demoExport.ts` schreibt die Dateien, `demo-worker/`
 * bildet eine Anfrage darauf ab — beide über diese eine Liste.
 */

import { BENCHMARKS, RISIKOFREI_ISIN } from './benchmarks.ts';
import { LESENDE_ROUTEN } from './routen.ts';
import { FENSTER, ZEITRAEUME } from './zeitfenster.ts';

const OHNE_PARAMETER: readonly string[] = Object.values(LESENDE_ROUTEN)
  .filter((r) => r.parameter.length === 0)
  .map((r) => r.pfad.slice('/api/'.length));
const BENCHMARK_WAHL: readonly string[] = [...BENCHMARKS.map((b) => b.isin), RISIKOFREI_ISIN];
const OHNE_BENCHMARK = 'ohne';

/** Das feste Beispielziel des Rebalancing-Rechners im Abzug, in Basispunkten je Zeile. [ADR-057] */
export const DEMO_REBALANCING_ZIEL = 'KONTO:500,IE00B4L5Y983:5000,LU0171310443:1000,US67066G1040:500,IE00B3VVMM84:1500,IE00B41RYL63:1000,CH0454664001:0,IE00B579F325:500';

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

  if (OHNE_PARAMETER.includes(name)) {
    return [...parameter.keys()].length === 0 ? `/api/${name}.json` : null;
  }
  // Der freie Zeitraum (`von`/`bis`) ist in der Demo gesperrt und fehlt im Abzug.
  if (`/api/${name}` === LESENDE_ROUTEN.zeitreihe.pfad) {
    if (!nurErlaubte(parameter, ['zeitraum', 'benchmark'])) return null;
    const zeitraum = einzeln(parameter, 'zeitraum', ZEITRAEUME, 'max');
    const benchmarke = parameter.getAll('benchmark');
    if (zeitraum === null || benchmarke.length > 1) return null;
    const benchmark = benchmarke[0] !== undefined && BENCHMARK_WAHL.includes(benchmarke[0]) ? benchmarke[0] : OHNE_BENCHMARK;
    return `/api/zeitreihe/${zeitraum}/${benchmark}.json`;
  }
  if (`/api/${name}` === LESENDE_ROUTEN.fluesse.pfad) {
    if (!nurErlaubte(parameter, ['fenster'])) return null;
    const fenster = einzeln(parameter, 'fenster', FENSTER, '12m');
    return fenster === null ? null : `/api/fluesse/${fenster}.json`;
  }
  if (`/api/${name}` === LESENDE_ROUTEN.rebalancing.pfad) {
    if (!nurErlaubte(parameter, ['ziel'])) return null;
    return einzeln(parameter, 'ziel', [DEMO_REBALANCING_ZIEL], '') === DEMO_REBALANCING_ZIEL ? '/api/rebalancing.json' : null;
  }
  return null;
}

/**
 * Jede Anfrage, die die Oberfläche stellen kann, so wie `src/lib/api.ts` sie baut — ohne
 * `von`/`bis`: der Zeitraumregler ist in der Demo gesperrt.
 */
export function abzugAnfragen(): string[] {
  const anfragen = OHNE_PARAMETER.map((n) => `/api/${n}`);
  for (const z of ZEITRAEUME) {
    anfragen.push(`${LESENDE_ROUTEN.zeitreihe.pfad}?zeitraum=${z}`);
    for (const b of BENCHMARK_WAHL) {
      anfragen.push(`${LESENDE_ROUTEN.zeitreihe.pfad}?zeitraum=${z}&benchmark=${encodeURIComponent(b)}`);
    }
  }
  for (const f of FENSTER) anfragen.push(`${LESENDE_ROUTEN.fluesse.pfad}?fenster=${f}`);
  anfragen.push(`${LESENDE_ROUTEN.rebalancing.pfad}?ziel=${encodeURIComponent(DEMO_REBALANCING_ZIEL)}`);
  return anfragen;
}
