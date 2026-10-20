/*
 * Kachel 1, Vorschau beim Ziehen des Zeitraumreglers: Beginn und Ende als Linien im Chart,
 * was danach wegfaellt abgedunkelt, das Datum an der Aussenseite jeder Linie — so kommen
 * sich die zwei Beschriftungen nie in die Quere. Fehlt dort der Platz, rueckt sie nach innen.
 *
 * Ein eigenes SVG ueber dem Chart, nicht eine Schicht darin: ein Ziehschritt rendert so nur
 * diese Ueberlage, nicht Recharts samt aller Punkte (gemessen 12–34 ms je Schritt bei
 * 420 Punkten). Zeichenflaeche und X-Skala meldet ein unsichtbares `<Customized>` (`lageMelder`),
 * und das nur, wenn das Chart ohnehin rendert. Beide SVGs beginnen in der linken oberen Ecke
 * von `.chart-flaeche`, also gelten dieselben Koordinaten.
 *
 * Die X-Achse ist kategorial, also sitzt jede Linie auf einem Punkt der Reihe — der Beginn auf
 * dem ersten ab seinem Tag, das Ende auf dem letzten bis dahin (ab drei Jahren ist die Reihe
 * woechentlich). Liegt ein Griff ausserhalb des Fensters, gibt es dort keine Linie, nur die
 * Abdunkelung.
 *
 * Die Unschaerfe liefert diese Ueberlage nur als Filter; angewandt wird er per CSS auf die
 * Reihen, solange sie im DOM steht (`.verlauf-vorschau` in theme.css). Ein Filter mit
 * Teilregionen statt Maske: so bleibt der Schein der Linien (#linie-leuchten) erhalten.
 */

import { useLayoutEffect } from 'react';
import { Customized } from 'recharts';

import type { Zeitpunkt } from '@/lib/api';
import { useBeobachtet, type Beobachtbar } from '@/lib/beobachtbar';
import {
  CHART_ACHSEN_SCHRIFTGROESSE,
  LINIE_MARKE,
  VORSCHAU_ABDUNKELUNG,
  VORSCHAU_BESCHRIFTUNG_ABSTAND,
  VORSCHAU_BESCHRIFTUNG_OBEN,
  VORSCHAU_STRICHELUNG,
  VORSCHAU_UNSCHAERFE,
  achsenTextBreite,
} from '@/lib/chartmasse';
import { datumKurz } from '@/lib/format';
import { FARBE } from '@/lib/farben';
import { useStufenZaehler } from '@/hooks/useZahlZaehler';

/** Steht in theme.css (Test: VerlaufVorschau.test.tsx); je Dokument hoechstens ein Verlaufschart. */
export const VORSCHAU_FILTER_ID = 'verlauf-vorschau-unschaerfe';

/** Stand der Reglergriffe als Stufen in `tage`. */
export type Vorschau = { readonly tage: readonly string[]; readonly von: number; readonly bis: number };

/** Die Vorschau samt Fenster, in dem gezogen wurde — in jedem anderen gilt sie nicht. */
export type VorschauStand = { readonly fuer: string; readonly vorschau: Vorschau } | null;

/** Was die Ansicht dem Chart reicht: woher die Vorschau kommt und welches Fenster gilt. */
export type VorschauAnschluss = { readonly quelle: Beobachtbar<VorschauStand>; readonly fenster: string };

type Flaeche = { readonly left: number; readonly top: number; readonly width: number; readonly height: number };

/** Zeichenflaeche und Lage jedes Tages, wie Recharts sie zuletzt gezeichnet hat. */
export type ChartLage = {
  readonly flaeche: Flaeche;
  readonly x: (tag: string) => number;
  readonly daten: readonly Zeitpunkt[];
};

type Skala = ((wert: string) => number | undefined) & { bandwidth?: () => number };

/** Was Recharts einem `<Customized>` mitgibt, soweit hier gebraucht. */
type MelderProps = {
  readonly lage: Beobachtbar<ChartLage | null>;
  readonly daten: readonly Zeitpunkt[];
  readonly offset?: Flaeche;
  readonly xAxisMap?: Record<string, { readonly scale: Skala }>;
};

/** Als Funktion, nicht als Komponente: Recharts findet seine Kinder ueber den Typ. */
export function lageMelder(lage: Beobachtbar<ChartLage | null>, daten: readonly Zeitpunkt[]) {
  return <Customized component={<LageMelder lage={lage} daten={daten} />} />;
}

function LageMelder({ lage, daten, offset, xAxisMap }: MelderProps) {
  const skala = xAxisMap === undefined ? undefined : Object.values(xAxisMap)[0]?.scale;
  const left = offset?.left;
  const top = offset?.top;
  const width = offset?.width;
  const height = offset?.height;
  useLayoutEffect(() => {
    if (skala === undefined || left === undefined || top === undefined || width === undefined || height === undefined) {
      lage.setze(null);
      return;
    }
    const mitte = (skala.bandwidth?.() ?? 0) / 2;
    lage.setze({ flaeche: { left, top, width, height }, x: (tag) => (skala(tag) ?? left) + mitte, daten });
  }, [lage, daten, skala, left, top, width, height]);
  return null;
}

/** Zeichnet die Vorschau, solange eine fuer das gezeigte Fenster steht. */
export function VorschauUeberlage({
  anschluss,
  lage,
}: {
  readonly anschluss: VorschauAnschluss;
  readonly lage: Beobachtbar<ChartLage | null>;
}) {
  const stand = useBeobachtet(anschluss.quelle);
  const chart = useBeobachtet(lage);
  if (stand === null || stand.fuer !== anschluss.fenster || chart === null) return null;
  return <VorschauBild vorschau={stand.vorschau} lage={chart} />;
}

type Lage = { readonly x: number; readonly linie: boolean };

export function VorschauBild({ vorschau, lage }: { readonly vorschau: Vorschau; readonly lage: ChartLage }) {
  const { flaeche, x, daten } = lage;
  const erster = daten[0]?.tag;
  const letzter = daten.at(-1)?.tag;
  const beginnTag = vorschau.tage[vorschau.von];
  const endeTag = vorschau.tage[vorschau.bis];

  // Gezaehlt wird vor jedem Ausstieg — Hooks stehen nicht hinter einem `return`.
  const angezeigtVon = useStufenZaehler(vorschau.von);
  const angezeigtBis = useStufenZaehler(vorschau.bis);

  if (erster === undefined || letzter === undefined || beginnTag === undefined || endeTag === undefined) return null;

  const links = flaeche.left;
  const rechts = flaeche.left + flaeche.width;

  const beginn: Lage =
    beginnTag < erster
      ? { x: links, linie: false }
      : beginnTag > letzter
        ? { x: rechts, linie: false }
        : { x: x(daten.find((p) => p.tag >= beginnTag)?.tag ?? letzter), linie: true };
  const ende: Lage =
    endeTag > letzter
      ? { x: rechts, linie: false }
      : endeTag < erster
        ? { x: links, linie: false }
        : { x: x(daten.findLast((p) => p.tag <= endeTag)?.tag ?? erster), linie: true };

  return (
    <svg className="verlauf-vorschau" aria-hidden="true" focusable="false">
      <Unschaerfe von={beginn.x} bis={ende.x} flaeche={flaeche} />
      <Abdunkelung von={links} bis={beginn.x} flaeche={flaeche} />
      <Abdunkelung von={ende.x} bis={rechts} flaeche={flaeche} />
      {beginn.linie ? (
        <Linie
          x={beginn.x}
          flaeche={flaeche}
          text={datumKurz(vorschau.tage[angezeigtVon] ?? beginnTag)}
          aussen="links"
        />
      ) : null}
      {ende.linie ? (
        <Linie
          x={ende.x}
          flaeche={flaeche}
          text={datumKurz(vorschau.tage[angezeigtBis] ?? endeTag)}
          aussen="rechts"
        />
      ) : null}
    </svg>
  );
}

/** Weich links von `von` und rechts von `bis`, scharf dazwischen. */
function Unschaerfe({ von, bis, flaeche }: { readonly von: number; readonly bis: number; readonly flaeche: Flaeche }) {
  // Der Rand faengt den Schein und die Unschaerfe selbst auf, sonst schnitte der Filter sie ab.
  const rand = VORSCHAU_UNSCHAERFE * 4;
  const y = flaeche.top - rand;
  const hoehe = flaeche.height + 2 * rand;
  const links = flaeche.left - rand;
  const rechts = flaeche.left + flaeche.width + rand;
  return (
    <defs>
      <filter
        id={VORSCHAU_FILTER_ID}
        filterUnits="userSpaceOnUse"
        primitiveUnits="userSpaceOnUse"
        x={links}
        y={y}
        width={rechts - links}
        height={hoehe}
      >
        <feGaussianBlur in="SourceGraphic" stdDeviation={VORSCHAU_UNSCHAERFE} result="weich" />
        <feFlood x={links} y={y} width={Math.max(0, von - links)} height={hoehe} result="vorher" />
        <feFlood x={bis} y={y} width={Math.max(0, rechts - bis)} height={hoehe} result="nachher" />
        <feFlood x={von} y={y} width={Math.max(0, bis - von)} height={hoehe} result="mitte" />
        <feMerge result="aussen">
          <feMergeNode in="vorher" />
          <feMergeNode in="nachher" />
        </feMerge>
        <feComposite in="weich" in2="aussen" operator="in" result="weichAussen" />
        <feComposite in="SourceGraphic" in2="mitte" operator="in" result="scharfInnen" />
        <feMerge>
          <feMergeNode in="weichAussen" />
          <feMergeNode in="scharfInnen" />
        </feMerge>
      </filter>
    </defs>
  );
}

function Abdunkelung({ von, bis, flaeche }: { readonly von: number; readonly bis: number; readonly flaeche: Flaeche }) {
  if (bis <= von) return null;
  return (
    <rect
      x={von}
      y={flaeche.top}
      width={bis - von}
      height={flaeche.height}
      fill={FARBE.grund}
      fillOpacity={VORSCHAU_ABDUNKELUNG}
    />
  );
}

function Linie({
  x,
  flaeche,
  text,
  aussen,
}: {
  readonly x: number;
  readonly flaeche: Flaeche;
  readonly text: string;
  readonly aussen: 'links' | 'rechts';
}) {
  const platz = VORSCHAU_BESCHRIFTUNG_ABSTAND + achsenTextBreite(text);
  const nachLinks =
    aussen === 'links' ? x - platz >= flaeche.left : x + platz > flaeche.left + flaeche.width;
  return (
    <>
      <line
        x1={x}
        x2={x}
        y1={flaeche.top}
        y2={flaeche.top + flaeche.height}
        stroke={FARBE.chart1}
        strokeWidth={LINIE_MARKE}
        strokeDasharray={VORSCHAU_STRICHELUNG}
      />
      <text
        x={nachLinks ? x - VORSCHAU_BESCHRIFTUNG_ABSTAND : x + VORSCHAU_BESCHRIFTUNG_ABSTAND}
        y={flaeche.top + VORSCHAU_BESCHRIFTUNG_OBEN + CHART_ACHSEN_SCHRIFTGROESSE}
        textAnchor={nachLinks ? 'end' : 'start'}
        fill={FARBE.text}
        fontSize={CHART_ACHSEN_SCHRIFTGROESSE}
        className="tabular-nums"
      >
        {text}
      </text>
    </>
  );
}
