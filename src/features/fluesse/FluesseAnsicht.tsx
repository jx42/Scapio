/*
 * Kachel 5, Ansicht: wie viel Geld in welchem Monat netto in Wertpapiere floss.
 *
 * Ein Kauf zaehlt positiv, ein Verkauf negativ — beides ist dieselbe Bewegung von der
 * Cash- auf die Wertpapierseite desselben Depots, nur mit umgekehrtem Vorzeichen. Fuer
 * XIRR und TWR ist das kein echter Kapitalfluss und bleibt dort aussen vor; hier ist es
 * genau die gesuchte Zahl. Siehe ADR-008.
 */

import { useCallback, useState, type ComponentProps } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { de } from '@/i18n/de';
import type { Fenster, Monatsfluss } from '@/lib/api';
import {
  CHART_ACHSEN_SCHRIFTGROESSE,
  DECKKRAFT_GEDIMMT,
  FLUESSE_BALKEN_RUNDUNG,
  FLUESSE_CHART_HOEHE,
  FLUESSE_MARGIN,
  FLUESSE_X_ACHSE_TICK_ABSTAND,
  GITTER_STRICHELUNG,
  LINIE_NEBEN,
  yAchsenBreite,
} from '@/lib/chartmasse';
import { euroAusCent, euroKompaktAusCent, monatKurz, monatLang } from '@/lib/format';
import { FARBE } from '@/lib/farben';
import { useZahlZaehler } from '@/hooks/useZahlZaehler';
import { ChartRahmen } from '@/components/ChartRahmen';
import { ChartTooltipFlaeche } from '@/components/ChartTooltipFlaeche';
import { LeerZustand } from '@/components/Zustaende';

export type FluesseAnsichtProps = {
  readonly monate: readonly Monatsfluss[];
  readonly schnittCent: number;
  readonly fenster: Fenster;
};

// Recharts exportiert den Ereignistyp nicht direkt aus dem Paket — hier ueber die
// Prop von <BarChart> abgeleitet statt dupliziert.
type BarChartMausEreignis = NonNullable<ComponentProps<typeof BarChart>['onMouseMove']>;

export function FluesseAnsicht({ monate, schnittCent, fenster }: FluesseAnsichtProps) {
  const [hervorgehoben, setHervorgehoben] = useState<string | null>(null);
  const daten = monate as Monatsfluss[];

  // Stabile Referenzen: sonst erzwingt jede Mausbewegung ueber dem Chart eine neue
  // Funktion je Render, zusaetzlich zum ohnehin bei jeder Bewegung ausgeloesten Re-Render.
  const behandleMausBewegung = useCallback<BarChartMausEreignis>((zustand) => {
    setHervorgehoben(typeof zustand.activeLabel === 'string' ? zustand.activeLabel : null);
  }, []);
  const behandleMausVerlassen = useCallback<BarChartMausEreignis>(() => setHervorgehoben(null), []);
  const yBeschriftungen = [
    euroKompaktAusCent(Math.min(0, ...daten.map((m) => m.nettoCent))),
    euroKompaktAusCent(Math.max(0, ...daten.map((m) => m.nettoCent))),
  ];
  const angezeigterSchnitt = useZahlZaehler(euroAusCent(schnittCent));

  return (
    <div className="flex flex-col gap-3">
      <p className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="inline-flex items-baseline">
          <span aria-hidden="true" className="mr-2 size-2 self-center rounded-full bg-chart-3" />
          <span className="mr-1.5 text-sm text-text-leise">{de.fluesse.schnitt}</span>
          <span className="text-sm font-medium tabular-nums text-text">
            {angezeigterSchnitt}
          </span>
        </span>
      </p>

      {daten.length === 0 ? (
        <LeerZustand text={de.fluesse.leer} />
      ) : (
        <ChartRahmen
          hoehe={FLUESSE_CHART_HOEHE}
          label={de.fluesse.chart(de.fluesse.fensterLang[fenster])}
          tabelle={{
            beschriftung: de.fluesse.tabelle,
            spalten: [de.fluesse.spalteMonat, de.fluesse.spalteNetto],
            zeilen: daten.map((m) => [monatLang(m.monat), euroAusCent(m.nettoCent)]),
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              accessibilityLayer={false}
              data={daten}
              margin={FLUESSE_MARGIN}
              onMouseMove={behandleMausBewegung}
              onMouseLeave={behandleMausVerlassen}
            >
              <CartesianGrid stroke={FARBE.rand} strokeDasharray={GITTER_STRICHELUNG} vertical={false} />
              <XAxis
                dataKey="monat"
                tickFormatter={monatKurz}
                stroke={FARBE.textLeise}
                tick={{ fontSize: CHART_ACHSEN_SCHRIFTGROESSE }}
                tickLine={false}
                minTickGap={FLUESSE_X_ACHSE_TICK_ABSTAND}
              />
              <YAxis
                tickFormatter={euroKompaktAusCent}
                stroke={FARBE.textLeise}
                tick={{ fontSize: CHART_ACHSEN_SCHRIFTGROESSE }}
                tickLine={false}
                width={yAchsenBreite(yBeschriftungen)}
              />
              <RechartsTooltip content={<FlussTooltip />} cursor={false} />
              <Bar
                dataKey="nettoCent"
                name={de.fluesse.netto}
                fill={FARBE.chart1}
                radius={FLUESSE_BALKEN_RUNDUNG}
                isAnimationActive={false}
              >
                {daten.map((entry) => (
                  <Cell
                    key={entry.monat}
                    fill={FARBE.chart1}
                    fillOpacity={
                      hervorgehoben === null || hervorgehoben === entry.monat ? 1 : DECKKRAFT_GEDIMMT
                    }
                  />
                ))}
              </Bar>
              <ReferenceLine y={schnittCent} stroke={FARBE.chart3} />
              <ReferenceLine y={0} stroke={FARBE.textLeise} strokeWidth={LINIE_NEBEN} />
            </BarChart>
          </ResponsiveContainer>
        </ChartRahmen>
      )}
    </div>
  );
}

type TooltipEintrag = { readonly dataKey?: string | number; readonly value?: number };

/**
 * Eigener Tooltip-Inhalt: der von Recharts formatiert selbst und wuerde Cent als
 * blanke Zahl zeigen. Formatiert wird ausschliesslich in `lib/format.ts`.
 */
function FlussTooltip(props: {
  readonly active?: boolean;
  readonly label?: string | number;
  readonly payload?: readonly TooltipEintrag[];
}) {
  if (props.active !== true || props.payload === undefined) return null;
  const monat = typeof props.label === 'string' ? props.label : '';
  const netto = props.payload.find((e) => e.dataKey === 'nettoCent')?.value;
  return (
    <ChartTooltipFlaeche>
      <p className="mb-1 font-medium">{monat === '' ? '' : monatLang(monat)}</p>
      {netto === undefined ? null : (
        <p>{de.satz.beschriftet(de.fluesse.netto, euroAusCent(netto))}</p>
      )}
    </ChartTooltipFlaeche>
  );
}
