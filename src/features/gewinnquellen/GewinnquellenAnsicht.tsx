/*
 * Gewinne & Abzüge, Ansicht: Gewinne je Position und Ertraege fliessen links zusammen
 * und teilen sich rechts in Gesamtgewinn, Positionsverluste, Steuern und Gebuehren.
 *
 * Bei einem Gesamtverlust kehrt sich die Mitte um: Was die Abzuege nicht aus Gewinnen decken,
 * fliesst links als Gesamtverlust zu, und die Mitte ist die Summe der Abzuege. So bleibt jeder
 * Fluss positiv, und links steht immer, was hereinkam, rechts, was abging.
 *
 * Knoten und Baender baut `graph.ts`, die SVG-Formen zeichnet `SankeyFormen.tsx`.
 *
 * Ein Klick auf Knoten oder Band oeffnet die Buchungen dahinter. Nur fuer Zeiger: In
 * role="img" liegt nichts Bedienbares (ChartRahmen); die Tastatur erreicht dieselben Listen
 * nicht ueber das Diagramm.
 */

import { useCallback, useMemo, useRef, useState, type ComponentProps, type PointerEvent } from 'react';
import { ResponsiveContainer, Sankey } from 'recharts';

import { de } from '@/i18n/de';
import type { Gewinnquellen } from '@/lib/api';
import { GEWINN_CHART_HOEHE, GEWINN_KNOTEN_ABSTAND, GEWINN_KNOTEN_BREITE, GEWINN_MARGIN, gewinnBeschriftungZeichen } from '@/lib/chartmasse';
import { anteilProzent, euroAusCent, richtungswert } from '@/lib/format';
import { richtungTon } from '@/lib/farben';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { InfoKnopf } from '@/components/InfoKnopf';
import { useZahlZaehler } from '@/hooks/useZahlZaehler';
import { ChartRahmen } from '@/components/ChartRahmen';
import { RichtungsPfeil } from '@/components/RichtungsPfeil';
import { noetigeStufe, type Stufe } from './beschriftung';
import { beschriftungEingabe, graph } from './graph';
import { BandForm, KnotenForm, type BandProps, type KnotenProps } from './SankeyFormen';
import type { Auswahl } from './GewinnquellenBuchungen';

export type GewinnquellenAnsichtProps = {
  readonly daten: Gewinnquellen;
  /** Aus den Kennzahlen; `null`, solange sie fehlen. */
  readonly realisiertCent: number | null;
  /** Ohne: nichts ist klickbar, etwa solange die Buchungen fehlen. */
  readonly onAuswahl?: ((a: Auswahl) => void) | undefined;
};

type Hover = { readonly art: 'node' | 'link'; readonly index: number } | null;

type SankeyMausEreignis = NonNullable<ComponentProps<typeof Sankey>['onMouseEnter']>;

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
      // eslint-disable-next-line no-restricted-syntax -- Tupfer zeigt die Farbe des Netto-Knotens im Sankey (chart-1 oder verlust), keine Richtung.
      tupfer={daten.nettoCent < 0 ? 'bg-verlust' : 'bg-chart-1'}
      bezeichnung={daten.nettoCent < 0 ? de.gewinnquellen.nettoverlust : de.gewinnquellen.nettogewinn}
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
              <span className="mr-1.5 text-sm text-text-leise">{de.satz.beschriftung(de.gewinnquellen.realisiert)}</span>
              <InfoKnopf bezeichnung={de.kennzahlen.realisiert}>
                <p>{de.kennzahlen.erklaerung.realisiert}</p>
              </InfoKnopf>
              <Button
                type="button"
                variant="link"
                disabled={onAuswahl === undefined}
                onClick={() => onAuswahl?.({ art: 'realisiert' })}
                className={cn('ml-1.5 h-auto min-h-6 gap-0 p-0 tabular-nums', richtungTon[realisiert.richtung])}
              >
                <span className="sr-only">{de.kennzahlen.detailsOeffnen(de.kennzahlen.realisiert)} </span>
                <RichtungsPfeil pfeil={realisiert.pfeil} className="mr-0.5" />
                {realisiert.wert}
              </Button>
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
      <span className="mr-1.5 text-sm text-text-leise">{de.satz.beschriftung(bezeichnung)}</span>
      <span className="text-sm font-medium tabular-nums text-text">
        <RichtungsPfeil pfeil={pfeil} className="mr-0.5" />
        {wert}
      </span>
    </span>
  );
}
