/*
 * Kachel 1, Ansicht: Depotwert, Einzahlungslinie, Gesamtgewinn.
 *
 * Der Abstand zwischen Depotwert und eingezahltem Kapital IST der Gewinn —
 * das liest man schneller als jede Prozentzahl, und genau deshalb liegen beide Linien
 * uebereinander statt in zwei Kacheln. Die Rendite-Ansicht zeigt denselben Gewinn als
 * Prozentsatz der Einzahlung, bewusst nicht zeitgewichtet wie TWR — siehe ADR-011.
 *
 * Diese Zahl heisst hier ueberall "Gesamtgewinn" und NICHT "Kursgewinn": sie ist
 * Depotwert minus eingezahltes Kapital und enthaelt damit Cash, Ertraege, Steuern und
 * Gebuehren, waehrend die Karte Kursgewinn nur die gehaltenen Wertpapiere gegen
 * ihren Einstand stellt. Beide Zahlen stehen auf derselben Seite uebereinander und
 * weichen um genau diese Posten voneinander ab — deshalb traegt jede hier gezeigte
 * Gewinnzahl eine Beschriftung und eine Erklaerung. [ADR-016]
 *
 * Reine Ansicht: keine Query, keine Rechnung (auch die Differenz zum Vergleich kommt fertig aus
 * `core/kursgewinn.ts`). Alle Werte kommen fertig herein, alle
 * Zeichenketten aus lib/format.ts.
 */

import { ArrowUpRight } from 'lucide-react';

import { de } from '@/i18n/de';
import { RISIKOFREI_ISIN, type Marke, type MaxDrawdownErgebnis, type Zeitpunkt, type Zeitraum } from '@/lib/api';
import { betragOhneVorzeichen, datumKurz, euroAusCent, maxDrawdownAnzeige, prozent } from '@/lib/format';
import { linkVariants } from '@/lib/linkStil';
import { cn } from '@/lib/utils';
import { OnvistaLink } from '@/components/OnvistaLink';
import { LeerZustand } from '@/components/Zustaende';
import { TabsContent } from '@/components/ui/tabs';
import { Zeitraumregler } from '@/features/verlauf/Zeitraumregler';
import { Zeitraumwahl } from '@/features/verlauf/Zeitraumwahl';
import { Gewinnwert } from '@/features/verlauf/VerlaufGewinnwert';
import { VerlaufRenditeChart } from '@/features/verlauf/VerlaufRenditeChart';
import { VerlaufVermoegenChart } from '@/features/verlauf/VerlaufVermoegenChart';
import { useZeitraumVorschau } from '@/features/verlauf/useZeitraumVorschau';
import type { DrawdownMarke } from '@/features/verlauf/verlaufAchsen';

export type VerlaufAnsichtModus = 'vermoegen' | 'rendite';

export const VERLAUF_MODI: readonly VerlaufAnsichtModus[] = ['vermoegen', 'rendite'];

export type VerlaufAnsichtProps = {
  readonly punkte: readonly Zeitpunkt[];
  readonly marken: readonly Marke[];
  /** `null`, solange der Zeitraumregler einen freien Zeitraum haelt. */
  readonly zeitraum: Zeitraum | null;
  /** Das tatsaechlich gezeigte Fenster, wie der Server es begrenzt hat. */
  readonly ausschnitt: { readonly von: string; readonly bis: string } | null;
  /** Stufen des Zeitraumreglers; leer heisst: kein Regler. */
  readonly tage: readonly string[];
  /** Sichtbar, aber nicht bedienbar — in der Demo. */
  readonly reglerGesperrt: boolean;
  /**
   * Zaehlt jede von aussen gesetzte Auswahl (Segmentleiste, Rueckfall nach einem Fehler): auch
   * wenn danach dasselbe Fenster aus dem Cache kommt, muessen Griffe und Vorschau eines
   * Ziehens weg.
   */
  readonly auswahlRunde: number;
  /** Bestimmt die Kopfzeile: Betrag vor Prozent bei "vermoegen", Prozent vor Betrag bei "rendite", wie im Tooltip. */
  readonly modus: VerlaufAnsichtModus;
  /**
   * Gesamtgewinn (Depotwert minus eingezahltes Kapital), Differenz zwischen Ende und Beginn
   * des gewaehlten Zeitraums — kommt fertig aus `/api/zeitreihe` (`core/kursgewinn.ts`),
   * damit der Kopfwert mit dem Zeitraum wechselt statt immer den Stand von heute zu
   * zeigen.
   */
  readonly fensterGewinnCent: number;
  /** `fensterGewinnCent` bezogen auf das eingezahlte Kapital zu Fensterende. */
  readonly fensterGewinnProzent: number;
  /** Bei drift.stufe 'abbruch' wird nicht gezeichnet, sondern erklaert. */
  readonly gesperrt: boolean;
  /** Warum nicht gezeichnet wird. Kommt fertig formuliert aus `sperrtext()`. */
  readonly sperrgrund?: string | null;
  readonly onZeitraum: (zeitraum: Zeitraum) => void;
  readonly onFreierZeitraum: (von: string, bis: string) => void;
  /** Der aktiv verglichene Benchmark, oder `null` — bestimmt Namen in Legende/Tooltip/Tabelle. */
  readonly benchmark: { readonly isin: string; readonly name: string } | null;
  /** Aus Linienwahl, per Default aus: nur im Vermoegen-Chart gezeichnet. */
  readonly zeigeEinzahlung: boolean;
  /** Aus Linienwahl, per Default aus: die gelben Markierungslinien im Vermoegen-Chart. */
  readonly zeigeZufluesse: boolean;
  /** Nach einem Klick auf die Drawdown-Karte: im Chart eingezeichnet, bis der Zeitraum wechselt. */
  readonly drawdown: Extract<MaxDrawdownErgebnis, { art: 'ok' }> | null;
};


export function VerlaufAnsicht({
  punkte,
  marken,
  zeitraum,
  ausschnitt,
  tage,
  reglerGesperrt,
  auswahlRunde,
  modus,
  fensterGewinnCent,
  fensterGewinnProzent,
  gesperrt,
  sperrgrund,
  onZeitraum,
  onFreierZeitraum,
  benchmark,
  zeigeEinzahlung,
  zeigeZufluesse,
  drawdown,
}: VerlaufAnsichtProps) {
  const zeitraumLang =
    zeitraum !== null
      ? de.verlauf.zeitraumLang[zeitraum]
      : ausschnitt === null
        ? ''
        : de.verlauf.zeitraumFrei(datumKurz(ausschnitt.von), datumKurz(ausschnitt.bis));
  const daten = punkte as Zeitpunkt[];
  // Nur ausgewaehlt, nicht gerechnet: der letzte Punkt der Reihe ist der Kopfwert.
  const letzter = punkte.at(-1);
  const vergleichGewinnCent = letzter?.benchmarkGewinnCent;
  const vergleichGewinnProzent = letzter?.benchmarkProzent;
  const differenzCent = letzter?.differenzCent;
  const differenzProzent = letzter?.differenzProzent;
  const benchmarkName = benchmark?.name ?? null;

  const drawdownZeitraum = drawdown === null ? null : maxDrawdownAnzeige(drawdown).zeitraum;
  const drawdownMarke: DrawdownMarke | null =
    drawdown === null ? null : { hoch: drawdown.tagHoch, tief: drawdown.tagTief };
  const drawdownLabel =
    drawdown === null || drawdownZeitraum === null ? '' : de.verlauf.drawdownImChart(prozent(drawdown.anteil), drawdownZeitraum);

  const { fenster, anschluss, melde } = useZeitraumVorschau(ausschnitt, tage, auswahlRunde);

  const regler =
    ausschnitt === null || tage.length < 2 ? undefined : (
      <Zeitraumregler
        tage={tage}
        fenster={fenster}
        von={ausschnitt.von}
        bis={ausschnitt.bis}
        gesperrt={reglerGesperrt}
        onWahl={onFreierZeitraum}
        onVorschau={melde}
      />
    );

  // Gesperrt und leer sind unabhaengig vom Modus — dieselbe Meldung fuer beide Tabs,
  // sonst zeigt <TabsContent> des inaktiven Modus nichts und aria-controls liefe ins Leere.
  const ersatzinhalt = gesperrt ? (
    <LeerZustand ton="verlust" titel={de.drift.chartUnterdrueckt} text={sperrgrund ?? null} />
  ) : punkte.length === 0 ? (
    <LeerZustand text={de.verlauf.keinZeitraum} />
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {letzter === undefined ? null : (
            <Gewinnwert
              bezeichnung={modus === 'rendite' ? de.verlauf.depot : de.verlauf.gesamtgewinnDepot}
              erklaerung={de.verlauf.erklaerungGesamtgewinnZeitraum}
              betrag={betragOhneVorzeichen(fensterGewinnCent, euroAusCent)}
              prozentwert={betragOhneVorzeichen(fensterGewinnProzent, prozent)}
              wert={fensterGewinnCent}
              prozentVorn={modus === 'rendite'}
            />
          )}
          {benchmarkName === null ||
          vergleichGewinnCent === undefined ||
          vergleichGewinnProzent === undefined ||
          differenzCent === undefined ||
          differenzProzent === undefined ? null : (
            <>
              <Gewinnwert
                bezeichnung={benchmarkName}
                erklaerung={de.verlauf.erklaerungBenchmarkGewinn(benchmarkName)}
                quelle={benchmark === null ? undefined : <BenchmarkQuelle isin={benchmark.isin} name={benchmark.name} />}
                betrag={betragOhneVorzeichen(vergleichGewinnCent, euroAusCent)}
                prozentwert={betragOhneVorzeichen(vergleichGewinnProzent, prozent)}
                wert={vergleichGewinnCent}
                prozentVorn={modus === 'rendite'}
              />
              <Gewinnwert
                bezeichnung={de.verlauf.differenz}
                erklaerung={de.verlauf.erklaerungDifferenz}
                betrag={betragOhneVorzeichen(differenzCent, euroAusCent)}
                prozentwert={betragOhneVorzeichen(differenzProzent, prozent)}
                wert={differenzCent}
                prozentVorn={modus === 'rendite'}
              />
            </>
          )}
        </p>
        <Zeitraumwahl gewaehlt={zeitraum} onWahl={onZeitraum} />
      </div>

      <TabsContent value="vermoegen">
        {ersatzinhalt ?? (
          <VerlaufVermoegenChart
            punkte={daten}
            marken={marken}
            label={de.verlauf.chartVermoegen(zeitraumLang, benchmarkName) + drawdownLabel}
            benchmarkName={benchmarkName}
            zeigeEinzahlung={zeigeEinzahlung}
            zeigeZufluesse={zeigeZufluesse}
            fuss={regler}
            vorschau={regler === undefined ? undefined : anschluss}
            drawdown={drawdownMarke}
          />
        )}
      </TabsContent>
      <TabsContent value="rendite">
        {ersatzinhalt ?? (
          <VerlaufRenditeChart
            punkte={daten}
            label={de.verlauf.chartRendite(zeitraumLang, benchmarkName) + drawdownLabel}
            benchmarkName={benchmarkName}
            fuss={regler}
            vorschau={regler === undefined ? undefined : anschluss}
            drawdown={drawdownMarke}
          />
        )}
      </TabsContent>
    </div>
  );
}

/** Im Popover statt im Menue: ein Link in einem `menuitem` waere ein Ziel im Ziel. */
function BenchmarkQuelle({ isin, name }: { readonly isin: string; readonly name: string }) {
  if (isin !== RISIKOFREI_ISIN) {
    return (
      <OnvistaLink isin={isin} name={name}>
        {isin}
      </OnvistaLink>
    );
  }
  return (
    <a
      href="https://data.ecb.europa.eu/" /* INV-AUSNAHME: feste Adresse, kein Wert — ADR-021 */
      target="_blank"
      rel="noopener noreferrer"
      aria-label={de.verlauf.risikofreiOeffnen}
      className={cn(linkVariants(), 'inline-flex items-center gap-0.5 text-xs text-text-leise')}
    >
      {de.verlauf.risikofreiKurz}
      <ArrowUpRight aria-hidden="true" className="size-3" />
    </a>
  );
}
