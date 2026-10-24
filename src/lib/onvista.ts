/*
 * Verlinkt eine ISIN zu onvista — die einzige Stelle, die einen `href` aus einem Wert baut.
 *
 * INV-06 verbietet das fuer Fremdtext, weil niemand seinen Inhalt prueft. Eine ISIN ist
 * kein Fremdtext in diesem Sinn: `ingest/schema/grundlagen.ts` fuehrt sie als eigenen Typ
 * `Isin`, getrennt von `Fremdtext`, mit genau diesem Muster. Der Zeichenraum ist
 * geschlossen (`A-Z`, `0-9`) — kein `"`, `<`, `&`, `:`, `/`, also kein Ausbruch aus der
 * Ziel-Adresse und kein `javascript:`-Schema moeglich. Begruendung und die Grenzen dieser
 * Ausnahme: ADR-021 und ADR-028.
 */

export const ISIN_MUSTER = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

/**
 * `null`, wenn `isin` nicht dem ISIN-Muster entspricht — dann gibt es keinen Link.
 * Die Suche leitet je Art (ETF, Aktie, Fonds, ETC/ETP, Anleihe) auf die Produktseite weiter;
 * die Wertpapierart geht deshalb nicht in die Adresse ein.
 */
export function onvistaLink(isin: string): string | null {
  if (!ISIN_MUSTER.test(isin)) return null;
  return `https://www.onvista.de/suche?searchValue=${isin}`; // INV-AUSNAHME: geschlossener Zeichenraum, siehe ADR-021
}
