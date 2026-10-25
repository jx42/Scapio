/*
 * Kachel 4, linke Hälfte: der Blick durch die ETFs auf die Unternehmen dahinter.
 *
 * Kompakt: eine Zeile je Unternehmen, Prozent vor Euro wie in den Legenden der Ringe. Die Fonds stehen nur in der Hover-Karte und, für Screenreader, verborgen in der Zeile.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { de } from '@/i18n/de';
import type { UnternehmenZeile } from '@/lib/api';
import { anteilProzent, euroAusCent, zahl } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useZahlZaehler } from '@/hooks/useZahlZaehler';
import { LeerZustand } from '@/components/Zustaende';
import { Button } from '@/components/ui/button';
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

/** Ohne Nachbarhöhe (schmal, oder ausgeklappt nebenan nicht messbar) gilt eine feste Anzahl. */
const STANDARD_ANZAHL = 10;

export type Top25AnsichtProps = {
  readonly zeilen: readonly UnternehmenZeile[];
  /** Die Kachel hat die Höhe von Länder & Sektoren — dann so viele Zeilen, wie hineinpassen. */
  readonly gebunden: boolean;
  readonly ausgeklappt: boolean;
  readonly onAusgeklapptAendern: (ausgeklappt: boolean) => void;
};

export function Top25Ansicht({ zeilen, gebunden, ausgeklappt, onAusgeklapptAendern }: Top25AnsichtProps) {
  const rahmenRef = useRef<HTMLDivElement>(null);
  const [passend, setPassend] = useState(STANDARD_ANZAHL);
  const messen = gebunden && !ausgeklappt;

  // Wie in KennzahlenAnsicht: alle Zeilen bleiben im DOM, damit sich bei wachsender Nachbarkachel
  // neu messen lässt; die erste nicht mehr ganz passende bleibt angeschnitten unter der Maske.
  useLayoutEffect(() => {
    const rahmen = rahmenRef.current;
    if (!messen || rahmen === null) return undefined;
    const anpassen = () => {
      const unterkante = rahmen.getBoundingClientRect().bottom + 0.5;
      const knoten = rahmen.querySelectorAll<HTMLElement>('tbody tr');
      let anzahl = knoten.length;
      for (let i = 0; i < knoten.length; i++) {
        if (knoten[i]!.getBoundingClientRect().bottom > unterkante) {
          anzahl = i;
          break;
        }
      }
      setPassend(Math.max(1, anzahl));
    };
    anpassen();
    const beobachter = new ResizeObserver(anpassen);
    beobachter.observe(rahmen);
    return () => beobachter.disconnect();
  }, [messen, zeilen.length]);

  if (zeilen.length === 0) return <LeerZustand text={de.top25.leer} />;

  const anzahl = ausgeklappt ? zeilen.length : Math.min(messen ? passend : STANDARD_ANZAHL, zeilen.length);
  const alleSichtbar = anzahl >= zeilen.length;
  // Gemessen stehen alle Zeilen im Baum (unsichtbar ab der angeschnittenen), sonst eine angeschnittene mehr.
  const gezeigt = messen ? zeilen : zeilen.slice(0, anzahl + 1);
  const erste = zeilen[0];
  const letzte = zeilen[anzahl - 1];
  if (erste === undefined || letzte === undefined) return null;
  const beschriftung = de.top25.tabelle(zahl(erste.rang), zahl(letzte.rang));

  return (
    <div className={cn('flex flex-col', messen && 'h-full min-h-0')}>
      {/* `-mx-2 px-2`: Platz für den gerundeten Zeilen-Hover, den `overflow-hidden` sonst abschneidet. */}
      <div ref={rahmenRef} className={cn(messen && '-mx-2 min-h-0 flex-1 overflow-hidden px-2')}>
        <Table className="table-fixed" bereich={beschriftung} innen={cn(!alleSichtbar && 'ausblenden-unten')}>
          <TableCaption className="sr-only">{beschriftung}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="h-auto w-10 py-1 pr-1 font-normal sm:w-12">
                {de.top25.spalteRang}
              </TableHead>
              <TableHead scope="col" className="h-auto py-1 pr-2 font-normal">
                {de.top25.spalteName}
              </TableHead>
              <TableHead scope="col" className="h-auto w-14 py-1 pl-1 text-right font-normal">
                {de.top25.spalteAnteil}
              </TableHead>
              <TableHead scope="col" className="h-auto w-24 py-1 pl-1 text-right font-normal">
                {de.top25.spalteExposure}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {gezeigt.map((z, i) => (
              <Top25Zeile
                key={z.isin === '' ? z.name : z.isin}
                zeile={z}
                unsichtbar={i > anzahl}
                angeschnitten={i >= anzahl}
              />
            ))}
          </TableBody>
        </Table>
      </div>
      {alleSichtbar && !ausgeklappt ? null : (
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={ausgeklappt}
          onClick={() => onAusgeklapptAendern(!ausgeklappt)}
          className="w-fit"
        >
          <ChevronDown className={cn('transition-transform', ausgeklappt && 'rotate-180')} aria-hidden="true" />
          {ausgeklappt ? de.top25.wenigerZeigen : de.top25.mehrZeigen}
        </Button>
      )}
    </div>
  );
}

type Top25ZeileProps = {
  readonly zeile: UnternehmenZeile;
  readonly unsichtbar: boolean;
  /** Unter der Blende: angedeutet, aber ohne Fokus. [WCAG 2.4.11] */
  readonly angeschnitten: boolean;
};

function Top25Zeile({ zeile, unsichtbar, angeschnitten }: Top25ZeileProps) {
  const angezeigterRang = useZahlZaehler(zahl(zeile.rang));
  const angezeigtesExposure = useZahlZaehler(euroAusCent(zeile.exposureCent));
  const angezeigterAnteil = useZahlZaehler(anteilProzent(zeile.anteilDepot));
  const fonds = de.top25.fondsListe(zeile.ausFonds.map((f) => f.name ?? f.isin));
  return (
    <TableRow className={cn(unsichtbar && 'invisible')} inert={angeschnitten}>
      <TableCell className="py-2 pr-1 align-top tabular-nums text-text-leise">{angezeigterRang}</TableCell>
      <TableHead scope="row" className="h-auto min-w-0 py-2 pr-2 text-sm font-normal whitespace-normal">
        <HoverCard openDelay={150} closeDelay={100}>
          <HoverCardTrigger asChild>
            <span className="block break-words text-text">{zeile.name}</span>
          </HoverCardTrigger>
          <HoverCardContent side="top" align="start" aria-hidden="true">
            {fonds}
          </HoverCardContent>
        </HoverCard>
        <span className="sr-only">{de.top25.fondsHinweis(fonds)}</span>
      </TableHead>
      <TableCell className="py-2 pl-1 text-right align-top tabular-nums text-text-leise">{angezeigterAnteil}</TableCell>
      <TableCell className="py-2 pl-1 text-right align-top tabular-nums text-text">{angezeigtesExposure}</TableCell>
    </TableRow>
  );
}
