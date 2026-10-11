import { de } from '@/i18n/de';
import type { Sparplan } from '@/lib/api';
import { euroAusCent, tagImMonat } from '@/lib/format';
import { useZahlZaehler } from '@/hooks/useZahlZaehler';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const FREQUENZEN: Readonly<Record<string, string>> = de.frequenz;

/** Bekannte Rhythmen deutsch, unbekannte unveraendert — Fremdtext, nur als Text. [INV-06] */
function rhythmus(plan: Sparplan): string {
  const uebersetzt = FREQUENZEN[plan.frequenz.toUpperCase()] ?? plan.frequenz;
  if (plan.tagImMonat === null) return uebersetzt;
  return `${uebersetzt}, ${de.sparplaene.amTag(tagImMonat(plan.tagImMonat))}`;
}

export type SparplanListeProps = {
  readonly plaene: readonly Sparplan[];
  readonly summeCent: number;
};

export function SparplanListe({ plaene, summeCent }: SparplanListeProps) {
  const angezeigteSumme = useZahlZaehler(euroAusCent(summeCent));
  return (
    <div className="-mx-2">
      <Table className="table-fixed">
        <TableCaption className="sr-only">{de.sparplaene.tabelle}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className="h-auto whitespace-normal py-1 pr-2 font-normal">
              {de.sparplaene.spaltePlan}
            </TableHead>
            <TableHead scope="col" className="h-auto w-24 py-1 text-right font-normal">
              {de.sparplaene.spalteBetrag}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plaene.map((p) => (
            <SparplanZeile key={p.isin === '' ? p.name : p.isin} plan={p} />
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="border-0">
            <TableHead scope="row" className="h-auto py-1 pr-2 text-sm">
              {de.sparplaene.summe}
            </TableHead>
            <TableCell className="py-1 text-right tabular-nums text-text">
              {angezeigteSumme}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

/** Eigene Komponente, weil `useZahlZaehler` als Hook nicht in der `.map()`-Schleife stehen darf. */
function SparplanZeile({ plan }: { readonly plan: Sparplan }) {
  const angezeigterBetrag = useZahlZaehler(euroAusCent(plan.betragCent));
  return (
    <TableRow>
      <TableHead scope="row" className="h-auto whitespace-normal py-1 pr-2 text-sm font-normal">
        <span className="block break-words text-text">{plan.name}</span>
        <span className="block text-xs text-text-leise">{rhythmus(plan)}</span>
      </TableHead>
      <TableCell className="py-1 text-right tabular-nums text-text">{angezeigterBetrag}</TableCell>
    </TableRow>
  );
}
