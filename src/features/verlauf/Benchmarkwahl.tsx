/*
 * Die Dropdown-Auswahl fuer den Vergleichs-Benchmark, im Kachelkopf links vom
 * Vermoegen/Rendite-Schalter. Immer hoechstens eine Auswahl; ein erneuter Klick auf den
 * gewaehlten Eintrag schaltet den Vergleich aus. Der Knopf zeigt "Vergleich" oder den Namen
 * des gewaehlten Benchmarks, dazu den Punkt in der Linienfarbe als Legende.
 *
 * Die Eintraege tragen keinen Link: ein Link im menuitem ist verschachtelte Bedienung
 * (WCAG 4.1.2). Der Link zum gewaehlten Vergleich steht in dessen Erklaerung (VerlaufAnsicht).
 */

import { ChevronDownIcon } from 'lucide-react';

import { de } from '@/i18n/de';
import { BENCHMARKS, RISIKOFREI, RISIKOFREI_ISIN } from '@/lib/api';
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
};

export function Benchmarkwahl({ gewaehlt, onWahl, zeigeRisikofrei }: BenchmarkwahlProps) {
  // ETFs zuerst, der risikofreie Zins zuletzt — er ist kein ETF, sondern die Basis der
  // Sharpe-Ratio (`core/risiko.ts`), siehe ADR-026.
  const eintraege = zeigeRisikofrei ? [...BENCHMARKS, RISIKOFREI] : BENCHMARKS;
  const name = eintraege.find((benchmark) => benchmark.isin === gewaehlt)?.name;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={triggerVariants({ aktiv: name !== undefined })}>
        {name === undefined ? null : <span aria-hidden="true" className="size-2 rounded-full bg-chart-4" />}
        {name ?? de.verlauf.benchmark}
        <ChevronDownIcon aria-hidden="true" className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {eintraege.map((benchmark) => (
          <DropdownMenuCheckboxItem
            key={benchmark.isin}
            checked={benchmark.isin === gewaehlt}
            punkt="bg-chart-4"
            onCheckedChange={(an) => {
              onWahl(an ? benchmark.isin : null);
            }}
            rechts={benchmark.isin === RISIKOFREI_ISIN ? de.verlauf.risikofreiKurz : benchmark.isin}
          >
            {benchmark.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
