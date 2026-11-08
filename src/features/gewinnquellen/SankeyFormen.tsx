/*
 * SVG-Formen des Sankey: Knoten mit Beschriftung und Band. Ein Klick oeffnet die Buchungen
 * dahinter, nur fuer Zeiger (ADR-059).
 */

import type { ComponentProps } from 'react';
import type { Sankey } from 'recharts';

import {
  GEWINN_BAND_DECKKRAFT,
  GEWINN_BAND_KLICKBREITE,
  GEWINN_BESCHRIFTUNG_ABSTAND,
  GEWINN_BESCHRIFTUNG_HOEHE,
  GEWINN_KNOTEN_ABSTAND,
  GEWINN_KNOTEN_BREITE,
  GEWINN_KNOTEN_DECKKRAFT_GEDIMMT,
  GEWINN_KNOTEN_RUNDUNG,
  GEWINN_ZWEIZEILIG_AB,
} from '@/lib/chartmasse';
import { linkVariants } from '@/lib/linkStil';
import { cn } from '@/lib/utils';
import { TextMitPfeil } from '@/components/RichtungsPfeil';
import { beschriftung, type Stufe } from './beschriftung';
import { beschriftungEingabe, type Knoten } from './graph';
import type { Auswahl } from './GewinnquellenBuchungen';

type SankeyProps = ComponentProps<typeof Sankey>;
export type KnotenProps = Parameters<Extract<SankeyProps['node'], (...args: never[]) => unknown>>[0];
export type BandProps = Parameters<Extract<SankeyProps['link'], (...args: never[]) => unknown>>[0];

type KnotenFormProps = KnotenProps & {
  readonly breite: number;
  readonly zeichen: number;
  readonly stufe: Stufe;
  readonly aktiv: boolean;
  /** Knoten oder sein Band liegt unter dem Zeiger: der Name unterstreicht sich. */
  readonly betont: boolean;
  readonly onAuswahl: ((a: Auswahl) => void) | undefined;
};

/**
 * Beschriftung als HTML im `foreignObject`, damit der Richtungspfeil dasselbe Icon ist wie im
 * Rest der Seite. Sie steht zwischen Knoten und Mitte, senkrecht mittig am Knoten. Die Mitte
 * bleibt unbeschriftet: ihre Summe steht ueber dem Diagramm.
 */
export function KnotenForm({ x, y, width, height, payload, breite, zeichen, stufe, aktiv, betont, onAuswahl }: KnotenFormProps) {
  const k = payload as unknown as Knoten;
  const auswahl = onAuswahl === undefined ? null : k.auswahl;
  const knoten = <rect x={x} y={y} width={width} height={height} rx={GEWINN_KNOTEN_RUNDUNG} fill={k.farbe} />;
  if (k.spalte === 1) return knoten;

  const einzeilig = height < GEWINN_ZWEIZEILIG_AB;
  const { name, wert } = beschriftung(beschriftungEingabe(k, zeichen), einzeilig, stufe);
  const mitteRand = breite / 2;
  const links =
    k.spalte === 0 ? x + width + GEWINN_BESCHRIFTUNG_ABSTAND : mitteRand + GEWINN_KNOTEN_BREITE / 2 + GEWINN_BESCHRIFTUNG_ABSTAND;
  const rechts = k.spalte === 0 ? mitteRand - GEWINN_KNOTEN_BREITE / 2 - GEWINN_BESCHRIFTUNG_ABSTAND : x - GEWINN_BESCHRIFTUNG_ABSTAND;
  const oben = y + height / 2 - GEWINN_BESCHRIFTUNG_HOEHE / 2;

  return (
    <g
      opacity={aktiv ? 1 : GEWINN_KNOTEN_DECKKRAFT_GEDIMMT}
      className={cn('transition-opacity duration-300 ease-out', auswahl !== null && 'cursor-pointer')}
      // eslint-disable-next-line no-restricted-syntax -- Sankey-Klick nur fuer Zeiger, in role="img" liegt nichts Bedienbares (ADR-059).
      onClick={auswahl === null ? undefined : () => onAuswahl?.(auswahl)}
    >
      {knoten}
      {auswahl === null ? null : (
        // Klickflaeche ueber Knoten und Beschriftung, nach oben und unten bis in die Mitte des
        // Abstands: Auch ein Knoten von einem Pixel ist so gut zu treffen.
        <rect
          x={k.spalte === 0 ? x : links}
          y={y - GEWINN_KNOTEN_ABSTAND / 2}
          width={Math.max(0, k.spalte === 0 ? rechts - x : x + width - links)}
          height={height + GEWINN_KNOTEN_ABSTAND}
          fill="none"
          pointerEvents="all"
        />
      )}
      <foreignObject
        x={links}
        y={oben}
        width={Math.max(0, rechts - links)}
        height={GEWINN_BESCHRIFTUNG_HOEHE}
        className="pointer-events-none overflow-visible"
      >
        <div
          className={cn(
            'flex h-full text-sm leading-snug whitespace-nowrap text-text',
            einzeilig ? 'items-center gap-x-2' : 'flex-col justify-center',
            k.spalte === 2 && (einzeilig ? 'justify-end' : 'items-end'),
          )}
        >
          <span className={cn(auswahl !== null && betont && cn(linkVariants({ abstand: 'weit' }), 'decoration-current'))}>
            {name}
          </span>
          {wert === null ? null : (
            <span className="tabular-nums">
              <TextMitPfeil text={wert} />
            </span>
          )}
        </div>
      </foreignObject>
    </g>
  );
}

export function BandForm(
  props: BandProps & {
    readonly aktiv: boolean;
    readonly hervorgehoben: boolean;
    readonly onAuswahl: ((a: Auswahl) => void) | undefined;
  },
) {
  const { sourceX, sourceY, targetX, targetY, sourceControlX, targetControlX, linkWidth, payload, aktiv, hervorgehoben, onAuswahl } =
    props;
  const quelle = payload.source as unknown as Knoten;
  const ziel = payload.target as unknown as Knoten;
  // Hinein in die Mitte in der Farbe der Herkunft, hinaus in der des Ziels.
  const aussen = quelle.spalte === 0 ? quelle : ziel;
  const farbe = aussen.farbe;
  const auswahl = onAuswahl === undefined ? null : aussen.auswahl;
  const deckkraft = !hervorgehoben ? GEWINN_BAND_DECKKRAFT.normal : aktiv ? GEWINN_BAND_DECKKRAFT.aktiv : GEWINN_BAND_DECKKRAFT.gedimmt;
  const d = `M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`;
  return (
    // eslint-disable-next-line no-restricted-syntax -- Sankey-Klick nur fuer Zeiger, in role="img" liegt nichts Bedienbares (ADR-059).
    <g className={cn(auswahl !== null && 'cursor-pointer')} onClick={auswahl === null ? undefined : () => onAuswahl?.(auswahl)}>
      <path
        d={d}
        fill="none"
        stroke={farbe}
        strokeWidth={Math.max(linkWidth, 1)}
        strokeOpacity={deckkraft}
        className="transition-[stroke-opacity] duration-300 ease-out"
      />
      {/* Unsichtbar breiter: Duenne Baender sind sonst kaum zu treffen. */}
      {auswahl === null ? null : (
        <path d={d} fill="none" stroke={farbe} strokeWidth={Math.max(linkWidth, GEWINN_BAND_KLICKBREITE)} strokeOpacity={0} />
      )}
    </g>
  );
}
