/**
 * Die Arten der Quellen, deren Scheitern ein Lauf meldet (`quelleGescheitert`). Der Ingest
 * setzt sie, die Oberfläche hat für jede einen Text — ein neuer Eintrag hier verlangt beides.
 * Der Schlüssel ist die Art, bei Kursen und Fondsverzeichnissen mit `:<teil>` dahinter.
 */
const QUELLEN_ARTEN = [
  'transaktionen',
  'holdings',
  'cash',
  'kurse',
  'sparplaene',
  'gesamtwert',
  'vpi',
  'vpi-aktuell',
  'zins',
  'art',
  'fonds',
  'fondsaufloesung',
  'fondskatalog',
] as const;

export type QuellenArt = (typeof QUELLEN_ARTEN)[number];
export type QuellenSchluessel = QuellenArt | `${QuellenArt}:${string}`;

export function istQuellenArt(art: string): art is QuellenArt {
  return (QUELLEN_ARTEN as readonly string[]).includes(art);
}

/** Art und Teil eines Schlüssels; ohne `:` ist der Teil die Art selbst. */
export function zerlegeQuelle(schluessel: string): { readonly art: string; readonly teil: string } {
  const trenner = schluessel.indexOf(':');
  return trenner < 0
    ? { art: schluessel, teil: schluessel }
    : { art: schluessel.slice(0, trenner), teil: schluessel.slice(trenner + 1) };
}
