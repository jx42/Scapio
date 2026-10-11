/**
 * Die Zeitraum- und Fensterlisten der Oberflaeche und des Servers. Im Wurzelverzeichnis,
 * weil beide Seiten sie brauchen und ein siebtes Fenster an genau einer Stelle
 * eingetragen werden soll: `server/zeitraum.ts` prueft Anfragen gegen die Listen,
 * `src/lib/api.ts` reicht sie an die Segmentleisten weiter.
 *
 * `Zeitraum` waehlt den Verlauf, `Fenster` die Monate der Fluss-Kachel. Nicht zu
 * verwechseln mit `KURSFENSTER_JE_HERKUNFT` in `ingest/quellen/kurse.ts`, den Fenstern
 * der Kursabfrage beim MCP.
 */

export const ZEITRAEUME = ['1w', '1m', 'ytd', '1j', '3j', '5j', 'max'] as const;
export type Zeitraum = (typeof ZEITRAEUME)[number];

export const FENSTER = ['3m', '6m', '12m', '36m', '60m', 'max'] as const;
export type Fenster = (typeof FENSTER)[number];

/** Anzahl der Monate je Fenster; `max` ist die ganze Historie. */
export const FENSTER_MONATE: Record<Exclude<Fenster, 'max'>, number> = {
  '3m': 3,
  '6m': 6,
  '12m': 12,
  '36m': 36,
  '60m': 60,
};
