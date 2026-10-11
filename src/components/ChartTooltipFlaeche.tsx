/*
 * Die gemeinsame Flaeche aller Chart-Tooltips (Verlauf, Fluesse). Inhalt und Formatierung
 * bleiben bei der jeweiligen Kachel, weil Recharts den Inhalt selbst nicht formatiert.
 */

import type { ReactNode } from 'react';

export function ChartTooltipFlaeche({ children }: { readonly children: ReactNode }) {
  return <div className="schwebend rounded-md px-3 py-2 text-sm text-text">{children}</div>;
}
