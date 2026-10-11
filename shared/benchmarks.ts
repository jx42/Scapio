/**
 * Feste Liste der Vergleichs-Benchmarks fuer Kachel 1 (Verlauf). Im Wurzelverzeichnis,
 * weil zwei Schichten sie brauchen, die einander nicht gehoeren: der Ingest holt ihre
 * Kurshistorie (`ingest/ernte.ts`), der Server bietet sie als Auswahl an
 * (`server/vertrag.ts` reicht sie weiter, INV-11 unveraendert). `core/` liest diese
 * Datei nie.
 *
 * Aenderungen ausschliesslich per Code-Aenderung — bewusst keine Tabelle, keine
 * JSON-Datei.
 */
export const BENCHMARKS = [
  { isin: 'IE00B4L5Y983', name: 'MSCI World' },
  { isin: 'IE00B6R52259', name: 'MSCI ACWI' },
  { isin: 'IE00BKM4GZ66', name: 'MSCI Emerging Markets' },
  { isin: 'IE00B4K48X80', name: 'MSCI Europe' },
  { isin: 'IE00B5BMR087', name: 'S&P 500' },
  { isin: 'DE0005933931', name: 'DAX' },
  { isin: 'DE000A0S9GB0', name: 'Gold' },
  { isin: 'CH0454664001', name: 'Bitcoin' },
  { isin: 'IE00B4WXJJ64', name: 'EU Anleihen' },
] as const;

export type BenchmarkIsin = (typeof BENCHMARKS)[number]['isin'];

/** Vorauswahl der Oberflaeche, solange niemand etwas anderes gewaehlt hat. */
export const STANDARD_BENCHMARK: BenchmarkIsin = 'IE00B4L5Y983';

/**
 * Sonderfall Benchmark: der risikofreie Zins (EZB €STR), derselbe wie die Basis der
 * Sharpe-Ratio (`core/risiko.ts`). Bewusst nicht Teil von `BENCHMARKS`: er hat keine
 * ISIN und keine Kurshistorie vom MCP, der Ingest darf ihn also nicht wie die anderen
 * neun ueber `holeKurse()` abfragen (`ingest/ernte.ts`). Seine Linie entsteht rein aus
 * der ohnehin ingesteten Zinsreihe (`core/benchmark.ts`, `risikofreiesRaster`), siehe
 * ADR-026.
 *
 * `isin` ist hier keine echte ISIN — bewusst gegen `onvistaLink()`s Muster verstoßend
 * (`src/lib/onvista.ts`), damit die Oberflaeche automatisch keinen onvista-Link zeigt.
 */
export const RISIKOFREI_ISIN = 'RISIKOFREI' as const;
export const RISIKOFREI = { isin: RISIKOFREI_ISIN, name: 'Risikofreier Zins' } as const;
