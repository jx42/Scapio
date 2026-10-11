/*
 * Kachel 1, Tooltip der beiden Chart-Ansichten. Reine Darstellung: alle Werte kommen
 * fertig aus dem Zeitpunkt, alle Zeichenketten aus lib/format.ts.
 */

import { de } from '@/i18n/de';
import type { Marke, Zeitpunkt } from '@/lib/api';
import {
  betragOhneVorzeichen,
  datumKurz,
  euroAusCent,
  prozent,
  richtungBgTon,
  richtungPfeil,
  richtungTon,
  vorzeichen,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import { ChartTooltipFlaeche } from '@/components/ChartTooltipFlaeche';
import { RichtungsPfeil } from '@/components/RichtungsPfeil';
import type { VerlaufAnsichtModus } from '@/features/verlauf/VerlaufAnsicht';

type TooltipNutzlast = {
  readonly active?: boolean;
  readonly label?: string | number;
  readonly payload?: readonly { readonly payload?: Zeitpunkt }[];
  /** Nur im Vermoegen-Chart gesetzt — dort stehen die Markierungslinien. */
  readonly marken?: readonly Marke[];
  /** Name des aktiven Benchmarks, fuer eine zusaetzliche Zeile — nur wenn gesetzt. */
  readonly benchmarkName?: string | null;
  /** Nur im Vermoegen-Chart gesetzt — Einzahlungszeile und Markierungsliste folgen der Linienwahl. */
  readonly zeigeEinzahlung?: boolean;
  readonly zeigeZufluesse?: boolean;
  /** Steuert Depotwert-Zeile, Trennlinien und den Punkt vor dem Gesamtgewinn. */
  readonly modus: VerlaufAnsichtModus;
};

/** Farbiger Punkt vor einem Tooltip-Wert — dieselbe Farbe wie die zugehoerige Linie im
 *  Chart, seit die Legende weggefallen ist die einzige Zuordnung von Wert zu Linie. */
function TooltipPunkt({ farbe }: { readonly farbe: string }) {
  return <span aria-hidden="true" className={cn('size-2 rounded-full', farbe)} />;
}

/** Trennlinie im Tooltip, nur zwischen Datum und den Werten sowie vor der Differenz. */
function TooltipTrennlinie() {
  return <div className="my-1 border-t border-rand" />;
}

/**
 * Differenz-Zeile: nur die Beschriftung bleibt in der normalen Textfarbe, Prozent- und
 * Euro-Wert samt Klammern tragen Gruen/Rot — Farbe kommt hier zum ohnehin im Zahlenformat
 * enthaltenen Vorzeichen dazu, dem Pfeil daneben. [src/CLAUDE.md, Gewinn/Verlust nie
 * allein ueber Farbe]
 *
 * Gibt zwei Grid-Zellen zurueck (Beschriftung, Wert) statt einer eigenen Zeile — die
 * Zellen fuegen sich in das zweispaltige Grid von `VerlaufTooltip` ein.
 */
function DifferenzZeile({
  modus,
  prozentDiff,
  euroDiff,
}: {
  readonly modus: VerlaufAnsichtModus;
  readonly prozentDiff: number;
  readonly euroDiff: number;
}) {
  const { richtung, pfeil } = vorzeichen(euroDiff);
  return (
    <>
      <span className="text-text">{`${de.verlauf.differenz}:`}</span>
      <span className={cn('flex flex-wrap items-center gap-1 font-bold', richtungTon[richtung])}>
        <RichtungsPfeil pfeil={pfeil} />
        {modus === 'vermoegen' ? (
          <>
            <span>{betragOhneVorzeichen(euroDiff, euroAusCent)}</span>
            <span>{`(${betragOhneVorzeichen(prozentDiff, prozent)})`}</span>
          </>
        ) : (
          <>
            <span>{betragOhneVorzeichen(prozentDiff, prozent)}</span>
            <span>{`(${betragOhneVorzeichen(euroDiff, euroAusCent)})`}</span>
          </>
        )}
      </span>
    </>
  );
}

export function VerlaufTooltip({
  active,
  payload,
  marken,
  benchmarkName,
  zeigeEinzahlung,
  zeigeZufluesse,
  modus,
}: TooltipNutzlast) {
  const punkt = payload?.[0]?.payload;
  if (active !== true || punkt === undefined) return null;
  const markenAmTag =
    zeigeZufluesse === true ? (marken?.filter((marke) => marke.tag === punkt.tag) ?? []) : [];
  const hatBenchmark =
    benchmarkName !== null &&
    benchmarkName !== undefined &&
    punkt.benchmarkProzent !== undefined &&
    punkt.benchmarkGewinnCent !== undefined &&
    punkt.differenzCent !== undefined &&
    punkt.differenzProzent !== undefined;
  const { richtung: gewinnRichtung, pfeil: gewinnPfeil } = vorzeichen(punkt.gewinnProzent);
  return (
    <ChartTooltipFlaeche>
      <p className="text-text-leise">{datumKurz(punkt.tag)}</p>
      <TooltipTrennlinie />
      <div className="grid grid-cols-[auto_auto] items-baseline gap-x-3 gap-y-1">
        {zeigeEinzahlung !== true ? null : (
          <>
            <span className="flex items-center gap-1.5 text-text">
              <TooltipPunkt farbe="bg-chart-2" />
              {`${de.verlauf.einzahlung}:`}
            </span>
            <span className="text-text">{euroAusCent(punkt.einzahlungKumCent)}</span>
          </>
        )}
        {modus !== 'vermoegen' ? null : (
          <>
            <span className="flex items-center gap-1.5 text-text">
              <TooltipPunkt farbe="bg-chart-1" />
              {`${de.verlauf.depotwert}:`}
            </span>
            <span className="text-text">{euroAusCent(punkt.gesamtCent)}</span>
          </>
        )}
        <span className="flex items-center gap-1.5 text-text">
          {modus !== 'rendite' ? null : <TooltipPunkt farbe={richtungBgTon[gewinnRichtung]} />}
          {`${de.verlauf.gesamtgewinnDepot}:`}
        </span>
        <span className={cn('flex flex-wrap items-center gap-1', richtungTon[gewinnRichtung])}>
          <RichtungsPfeil pfeil={gewinnPfeil} />
          {modus === 'vermoegen' ? (
            <>
              <span>{betragOhneVorzeichen(punkt.gewinnCent, euroAusCent)}</span>
              <span>{`(${betragOhneVorzeichen(punkt.gewinnProzent, prozent)})`}</span>
            </>
          ) : (
            <>
              <span>{betragOhneVorzeichen(punkt.gewinnProzent, prozent)}</span>
              <span>{`(${betragOhneVorzeichen(punkt.gewinnCent, euroAusCent)})`}</span>
            </>
          )}
        </span>
        {!hatBenchmark ||
        punkt.benchmarkProzent === undefined ||
        punkt.benchmarkGewinnCent === undefined ||
        punkt.differenzCent === undefined ||
        punkt.differenzProzent === undefined ? null : (
          <>
            <span className="flex items-center gap-1.5 text-text">
              <TooltipPunkt farbe="bg-chart-4" />
              {`${benchmarkName}:`}
            </span>
            <span
              className={cn(
                'flex flex-wrap items-center gap-1',
                richtungTon[vorzeichen(punkt.benchmarkProzent).richtung],
              )}
            >
              <RichtungsPfeil pfeil={vorzeichen(punkt.benchmarkProzent).pfeil} />
              {modus === 'vermoegen' ? (
                <>
                  <span>{betragOhneVorzeichen(punkt.benchmarkGewinnCent, euroAusCent)}</span>
                  <span>{`(${betragOhneVorzeichen(punkt.benchmarkProzent, prozent)})`}</span>
                </>
              ) : (
                <>
                  <span>{betragOhneVorzeichen(punkt.benchmarkProzent, prozent)}</span>
                  <span>{`(${betragOhneVorzeichen(punkt.benchmarkGewinnCent, euroAusCent)})`}</span>
                </>
              )}
            </span>
            <div className="col-span-2">
              <TooltipTrennlinie />
            </div>
            <DifferenzZeile
              modus={modus}
              prozentDiff={punkt.differenzProzent}
              euroDiff={punkt.differenzCent}
            />
          </>
        )}
      </div>
      {markenAmTag.length === 0 ? null : (
        <ul className="mt-1.5 space-y-0.5 border-t border-rand pt-1.5 text-text-leise">
          {markenAmTag.flatMap((marke) =>
            marke.vorgaenge.map((vorgang, index) => (
              <li key={`${marke.typ}-${vorgang.isin ?? 'cash'}-${index}`}>
                {vorgang.name !== undefined
                  ? `${de.verlauf.markenTyp[marke.typ]} · ${vorgang.name}: `
                  : vorgang.isin !== undefined
                    ? `${de.verlauf.markenTyp[marke.typ]} · ${vorgang.isin}: `
                    : `${de.verlauf.markenTyp[marke.typ]}: `}
                <RichtungsPfeil pfeil={richtungPfeil(vorgang.betragCent)} className="mr-0.5" />
                {betragOhneVorzeichen(vorgang.betragCent, euroAusCent)}
              </li>
            )),
          )}
        </ul>
      )}
    </ChartTooltipFlaeche>
  );
}
