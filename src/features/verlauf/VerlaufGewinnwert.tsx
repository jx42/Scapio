/*
 * Kachel 1, beschrifteter Gewinnwert der Kopfzeile (Betrag, Prozent, Richtung, Erklaerung).
 */

import type { ReactNode } from 'react';

import { useZahlZaehler } from '@/hooks/useZahlZaehler';
import { InfoKnopf } from '@/components/InfoKnopf';
import { RichtungsBadge } from '@/components/RichtungsBadge';

export type GewinnwertProps = {
  readonly bezeichnung: string;
  readonly erklaerung: string;
  readonly betrag: string;
  /** Prozentwert in Klammern hinter dem Betrag, oder `null`. */
  readonly prozentwert: string | null;
  /** Vorzeichen des Betrags; `betrag` und `prozentwert` stehen ohne. */
  readonly wert: number;
  /** Prozent vor dem Betrag in Klammern, wie der Tooltip in der Rendite-Ansicht. */
  readonly prozentVorn: boolean;
  /** Quelle hinter der Zahl, unter der Erklaerung im Popover. */
  readonly quelle?: ReactNode;
};

/**
 * Beschrifteter Gewinnwert mit Erklaerung in der Kopfzeile.
 *
 * Die Beschriftung ist kein Schmuck: unbeschriftet neben dem Depotwert las sich diese
 * Zahl als der "Kursgewinn" aus der Karte darueber und wich doch von ihm ab, weil sie
 * Cash, Ertraege, Steuern und Gebuehren mitzaehlt. Name und Erklaerung stehen jetzt
 * an der Zahl selbst. [ADR-016]
 *
 * Gleiche Darstellung in beiden Modi: der Gesamtgewinn ist dieselbe Kennzahl,
 * ob als Nebenwert neben dem Depotwert (Vermoegen) oder als Kopfzahl (Rendite).
 */
export function Gewinnwert({
  bezeichnung,
  erklaerung,
  betrag,
  prozentwert,
  wert,
  prozentVorn,
  quelle,
}: GewinnwertProps) {
  const angezeigterBetrag = useZahlZaehler(betrag);
  const angezeigterProzentwert = useZahlZaehler(prozentwert ?? '');
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="text-sm text-text-leise">{`${bezeichnung}:`}</span>
      <RichtungsBadge wert={wert}>
        {prozentwert === null
          ? angezeigterBetrag
          : prozentVorn
            ? `${angezeigterProzentwert} (${angezeigterBetrag})`
            : `${angezeigterBetrag} (${angezeigterProzentwert})`}
      </RichtungsBadge>
      <InfoKnopf bezeichnung={bezeichnung}>
        <p>{erklaerung}</p>
        {quelle === undefined ? null : <p className="mt-2">{quelle}</p>}
      </InfoKnopf>
    </span>
  );
}
