/*
 * Farb-Tokens als CSS-Variable, fuer SVG-Attribute (Recharts, eigene Formen), die kein
 * Tailwind-Utility nehmen. Die einzige Stelle ausserhalb von `styles/theme.css`, an der
 * `var(--color-…)` als Zeichenkette steht — ein vertippter Name faellt sonst erst im
 * Browser als schwarze Linie auf.
 */

import type { Richtung } from '@/lib/format';

export const FARBE = {
  chart1: 'var(--color-chart-1)',
  chart2: 'var(--color-chart-2)',
  chart3: 'var(--color-chart-3)',
  chart4: 'var(--color-chart-4)',
  chart5: 'var(--color-chart-5)',
  grund: 'var(--color-grund)',
  flaeche: 'var(--color-flaeche)',
  rand: 'var(--color-rand)',
  text: 'var(--color-text)',
  textLeise: 'var(--color-text-leise)',
  gewinn: 'var(--color-gewinn)',
  verlust: 'var(--color-verlust)',
} as const;

/** Fuenf Chartfarben, reihum. Mehr als fuenf Segmente wiederholen die Reihe. */
export const CHART_REIHE = [FARBE.chart1, FARBE.chart2, FARBE.chart3, FARBE.chart4, FARBE.chart5] as const;

/**
 * Textfarbe je Richtung — neben `richtungFarbe` und `richtungBgTon` die eine Stelle, die `Richtung` auf ein Tailwind-Utility
 * abbildet. `neutral` ist ausdruecklich NICHT gruen: eine binaere Ternary auf
 * `richtung === 'ab'` faerbt neutrale Werte faelschlich als Gewinn.
 */
export const richtungTon: Record<Richtung, string> = {
  auf: 'text-gewinn',
  ab: 'text-verlust',
  neutral: 'text-text',
};

/** Farb-Variable je Richtung, fuer SVG-Attribute, die kein Tailwind-Utility nehmen. */
export const richtungFarbe: Record<Richtung, string> = {
  auf: FARBE.gewinn,
  ab: FARBE.verlust,
  neutral: FARBE.textLeise,
};

/** Punktfarbe je Richtung — Pendant zu `richtungTon` fuer einen Hintergrund statt Text. */
export const richtungBgTon: Record<Richtung, string> = {
  auf: 'bg-gewinn',
  ab: 'bg-verlust',
  neutral: 'bg-text-leise',
};
