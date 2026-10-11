/*
 * Der einzige Weg, ein Chart einzubinden.
 *
 * Ein Screenreader liest auf einer Chart-Flaeche nichts als Leere. Deshalb erzeugt
 * dieser Rahmen role="img", ein aria-label mit der Kernaussage und eine visuell
 * verborgene Datentabelle als gleichwertige Alternative — nicht als Zugabe, sondern
 * als die Alternative. Kein Chart wird ohne ihn eingebunden. [P-06] Das Chart selbst
 * ist nicht fokussierbar — kein `accessibilityLayer`, nichts Bedienbares in role="img".
 *
 * Zweite und letzte Stelle mit einem style-Attribut: Recharts braucht ein Pixelmass am
 * Container, sonst zeichnet es in eine Flaeche der Hoehe null. Gesetzt wird
 * ausschliesslich --chart-hoehe. [INV-05]
 *
 * Vertrag: <ChartRahmen hoehe={320} label="Depotwert seit 2019" tabelle={…}>…</ChartRahmen>
 */

import { useId, type CSSProperties, type ReactNode } from 'react';

export type ChartTabelle = {
  /** Die <caption> der verborgenen Tabelle. */
  readonly beschriftung: string;
  readonly spalten: readonly string[];
  /** Fertig formatierte Zellen — hier wird nichts mehr gerechnet oder formatiert. */
  readonly zeilen: readonly (readonly string[])[];
  /** Ein Satz zur Fassung der Tabelle, etwa ihre Verdichtung — wird mit der Tabelle vorgelesen. */
  readonly hinweis?: string;
};

export type ChartRahmenProps = {
  /** Hoehe der Zeichenflaeche in Pixeln, wie im Vertrag vorgesehen. */
  readonly hoehe: number;
  /** Die Kernaussage des Charts in einem Satz. */
  readonly label: string;
  readonly tabelle: ChartTabelle;
  readonly children: ReactNode;
};

export function ChartRahmen({ hoehe, label, tabelle, children }: ChartRahmenProps) {
  const hinweisId = useId();
  return (
    <figure className="m-0">
      <div
        className="chart-flaeche"
        role="img"
        aria-label={label}
        // eslint-disable-next-line react/forbid-dom-props -- INV-05, Ausnahme 2: Recharts braucht ein Pixelmass am Container; gesetzt wird hier nur die Variable --chart-hoehe, die Hoehe selbst steht in theme.css.
        style={{ '--chart-hoehe': `${hoehe}px` } as CSSProperties}
      >
        {children}
      </div>

      {/* sr-only auf dem div, nicht auf der table: Tabellen ignorieren beim Layout ihre
          eigene height/overflow-Beschraenkung und wachsen auf die Zeilenzahl, egal wie
          viele Zeilen die verborgene Alternative hat. Auf dem umschliessenden div greift
          die Clip-Technik wie vorgesehen. */}
      <div className="sr-only">
        {tabelle.hinweis === undefined ? null : <p id={hinweisId}>{tabelle.hinweis}</p>}
        <table aria-describedby={tabelle.hinweis === undefined ? undefined : hinweisId}>
          <caption>{tabelle.beschriftung}</caption>
          <thead>
            <tr>
              {tabelle.spalten.map((spalte) => (
                <th key={spalte} scope="col">
                  {spalte}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tabelle.zeilen.map((zeile) => (
              <tr key={zeile[0] ?? ''}>
                {zeile.map((zelle, spalte) =>
                  spalte === 0 ? (
                    <th key={tabelle.spalten[spalte] ?? String(spalte)} scope="row">
                      {zelle}
                    </th>
                  ) : (
                    <td key={tabelle.spalten[spalte] ?? String(spalte)}>{zelle}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
