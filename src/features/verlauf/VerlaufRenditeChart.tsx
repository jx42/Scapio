/*
 * Kachel 1, Rendite-Ansicht: Gesamtgewinn in Prozent als Flaeche mit Gruen/Rot-Verlauf um
 * die Nulllinie, optional die Benchmark-Linie. Geruest und Achsen stehen in
 * `VerlaufChartGeruest`, diese Datei liefert nur, was die Ansicht unterscheidet.
 */

import { useMemo, type ReactNode } from 'react';
import { Area, Line } from 'recharts';

import { de } from '@/i18n/de';
import type { Zeitpunkt } from '@/lib/api';
import { LINIE_HAUPT, LINIE_NEBEN } from '@/lib/chartmasse';
import { prozent, vorzeichen } from '@/lib/format';
import { serienAnimation } from '@/lib/bewegung';
import { FARBE, richtungFarbe } from '@/lib/farben';
import { VerlaufChartGeruest } from '@/features/verlauf/VerlaufChartGeruest';
import type { VorschauAnschluss } from '@/features/verlauf/VerlaufVorschau';
import { VerlaufTooltip } from '@/features/verlauf/VerlaufTooltip';
import { AktivPunktMitLinie, drawdownFlaeche, type DrawdownMarke, drawdownMarken, leuchtLinie, yAchseImRaster, zeichenflaecheLinks } from '@/features/verlauf/verlaufAchsen';
import { tabelleRendite } from '@/features/verlauf/verlaufTabellen';

/** Punkt beim Hover ueber die Rendite-Flaeche: feste Farbe je nach Vorzeichen des Werts an
 *  dieser Stelle statt des Linien-Farbverlaufs — der faerbte den Kreis sonst zweifarbig,
 *  halb Gewinn- halb Verlustfarbe, statt eindeutig rot oder gruen. */
function RenditeAktivPunkt({
  cx,
  cy,
  payload,
  links,
}: {
  readonly cx?: number;
  readonly cy?: number;
  readonly payload?: Zeitpunkt;
  readonly links: number;
}) {
  if (payload === undefined) return null;
  const farbe = richtungFarbe[vorzeichen(payload.gewinnProzent).richtung];
  return <AktivPunktMitLinie cx={cx} cy={cy} links={links} fuellung={farbe} />;
}

const achsenFormat = (wert: number): string => prozent(wert, true);

export type VerlaufRenditeChartProps = {
  readonly punkte: Zeitpunkt[];
  /** Beschriftung des Charts, fertig aus `de.verlauf.chartRendite`. */
  readonly label: string;
  readonly benchmarkName: string | null;
  /** Unter der Zeichenflaeche: der Zeitraumregler. */
  readonly fuss?: ReactNode;
  readonly vorschau?: VorschauAnschluss;
  /** Gesetzt nach einem Klick auf die Drawdown-Karte. */
  readonly drawdown: DrawdownMarke | null;
};

export function VerlaufRenditeChart({ punkte, label, benchmarkName, fuss, vorschau, drawdown }: VerlaufRenditeChartProps) {
  const tabelle = useMemo(() => tabelleRendite(punkte, benchmarkName), [punkte, benchmarkName]);

  // Y-Achse: siehe yAchseImRaster. Die 0 gehoert immer dazu, damit die Nulllinie
  // beschriftet ist, auch wenn der Zeitraum ganz im Plus oder Minus liegt.
  const yAchse = useMemo(() => {
    const werte = [0, ...punkte.flatMap((punkt) =>
      benchmarkName === null || punkt.benchmarkProzent === undefined
        ? [punkt.gewinnProzent]
        : [punkt.gewinnProzent, punkt.benchmarkProzent],
    )];
    return yAchseImRaster(werte);
  }, [punkte, benchmarkName]);

  // Schwelle fuer den Gruen/Rot-Uebergang der Rendite-Flaeche: wo faellt der Wert 0
  // innerhalb der tatsaechlich gezeichneten Flaeche? Die Area hat baseValue 0, ihre
  // SVG-Bounding-Box reicht also nur von max(gewinnProzent, 0) bis min(gewinnProzent, 0) —
  // nicht von der gepolsterten Achsen-Domain (domain), an der sich ein Gradient
  // mit dieser bezieht faelschlich orientieren wuerde. Reine Darstellungsfrage fuers
  // Farbverlauf-Gradient, keine Kennzahl.
  const schwelleProzent = useMemo(() => {
    const werte = punkte.map((punkt) => punkt.gewinnProzent);
    if (werte.length === 0) return 50;
    const boxOben = Math.max(...werte, 0);
    const boxUnten = Math.min(...werte, 0);
    const spanne = boxOben - boxUnten;
    return spanne === 0 ? 50 : (boxOben / spanne) * 100;
  }, [punkte]);

  // Breite der weichen Blende um die Nulllinie herum, fuer Linie und Flaeche der
  // Rendite-Ansicht: ein SVG-Farbverlauf interpoliert zwischen zwei Stopps immer
  // linear, ein harter Farbsprung braucht also zwei Stopps auf demselben Offset.
  // Ein kleiner Abstand zwischen ihnen macht daraus einen weichen Uebergang statt
  // eines Sprungs. Reine Darstellungsfrage, keine Kennzahl.
  const UEBERGANG_PROZENT = 8;

  const animation = serienAnimation();

  return (
    <VerlaufChartGeruest
      label={label}
      fuss={fuss}
      vorschau={vorschau}
      tabelle={tabelle}
      daten={punkte}
      defs={
        <defs>
          <linearGradient id="verlauf-linie-rendite" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={FARBE.gewinn} />
            <stop
              offset={`${Math.max(0, schwelleProzent - UEBERGANG_PROZENT)}%`}
              stopColor={FARBE.gewinn}
            />
            <stop
              offset={`${Math.min(100, schwelleProzent + UEBERGANG_PROZENT)}%`}
              stopColor={FARBE.verlust}
            />
            <stop offset="100%" stopColor={FARBE.verlust} />
          </linearGradient>
          <linearGradient id="verlauf-flaeche-rendite" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={FARBE.gewinn} stopOpacity={0.45} />
            <stop
              offset={`${Math.max(0, schwelleProzent - UEBERGANG_PROZENT)}%`}
              stopColor={FARBE.gewinn}
              stopOpacity={0.1}
            />
            <stop
              offset={`${Math.min(100, schwelleProzent + UEBERGANG_PROZENT)}%`}
              stopColor={FARBE.verlust}
              stopOpacity={0.1}
            />
            <stop offset="100%" stopColor={FARBE.verlust} stopOpacity={0.35} />
          </linearGradient>
        </defs>
      }
      yFormat={achsenFormat}
      yAchse={yAchse}
      nulllinie
      tooltip={<VerlaufTooltip benchmarkName={benchmarkName} modus="rendite" />}
    >
      {drawdownFlaeche(drawdown, punkte)}
      {leuchtLinie('gewinnProzent', 'url(#verlauf-linie-rendite)', LINIE_HAUPT, animation)}
      <Area
        type="monotone"
        dataKey="gewinnProzent"
        name={de.verlauf.gesamtgewinnDepot}
        stroke="url(#verlauf-linie-rendite)"
        strokeWidth={LINIE_HAUPT}
        fill="url(#verlauf-flaeche-rendite)"
        {...animation}
        dot={false}
        activeDot={<RenditeAktivPunkt links={zeichenflaecheLinks(yAchse, achsenFormat)} />}
      />
      {benchmarkName === null ? null : leuchtLinie('benchmarkProzent', FARBE.chart4, LINIE_NEBEN, animation, true)}
      {benchmarkName === null ? null : (
        <Line
          type="monotone"
          dataKey="benchmarkProzent"
          name={benchmarkName}
          stroke={FARBE.chart4}
          strokeOpacity={0.8}
          strokeWidth={LINIE_NEBEN}
          {...animation}
          dot={false}
          connectNulls
        />
      )}
      {drawdownMarken(drawdown, punkte, 'gewinnProzent')}
    </VerlaufChartGeruest>
  );
}
