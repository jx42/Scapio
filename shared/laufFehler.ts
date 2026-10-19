/**
 * Jeder Code, den ein Lauf in `lauf.fehler_code` oder im Hinweis `quelleGescheitert` tragen
 * kann. Die Fehlerklassen des Ingest tippen ihren Code hierauf, die Oberflaeche bindet ihre
 * Saetze daran, und `test/laufFehler.test.ts` verlangt fuer jeden einen Eintrag in
 * `docs/RUNBOOK.md`. Die Codes der API-Fehlerform stehen in `server/fehler.ts`.
 */

export const MCP_FEHLER = [
  'E_MCP_ANMELDUNG',
  'E_MCP_DROSSEL',
  'E_MCP_ZEIT',
  'E_MCP_TRANSIENT',
  'E_MCP_ABGELEHNT',
  'E_MCP_RPC',
  'E_MCP_ARGUMENT',
  'E_MCP_SEITEN',
  'E_MCP_UNVOLLSTAENDIG',
] as const;
export type McpFehlerCode = (typeof MCP_FEHLER)[number];

export const NETZ_FEHLER = [
  'E_NETZ',
  'E_NETZ_ADRESSE',
  'E_NETZ_DNS',
  'E_NETZ_GROESSE',
  'E_NETZ_HOST',
  'E_NETZ_PRIVAT',
  'E_NETZ_SCHEMA',
  'E_NETZ_STATUS',
  'E_NETZ_UMLEITUNG',
  'E_NETZ_ZEIT',
] as const;
export type NetzFehlerCode = (typeof NETZ_FEHLER)[number];

export const LAUF_FEHLER = [
  ...MCP_FEHLER,
  ...NETZ_FEHLER,
  'E_SCHEMA',
  'E_PLAUSIBEL',
  'E_STORNO_BREMSE',
  'E_SEED_KAPUTT',
  'E_DATEI_FREMD',
  'E_VPI_QUELLE',
  'E_VPI_AKTUELL_QUELLE',
  'E_ZINS_QUELLE',
  'E_ABGEBROCHEN',
  'E_UNBEKANNT',
] as const;
export type LaufFehlerCode = (typeof LAUF_FEHLER)[number];

const ALLE: ReadonlySet<string> = new Set(LAUF_FEHLER);
const NETZ: ReadonlySet<string> = new Set(NETZ_FEHLER);

export function istLaufFehlerCode(code: string): code is LaufFehlerCode {
  return ALLE.has(code);
}

export function istNetzFehlerCode(code: string): code is NetzFehlerCode {
  return NETZ.has(code);
}
