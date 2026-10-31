/*
 * Die Buchungen hinter einem Knoten des Sankey (`GewinnquellenBuchungen`).
 *
 * Eine echte Tabelle, keine Liste aus <div>: eine Vorlesehilfe sagt Datum, Bezug und
 * Betrag als Zeile an. `zeilen` kommt bereits fertig aufbereitet herein: hier wird
 * nicht gerechnet, nur formatiert und gerendert.
 */

import { de } from '@/i18n/de';
import type { ErtragsZeile, RealisierteZeile } from '@/lib/api';
import { datumKurz, euroAusCent, vorzeichen } from '@/lib/format';
import { richtungTon } from '@/lib/farben';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type DetailZeile = {
  readonly txId: string;
  readonly tag: string;
  /** Fettgedruckte Hauptzeile der mittleren Spalte. */
  readonly haupt: string;
  /** Kleine graue Unterzeile darunter, sofern vorhanden. */
  readonly neben: string | null;
  readonly betragCent: number;
};

export type KennzahlDetailsDialogProps = {
  readonly titel: string;
  readonly zeilen: readonly DetailZeile[] | null;
  /** Kopf der mittleren Spalte: "Wofür" bei Ertraegen, "Position" bei Verkaeufen. */
  readonly spalteMitte: string;
  /** Text bei leerer Liste; ohne Angabe `de.kennzahlen.detailsLeer`. */
  readonly leer?: string | undefined;
  readonly onOpenChange: (offen: boolean) => void;
};

/** `tx.typ`, roh von der Bank — bekannte Werte deutsch, alles andere unveraendert. [INV-06] */
function typLabel(typ: string): string {
  return de.kennzahlen.ertragsTyp[typ.toUpperCase() as keyof typeof de.kennzahlen.ertragsTyp] ?? typ;
}

/**
 * Worauf sich die Buchung bezieht, als Text. Steht ein Wertpapier dahinter, nennt die
 * Zeile es beim Namen; Zinsen auf Cash nennen das Verrechnungskonto. Fehlt der Bezug in
 * der Antwort der Bank, sagt die Zeile genau das — geraten wird nichts. [P-08]
 */
function bezugLabel(z: ErtragsZeile): string {
  if (z.bezug === 'wertpapier') return z.name ?? de.kennzahlen.bezugUnbekannt;
  if (z.bezug === 'verrechnungskonto') return de.kennzahlen.bezugVerrechnungskonto;
  return de.kennzahlen.bezugUnbekannt;
}

/**
 * Bei Ertraegen und Steuern ist der Typ (Zinsen, Steuerabzug, ...) die Kategorie und der
 * Bezug (ETF-Name, Verrechnungskonto) die konkrete Angabe dazu — deshalb steht der Typ
 * fett oben, der Bezug klein darunter.
 */
export function ertragsZeilenAlsDetails(zeilen: readonly ErtragsZeile[]): DetailZeile[] {
  return zeilen.map((z) => ({
    txId: z.txId,
    tag: z.tag,
    haupt: typLabel(z.typ),
    neben: bezugLabel(z),
    betragCent: z.betragCent,
  }));
}

/**
 * Bei realisierten Verkaeufen ist es umgekehrt: der ETF-Name unterscheidet die Zeilen,
 * "Realisierter Verkauf" steht bei jeder Zeile gleich und gehoert deshalb klein darunter.
 */
export function realisierteZeilenAlsDetails(zeilen: readonly RealisierteZeile[]): DetailZeile[] {
  return zeilen.map((z) => ({
    txId: z.txId,
    tag: z.tag,
    haupt: z.name,
    neben: de.kennzahlen.realisierterVerkauf,
    betragCent: z.gewinnCent,
  }));
}

export function KennzahlDetailsDialog({ titel, zeilen, spalteMitte, leer, onOpenChange }: KennzahlDetailsDialogProps) {
  return (
    <Dialog open={zeilen !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titel}</DialogTitle>
          <DialogDescription className="sr-only">{de.kennzahlen.detailsBeschreibung(titel)}</DialogDescription>
        </DialogHeader>
        <Table>
          <TableCaption className="sr-only">{titel}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{de.kennzahlen.detailsSpalteDatum}</TableHead>
              <TableHead scope="col">{spalteMitte}</TableHead>
              <TableHead scope="col" className="text-right">
                {de.kennzahlen.detailsSpalteBetrag}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {zeilen !== null && zeilen.length === 0 ? (
              <TableRow data-ruhig="">
                <TableCell colSpan={3} className="py-4 text-center text-text-leise">
                  {leer ?? de.kennzahlen.detailsLeer}
                </TableCell>
              </TableRow>
            ) : (
              zeilen?.map((z) => {
                const richtung = vorzeichen(z.betragCent);
                return (
                  <TableRow key={z.txId}>
                    <TableCell className="whitespace-nowrap align-top">{datumKurz(z.tag)}</TableCell>
                    <TableCell className="align-top">
                      <span>{z.haupt}</span>
                      {z.neben === null ? null : <span className="block text-xs text-text-leise">{z.neben}</span>}
                    </TableCell>
                    <TableCell
                      className={cn('text-right whitespace-nowrap align-top', richtungTon[richtung.richtung])}
                    >
                      {euroAusCent(z.betragCent, true)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
