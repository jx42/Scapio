/*
 * Kachel 1, gemeinsames Geruest beider Chart-Ansichten: Rahmen, Raster, Achsen und
 * Tooltip. Die Y-Hoverlinie zeichnet der aktive Punkt der Ansicht (`AktivPunktMitLinie`). Die Ansichten reichen nur ab, was sie unterscheidet — Gradienten,
 * Y-Achse und -Format, den Tooltip und ihre Serien als Kinder.
 *
 * Die Reihenfolge der Kinder ist die von Recharts gezeichnete Reihenfolge; sie steht hier
 * wie vor dem Schnitt in beiden Ansichten.
 */

import { useMemo, type ReactElement, type ReactNode } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { Zeitpunkt } from '@/lib/api';
import {
  CHART_ACHSEN_SCHRIFTGROESSE,
  VERLAUF_CHART_HOEHE,
  VERLAUF_MARGIN,
  VERLAUF_X_ACHSE_TICK_ABSTAND,
  yAchsenBreite,
} from '@/lib/chartmasse';
import { achsenDatumFormat, achseNachMonat } from '@/lib/format';
import { FARBE } from '@/lib/farben';
import { ChartRahmen, type ChartTabelle } from '@/components/ChartRahmen';
import { domainBeschriftungen, monatsTicks, type YAchse } from '@/features/verlauf/verlaufAchsen';

export type VerlaufChartGeruestProps = {
  readonly label: string;
  readonly tabelle: ChartTabelle;
  readonly daten: Zeitpunkt[];
  /** `<defs>` mit den Gradienten der Ansicht. */
  readonly defs: ReactNode;
  readonly yFormat: (wert: number) => string;
  readonly yAchse: YAchse;
  /** Feste Linie bei 0 — nur die Rendite-Ansicht. */
  readonly nulllinie?: boolean;
  readonly tooltip: ReactElement;
  /** Die Serien der Ansicht (`<Area>`, `<Line>`, Markierungslinien). */
  readonly children: ReactNode;
};

export function VerlaufChartGeruest({
  label,
  tabelle,
  daten,
  defs,
  yFormat,
  yAchse,
  nulllinie = false,
  tooltip,
  children,
}: VerlaufChartGeruestProps) {
  const ersterTag = daten[0]?.tag;
  const letzterTag = daten.at(-1)?.tag;
  const xFormat = useMemo(() => achsenDatumFormat(ersterTag, letzterTag), [ersterTag, letzterTag]);
  const xTicks = useMemo(() => monatsTicks(daten, achseNachMonat(ersterTag, letzterTag)), [daten, ersterTag, letzterTag]);

  return (
    <ChartRahmen hoehe={VERLAUF_CHART_HOEHE} label={label} tabelle={tabelle}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={daten}
          margin={VERLAUF_MARGIN}
        >
          {defs}
          <CartesianGrid stroke={FARBE.rand} strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="tag"
            ticks={xTicks}
            tickFormatter={xFormat}
            stroke={FARBE.textLeise}
            tick={{ fontSize: CHART_ACHSEN_SCHRIFTGROESSE }}
            tickLine={false}
            minTickGap={VERLAUF_X_ACHSE_TICK_ABSTAND}
          />
          <YAxis
            tickFormatter={yFormat}
            stroke={FARBE.textLeise}
            tick={{ fontSize: CHART_ACHSEN_SCHRIFTGROESSE }}
            tickLine={false}
            width={yAchsenBreite(domainBeschriftungen(yAchse.domain, yFormat))}
            domain={yAchse.domain}
            ticks={yAchse.ticks}
            interval={0}
          />
          {nulllinie ? <ReferenceLine y={0} stroke={FARBE.rand} /> : null}
          <RechartsTooltip content={tooltip} cursor={{ stroke: FARBE.rand }} />
          {children}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartRahmen>
  );
}
