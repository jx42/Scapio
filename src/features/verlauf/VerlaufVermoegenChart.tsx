/*
 * Kachel 1, Vermoegen-Ansicht: Depotwert als Flaeche, optional Einzahlungs- und
 * Benchmark-Linie und die Markierungslinien der Zufluesse. Geruest und Achsen stehen in
 * `VerlaufChartGeruest`, diese Datei liefert nur, was die Ansicht unterscheidet.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { Area, Line } from 'recharts';

import { de } from '@/i18n/de';
import type { Marke, Zeitpunkt } from '@/lib/api';
import { LINIE_HAUPT, LINIE_NEBEN } from '@/lib/chartmasse';
import { euroKompaktAusCent } from '@/lib/format';
import { serienAnimation } from '@/lib/bewegung';
import { FARBE } from '@/lib/farben';
import { VerlaufChartGeruest } from '@/features/verlauf/VerlaufChartGeruest';
import type { VorschauAnschluss } from '@/features/verlauf/VerlaufVorschau';
import { VerlaufTooltip } from '@/features/verlauf/VerlaufTooltip';
import { AktivPunktMitLinie, drawdownFlaeche, type DrawdownMarke, drawdownMarken, leuchtLinie, markenLinien, yAchseImRaster, zeichenflaecheLinks } from '@/features/verlauf/verlaufAchsen';
import { tabelleVermoegen } from '@/features/verlauf/verlaufTabellen';

export type VerlaufVermoegenChartProps = {
  readonly punkte: Zeitpunkt[];
  readonly marken: readonly Marke[];
  /** Beschriftung des Charts, fertig aus `de.verlauf.chartVermoegen`. */
  readonly label: string;
  readonly benchmarkName: string | null;
  readonly zeigeEinzahlung: boolean;
  readonly zeigeZufluesse: boolean;
  /** Unter der Zeichenflaeche: der Zeitraumregler. */
  readonly fuss?: ReactNode;
  readonly vorschau?: VorschauAnschluss;
  /** Gesetzt nach einem Klick auf die Drawdown-Karte. */
  readonly drawdown: DrawdownMarke | null;
};

export function VerlaufVermoegenChart({
  punkte,
  marken,
  label,
  benchmarkName,
  zeigeEinzahlung,
  zeigeZufluesse,
  fuss,
  vorschau,
  drawdown,
}: VerlaufVermoegenChartProps) {
  const [hoverMarke, setHoverMarke] = useState<string | null>(null);

  // Memoisiert: baut sonst das komplette Screenreader-Tabellen-Array bei jedem Render
  // neu auf, auch bei reinen hoverMarke-Aenderungen.
  const tabelle = useMemo(
    () => tabelleVermoegen(punkte, benchmarkName, zeigeZufluesse ? marken : []),
    [punkte, benchmarkName, zeigeZufluesse, marken],
  );

  // Y-Achsen-Domain: an die Werte des gewaehlten Zeitraums angepasst statt fest bei 0
  // zu beginnen, damit die Kurve die Chart-Hoehe ausfuellt. [siehe yAchseImRaster]
  const yAchse = useMemo(() => {
    const werte = punkte.flatMap((punkt) => {
      const werteAmTag = [punkt.gesamtCent];
      if (zeigeEinzahlung) werteAmTag.push(punkt.einzahlungKumCent);
      if (benchmarkName !== null && punkt.benchmarkCent !== undefined) werteAmTag.push(punkt.benchmarkCent);
      return werteAmTag;
    });
    return yAchseImRaster(werte);
  }, [punkte, benchmarkName, zeigeEinzahlung]);

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
          <linearGradient id="verlauf-flaeche-vermoegen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={FARBE.chart1} stopOpacity={0.5} />
            <stop offset="100%" stopColor={FARBE.chart1} stopOpacity={0} />
          </linearGradient>
        </defs>
      }
      yFormat={euroKompaktAusCent}
      yAchse={yAchse}
      tooltip={
        <VerlaufTooltip
          marken={marken}
          benchmarkName={benchmarkName}
          zeigeEinzahlung={zeigeEinzahlung}
          zeigeZufluesse={zeigeZufluesse}
          modus="vermoegen"
        />
      }
    >
      {drawdownFlaeche(drawdown, punkte)}
      {leuchtLinie('gesamtCent', FARBE.chart1, LINIE_HAUPT, animation)}
      <Area
        type="monotone"
        dataKey="gesamtCent"
        name={de.verlauf.depotwert}
        stroke={FARBE.chart1}
        strokeWidth={LINIE_HAUPT}
        fill="url(#verlauf-flaeche-vermoegen)"
        {...animation}
        dot={false}
        activeDot={
          <AktivPunktMitLinie links={zeichenflaecheLinks(yAchse, euroKompaktAusCent)} fuellung={FARBE.chart1} />
        }
      />
      {zeigeEinzahlung ? leuchtLinie('einzahlungKumCent', FARBE.text, LINIE_NEBEN, animation) : null}
      {zeigeEinzahlung ? (
        <Line
          type="monotone"
          dataKey="einzahlungKumCent"
          name={de.verlauf.einzahlung}
          stroke={FARBE.text}
          strokeOpacity={0.8}
          strokeWidth={LINIE_NEBEN}
          {...animation}
          dot={false}
        />
      ) : null}
      {benchmarkName === null ? null : leuchtLinie('benchmarkCent', FARBE.chart4, LINIE_NEBEN, animation, true)}
      {benchmarkName === null ? null : (
        <Line
          type="monotone"
          dataKey="benchmarkCent"
          name={benchmarkName}
          stroke={FARBE.chart4}
          strokeOpacity={0.8}
          strokeWidth={LINIE_NEBEN}
          {...animation}
          dot={false}
          connectNulls
        />
      )}
      {zeigeZufluesse ? markenLinien(marken, hoverMarke, setHoverMarke) : null}
      {drawdownMarken(drawdown, punkte, 'gesamtCent')}
    </VerlaufChartGeruest>
  );
}
