/*
 * Gewinne & Abzüge, Buchungen: welche Liste hinter einem Knoten des Sankey oder der
 * Summe „Realisierte Gewinne“ steht. Eine Position zeigt ihre realisierten Verkaeufe; ihr
 * Buchgewinn hat keine Buchung.
 */

import { de } from '@/i18n/de';
import type { KennzahlenAntwort } from '@/lib/api';
import {
  KennzahlDetailsDialog,
  ertragsZeilenAlsDetails,
  realisierteZeilenAlsDetails,
} from '@/features/kennzahlen/KennzahlDetailsDialog';

export type Auswahl =
  | { readonly art: 'realisiert' | 'ertraege' | 'steuern' | 'gebuehren' }
  | { readonly art: 'position'; readonly isin: string; readonly name: string }
  | { readonly art: 'uebrige'; readonly isins: readonly string[]; readonly name: string };

function inhalt(a: Auswahl, d: KennzahlenAntwort) {
  switch (a.art) {
    case 'realisiert':
      return {
        titel: de.kennzahlen.realisiert,
        spalteMitte: de.kennzahlen.detailsSpaltePosition,
        zeilen: realisierteZeilenAlsDetails(d.realisierteVerkaeufe),
      };
    case 'position':
      return {
        titel: a.name,
        spalteMitte: de.kennzahlen.detailsSpaltePosition,
        zeilen: realisierteZeilenAlsDetails(d.realisierteVerkaeufe.filter((z) => z.isin === a.isin)),
        leer: de.gewinnquellen.nichtsRealisiert,
      };
    case 'uebrige':
      return {
        titel: a.name,
        spalteMitte: de.kennzahlen.detailsSpaltePosition,
        zeilen: realisierteZeilenAlsDetails(d.realisierteVerkaeufe.filter((z) => a.isins.includes(z.isin))),
        leer: de.gewinnquellen.nichtsRealisiert,
      };
    case 'ertraege':
      return {
        titel: de.gewinnquellen.ertraege,
        spalteMitte: de.kennzahlen.detailsSpalteWofuer,
        zeilen: ertragsZeilenAlsDetails(d.zinsenTransaktionen),
      };
    case 'steuern':
      return {
        titel: de.gewinnquellen.steuern,
        spalteMitte: de.kennzahlen.detailsSpalteWofuer,
        zeilen: ertragsZeilenAlsDetails(d.steuernTransaktionen),
      };
    case 'gebuehren':
      return {
        titel: de.gewinnquellen.gebuehren,
        spalteMitte: de.kennzahlen.detailsSpalteWofuer,
        zeilen: ertragsZeilenAlsDetails(d.gebuehrenTransaktionen),
      };
  }
}

export function GewinnquellenBuchungen({
  daten,
  auswahl,
  onSchliessen,
}: {
  readonly daten: KennzahlenAntwort;
  readonly auswahl: Auswahl | null;
  readonly onSchliessen: () => void;
}) {
  const aktiv = auswahl === null ? null : inhalt(auswahl, daten);
  return (
    <KennzahlDetailsDialog
      titel={aktiv?.titel ?? ''}
      spalteMitte={aktiv?.spalteMitte ?? de.kennzahlen.detailsSpaltePosition}
      zeilen={aktiv?.zeilen ?? null}
      leer={aktiv?.leer}
      onOpenChange={(offen) => {
        if (!offen) onSchliessen();
      }}
    />
  );
}
