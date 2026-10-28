/**
 * Die Routen der API an einer Stelle. Server, Oberfläche, Demo-Abzug und Randfallseite
 * leiten ihre Listen hier ab; der Server bricht beim Start ab, wenn eine lesende Route
 * hier steht, aber nicht registriert ist.
 */

/** Lesende Routen mit den Query-Parametern, die der Server annimmt. */
export const LESENDE_ROUTEN = {
  health: { pfad: '/api/health', parameter: [] },
  zeitreihe: { pfad: '/api/zeitreihe', parameter: ['zeitraum', 'benchmark', 'von', 'bis'] },
  kennzahlen: { pfad: '/api/kennzahlen', parameter: [] },
  jahre: { pfad: '/api/jahre', parameter: ['benchmark'] },
  aufteilung: { pfad: '/api/aufteilung', parameter: [] },
  rebalancing: { pfad: '/api/rebalancing', parameter: ['ziel'] },
  top25: { pfad: '/api/top25', parameter: [] },
  gewinnquellen: { pfad: '/api/gewinnquellen', parameter: [] },
  fluesse: { pfad: '/api/fluesse', parameter: ['fenster'] },
  sparplaene: { pfad: '/api/sparplaene', parameter: [] },
  lauf: { pfad: '/api/lauf', parameter: [] },
  mcpAnmeldung: { pfad: '/api/mcp-anmeldung', parameter: [] },
} as const satisfies Record<string, { readonly pfad: `/api/${string}`; readonly parameter: readonly string[] }>;

export type LesendeRoute = keyof typeof LESENDE_ROUTEN;

/** Die beiden mutierenden Routen, ohne Parameter und ohne Rumpf. [INV-08, ADR-012] */
export const MUTIERENDE_ROUTEN = {
  refresh: '/api/refresh',
  mcpAnmeldung: '/api/mcp-anmeldung',
} as const;

export const ROUTEN_NAMEN = Object.keys(LESENDE_ROUTEN) as LesendeRoute[];
