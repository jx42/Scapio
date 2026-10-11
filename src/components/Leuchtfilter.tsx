/*
 * Der SVG-Filter hinter dem Leuchten der Chartlinien, einmal je Seite.
 *
 * CSS `drop-shadow()` braucht eine feste Farbe; ein SVG-Filter nimmt die Linie selbst,
 * weich gezeichnet und abgeschwaecht — so leuchtet jede Linie in ihrer eigenen Farbe,
 * auch der Gewinn-/Verlust-Verlauf der Rendite. Angewandt wird er in theme.css, auf eine
 * Kopie unter der Linie (`leuchtLinie`); er gibt deshalb nur den Schein aus.
 *
 * `userSpaceOnUse`: mit dem Standard `objectBoundingBox` haette eine waagrechte Linie
 * einen Filterbereich der Hoehe null und verschwaende. Der Bereich steht in absoluten
 * Einheiten statt Prozent: Prozente beziehen sich auf einen Viewport, und Edge unter
 * Windows nahm dafuer dieses 0×0-SVG — Bereich null, keine Linie.
 */

export function Leuchtfilter() {
  return (
    <svg aria-hidden="true" focusable="false" className="absolute size-0 overflow-hidden">
      <filter
        id="linie-leuchten"
        filterUnits="userSpaceOnUse"
        x="-100"
        y="-100"
        width="10000"
        height="5000"
        colorInterpolationFilters="sRGB"
      >
        <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="weich" />
        <feComponentTransfer in="weich">
          <feFuncA type="linear" slope="0.25" />
        </feComponentTransfer>
      </filter>
    </svg>
  );
}
