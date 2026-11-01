/*
 * Reiter Analyse, dritte Spalte: die Top 25 als Treemap, Fläche nach Exposure, Farbe nach Sektor —
 * dieselbe wie im Sektorring daneben (`gruppenFarbe`). Das graue Feld „Andere“ ist der Rest des
 * Depots, damit die Flächen Anteile am ganzen Depot zeigen; die Zahl kommt fertig aus dem Kern.
 *
 * Bedient wird über die Tabelle darunter; Hover auf ein Feld hebt deren Zeile hervor und umgekehrt,
 * Hover auf einen Sektor im Ring hebt dessen Unternehmen hervor.
 */

import { memo } from 'react';
import { ResponsiveContainer, Tooltip as RechartsTooltip, Treemap } from 'recharts';

import { de } from '@/i18n/de';
import type { Gruppe, UnternehmenZeile } from '@/lib/api';
import {
  ANALYSE_CHART_HOEHE,
  DECKKRAFT_GEDIMMT,
  LINIE_MARKE,
  TREEMAP_BESCHRIFTUNG_MIN_BREITE,
  TREEMAP_BESCHRIFTUNG_MIN_HOEHE,
  TREEMAP_DREI_ZEILEN_MIN_HOEHE,
  TREEMAP_INNENABSTAND,
  TREEMAP_RUNDUNG,
  TREEMAP_SCHRIFTGROESSE,
  TREEMAP_ZEILE_1,
  TREEMAP_ZEILE_2,
  TREEMAP_ZEILE_3,
  treemapZeichen,
} from '@/lib/chartmasse';
import { anteilProzent, euroAusCent, gekuerzt, zahl } from '@/lib/format';
import { FARBE } from '@/lib/farben';
import { ChartRahmen } from '@/components/ChartRahmen';
import { ChartTooltipFlaeche } from '@/components/ChartTooltipFlaeche';
import { gruppenFarbe, gruppenIndex, gruppenSchluessel } from './GruppenRing';
import { unternehmenSchluessel } from './Top25Ansicht';

/** Schlüssel sind ISIN oder Name (`unternehmenSchluessel`); ein NUL steht in keinem von beiden. */
const ANDERE = '\u0000andere';

export type Feld = {
  readonly art: 'unternehmen' | 'andere';
  readonly schluessel: string;
  readonly name: string;
  readonly exposureCent: number;
  readonly anteil: string;
  /** Unternehmen hinter dem Feld: eins, bei „Andere“ alle ausserhalb der Top 25. */
  readonly anzahl: number;
  readonly fonds: string;
  readonly farbe: string;
  /** Schlüssel des Sektors im Ring (`gruppenSchluessel`); `null` ohne Gruppe und bei „Andere“. */
  readonly gruppe: string | null;
  /** Recharts' `TreemapDataType` verlangt eine Indexsignatur. */
  readonly [k: string]: unknown;
};

export function unternehmenFeld(z: UnternehmenZeile, sektoren: readonly Gruppe[]): Feld {
  const sektor = sektoren[gruppenIndex(sektoren, z.sektor)];
  return {
    art: 'unternehmen',
    schluessel: unternehmenSchluessel(z),
    name: z.name,
    exposureCent: z.exposureCent,
    anteil: anteilProzent(z.anteilDepot),
    anzahl: 1,
    fonds: de.top25.fondsListe(z.ausFonds.map((f) => f.name ?? f.isin)),
    farbe: gruppenFarbe(sektoren, z.sektor),
    gruppe: sektor === undefined ? null : gruppenSchluessel(sektor),
  };
}

/** Das graue Feld für den Rest des Depots; ohne Rest keins. */
export function andereFeld(exposureCent: number, anteil: number, anzahl: number): Feld | null {
  if (exposureCent <= 0) return null;
  return {
    art: 'andere',
    schluessel: ANDERE,
    name: de.top25.andere,
    exposureCent,
    anteil: anteilProzent(anteil),
    anzahl,
    fonds: de.top25.andereHinweis,
    farbe: FARBE.rand,
    gruppe: null,
  };
}

export type UnternehmenTreemapProps = {
  readonly zeilen: readonly UnternehmenZeile[];
  /** Depot ausserhalb der Top 25, flach statt als Objekt, damit `memo` greift. */
  readonly andereCent: number;
  readonly andereAnteil: number;
  readonly andereAnzahl: number;
  readonly sektoren: readonly Gruppe[];
  readonly hervorgehoben: string | null;
  /** Schlüssel des hervorgehobenen Sektors (`gruppenSchluessel`). */
  readonly sektorHervorgehoben: string | null;
  readonly onHover: (schluessel: string | null) => void;
};

export const UnternehmenTreemap = memo(function UnternehmenTreemap({
  zeilen,
  andereCent,
  andereAnteil,
  andereAnzahl,
  sektoren,
  hervorgehoben,
  sektorHervorgehoben,
  onHover,
}: UnternehmenTreemapProps) {
  const andere = andereFeld(andereCent, andereAnteil, andereAnzahl);
  const felder = [...zeilen.map((z) => unternehmenFeld(z, sektoren)), ...(andere === null ? [] : [andere])];
  const aktiv = (f: Feld): boolean =>
    hervorgehoben !== null ? f.schluessel === hervorgehoben : sektorHervorgehoben === null || f.gruppe === sektorHervorgehoben;

  return (
    <ChartRahmen
      hoehe={ANALYSE_CHART_HOEHE}
      label={de.top25.treemap}
      tabelle={{
        beschriftung: de.top25.tabelleTreemap,
        spalten: [de.top25.spalteName, de.top25.spalteRang, de.top25.spalteSektor, de.top25.spalteAnteil, de.top25.spalteExposure],
        zeilen: [
          ...zeilen.map((z) => [
            z.name,
            zahl(z.rang),
            z.sektor === null ? '–' : de.top25.sektor(z.sektor),
            anteilProzent(z.anteilDepot),
            euroAusCent(z.exposureCent),
          ]),
          ...(andere === null ? [] : [[andere.name, '', '–', andere.anteil, euroAusCent(andere.exposureCent)]]),
        ],
      }}
    >
      <div aria-hidden="true" className="size-full">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={felder}
            dataKey="exposureCent"
            nameKey="name"
            isAnimationActive={false}
            // „Andere“ hebt nur sich selbst hervor; eine Tabellenzeile mit diesem Schlüssel gibt es nicht.
            onMouseEnter={(knoten) => onHover(typeof knoten.schluessel === 'string' ? knoten.schluessel : null)}
            onMouseLeave={() => onHover(null)}
            content={(knoten) => <FeldForm knoten={knoten} felder={felder} aktiv={aktiv} />}
          >
            <RechartsTooltip content={<TreemapTooltip felder={felder} />} cursor={false} isAnimationActive={false} />
          </Treemap>
        </ResponsiveContainer>
      </div>
    </ChartRahmen>
  );
});

export type Knoten = {
  readonly depth: number;
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/**
 * Ein Feld: `rect` und `text` mit `fill` als Zeichenattribut, kein Inline-CSS [INV-05]. Die Fuge
 * in `flaeche` trennt gleichfarbige Nachbarn; beschriftet wird nur, wo Platz ist.
 */
export function FeldForm({
  knoten,
  felder,
  aktiv,
}: {
  readonly knoten: Knoten;
  readonly felder: readonly Feld[];
  readonly aktiv: (f: Feld) => boolean;
}) {
  const feld = knoten.depth === 1 ? felder[knoten.index] : undefined;
  if (feld === undefined) return <g />;
  const { x, y, width, height } = knoten;
  const beschriftet = width >= TREEMAP_BESCHRIFTUNG_MIN_BREITE && height >= TREEMAP_BESCHRIFTUNG_MIN_HOEHE;
  // Auf Chartfarbe dunkle Schrift, auf dem grauen „Übrige“ helle (start/kontrast.ts).
  const schrift = feld.farbe === FARBE.rand ? FARBE.text : FARBE.grund;
  // Die Schrift dimmt mit, sonst stünde dunkle Schrift auf dem abgedunkelten Feld.
  const deckkraft = aktiv(feld) ? 1 : DECKKRAFT_GEDIMMT;
  const andere = feld.art === 'andere';
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={TREEMAP_RUNDUNG}
        fill={feld.farbe}
        fillOpacity={deckkraft}
        stroke={FARBE.flaeche}
        strokeWidth={LINIE_MARKE}
      />
      {beschriftet ? (
        <text x={x + TREEMAP_INNENABSTAND} fill={schrift} fillOpacity={deckkraft} fontSize={TREEMAP_SCHRIFTGROESSE} pointerEvents="none">
          <tspan x={x + TREEMAP_INNENABSTAND} y={y + TREEMAP_ZEILE_1} fontWeight={600}>
            {gekuerzt(feld.name, treemapZeichen(width))}
          </tspan>
          <tspan x={x + TREEMAP_INNENABSTAND} y={y + TREEMAP_ZEILE_2}>
            {andere ? de.top25.andereAnzahl(zahl(feld.anzahl)) : feld.anteil}
          </tspan>
          {/* „Andere“ hat keine Tabellenzeile; die Werte stehen deshalb auch im Feld. */}
          {andere && height >= TREEMAP_DREI_ZEILEN_MIN_HOEHE ? (
            <tspan x={x + TREEMAP_INNENABSTAND} y={y + TREEMAP_ZEILE_3}>
              {gekuerzt(de.top25.andereWerte(feld.anteil, euroAusCent(feld.exposureCent)), treemapZeichen(width))}
            </tspan>
          ) : null}
        </text>
      ) : null}
    </g>
  );
}

type TooltipEintrag = { readonly payload?: { readonly schluessel?: unknown } };

/** Name, Anteil, Exposure und Fonds wie Zeile und Hover-Karte der Tabelle. */
function TreemapTooltip(props: {
  readonly felder: readonly Feld[];
  readonly active?: boolean;
  readonly payload?: readonly TooltipEintrag[];
}) {
  const schluessel = props.payload?.[0]?.payload?.schluessel;
  const feld = props.felder.find((f) => f.schluessel === schluessel);
  if (props.active !== true || feld === undefined) return null;
  return (
    <ChartTooltipFlaeche>
      <p className="font-medium">{feld.name}</p>
      {feld.art === 'andere' ? <p className="text-text-leise">{de.top25.andereAnzahl(zahl(feld.anzahl))}</p> : null}
      <p className="text-text-leise">{de.top25.treemapWerte(feld.anteil, euroAusCent(feld.exposureCent))}</p>
      <p className="text-text-leise">{feld.fonds}</p>
    </ChartTooltipFlaeche>
  );
}
