/*
 * Kachel 4, Ansicht: der Blick durch die ETFs auf die Unternehmen dahinter.
 *
 * Eine Tabelle, alle 25 Zeilen untereinander. Die Spalte "Enthalten in" zeigt direkt,
 * aus welchen Fonds das Exposure stammt. Unter `sm` bliebe ihr neben den festen Spalten
 * keine Breite — dort steht die Fondsliste klein unter dem Namen.
 */

import { ChevronDown } from 'lucide-react';

import { de } from '@/i18n/de';
import type { UnternehmenZeile } from '@/lib/api';
import { euroAusCent, prozent, zahl } from '@/lib/format';
import { useGespeicherterSchalter } from '@/lib/speicher';
import { cn } from '@/lib/utils';
import { useZahlZaehler } from '@/hooks/useZahlZaehler';
import { LeerZustand } from '@/components/Zustaende';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const STANDARD_ANZAHL = 10;

export type Top25AnsichtProps = {
  readonly zeilen: readonly UnternehmenZeile[];
};

export function Top25Ansicht({ zeilen }: Top25AnsichtProps) {
  // Radix' CollapsibleTrigger setzt aria-expanded und aria-controls selbst.
  const [ausgeklappt, setAusgeklappt] = useGespeicherterSchalter('top25Ausgeklappt', false);
  if (zeilen.length === 0) return <LeerZustand text={de.top25.leer} />;

  // Zwei feste Haelften statt einer Sichtbarkeitsliste, die danach nochmal geteilt wird:
  // die obere steht immer, die untere haengt am Aufklappen. Beide Seiten schneiden genau
  // einmal, und `letzte` bezeichnet die tatsaechlich letzte gezeigte Zeile — sie steht in
  // der Tabellenbeschriftung fuer Screenreader.
  const kopfZeilen = zeilen.slice(0, STANDARD_ANZAHL);
  const restZeilen = ausgeklappt ? zeilen.slice(STANDARD_ANZAHL) : [];
  const erste = zeilen[0];
  const letzte = restZeilen.at(-1) ?? kopfZeilen.at(-1);
  if (erste === undefined || letzte === undefined) return null;
  const beschriftung = de.top25.tabelle(zahl(erste.rang), zahl(letzte.rang));

  return (
    <div className="flex flex-col gap-4">
      <Collapsible open={ausgeklappt} onOpenChange={setAusgeklappt}>
        <Table
          className="table-fixed"
          bereich={beschriftung}
          innen={cn(!ausgeklappt && zeilen.length > STANDARD_ANZAHL && 'ausblenden-unten')}
        >
          <TableCaption className="sr-only">{beschriftung}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="h-auto w-10 py-1 pr-1 font-normal sm:w-12">
                {de.top25.spalteRang}
              </TableHead>
              <TableHead scope="col" className="h-auto py-1 pr-2 font-normal sm:w-80">
                {de.top25.spalteName}
              </TableHead>
              <TableHead scope="col" className="h-auto w-20 py-1 px-1 text-right font-normal sm:w-28">
                {de.top25.spalteExposure}
              </TableHead>
              <TableHead scope="col" className="h-auto w-20 py-1 px-1 text-right font-normal">
                {de.top25.spalteAnteil}
              </TableHead>
              <TableHead scope="col" className="hidden h-auto py-1 px-1 font-normal sm:table-cell">
                {de.top25.spalteEtfs}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {kopfZeilen.map((z) => <Top25Zeile key={z.isin === '' ? z.name : z.isin} zeile={z} />)}
          </TableBody>
          <CollapsibleContent asChild>
            <TableBody>
              {restZeilen.map((z) => <Top25Zeile key={z.isin === '' ? z.name : z.isin} zeile={z} />)}
            </TableBody>
          </CollapsibleContent>
        </Table>
        {zeilen.length <= STANDARD_ANZAHL ? null : (
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="mt-0">
              <ChevronDown className={cn('transition-transform', ausgeklappt && 'rotate-180')} aria-hidden="true" />
              {ausgeklappt ? de.top25.wenigerZeigen : de.top25.mehrZeigen}
            </Button>
          </CollapsibleTrigger>
        )}
      </Collapsible>
    </div>
  );
}

function Top25Zeile({ zeile }: { readonly zeile: UnternehmenZeile }) {
  const angezeigterRang = useZahlZaehler(zahl(zeile.rang));
  const angezeigtesExposure = useZahlZaehler(euroAusCent(zeile.exposureCent));
  const angezeigterAnteil = useZahlZaehler(prozent(zeile.anteilDepot));
  const fonds = de.top25.fondsListe(zeile.ausFonds.map((f) => f.name ?? f.isin));
  return (
    <TableRow key={zeile.isin === '' ? zeile.name : zeile.isin}>
      <TableCell className="py-1 pr-1 tabular-nums text-text-leise">{angezeigterRang}</TableCell>
      <TableHead scope="row" className="h-auto min-w-0 py-1 pr-2 text-sm font-normal whitespace-normal">
        <span className="block max-w-full break-words text-text">
          {zeile.name}
        </span>
        <span className="block break-words text-xs text-text-leise sm:hidden">{fonds}</span>
      </TableHead>
      <TableCell className="py-1 px-1 text-right tabular-nums text-text">
        {angezeigtesExposure}
      </TableCell>
      <TableCell className="py-1 px-1 text-right tabular-nums text-text-leise">
        {angezeigterAnteil}
      </TableCell>
      <TableCell className="hidden py-1 px-1 text-text-leise sm:table-cell">
        <span className="block break-words">
          {fonds}
        </span>
      </TableCell>
    </TableRow>
  );
}
