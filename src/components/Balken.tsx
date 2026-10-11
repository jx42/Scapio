/*
 * Ein Balken ist ein Datenwert, kein Entwurf.
 *
 * Deshalb ist dies die erste von genau zwei Stellen im Projekt, an denen ein
 * style-Attribut steht: Tailwind kann keine zur Laufzeit berechnete Klasse erzeugen,
 * und eine Breite aus Daten ist genau das. Gesetzt wird ausschliesslich die Custom
 * Property --anteil; die Breite selbst steht als Regel in styles/theme.css. [INV-05]
 *
 * Vertrag: <Balken anteil={0.42} beschriftung="42 % von Apple" />
 */

import type { CSSProperties } from 'react';

export type BalkenProps = {
  /** Verhaeltniszahl 0..1. Werte ausserhalb werden begrenzt, nicht gerechnet. */
  readonly anteil: number;
  /** Was ein Screenreader statt des Balkens hoert. Pflicht. */
  readonly beschriftung: string;
};

export function Balken({ anteil, beschriftung }: BalkenProps) {
  const begrenzt = Number.isFinite(anteil) ? Math.min(1, Math.max(0, anteil)) : 0;

  return (
    <span className="balken-spur" role="img" aria-label={beschriftung}>
      {/* eslint-disable-next-line react/forbid-dom-props -- INV-05, Ausnahme 1: die Balkenbreite ist ein Datenwert; gesetzt wird nur --anteil, die Breite steht in theme.css. */}
      <span className="balken-fuellung" style={{ '--anteil': begrenzt } as CSSProperties} />
    </span>
  );
}
