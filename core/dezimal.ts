/**
 * Fixpunkt-Arithmetik. Die einzige Rundungsstelle des Projekts. [INV-02]
 *
 * Geld ist `bigint` in Cent, Menge in 1e-8 Stueck, Kurs in 1e-6 EUR.
 * `parseFloat` ist in `core/` und `ingest/` verboten — Zeichenketten werden hier
 * selbst zerlegt, damit aus "10,671" nicht 10.670999999999999 wird.
 */

export type Cent = bigint;
export type MengeE8 = bigint;
export type KursE6 = bigint;

export const CENT_SKALA = 2;
export const MENGE_SKALA = 8;
export const KURS_SKALA = 6;

export class DezimalFehler extends Error {
  readonly eingabe: string;

  constructor(eingabe: string, grund: string) {
    super(`Zahl nicht lesbar (${grund}): ${JSON.stringify(eingabe)}`);
    this.name = 'DezimalFehler';
    this.eingabe = eingabe;
  }
}

/** Zerlegt eine Zahl-Zeichenkette in Vorzeichen, Vorkomma- und Nachkommaziffern. */
function zerlege(roh: string): { negativ: boolean; ganz: string; bruch: string } {
  const text = roh.trim();
  if (text === '') throw new DezimalFehler(roh, 'leer');

  // Wissenschaftliche Notation wird nicht akzeptiert: sie erreicht diese Anwendung
  // nur aus einem Fliesskomma-Umweg, und genau den soll es nicht geben.
  if (/[eE]/.test(text)) throw new DezimalFehler(roh, 'Exponentialschreibweise');

  const treffer = /^([+-]?)(\d*)(?:[.,](\d*))?$/.exec(text);
  if (treffer === null) throw new DezimalFehler(roh, 'unerwartete Zeichen');

  const [, zeichen = '', ganz = '', bruch = ''] = treffer;
  if (ganz === '' && bruch === '') throw new DezimalFehler(roh, 'keine Ziffern');

  return { negativ: zeichen === '-', ganz: ganz === '' ? '0' : ganz, bruch };
}

/**
 * Skaliert eine Zeichenkette oder Zahl auf `skala` Nachkommastellen.
 * Ueberzaehlige Stellen werden kaufmaennisch gerundet (half-up, vom Betrag weg).
 */
function skaliere(v: string | number, skala: number): bigint {
  const roh = typeof v === 'number' ? zahlZuText(v) : v;
  const { negativ, ganz, bruch } = zerlege(roh);

  const gefuellt = bruch.padEnd(skala + 1, '0');
  const behalten = gefuellt.slice(0, skala);
  const naechste = gefuellt.charCodeAt(skala) - 48;

  let betrag = BigInt(ganz + behalten);
  if (naechste >= 5) betrag += 1n;

  return negativ ? -betrag : betrag;
}

/**
 * Eine `number` aus einer fremden Antwort in Text ohne Exponent.
 * Fliesskomma bleibt damit auf genau diese Funktion beschraenkt — sie ist die
 * Grenze zwischen dem, was die Schnittstelle liefert, und dem, was gerechnet wird.
 */
function zahlZuText(v: number): string {
  if (!Number.isFinite(v)) throw new DezimalFehler(String(v), 'nicht endlich');
  // toFixed(12) haelt jede Kursstelle, die eine Bank liefert, und schneidet den
  // Fliesskomma-Schmutz dahinter ab, bevor er in eine bigint wandern kann.
  const text = Math.abs(v) < 1e15 ? v.toFixed(12) : String(v);
  if (/[eE]/.test(text)) throw new DezimalFehler(String(v), 'zu gross');
  return text;
}

export function zuCent(v: string | number): Cent {
  return skaliere(v, CENT_SKALA);
}

export function zuMengeE8(v: string | number): MengeE8 {
  return skaliere(v, MENGE_SKALA);
}

export function zuKursE6(v: string | number): KursE6 {
  return skaliere(v, KURS_SKALA);
}

/**
 * Kaufmaennische Division auf Cent, half-up vom Betrag weg.
 * Die einzige Stelle im Projekt, an der gerundet wird.
 */
export function rundeAufCent(zaehler: bigint, nenner: bigint): Cent {
  if (nenner === 0n) throw new DezimalFehler('0', 'Division durch null');

  const negativ = zaehler < 0n !== nenner < 0n;
  const z = zaehler < 0n ? -zaehler : zaehler;
  const n = nenner < 0n ? -nenner : nenner;

  const ganz = z / n;
  const rest = z % n;
  const aufgerundet = rest * 2n >= n ? ganz + 1n : ganz;

  return negativ ? -aufgerundet : aufgerundet;
}

/**
 * Wert einer Position: Menge (1e-8) × Kurs (1e-6) ergibt Skala 1e-14,
 * gerundet auf Cent — einmal, am Ende, nie in Zwischenschritten.
 */
export function wert(menge: MengeE8, kurs: KursE6): Cent {
  return rundeAufCent(menge * kurs, 10n ** 12n);
}

/** Anteil zweier Cent-Betraege als `number`. Nur zur Anzeige, nie zum Weiterrechnen. */
export function anteil(teil: Cent, ganzes: Cent): number {
  if (ganzes === 0n) return 0;
  return Number(teil) / Number(ganzes);
}

/** Summe ohne Zwischenrundung. */
export function summe(werte: readonly bigint[]): bigint {
  let s = 0n;
  for (const w of werte) s += w;
  return s;
}

/** Betrag einer bigint. */
export function betragVon(v: bigint): bigint {
  return v < 0n ? -v : v;
}

/** `bigint` als Dezimalzeichenkette — die kanonische Form fuer Hashes und JSON. */
export function alsText(v: bigint): string {
  return v.toString(10);
}

/**
 * Cent als Eurobetrag mit zwei Nachkommastellen — exakt, ohne den Umweg ueber
 * `number`. `(Number(c) / 100).toFixed(2)` waere kuerzer und verlöre ab
 * 90 Billionen Euro die letzte Stelle; hier gibt es nichts zu verlieren. [INV-02]
 *
 * Ohne Tausenderpunkt und ohne Waehrungszeichen: das ist Sache der Anzeige.
 */
export function euroText(v: Cent): string {
  const negativ = v < 0n;
  const b = betragVon(v);
  const ganz = b / 100n;
  const rest = b % 100n;
  return `${negativ ? '-' : ''}${ganz.toString(10)},${rest.toString(10).padStart(2, '0')}`;
}
