/*
 * Kachel 1, Helfer fuer die Achsen der beiden Chart-Ansichten: Y-Raster, Monats-Ticks,
 * Markierungslinien, Leuchtlinien, Y-Hoverlinie. Markierungs- und Leuchtlinien sind
 * Funktionen und keine Komponenten, weil Recharts seine Kinder nach Typ sucht — ein
 * Wrapper wuerde sie nicht finden.
 */

import { Line, ReferenceLine } from 'recharts';

import type { Marke } from '@/lib/api';
import { FARBE } from '@/lib/farben';
import {
  AKTIV_PUNKT_RADIUS,
  AKTIV_PUNKT_RAND,
  LINIE_MARKE,
  LINIE_MARKE_HERVORGEHOBEN,
  VERLAUF_MARGIN,
  VERLAUF_Y_ACHSE_PUFFER_ANTEIL,
  yAchsenBreite,
} from '@/lib/chartmasse';

/**
 * Schein unter einer Serie: dieselbe Kurve noch einmal, nur sie traegt den Filter aus
 * <Leuchtfilter>. Safari rastert SVG-Filter in CSS-Pixeln — laege der Filter auf der
 * Serie selbst, waere die Linie auf Retina hochskaliert und unscharf.
 */
export function leuchtLinie(
  dataKey: string,
  stroke: string,
  strokeWidth: number,
  animation: object,
  connectNulls = false,
) {
  return (
    <Line
      key={`schein-${dataKey}`}
      className="linie-schein"
      type="monotone"
      dataKey={dataKey}
      stroke={stroke}
      strokeWidth={strokeWidth}
      {...animation}
      dot={false}
      activeDot={false}
      legendType="none"
      tooltipType="none"
      connectNulls={connectNulls}
    />
  );
}

/** Markierungslinien: beim Hover werden sie breiter und kraeftiger, statt nur ueber
 *  den Tooltip erkennbar zu sein. */
export function markenLinien(
  marken: readonly Marke[],
  hoverSchluessel: string | null,
  onHover: (schluessel: string | null) => void,
) {
  return marken.map((marke) => {
    const schluessel = `${marke.tag}-${marke.typ}`;
    const hervorgehoben = schluessel === hoverSchluessel;
    return (
      <ReferenceLine
        key={schluessel}
        x={marke.tag}
        stroke={FARBE.chart3}
        strokeOpacity={hervorgehoben ? 0.9 : 0.35}
        strokeWidth={hervorgehoben ? LINIE_MARKE_HERVORGEHOBEN : LINIE_MARKE}
        onMouseEnter={() => onHover(schluessel)}
        onMouseLeave={() => onHover(null)}
      />
    );
  });
}

export type YAchse = {
  readonly domain: [number, number] | ['auto', 'auto'];
  readonly ticks?: number[];
};

/** Etwa so viele Abschnitte hat die Y-Achse; der Schritt folgt dem 1-2-5-Raster. */
const Y_ACHSE_ABSCHNITTE = 5;

/** Kleinster Schritt aus 1, 2, 5 × 10^n, der die Spanne in hoechstens etwa `abschnitte` teilt. */
export function rasterSchritt(spanne: number, abschnitte = Y_ACHSE_ABSCHNITTE): number {
  const roh = spanne / abschnitte;
  const zehnerpotenz = 10 ** Math.floor(Math.log10(roh));
  const faktor = roh / zehnerpotenz;
  return (faktor <= 1 ? 1 : faktor <= 2 ? 2 : faktor <= 5 ? 5 : 10) * zehnerpotenz;
}

/**
 * Wertebereich plus Rand, auf das 1-2-5-Raster gerundet: die Kurve fuellt die Chart-Hoehe
 * unabhaengig vom Zeitraum, statt in einer bei 0 beginnenden Achse zu verschwinden, und die
 * Ticks sind runde Zahlen statt 8.851 / 13.351 €. Liegt 0 im Bereich, ist 0 ein Tick.
 */
export function yAchseImRaster(werte: readonly number[]): YAchse {
  if (werte.length === 0) return { domain: ['auto', 'auto'] };
  const min = Math.min(...werte);
  const max = Math.max(...werte);
  const spanne = max - min;
  const puffer = spanne === 0 ? Math.max(Math.abs(max), 1) * VERLAUF_Y_ACHSE_PUFFER_ANTEIL : spanne * VERLAUF_Y_ACHSE_PUFFER_ANTEIL;
  // Der Puffer kippt keinen rein positiven Bereich ins Minus (−100.000 € Depotwert).
  const unten = min >= 0 ? Math.max(0, min - puffer) : min - puffer;
  const oben = max <= 0 ? Math.min(0, max + puffer) : max + puffer;
  const schritt = rasterSchritt(oben - unten);
  const von = Math.floor(unten / schritt);
  const bis = Math.ceil(oben / schritt);
  // Ueber ganze Zahlen geteilt: 3 × 0,1 ist sonst 0,30000000000000004.
  const skala = 10 ** Math.max(0, -Math.floor(Math.log10(schritt)));
  const ticks = Array.from({ length: bis - von + 1 }, (_, i) => Math.round((von + i) * schritt * skala) / skala);
  return { domain: [ticks[0] ?? min, ticks.at(-1) ?? max], ticks };
}

/** Beschriftungen an den Enden einer Y-Domain, fuer `yAchsenBreite`. */
export function domainBeschriftungen(
  domain: [number, number] | ['auto', 'auto'],
  format: (wert: number) => string,
): string[] {
  return domain[0] === 'auto' ? [] : domain.map((wert) => format(wert as number));
}

/** Hoechstens so viele Monatsbeschriftungen; darueber wird auf 2, 3, 6 oder 12 Monate gestuft. */
const MONATS_TICKS_HOECHSTENS = 12;
const MONATS_STUFEN = [1, 2, 3, 6, 12] as const;

/**
 * Hoechstens ein Tick je Monat, sobald die Achse nur Monat und Jahr zeigt — sonst waehlt
 * Recharts Tage und beschriftet zwei davon mit demselben „08/25“. Der erste Punkt eines
 * Monats traegt den Tick; bei langen Zeitraeumen nur jeder 2./3./6./12. Monat ab Januar, damit
 * die Abstaende gleich bleiben. `undefined`: Recharts waehlt selbst (kurze Zeitraeume).
 */
export function monatsTicks(daten: readonly { readonly tag: string }[], nachMonat: boolean): string[] | undefined {
  if (!nachMonat) return undefined;
  const monatsanfaenge = daten
    .filter((punkt, index) => daten[index - 1]?.tag.slice(0, 7) !== punkt.tag.slice(0, 7))
    .map((punkt) => punkt.tag);
  const stufe =
    MONATS_STUFEN.find((monate) => monatsanfaenge.length / monate <= MONATS_TICKS_HOECHSTENS) ?? MONATS_STUFEN.at(-1);
  return monatsanfaenge.filter((tag) => (Number(tag.slice(5, 7)) - 1) % (stufe ?? 1) === 0);
}

/** Linker Rand der Zeichenflaeche: Y-Achse plus Aussenrand. */
export function zeichenflaecheLinks(yAchse: YAchse, format: (wert: number) => string): number {
  return VERLAUF_MARGIN.left + yAchsenBreite(domainBeschriftungen(yAchse.domain, format));
}

/**
 * Aktiver Punkt der Hauptserie samt waagrechter Y-Hoverlinie. Die Linie haengt am Punkt, den
 * Recharts beim Hover ohnehin zeichnet: als eigener React-State kostete sie ein zweites Rendern
 * des ganzen Charts je Mausbewegung — bei „max“ mit 2.000 Punkten 54 statt 25 ms auf
 * gedrosselter CPU. `cx`/`cy` setzt Recharts beim Klonen.
 */
export function AktivPunktMitLinie({
  cx,
  cy,
  links,
  fuellung,
}: {
  readonly cx?: number;
  readonly cy?: number;
  readonly links: number;
  readonly fuellung: string;
}) {
  if (cx === undefined || cy === undefined) return null;
  return (
    <g>
      <line x1={links} x2="100%" y1={cy} y2={cy} stroke={FARBE.rand} />
      <circle cx={cx} cy={cy} r={AKTIV_PUNKT_RADIUS} fill={fuellung} stroke={FARBE.text} strokeWidth={AKTIV_PUNKT_RAND} />
    </g>
  );
}
