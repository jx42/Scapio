/*
 * Bausteine der Ringdiagramme in Aufteilung und Analyse: Farbe je Segment, Farbpunkt der
 * Legende, Beschriftung in der Mitte.
 */

import type { LucideIcon } from 'lucide-react';

import {
  FARBTUPFER_GROESSE,
  RING_FLAGGE_BREITE,
  RING_FLAGGE_HOEHE,
  RING_BESCHRIFTUNG_GROESSE,
  RING_BESCHRIFTUNG_VERSATZ,
  RING_SYMBOL_GROESSE,
  RING_SYMBOL_VERSATZ,
  RING_WERT_GROESSE,
  RING_WERT_VERSATZ,
} from '@/lib/chartmasse';
import { CHART_REIHE, FARBE } from '@/lib/farben';
import type { Flagge } from '@/lib/flaggen';
import { useZahlZaehler } from '@/hooks/useZahlZaehler';

/** Lucide-Symbol oder, bei einem Land, dessen Flagge. */
export type RingSymbol = LucideIcon | { readonly flagge: Flagge };

export function ringFarbe(index: number): string {
  return CHART_REIHE[index % CHART_REIHE.length] ?? FARBE.chart1;
}

/**
 * Der Farbpunkt vor dem Namen. Ein SVG-Kreis, weil `fill` ein Zeichenattribut ist
 * und kein Inline-CSS — die Farbe selbst bleibt ein Token. [INV-05]
 */
export function Farbtupfer({ farbe: wert }: { readonly farbe: string }) {
  return (
    <svg
      width={FARBTUPFER_GROESSE}
      height={FARBTUPFER_GROESSE}
      viewBox={`0 0 ${String(FARBTUPFER_GROESSE)} ${String(FARBTUPFER_GROESSE)}`}
      aria-hidden="true"
      className="shrink-0"
    >
      <circle cx={FARBTUPFER_GROESSE / 2} cy={FARBTUPFER_GROESSE / 2} r={FARBTUPFER_GROESSE / 2} fill={wert} />
    </svg>
  );
}

/**
 * Die Mitte des Rings. Recharts uebergibt dem Label-Inhalt die Geometrie; Symbol und
 * SVG-Textknoten sind Zeichnung, kein Dokumenttext — der Wert steht zusaetzlich in der
 * verborgenen Tabelle des Rahmens. `ohneZaehler`, wo die Mitte beim Hover wechselt: dort zeigt
 * das Hochzaehlen keine Aenderung durch einen Lauf an, sondern flimmert nur.
 */
export function RingMitte(props: {
  readonly symbol: RingSymbol;
  readonly beschriftung: string;
  readonly wert: string;
  readonly ohneZaehler?: boolean;
  readonly viewBox?: { readonly cx?: number; readonly cy?: number };
}) {
  const gezaehlt = useZahlZaehler(props.wert);
  const angezeigterWert = props.ohneZaehler === true ? props.wert : gezaehlt;
  const cx = props.viewBox?.cx;
  const cy = props.viewBox?.cy;
  if (cx === undefined || cy === undefined) return null;
  return (
    <g aria-hidden="true">
      <MittenSymbol symbol={props.symbol} cx={cx} cy={cy} />
      <text x={cx} y={cy + RING_WERT_VERSATZ} textAnchor="middle" fill={FARBE.text} fontSize={RING_WERT_GROESSE}>
        {angezeigterWert}
      </text>
      <text
        x={cx}
        y={cy + RING_BESCHRIFTUNG_VERSATZ}
        textAnchor="middle"
        fill={FARBE.textLeise}
        fontSize={RING_BESCHRIFTUNG_GROESSE}
      >
        {props.beschriftung}
      </text>
    </g>
  );
}

function MittenSymbol({ symbol, cx, cy }: { readonly symbol: RingSymbol; readonly cx: number; readonly cy: number }) {
  if ('flagge' in symbol) {
    const Flagge = symbol.flagge;
    const lage = {
      x: cx - RING_FLAGGE_BREITE / 2,
      y: cy + RING_SYMBOL_VERSATZ + RING_SYMBOL_GROESSE - RING_FLAGGE_HOEHE,
      width: RING_FLAGGE_BREITE,
      height: RING_FLAGGE_HOEHE,
    };
    return (
      <>
        <Flagge {...lage} />
        {/* Weiße Felder (Japan, Polen) verschwämmen sonst mit dem hellen Text daneben. */}
        <rect {...lage} fill="none" stroke={FARBE.rand} />
      </>
    );
  }
  const Symbol = symbol;
  return (
    <Symbol
      x={cx - RING_SYMBOL_GROESSE / 2}
      y={cy + RING_SYMBOL_VERSATZ}
      size={RING_SYMBOL_GROESSE}
      color={FARBE.textLeise}
    />
  );
}
