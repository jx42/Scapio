/*
 * Bewegung ausserhalb von CSS: `theme.css` erreicht nur Uebergaenge und Keyframes, nicht die
 * rAF-Schleifen von Zaehler und Recharts. Die fragen hier nach, ob der Nutzer weniger
 * Bewegung will.
 */

export function bevorzugtWenigerBewegung(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Animation der Verlaufsserien: beim Zeitraumwechsel morpht Recharts jede Kurve vom alten
 * zum neuen Verlauf, statt hart zu springen. Lang genug, um der Bewegung zu folgen, kurz
 * genug, um beim schnellen Durchklicken nicht hinterherzuhaengen.
 */
export function serienAnimation() {
  return {
    isAnimationActive: !bevorzugtWenigerBewegung(),
    animationDuration: 450,
    animationEasing: 'ease-in-out',
  } as const;
}
