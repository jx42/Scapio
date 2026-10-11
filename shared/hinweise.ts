/**
 * Die Hinweise eines Laufs: Art plus Werte. Den Satz baut die Oberflaeche
 * (`src/i18n/de.ts`, `hinweisText`). Der Ingest formuliert nichts mehr, damit keine
 * Komponente einen Hinweis an seinem Wortlaut erkennen muss. Die Werte sind Zahlen,
 * Tage, ISINs und eigene Schluessel. Die einzige Ausnahme ist `name` beim
 * Tagessprung: ein Wertpapiername der Bank, der nur als Text erscheint [INV-06].
 */

export type HinweisWerte = {
  /** Aus einer Datenbankzeile vor der Umstellung auf Arten: der fertige Satz von damals. */
  text: { text: string };
  mcpSitzungErneuert: Record<string, never>;
  vpiNichtAngebunden: { quelle: string };
  vpiRandNichtAngebunden: { quelle: string };
  vpiRandOhneBasis: Record<string, never>;
  zinsNichtAngebunden: { quelle: string };
  fondsNichtAbrufbar: { anbieter: string; isin: string; grund: string };
  artNichtAbrufbar: { isin: string; grund: string };
  storniert: { anzahl: number };
  kurslueckenJung: { tage: number; spanne: number };
  selbstkontrolle: { stufe: string; abweichungProzent: number };
  punkteZuFrueh: { quelle: string; grenze: string };
  punkteInZukunft: { quelle: string };
  summenAbweichung: { zehnerpotenz: number };
  tagessprung: { isin: string; name: string | null; anzahl: number; von: string; bis: string };
  historienbeginn: { ersterTransaktionsTag: string; ersterKaufTag: string };
  uebertragOhneWert: { isin: string; tag: string };
  vpiSprung: { monate: readonly string[]; schwelleProzent: number };
  zeileOhneZeitstempel: { quelle: string };
  zeileOhneZweig: { quelle: string };
  unbekannteTypen: { typen: readonly string[] };
  seedUebernommen: { zeilen: number };
  kursfensterNichtAbrufbar: { fenster: string; isin: string; grund: string };
  kursfensterSchema: { fenster: string; isin: string };
  kursfensterAndereIsin: { fenster: string; isin: string };
  zinsLuecken: { tage: number };
  vpiLuecken: { monate: number };
  vpiRandLuecken: { monate: number };
  bestandteileSumme: { isin: string; prozent: number; positionen: number; ohneIsin: number };
  /** Die Transaktionsliste nutzt schon mindestens 80 % der Seitendecke in `ingest/mcp.ts`. */
  transaktionenSeitenGrenze: { seiten: number; hoechstens: number };
  /** Eine Quelle ist gescheitert. `quelle` ist der Schluessel aus `lauf.quellen`, `code` der Fehlercode. */
  quelleGescheitert: { quelle: string; code: string };
};

export type HinweisArt = keyof HinweisWerte;

export type Hinweis = { [A in HinweisArt]: { readonly art: A; readonly werte: Readonly<HinweisWerte[A]> } }[HinweisArt];

export function hinweis<A extends HinweisArt>(art: A, werte: HinweisWerte[A]): Hinweis {
  return { art, werte } as Hinweis;
}

/**
 * Fuer `lauf.log` und die Konsole von `npm run ingest`: maschinenlesbar, nicht huebsch.
 * Ohne Fremdtext (`name`, `text`) — die Konsole landet auch im Kontext eines Agenten [ADR-042].
 */
export function hinweisKurz(h: Hinweis): string {
  const { name: _name, text: _text, ...werte } = h.werte as Record<string, unknown>;
  return `${h.art} ${JSON.stringify(werte)}`;
}
