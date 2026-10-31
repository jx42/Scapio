/*
 * Reiter Analyse, dritte Spalte unter der Treemap: der Blick durch die ETFs auf die Unternehmen dahinter.
 *
 * Kompakt: eine Zeile je Unternehmen, Prozent vor Euro wie in den Legenden der Ringe. Die Fonds
 * stehen nur in der Hover-Karte und, für Screenreader, verborgen in der Zeile. Namen werden in der
 * Drittelbreite gekürzt; ungekürzt stehen sie in der Hover-Karte und der Tabelle der Treemap.
 * „Mehr zeigen“ hält `AnalyseAnsicht` für alle drei Spalten.
 */

import { memo } from 'react';

import { de } from '@/i18n/de';
import type { UnternehmenZeile } from '@/lib/api';
import { anteilProzent, euroAusCent, zahl } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useZahlZaehler } from '@/hooks/useZahlZaehler';
import { LeerZustand } from '@/components/Zustaende';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ANALYSE_ZEILEN } from './AnalyseSpalte';

/** Schlüssel eines Unternehmens für die Kopplung mit der Treemap; ohne ISIN der Name. */
export function unternehmenSchluessel(zeile: UnternehmenZeile): string {
  return zeile.isin === '' ? zeile.name : zeile.isin;
}

export type Top25AnsichtProps = {
  /** Ziel von `aria-controls` des gemeinsamen „Mehr zeigen“. */
  readonly id: string;
  readonly zeilen: readonly UnternehmenZeile[];
  readonly ausgeklappt: boolean;
  readonly hervorgehoben: string | null;
  readonly onHover: (schluessel: string | null) => void;
};

/**
 * Wie die Kopfzeile der Legenden daneben; die Zeilen erben deren Schrift statt `text-sm` der Tabelle.
 * So stehen Kopf und Zeilen über alle drei Spalten auf einer Linie.
 */
const KOPF = 'h-auto pt-0 pb-2';

export const Top25Ansicht = memo(function Top25Ansicht({ id, zeilen, ausgeklappt, hervorgehoben, onHover }: Top25AnsichtProps) {
  if (zeilen.length === 0) return <LeerZustand text={de.top25.leer} />;

  const anzahl = ausgeklappt ? zeilen.length : Math.min(ANALYSE_ZEILEN, zeilen.length);
  const alleSichtbar = anzahl >= zeilen.length;
  // Eine Zeile mehr, angeschnitten unter der Blende.
  const gezeigt = zeilen.slice(0, anzahl + 1);
  const erste = zeilen[0];
  const letzte = zeilen[anzahl - 1];
  if (erste === undefined || letzte === undefined) return null;
  const beschriftung = de.top25.tabelle(zahl(erste.rang), zahl(letzte.rang));

  return (
    <Table id={id} className="table-fixed text-[length:inherit] leading-[inherit]" bereich={beschriftung} innen={cn(!alleSichtbar && 'ausblenden-unten')}>
      <TableCaption className="sr-only">{beschriftung}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col" className={cn(KOPF, 'w-6 pr-1')}>
            <span aria-hidden="true">{de.top25.spalteRangKurz}</span>
            <span className="sr-only">{de.top25.spalteRang}</span>
          </TableHead>
          <TableHead scope="col" className={cn(KOPF, 'pr-2')}>
            {de.top25.spalteName}
          </TableHead>
          <TableHead scope="col" className={cn(KOPF, 'w-14 pl-1 text-right')}>
            {de.top25.spalteAnteil}
          </TableHead>
          <TableHead scope="col" className={cn(KOPF, 'w-24 pl-1 text-right')}>
            {de.top25.spalteExposure}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {gezeigt.map((z, i) => (
          <Top25Zeile
            key={unternehmenSchluessel(z)}
            zeile={z}
            angeschnitten={i >= anzahl}
            aktiv={hervorgehoben === unternehmenSchluessel(z)}
            onHover={onHover}
          />
        ))}
      </TableBody>
    </Table>
  );
});

type Top25ZeileProps = {
  readonly zeile: UnternehmenZeile;
  /** Unter der Blende: angedeutet, aber ohne Fokus. [WCAG 2.4.11] */
  readonly angeschnitten: boolean;
  readonly aktiv: boolean;
  readonly onHover: (schluessel: string | null) => void;
};

function Top25Zeile({ zeile, angeschnitten, aktiv, onHover }: Top25ZeileProps) {
  const angezeigterRang = useZahlZaehler(zahl(zeile.rang));
  const angezeigtesExposure = useZahlZaehler(euroAusCent(zeile.exposureCent));
  const angezeigterAnteil = useZahlZaehler(anteilProzent(zeile.anteilDepot));
  const fonds = de.top25.fondsListe(zeile.ausFonds.map((f) => f.name ?? f.isin));
  return (
    <TableRow
      inert={angeschnitten}
      data-aktiv={aktiv ? '' : undefined}
      onMouseEnter={() => onHover(unternehmenSchluessel(zeile))}
      onMouseLeave={() => onHover(null)}
    >
      <TableCell className="py-2 pr-1 align-top tabular-nums text-text-leise">{angezeigterRang}</TableCell>
      <TableHead scope="row" className="h-auto min-w-0 py-2 pr-2 text-[length:inherit] font-normal">
        <HoverCard openDelay={150} closeDelay={100}>
          <HoverCardTrigger asChild>
            <span className="block truncate text-text">{zeile.name}</span>
          </HoverCardTrigger>
          <HoverCardContent side="top" align="start" aria-hidden="true">
            <p className="font-medium text-text">{zeile.name}</p>
            <p>{fonds}</p>
          </HoverCardContent>
        </HoverCard>
        <span className="sr-only">{de.top25.fondsHinweis(fonds)}</span>
      </TableHead>
      <TableCell className="py-2 pl-1 text-right align-top tabular-nums text-text-leise">{angezeigterAnteil}</TableCell>
      <TableCell className="py-2 pl-1 text-right align-top tabular-nums text-text">{angezeigtesExposure}</TableCell>
    </TableRow>
  );
}
