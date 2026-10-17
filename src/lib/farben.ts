/*
 * Farb-Tokens als CSS-Variable, fuer SVG-Attribute (Recharts, eigene Formen), die kein
 * Tailwind-Utility nehmen. Die einzige Stelle ausserhalb von `styles/theme.css`, an der
 * `var(--color-…)` als Zeichenkette steht — ein vertippter Name faellt sonst erst im
 * Browser als schwarze Linie auf.
 */

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
