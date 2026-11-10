/*
 * Liniendiagramm im Positionsverlauf. Eigener Chart statt `VerlaufChartGeruest`: dessen
 * Kategorie-Achse gibt jeder Zeile gleich viel Breite, und bei 3J nähme das taggenaue letzte Jahr
 * fast die ganze Fläche ein. Hier ist die Achse zeitgetreu (ADR-063).
 */

import {
  CartesianGrid,
  ComposedChart,
  DefaultZIndexes,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  ZIndexLayer,
  useXAxisScale,
  useYAxisScale,
} from 'recharts';

import { de } from '@/i18n/de';
import type { PositionsverlaufKauf, PositionsverlaufPunkt } from '@/lib/api';
import { serienAnimation } from '@/lib/bewegung';
import {
  AKTIV_PUNKT_RADIUS,
  AKTIV_PUNKT_RAND,
  CHART_ACHSEN_SCHRIFTGROESSE,
  GITTER_STRICHELUNG,
  KAUF_PUNKT_RADIUS,
  KAUF_PUNKT_RAND,
  LINIE_HAUPT,
  LINIE_WIEDERHOLT_STRICHELUNG,
  POSITIONSVERLAUF_CHART_HOEHE,
  VERLAUF_MARGIN,
  VERLAUF_X_ACHSE_TICK_ABSTAND,
  yAchsenBreite,
} from '@/lib/chartmasse';
import { FARBE, richtungTon } from '@/lib/farben';
import {
  anteilProzent,
  betragOhneVorzeichen,
  datumAlsTagMonat,
  datumKurz,
  prozent,
  tagAchsenwert,
  vorzeichen,
  zeitachse,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import { ChartRahmen, type ChartTabelle } from '@/components/ChartRahmen';
import { ChartTooltipFlaeche } from '@/components/ChartTooltipFlaeche';
import { Farbtupfer } from '@/components/Ring';
import { RichtungsPfeil } from '@/components/RichtungsPfeil';
import {
  AktivPunktMitLinie,
  domainBeschriftungen,
  leuchtLinie,
  yAchseImRaster,
  zeichenflaecheLinks,
} from '@/features/verlauf/verlaufAchsen';
import { tabellenPunkte } from '@/features/verlauf/verlaufTabellen';
import { TooltipTrennlinie } from '@/features/verlauf/VerlaufTooltip';

export type SichtbareLinie = {
  readonly isin: string;
  readonly name: string;
  readonly farbe: string;
  readonly gestrichelt: boolean;
  readonly kaeufe: readonly PositionsverlaufKauf[];
};

type Zeile = PositionsverlaufPunkt & { readonly x: number };

/** Eine flache Linie gäbe sonst eine Achse ohne Spanne. */
const KLEINSTE_SPANNE = 0.002;
const FLACHE_ACHSE = 0.01;

/** Mehr Zeilen je Spalte passen nicht in die Höhe des Charts. */
const TOOLTIP_ZEILEN = 12;

const achsenFormat = (wert: number): string => prozent(wert, true);

function wertVon(punkt: PositionsverlaufPunkt, isin: string): number | null {
  return punkt.werte[isin] ?? null;
}

/** Alle Käufe seit der vorigen Zeile, damit in der verdichteten Tabelle keiner verloren geht. */
function kaeufeJeZeile(punkte: readonly PositionsverlaufPunkt[], linien: readonly SichtbareLinie[]): string[] {
  return punkte.map((punkt, index) => {
    const vorher = index === 0 ? '' : (punkte[index - 1]?.tag ?? '');
    return linien
      .flatMap((linie) =>
        linie.kaeufe
          .filter((kauf) => kauf.punktTag > vorher && kauf.punktTag <= punkt.tag)
          .map((kauf) => de.satz.beschriftet(linie.name, datumKurz(kauf.tag))),
      )
      .join('; ');
  });
}

export function tabellePositionsverlauf(
  alle: readonly PositionsverlaufPunkt[],
  linien: readonly SichtbareLinie[],
): ChartTabelle {
  const { punkte, aufloesung } = tabellenPunkte(alle);
  const kaeufe = kaeufeJeZeile(punkte, linien);
  return {
    hinweis: de.verlauf.tabelleAufloesung[aufloesung],
    beschriftung: de.positionsverlauf.tabelle,
    spalten: [de.verlauf.spalteTag, ...linien.map((l) => l.name), de.positionsverlauf.spalteKaeufe],
    zeilen: punkte.map((punkt, index) => [
      datumKurz(punkt.tag),
      ...linien.map((l) => {
        const wert = wertVon(punkt, l.isin);
        return wert === null ? '' : anteilProzent(wert, true);
      }),
      kaeufe[index] ?? '',
    ]),
  };
}

function kaufText(tage: readonly string[]): string | null {
  const letzter = tage.at(-1);
  if (letzter === undefined) return null;
  if (tage.length === 1) return de.positionsverlauf.kauf(datumKurz(letzter));
  return de.positionsverlauf.kaeufe(tage.length, tage.slice(0, -1).map(datumAlsTagMonat).join(', '), datumKurz(letzter));
}

type SpitzeProps = {
  readonly linien: readonly SichtbareLinie[];
  readonly active?: boolean;
  readonly payload?: readonly { readonly payload?: Zeile }[];
};

function Spitze({ linien, active, payload }: SpitzeProps) {
  const zeile = payload?.[0]?.payload;
  if (active !== true || zeile === undefined) return null;
  const eintraege = linien
    .flatMap((linie) => {
      const wert = wertVon(zeile, linie.isin);
      return wert === null ? [] : [{ linie, wert }];
    })
    .sort((a, b) => b.wert - a.wert);
  const weitere = eintraege.length - TOOLTIP_ZEILEN;
  return (
    <ChartTooltipFlaeche>
      <p className="text-text-leise">{datumKurz(zeile.tag)}</p>
      <TooltipTrennlinie />
      <div className={cn('max-w-[calc(100vw-12rem)] space-y-1 sm:max-w-88', weitere > 0 && 'lg:max-w-176 lg:columns-2 lg:gap-x-6')}>
        {eintraege.map(({ linie, wert }, index) => {
          const kauf = kaufText(linie.kaeufe.filter((k) => k.punktTag === zeile.tag).map((k) => k.tag));
          const { richtung, pfeil } = vorzeichen(wert);
          return (
            <div key={linie.isin} className={cn('break-inside-avoid', index >= TOOLTIP_ZEILEN && 'max-lg:hidden')}>
              <div className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 items-start gap-1.5 text-text">
                  {/* mt-1.5: mittig zur ersten Zeile, auch wenn der Name umbricht. */}
                  <Farbtupfer farbe={linie.farbe} className="mt-1.5 size-2 shrink-0" />
                  <span className="min-w-0 break-words">{de.satz.beschriftung(linie.name)}</span>
                </span>
                <span className={cn('flex shrink-0 items-center gap-1', richtungTon[richtung])}>
                  <RichtungsPfeil pfeil={pfeil} />
                  {betragOhneVorzeichen(wert, prozent)}
                </span>
              </div>
              {kauf === null ? null : <p className="text-text-leise">{kauf}</p>}
            </div>
          );
        })}
      </div>
      {weitere > 0 ? <p className="mt-1 text-text-leise lg:hidden">{de.positionsverlauf.weitere(weitere)}</p> : null}
    </ChartTooltipFlaeche>
  );
}

/**
 * Eigene Ebene statt `dot` an der Linie: Recharts baute sonst in jedem Animationsframe ein Element
 * je Linie und Tag, bei 25 Linien blockierte das Einblenden die Seite für Sekunden.
 */
function KaufPunkte({ zeilen, linien }: { readonly zeilen: readonly Zeile[]; readonly linien: readonly SichtbareLinie[] }) {
  const x = useXAxisScale();
  const y = useYAxisScale();
  if (x === undefined || y === undefined) return null;
  const zeileJeTag = new Map(zeilen.map((z) => [z.tag, z]));
  return (
    <ZIndexLayer zIndex={DefaultZIndexes.line + 1}>
      {linien.flatMap((linie) =>
        [...new Set(linie.kaeufe.map((k) => k.punktTag))].flatMap((tag) => {
          const zeile = zeileJeTag.get(tag);
          const wert = zeile === undefined ? null : wertVon(zeile, linie.isin);
          const cx = zeile === undefined ? undefined : x(zeile.x);
          const cy = wert === null ? undefined : y(wert);
          if (cx === undefined || cy === undefined) return [];
          return [
            <circle
              key={`${linie.isin}-${tag}`}
              cx={cx}
              cy={cy}
              r={KAUF_PUNKT_RADIUS}
              fill={linie.farbe}
              stroke={FARBE.grund}
              strokeWidth={KAUF_PUNKT_RAND}
            />,
          ];
        }),
      )}
    </ZIndexLayer>
  );
}

export type PositionsverlaufChartProps = {
  readonly punkte: readonly PositionsverlaufPunkt[];
  /** In Ringreihenfolge. */
  readonly linien: readonly SichtbareLinie[];
};

export function PositionsverlaufChart({ punkte, linien }: PositionsverlaufChartProps) {
  const zeilen: Zeile[] = punkte.map((p) => ({ ...p, x: tagAchsenwert(p.tag) }));
  const achse = zeitachse(punkte[0]?.tag ?? '', punkte.at(-1)?.tag ?? '');

  const werte = punkte.flatMap((p) =>
    linien.flatMap((l) => {
      const wert = wertVon(p, l.isin);
      return wert === null ? [] : [wert];
    }),
  );
  const flach = Math.max(0, ...werte) - Math.min(0, ...werte) < KLEINSTE_SPANNE;
  const yAchse = yAchseImRaster([0, ...werte, ...(flach ? [-FLACHE_ACHSE, FLACHE_ACHSE] : [])]);
  const animation = serienAnimation();
  const links = zeichenflaecheLinks(yAchse, achsenFormat);

  return (
    <ChartRahmen
      hoehe={POSITIONSVERLAUF_CHART_HOEHE}
      label={de.positionsverlauf.chart}
      tabelle={tabellePositionsverlauf(punkte, linien)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart accessibilityLayer={false} data={zeilen} margin={VERLAUF_MARGIN}>
          <CartesianGrid stroke={FARBE.rand} strokeDasharray={GITTER_STRICHELUNG} vertical={false} />
          <XAxis
            type="number"
            dataKey="x"
            domain={['dataMin', 'dataMax']}
            ticks={achse.ticks}
            tickFormatter={achse.format}
            stroke={FARBE.textLeise}
            tick={{ fontSize: CHART_ACHSEN_SCHRIFTGROESSE, textAnchor: 'start' }}
            tickLine={false}
            minTickGap={VERLAUF_X_ACHSE_TICK_ABSTAND}
          />
          <YAxis
            tickFormatter={achsenFormat}
            stroke={FARBE.textLeise}
            tick={{ fontSize: CHART_ACHSEN_SCHRIFTGROESSE }}
            tickLine={false}
            width={yAchsenBreite(domainBeschriftungen(yAchse.domain, achsenFormat))}
            domain={yAchse.domain}
            ticks={yAchse.ticks}
            interval={0}
          />
          <ReferenceLine y={0} stroke={FARBE.rand} />
          <RechartsTooltip content={<Spitze linien={linien} />} cursor={{ stroke: FARBE.rand }} />
          {linien.flatMap((linie) => {
            const dataKey = `werte.${linie.isin}`;
            return [
              // Unter dem Strich gäbe der Schein die Lücken wieder zu.
              linie.gestrichelt ? null : leuchtLinie(dataKey, linie.farbe, LINIE_HAUPT, animation, true),
              <Line
                key={linie.isin}
                type="monotone"
                dataKey={dataKey}
                name={linie.name}
                stroke={linie.farbe}
                strokeWidth={LINIE_HAUPT}
                {...(linie.gestrichelt ? { strokeDasharray: LINIE_WIEDERHOLT_STRICHELUNG } : {})}
                {...animation}
                connectNulls
                dot={false}
                // Waagrechte Hoverlinien gibt es nur bei einer Linie; bei vielen wären sie Gitterlärm.
                activeDot={
                  linien.length === 1 ? (
                    <AktivPunktMitLinie links={links} fuellung={linie.farbe} />
                  ) : (
                    { r: AKTIV_PUNKT_RADIUS, fill: linie.farbe, stroke: FARBE.text, strokeWidth: AKTIV_PUNKT_RAND }
                  )
                }
              />,
            ];
          })}
          <KaufPunkte zeilen={zeilen} linien={linien} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartRahmen>
  );
}
