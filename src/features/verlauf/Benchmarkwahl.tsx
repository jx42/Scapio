/*
 * Die Dropdown-Auswahl fuer den Vergleichs-Benchmark, im Kachelkopf links vom
 * Vermoegen/Rendite-Schalter. Immer hoechstens eine Auswahl; ein erneuter Klick auf den
 * gewaehlten Eintrag schaltet den Vergleich aus. Der Knopf zeigt "Vergleich" oder den Namen
 * des gewaehlten Benchmarks, dazu den Punkt in der Linienfarbe als Legende. Jeder Eintrag nennt
 * den Abstand des Depots zu ihm im gezeigten Fenster, damit man nicht erst durchklicken muss.
 * Name, Abstand und ISIN stehen in einem Raster ueber alle Eintraege (subgrid): Betraege
 * rechtsbuendig, ISINs linksbuendig, jede Spalte mit durchgehender Kante.
 *
 * Die Eintraege tragen keinen Link: ein Link im menuitem ist verschachtelte Bedienung
 * (WCAG 4.1.2). Der Link zum gewaehlten Vergleich steht in dessen Erklaerung (VerlaufAnsicht).
 */

import { ChevronDownIcon } from 'lucide-react';

import { de } from '@/i18n/de';
import { BENCHMARKS, RISIKOFREI, RISIKOFREI_ISIN, type VergleichAbstand } from '@/lib/api';
import { betragOhneVorzeichen, euroAusCent, prozent } from '@/lib/format';
import { RichtungsBadge } from '@/components/RichtungsBadge';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { triggerVariants } from '@/components/ui/trigger';

export type BenchmarkwahlProps = {
  readonly gewaehlt: string | null;
  readonly onWahl: (isin: string | null) => void;
  /** Der risikofreie Zins ist nur im Rendite-Tab waehlbar — als Depotwert-Linie waere die
   * simulierte Zinskurve kaum von einer Geraden zu unterscheiden (ADR-026). */
  readonly zeigeRisikofrei: boolean;
  /** Aus `/api/zeitreihe`; ein Vergleich ohne Kurse fehlt darin. */
  readonly abstaende: readonly VergleichAbstand[];
  /** Euro bei "vermoegen", Prozent bei "rendite" — wie die Kopfzeile. */
  readonly inProzent: boolean;
};

export function Benchmarkwahl({ gewaehlt, onWahl, zeigeRisikofrei, abstaende, inProzent }: BenchmarkwahlProps) {
  // ETFs alphabetisch, der risikofreie Zins zuletzt — er ist kein ETF, sondern die Basis der
  // Sharpe-Ratio (`core/risiko.ts`), siehe ADR-026.
  const etfs = BENCHMARKS.toSorted((a, b) => a.name.localeCompare(b.name, 'de'));
  const eintraege = zeigeRisikofrei ? [...etfs, RISIKOFREI] : etfs;
  const name = eintraege.find((benchmark) => benchmark.isin === gewaehlt)?.name;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={triggerVariants({ aktiv: name !== undefined })}>
        {name === undefined ? null : <span aria-hidden="true" className="size-2 rounded-full bg-chart-4" />}
        {name ?? de.verlauf.benchmark}
        <ChevronDownIcon aria-hidden="true" className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="grid grid-cols-[1fr_auto_auto]">
        {eintraege.map((benchmark) => {
          const abstand = abstaende.find((a) => a.isin === benchmark.isin);
          return (
            <DropdownMenuCheckboxItem
              key={benchmark.isin}
              checked={benchmark.isin === gewaehlt}
              punkt="bg-chart-4"
              className="col-span-3 grid grid-cols-subgrid gap-x-4"
              onCheckedChange={(an) => {
                onWahl(an ? benchmark.isin : null);
              }}
            >
              <span>{benchmark.name}</span>
              <span className="justify-self-end">
                {abstand === undefined ? null : (
                  <RichtungsBadge wert={abstand.differenzCent}>
                    {inProzent
                      ? de.satz.mitNebenwert(
                          betragOhneVorzeichen(abstand.differenzProzent, prozent),
                          betragOhneVorzeichen(abstand.differenzCent, euroAusCent),
                        )
                      : de.satz.mitNebenwert(
                          betragOhneVorzeichen(abstand.differenzCent, euroAusCent),
                          betragOhneVorzeichen(abstand.differenzProzent, prozent),
                        )}
                  </RichtungsBadge>
                )}
              </span>
              <span className="text-xs text-text-leise tabular-nums">
                {benchmark.isin === RISIKOFREI_ISIN ? de.verlauf.risikofreiKurz : benchmark.isin}
              </span>
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
