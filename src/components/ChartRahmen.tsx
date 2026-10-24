/*
 * Der einzige Weg, ein Chart einzubinden.
 *
 * Ein Screenreader liest auf einer Chart-Flaeche nichts als Leere. Deshalb erzeugt
 * dieser Rahmen role="img", ein aria-label mit der Kernaussage und eine visuell
 * verborgene Datentabelle als gleichwertige Alternative — nicht als Zugabe, sondern
 * als die Alternative. Kein Chart wird ohne ihn eingebunden. [P-06] Das Chart selbst
 * ist nicht fokussierbar — `accessibilityLayer={false}` an jedem Chart (seit Recharts 3 an),
 * nichts Bedienbares in role="img".
 *
 * Zweite und letzte Stelle mit einem style-Attribut: Recharts braucht ein Pixelmass am
 * Container, sonst zeichnet es in eine Flaeche der Hoehe null. Gesetzt werden
 * ausschliesslich --chart-hoehe und --chart-links, der Einzug des Fusses bis zur
 * Zeichenflaeche — die Breite der Y-Achse steht erst mit ihren Beschriftungen fest. [INV-05]
 *
 * Der Fuss (etwa ein Regler) steht ausserhalb von role="img", denn dort darf nichts
 * Bedienbares liegen.
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
  /** Unter der Zeichenflaeche, links buendig mit ihr. */
  readonly fuss?: ReactNode;
  /** Abstand der Zeichenflaeche vom linken Rand in Pixeln (Rand plus Y-Achse). */
  readonly fussEinzug?: number;
};

export function ChartRahmen({ hoehe, label, tabelle, children, fuss, fussEinzug = 0 }: ChartRahmenProps) {
  const hinweisId = useId();
  return (
    <figure
      className="m-0"
      // eslint-disable-next-line react/forbid-dom-props -- INV-05, Ausnahme 2: Recharts braucht ein Pixelmass am Container, der Fuss den gemessenen Einzug; gesetzt werden nur die Variablen, Hoehe und Einzug selbst stehen in theme.css.
      style={{ '--chart-hoehe': `${hoehe}px`, '--chart-links': `${fussEinzug}px` } as CSSProperties}
    >
      <div className="chart-flaeche" role="img" aria-label={label}>
        {children}
      </div>
      {fuss === undefined ? null : <div className="chart-fuss">{fuss}</div>}

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
