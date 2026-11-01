/*
 * Gewinne & Abzüge, Ansicht: Gewinne je Position und Ertraege fliessen links zusammen
 * und teilen sich rechts in Nettogewinn, Positionsverluste, Steuern und Gebuehren.
 *
 * Bei einem Nettoverlust kehrt sich die Mitte um: Was die Abzuege nicht aus Gewinnen decken,
 * fliesst links als Nettoverlust zu, und die Mitte ist die Summe der Abzuege. So bleibt jeder
 * Fluss positiv, und links steht immer, was hereinkam, rechts, was abging.
 *
 * Alle Betraege und Anteile kommen fertig aus `core/gewinnquellen.ts`; hier werden nur
 * Knoten und Baender fuer Recharts zusammengesteckt.
 *
 * Ein Klick auf Knoten oder Band oeffnet die Buchungen dahinter. Nur fuer Zeiger: In
 * role="img" liegt nichts Bedienbares (ChartRahmen); die Tastatur erreicht dieselben Listen
 * nicht ueber das Diagramm.
 */

import { useCallback, useMemo, useRef, useState, type ComponentProps, type PointerEvent } from 'react';
import { ResponsiveContainer, Sankey } from 'recharts';

import { de } from '@/i18n/de';
import type { Gewinnquelle, Gewinnquellen } from '@/lib/api';
import {
  GEWINN_BAND_DECKKRAFT,
  GEWINN_BAND_KLICKBREITE,
  GEWINN_BESCHRIFTUNG_ABSTAND,
  GEWINN_BESCHRIFTUNG_HOEHE,
  GEWINN_CHART_HOEHE,
  GEWINN_KNOTEN_ABSTAND,
  GEWINN_KNOTEN_BREITE,
  GEWINN_KNOTEN_DECKKRAFT_GEDIMMT,
  GEWINN_KNOTEN_RUNDUNG,
  GEWINN_MARGIN,
  GEWINN_ZWEIZEILIG_AB,
  gewinnBeschriftungZeichen,
} from '@/lib/chartmasse';
import { anteilProzent, euroAusCent, richtungswert } from '@/lib/format';
import { FARBE, richtungTon } from '@/lib/farben';
import { linkVariants } from '@/lib/linkStil';
import { cn } from '@/lib/utils';
import { InfoKnopf } from '@/components/InfoKnopf';
import { useZahlZaehler } from '@/hooks/useZahlZaehler';
import { ChartRahmen } from '@/components/ChartRahmen';
import { RichtungsPfeil, TextMitPfeil } from '@/components/RichtungsPfeil';
import { beschriftung, noetigeStufe, type BeschriftungEingabe, type Stufe } from './beschriftung';
import type { Auswahl } from './GewinnquellenBuchungen';

export type GewinnquellenAnsichtProps = {
  readonly daten: Gewinnquellen;
  /** Aus den Kennzahlen; `null`, solange sie fehlen. */
  readonly realisiertCent: number | null;
  /** Ohne: nichts ist klickbar, etwa solange die Buchungen fehlen. */
  readonly onAuswahl?: ((a: Auswahl) => void) | undefined;
};

type Spalte = 0 | 1 | 2;

type Knoten = {
  readonly schluessel: string;
  readonly name: string;
  readonly farbe: string;
  readonly spalte: Spalte;
  /** Mit Vorzeichen, wie er beschriftet wird. */
  readonly betragCent: number;
  /** Anteil an der Mitte; `null` an der Mitte selbst. */
  readonly anteil: number | null;
  /** Einziger Knoten seiner Spalte: sein Anteil ist 100 % und wird nicht beschriftet. */
  readonly allein: boolean;
  /** Welche Buchungen ein Klick oeffnet; `null` bei Mitte und Netto. */
  readonly auswahl: Auswahl | null;
};

type Band = {
  readonly source: number;
  readonly target: number;
  readonly value: number;
};

type Hover = { readonly art: 'node' | 'link'; readonly index: number } | null;

type SankeyProps = ComponentProps<typeof Sankey>;
type KnotenProps = Parameters<Extract<SankeyProps['node'], (...args: never[]) => unknown>>[0];
type BandProps = Parameters<Extract<SankeyProps['link'], (...args: never[]) => unknown>>[0];
type SankeyMausEreignis = NonNullable<SankeyProps['onMouseEnter']>;

function quellenName(q: Gewinnquelle): string {
  switch (q.art) {
    case 'position':
      return q.name ?? q.isin ?? '';
    case 'uebrige':
      return de.gewinnquellen.uebrige(q.anzahl);
    case 'ertraege':
      return de.gewinnquellen.ertraege;
    case 'steuern':
      return de.gewinnquellen.steuern;
    case 'gebuehren':
      return de.gewinnquellen.gebuehren;
  }
}

function quellenAuswahl(q: Gewinnquelle, name: string): Auswahl | null {
  switch (q.art) {
    case 'position':
      return q.isin === null ? null : { art: 'position', isin: q.isin, name };
    case 'uebrige':
      return { art: 'uebrige', isins: q.isins, name };
    default:
      return { art: q.art };
  }
}

function quellenKnoten(q: Gewinnquelle, spalte: Spalte, index: number): Knoten {
  const zufluss = q.betragCent > 0;
  const farbe = !zufluss ? FARBE.verlust : q.art === 'position' || q.art === 'uebrige' ? FARBE.gewinn : FARBE.chart5;
  const name = quellenName(q);
  return {
    schluessel: `${spalte}-${q.art}-${q.isin ?? index}`,
    name,
    farbe,
    spalte,
    betragCent: q.betragCent,
    anteil: q.anteil,
    allein: false,
    auswahl: quellenAuswahl(q, name),
  };
}

/**
 * Knoten in Recharts-Reihenfolge: je Spalte von oben nach unten, wie sie die API liefert.
 * Jedes Band laeuft in die Mitte hinein oder aus ihr heraus.
 */
function graph(d: Gewinnquellen): {
  readonly knoten: readonly Knoten[];
  readonly baender: readonly Band[];
} {
  const verlust = d.nettoCent < 0;
  const links = d.zufluesse.map((q, i) => quellenKnoten(q, 0, i));
  const rechts = d.abfluesse.map((q, i) => quellenKnoten(q, 2, i));
  const netto: Knoten | null =
    d.nettoCent === 0
      ? null
      : {
          schluessel: 'netto',
          name: verlust ? de.gewinnquellen.nettoverlust : de.gewinnquellen.nettogewinn,
          farbe: verlust ? FARBE.verlust : FARBE.chart1,
          spalte: verlust ? 0 : 2,
          betragCent: d.nettoCent,
          anteil: d.nettoAnteil,
          allein: false,
          auswahl: null,
        };
  const mitte: Knoten = {
    schluessel: 'mitte',
    name: verlust ? de.gewinnquellen.abzuege : de.gewinnquellen.brutto,
    farbe: FARBE.chart1,
    spalte: 1,
    betragCent: d.mitteCent,
    anteil: null,
    allein: true,
    auswahl: null,
  };

  const reihe = [...links, ...(netto !== null && verlust ? [netto] : []), mitte, ...(netto !== null && !verlust ? [netto] : []), ...rechts];
  const knoten = reihe.map((k) => ({
    ...k,
    allein: reihe.filter((j) => j.spalte === k.spalte).length === 1,
  }));
  const m = reihe.indexOf(mitte);
  const baender = knoten.flatMap((k, i): Band[] => {
    if (k.spalte === 0) return [{ source: i, target: m, value: Math.abs(k.betragCent) }];
    if (k.spalte === 2) return [{ source: m, target: i, value: Math.abs(k.betragCent) }];
    return [];
  });
  return { knoten, baender };
}

function betragText(cent: number): string {
  const r = richtungswert(cent, euroAusCent);
  return r.pfeil === '' ? r.wert : `${r.pfeil}\u00a0${r.wert}`;
}

function beschriftungEingabe(k: Knoten, zeichen: number): BeschriftungEingabe {
  return {
    name: k.name,
    betrag: betragText(k.betragCent),
    anteil: k.anteil === null || k.allein ? null : anteilProzent(k.anteil),
    zeichen,
  };
}

export function GewinnquellenAnsicht({ daten, realisiertCent, onAuswahl }: GewinnquellenAnsichtProps) {
  const [hover, setHover] = useState<Hover>(null);
  const [breite, setBreite] = useState(0);
  // Ein Antippen loest auch mouseenter aus, aber nie mouseleave: das Diagramm bliebe gedimmt.
  const beruehrt = useRef(false);
  const { knoten, baender } = useMemo(() => graph(daten), [daten]);
  // Gleiche Referenz ueber Renders hinweg: Sonst rechnet Recharts das Layout bei jedem Hover neu.
  const sankeyDaten = useMemo(() => ({ nodes: [...knoten], links: [...baender] }), [knoten, baender]);
  const zeichen = gewinnBeschriftungZeichen(breite);
  const stufe = useMemo(
    () => Math.max(0, ...knoten.filter((k) => k.spalte !== 1).map((k) => noetigeStufe(beschriftungEingabe(k, zeichen)))) as Stufe,
    [knoten, zeichen],
  );

  const behandleMausBetreten = useCallback<SankeyMausEreignis>((eintrag, art) => {
    if (!beruehrt.current) setHover({ art, index: eintrag.index });
  }, []);
  const behandleZeiger = useCallback((e: PointerEvent) => {
    beruehrt.current = e.pointerType !== 'mouse';
    if (beruehrt.current) setHover(null);
  }, []);
  const behandleMausVerlassen = useCallback<SankeyMausEreignis>(() => setHover(null), []);
  const behandleGroesse = useCallback((w: number) => setBreite(w), []);
  // Der Dialog legt sich ueber das Diagramm, mouseleave kommt nie an: sonst bliebe es gedimmt.
  const waehle = useMemo(
    () =>
      onAuswahl === undefined
        ? undefined
        : (a: Auswahl) => {
            setHover(null);
            onAuswahl(a);
          },
    [onAuswahl],
  );

  const bandAktiv = (i: number): boolean => {
    if (hover === null) return true;
    if (hover.art === 'link') return hover.index === i;
    const b = baender[i];
    return b !== undefined && (b.source === hover.index || b.target === hover.index);
  };
  const knotenAktiv = (i: number): boolean => {
    if (hover === null) return true;
    if (hover.art === 'node') return hover.index === i || baender.some((b, j) => bandAktiv(j) && (b.source === i || b.target === i));
    const b = baender[hover.index];
    return b !== undefined && (b.source === i || b.target === i);
  };

  const brutto = useZahlZaehler(euroAusCent(daten.bruttoCent));
  const abzuege = richtungswert(daten.abzuegeCent, euroAusCent);
  const abzuegeAnzeige = useZahlZaehler(abzuege.wert);
  const realisiert = richtungswert(realisiertCent ?? 0, euroAusCent);
  const netto = richtungswert(daten.nettoCent, euroAusCent);
  const nettoAnzeige = useZahlZaehler(netto.wert);
  const nettoSumme = (
    <Summe
      tupfer={daten.nettoCent < 0 ? 'bg-verlust' : 'bg-chart-1'}
      bezeichnung={de.gewinnquellen.netto}
      wert={nettoAnzeige}
      pfeil={netto.pfeil}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Jede Summe steht ueber der Seite des Diagramms, auf der ihr Knoten liegt. */}
      <p className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <span className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <Summe tupfer="bg-gewinn" bezeichnung={de.gewinnquellen.brutto} wert={brutto} pfeil="" />
          {realisiertCent === null ? null : (
            <span className="inline-flex items-baseline">
              <span className="mr-1.5 text-sm text-text-leise">{de.gewinnquellen.realisiert}</span>
              <InfoKnopf bezeichnung={de.kennzahlen.realisiert}>
                <p>{de.kennzahlen.erklaerung.realisiert}</p>
              </InfoKnopf>
              <button
                type="button"
                disabled={onAuswahl === undefined}
                onClick={() => onAuswahl?.({ art: 'realisiert' })}
                className={cn(
                  'ml-1.5 min-h-6 cursor-pointer text-sm font-medium tabular-nums',
                  richtungTon[realisiert.richtung],
                  linkVariants({ abstand: 'weit' }),
                )}
              >
                <span className="sr-only">{de.kennzahlen.detailsOeffnen(de.kennzahlen.realisiert)} </span>
                <RichtungsPfeil pfeil={realisiert.pfeil} className="mr-0.5" />
                {realisiert.wert}
              </button>
            </span>
          )}
          {daten.nettoCent < 0 ? nettoSumme : null}
        </span>
        <span className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          {daten.abzuegeCent === 0 ? null : (
            <Summe tupfer="bg-verlust" bezeichnung={de.gewinnquellen.abzuege} wert={abzuegeAnzeige} pfeil={abzuege.pfeil} />
          )}
          {daten.nettoCent < 0 ? null : nettoSumme}
        </span>
      </p>

      <ChartRahmen
        hoehe={GEWINN_CHART_HOEHE}
        label={de.gewinnquellen.chart(euroAusCent(daten.nettoCent, true))}
        tabelle={{
          beschriftung: de.gewinnquellen.tabelle,
          spalten: [de.gewinnquellen.spalteHerkunft, de.gewinnquellen.spalteBetrag, de.gewinnquellen.spalteAnteil],
          zeilen: knoten.map((k) => [k.name, euroAusCent(k.betragCent, k.spalte !== 1), k.anteil === null ? '' : anteilProzent(k.anteil)]),
        }}
      >
        <div className="size-full" onPointerDown={behandleZeiger} onPointerMove={behandleZeiger}>
          <ResponsiveContainer width="100%" height="100%" onResize={behandleGroesse}>
            <Sankey
              accessibilityLayer={false}
              data={sankeyDaten}
              nodeWidth={GEWINN_KNOTEN_BREITE}
              nodePadding={GEWINN_KNOTEN_ABSTAND}
              margin={GEWINN_MARGIN}
              sort={false}
              onMouseEnter={behandleMausBetreten}
              onMouseLeave={behandleMausVerlassen}
              node={(p: KnotenProps) => (
                <KnotenForm
                  {...p}
                  breite={breite}
                  zeichen={zeichen}
                  stufe={stufe}
                  aktiv={knotenAktiv(p.index)}
                  betont={hover !== null && knotenAktiv(p.index)}
                  onAuswahl={waehle}
                />
              )}
              link={(p: BandProps) => <BandForm {...p} aktiv={bandAktiv(p.index)} hervorgehoben={hover !== null} onAuswahl={waehle} />}
            />
          </ResponsiveContainer>
        </div>
      </ChartRahmen>
    </div>
  );
}

function Summe({
  tupfer,
  bezeichnung,
  wert,
  pfeil,
}: {
  readonly tupfer: string;
  readonly bezeichnung: string;
  readonly wert: string;
  readonly pfeil: string;
}) {
  return (
    <span className="inline-flex items-baseline">
      <span aria-hidden="true" className={cn('mr-2 size-2 self-center rounded-full', tupfer)} />
      <span className="mr-1.5 text-sm text-text-leise">{bezeichnung}</span>
      <span className="text-sm font-medium tabular-nums text-text">
        <RichtungsPfeil pfeil={pfeil} className="mr-0.5" />
        {wert}
      </span>
    </span>
  );
}

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
function KnotenForm({ x, y, width, height, payload, breite, zeichen, stufe, aktiv, betont, onAuswahl }: KnotenFormProps) {
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

function BandForm(
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
