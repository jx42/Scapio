/*
 * Pixelmasse fuer die Chart-Kacheln, an einer Stelle statt verstreut in den drei
 * Ansichten. Recharts nimmt fuer Hoehe, Randbreite, Tick-Abstand und Versatz Zahlen
 * entgegen, keine Tailwind-Klasse — die Werte bleiben deshalb benannte Konstanten statt
 * Literale in der JSX.
 */

export const AUFTEILUNG_CHART_HOEHE = 260;
/** Vertikaler Versatz der beiden Textzeilen in der Ringmitte, vom Mittelpunkt aus. */
export const RING_BESCHRIFTUNG_VERSATZ = -8;
export const RING_WERT_VERSATZ = 14;
export const RING_BESCHRIFTUNG_GROESSE = 12;
export const RING_WERT_GROESSE = 18;

/** Tick-Beschriftung der Achsen, an Tailwinds text-sm angeglichen (theme.css: --text-sm). */
export const CHART_ACHSEN_SCHRIFTGROESSE = 15;

/** Mittlere Zeichenbreite der Achsenschrift als Anteil der Schriftgroesse (Ziffern ~0,6 em). */
const ACHSEN_ZEICHENBREITE_EM = 0.6;
/** Tickstrich (6) plus Abstand (2), die Recharts links neben der Beschriftung freihaelt. */
const ACHSEN_BESCHRIFTUNG_ABSTAND = 8;

/**
 * Breite einer Y-Achse: genau die laengste Beschriftung plus Abstand. Recharts 2 kennt
 * kein `width="auto"`, und eine feste Breite laesst links Leerraum, sobald die Zahlen
 * kuerzer sind als der Worst Case.
 */
export function yAchsenBreite(beschriftungen: readonly string[]): number {
  const laengste = Math.max(0, ...beschriftungen.map((text) => text.length));
  return Math.ceil(laengste * CHART_ACHSEN_SCHRIFTGROESSE * ACHSEN_ZEICHENBREITE_EM) + ACHSEN_BESCHRIFTUNG_ABSTAND;
}

export const VERLAUF_CHART_HOEHE = 320;
export const VERLAUF_X_ACHSE_TICK_ABSTAND = 48;
export const VERLAUF_MARGIN = { top: 8, right: 0, bottom: 0, left: 0 } as const;
/** Rand ueber Datenspanne hinaus, als Anteil davon, damit die Y-Achse sich dem
 *  gewaehlten Zeitraum anpasst statt fest bei 0 zu beginnen — sonst verschenkt ein
 *  ruhiger Kursverlauf einen Grossteil der Chart-Hoehe. */
export const VERLAUF_Y_ACHSE_PUFFER_ANTEIL = 0.08;

export const FLUESSE_CHART_HOEHE = 200;
export const FLUESSE_X_ACHSE_TICK_ABSTAND = 16;
export const FLUESSE_MARGIN = { top: 8, right: 0, bottom: 0, left: 0 } as const;

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
