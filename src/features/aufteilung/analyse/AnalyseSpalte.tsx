/*
 * Was die drei Spalten im Reiter Analyse teilen: Zeilenzahl im zugeklappten Zustand und Überschrift.
 */

/** Zugeklappt je Spalte, dazu eine angeschnittene Zeile unter der Maske. */
export const ANALYSE_ZEILEN = 5;

/** Überschrift einer Spalte im Reiter Analyse, eine Stufe unter dem Kacheltitel. */
export function AnalyseUeberschrift({ id, children }: { readonly id: string; readonly children: string }) {
  return (
    <h3 id={id} className="font-heading text-base font-semibold text-text">
      {children}
    </h3>
  );
}
