/*
 * Pixelmasse fuer die Chart-Kacheln, an einer Stelle statt verstreut in den drei
 * Ansichten. Recharts nimmt fuer Hoehe, Randbreite, Tick-Abstand und Versatz Zahlen
 * entgegen, keine Tailwind-Klasse — die Werte bleiben deshalb benannte Konstanten statt
 * Literale in der JSX.
 */

export const AUFTEILUNG_CHART_HOEHE = 260;
/** Ringe in „Länder & Sektoren“: neben der Legende statt darüber, passt zu `w-66`, so hoch wie die zugeklappte Legende. */
export const GRUPPEN_RING_HOEHE = 264;
/** Ringmitte von oben nach unten: Symbol, Wert, Beschriftung — Versatz vom Mittelpunkt aus. */
export const RING_SYMBOL_GROESSE = 28;
export const RING_SYMBOL_VERSATZ = -38;
/** Flagge statt Symbol: 3 : 2, so breit, dass sie neben dem 28er-Symbol gleich schwer wirkt; unten bündig mit ihm. */
export const RING_FLAGGE_BREITE = 36;
export const RING_FLAGGE_HOEHE = 24;
export const RING_WERT_VERSATZ = 14;
export const RING_BESCHRIFTUNG_VERSATZ = 32;
export const RING_BESCHRIFTUNG_GROESSE = 12;
export const RING_WERT_GROESSE = 18;
/** Ringbreite als Anteil des Radius und Luecke zwischen zwei Stuecken in Grad. */
export const RING_INNEN = '70%';
export const RING_AUSSEN = '88%';
export const RING_LUECKE_GRAD = 1;

/** Strichelung des Hintergrundgitters und der Vorschau-Linie (Strich, Luecke). */
export const GITTER_STRICHELUNG = '2 4';
export const VORSCHAU_STRICHELUNG = '4 3';

/** Tick-Beschriftung der Achsen, an Tailwinds text-sm angeglichen (theme.css: --text-sm). */
export const CHART_ACHSEN_SCHRIFTGROESSE = 15;

/** Mittlere Zeichenbreite der Achsenschrift als Anteil der Schriftgroesse (Ziffern ~0,6 em). */
const ACHSEN_ZEICHENBREITE_EM = 0.6;
/** Tickstrich (6) plus Abstand (2), die Recharts links neben der Beschriftung freihaelt. */
const ACHSEN_BESCHRIFTUNG_ABSTAND = 8;

/**
 * Breite einer Y-Achse: genau die laengste Beschriftung plus Abstand. Selbst gerechnet statt
 * `width="auto"`, weil Regler und Hoverlinie den linken Rand der Zeichenflaeche schon vor dem
 * Zeichnen brauchen; eine feste Breite liesse links Leerraum, sobald die Zahlen kuerzer sind.
 */
export function yAchsenBreite(beschriftungen: readonly string[]): number {
  const laengste = Math.max(0, ...beschriftungen.map((text) => text.length));
  return Math.ceil(laengste * CHART_ACHSEN_SCHRIFTGROESSE * ACHSEN_ZEICHENBREITE_EM) + ACHSEN_BESCHRIFTUNG_ABSTAND;
}

/** Breite einer Zeile in Achsenschrift, geschaetzt wie bei `yAchsenBreite`. */
export function achsenTextBreite(text: string): number {
  return Math.ceil(text.length * CHART_ACHSEN_SCHRIFTGROESSE * ACHSEN_ZEICHENBREITE_EM);
}

export const VERLAUF_CHART_HOEHE = 320;
/** Abstand der Datumsbeschriftung von ihrer Vorschaulinie und vom oberen Rand. */
export const VORSCHAU_BESCHRIFTUNG_ABSTAND = 8;
export const VORSCHAU_BESCHRIFTUNG_OBEN = 6;
/** Deckkraft der Abdunkelung ausserhalb des gezogenen Zeitraums. */
export const VORSCHAU_ABDUNKELUNG = 0.45;
/** Unschaerfe (stdDeviation) der Reihen ausserhalb des gezogenen Zeitraums. */
export const VORSCHAU_UNSCHAERFE = 2.5;
export const VERLAUF_X_ACHSE_TICK_ABSTAND = 48;
export const VERLAUF_MARGIN = { top: 8, right: 0, bottom: 0, left: 0 } as const;
/** Rand ueber Datenspanne hinaus, als Anteil davon, damit die Y-Achse sich dem
 *  gewaehlten Zeitraum anpasst statt fest bei 0 zu beginnen — sonst verschenkt ein
 *  ruhiger Kursverlauf einen Grossteil der Chart-Hoehe. */
export const VERLAUF_Y_ACHSE_PUFFER_ANTEIL = 0.08;

export const FLUESSE_CHART_HOEHE = 200;
export const FLUESSE_X_ACHSE_TICK_ABSTAND = 16;
export const FLUESSE_MARGIN = { top: 8, right: 0, bottom: 0, left: 0 } as const;
/** Oben gerundete Balken (oben links, oben rechts, unten rechts, unten links). */
export const FLUESSE_BALKEN_RUNDUNG: [number, number, number, number] = [4, 4, 0, 0];

export const GEWINN_CHART_HOEHE = 440;
/** Oben und unten Platz fuer die halbe Zeile ueber dem ersten und unter dem letzten Knoten. */
export const GEWINN_MARGIN = { top: 16, right: 0, bottom: 16, left: 0 } as const;
export const GEWINN_KNOTEN_BREITE = 6;
/** Mindestens eine Textzeile, damit sich die Beschriftungen kleiner Knoten nicht ueberlagern. */
export const GEWINN_KNOTEN_ABSTAND = 22;
export const GEWINN_KNOTEN_RUNDUNG = 2;
export const GEWINN_BESCHRIFTUNG_ABSTAND = 8;
/** Hoehe des Beschriftungskastens: zwei Zeilen, senkrecht mittig am Knoten. */
export const GEWINN_BESCHRIFTUNG_HOEHE = 44;
/** Ab dieser Knotenhoehe stehen Name und Betrag untereinander, darunter in einer Zeile. */
export const GEWINN_ZWEIZEILIG_AB = 36;
/** Schriftgroesse der Beschriftung in px — muss `text-sm` entsprechen, wie in Top 25 und Länder & Sektoren. */
export const GEWINN_SCHRIFT = 14;
// Beim Überfahren tritt das Aktive nur leicht hervor, der Rest bleibt lesbar.
export const GEWINN_BAND_DECKKRAFT = { normal: 0.32, aktiv: 0.48, gedimmt: 0.16 } as const;
export const GEWINN_KNOTEN_DECKKRAFT_GEDIMMT = 0.55;
/** Unter so vielen Zeichen ist ein Name nicht mehr zu erkennen. */
export const GEWINN_NAME_MINDESTZEICHEN = 8;
/** Mittlere Zeichenbreite von Fliesstext; schmaler als die der Ziffern an den Achsen. */
const GEWINN_ZEICHENBREITE_EM = 0.55;

/**
 * Wie viele Zeichen eine Beschriftung haben darf: sie steht zwischen Knoten und Mitte. Geschaetzt
 * statt per CSS gekuerzt — `text-overflow: ellipsis` faellt beim Textabstand nach WCAG 1.4.12 durch.
 */
export function gewinnBeschriftungZeichen(breite: number): number {
  const platz = breite / 2 - GEWINN_KNOTEN_BREITE * 1.5 - GEWINN_BESCHRIFTUNG_ABSTAND * 2;
  return Math.max(GEWINN_NAME_MINDESTZEICHEN, Math.floor(platz / (GEWINN_SCHRIFT * GEWINN_ZEICHENBREITE_EM)));
}

/** Strichstaerken: Hauptlinie (Flaeche, Ringtrenner), Nebenlinie (Einzahlung, Vergleich, Nulllinie),
 *  Markierungslinie normal und hervorgehoben. */
export const LINIE_HAUPT = 2;
export const LINIE_NEBEN = 1.5;
export const LINIE_MARKE = 1;
export const LINIE_MARKE_HERVORGEHOBEN = 2;

/** Hover-Punkt der Rendite-Flaeche: Radius und Randstaerke. */
export const AKTIV_PUNKT_RADIUS = 4;
export const AKTIV_PUNKT_RAND = 2;

/** Farbpunkt vor einem Namen in der Legende (Durchmesser; der Radius folgt daraus). */
export const FARBTUPFER_GROESSE = 10;

/** Leuchten der Linien: Filterflaeche in Nutzerkoordinaten (groesser als jeder Chart), Unschaerfe und Deckkraft. */
export const LEUCHTEN = { x: -100, y: -100, breite: 10_000, hoehe: 5_000, unschaerfe: 1, deckkraft: 0.25 } as const;
