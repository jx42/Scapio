/*
 * Eine Zeile der Kennzahlen-Kachel.
 *
 * Sie rendert <tr> mit <th scope="row">, weil die Kennzahlen eine Tabelle sind und
 * keine Ansammlung von Kaesten — ein Screenreader liest dann Bezeichnung und Wert als
 * Paar. Die Erklaerung haengt an einem echten Knopf und ist damit mit der Tastatur
 * erreichbar und oeffnet ein Popover, auch per Tippen. [P-06]
 *
 * `anmerkung` steht im selben Popover wie `erklaerung`, nicht als eigener, staendig
 * sichtbarer Text unter dem Wert — sonst waere die Zahlentafel bei jedem fehlenden
 * Wert von Fliesstext ueberladen.
 *
 * `onDetails` macht den Wert selbst zu einem echten Knopf (nicht ein div mit
 * onClick), damit die Transaktionsliste dahinter auch mit der Tastatur erreichbar ist.
 *
 * Vertrag: <Kennzahlzeile bezeichnung="IZF" wert="11,23 %" nebenwert="+ 12.345,67 €" erklaerung="…" />
 *
 * Alle Werte kommen fertig formatiert herein — hier wird nicht gerechnet und nicht
 * formatiert.
 */

import { de } from '@/i18n/de';
import { type Richtung } from '@/lib/format';
import { richtungTon } from '@/lib/farben';
import { linkVariants } from '@/lib/linkStil';
import { cn } from '@/lib/utils';
import { useZahlZaehler } from '@/hooks/useZahlZaehler';
import { InfoKnopf } from '@/components/InfoKnopf';
import { RichtungsPfeil, TextMitPfeil } from '@/components/RichtungsPfeil';
import { TableCell, TableHead, TableRow } from '@/components/ui/table';

export type KennzahlzeileProps = {
  readonly bezeichnung: string;
  readonly wert: string;
  readonly nebenwert?: string | null;
  readonly erklaerung?: string | null;
  /** Steuert Farbe UND Pfeil — Gewinn nie allein ueber Farbe. */
  readonly richtung?: Richtung;
  /** Pfeilzeichen aus `vorzeichen()`; der Wert daneben steht ohne Vorzeichen. */
  readonly pfeil?: string;
  /** Ein Satz im Erklaerungs-Tooltip: warum eine Zahl fehlt, oder woran sie krankt. */
  readonly anmerkung?: string | null;
  /**
   * `false` fuer einen `nebenwert`, dessen erste Zahl nicht die zaehlenswerte ist
   * (z. B. eine Jahreszahl vor dem eigentlichen Prozentwert) — dort wuerde
   * `useZahlZaehler` die falsche Ziffernfolge hochzaehlen.
   */
  readonly nebenwertAnimiert?: boolean;
  /** Macht den Wert zu einem Knopf, der die zugrundeliegenden Transaktionen zeigt. */
  readonly onDetails?: () => void;
  /** Zusätzliche CSS-Klassen für die Zeile, etwa `invisible` beim Kuerzen in Kennzahlen. */
  readonly className?: string;
  /** Nimmt die Zeile aus Tabulatorreihenfolge und Barrierefreiheitsbaum, solange sie unter der Blende liegt. */
  readonly inert?: boolean;
};

export function Kennzahlzeile({
  bezeichnung,
  wert,
  nebenwert = null,
  erklaerung = null,
  richtung = 'neutral',
  pfeil = '',
  anmerkung = null,
  nebenwertAnimiert = true,
  onDetails,
  className,
  inert,
}: KennzahlzeileProps) {
  const angezeigterWert = useZahlZaehler(wert);
  const gezaehlterNebenwert = useZahlZaehler(nebenwert ?? '');
  const angezeigterNebenwert = nebenwertAnimiert ? gezaehlterNebenwert : (nebenwert ?? '');

  return (
    <TableRow className={cn('group', onDetails !== undefined && 'relative', className)} inert={inert}>
      <TableHead scope="row" className="h-auto py-2 pr-3 align-top text-sm font-normal whitespace-normal">
        <span className="relative z-10 inline-flex items-center gap-1.5">
          {bezeichnung}
          {erklaerung === null && (anmerkung === null || anmerkung === '') ? null : (
            <InfoKnopf bezeichnung={bezeichnung}>
              {erklaerung === null ? null : <p>{erklaerung}</p>}
              {anmerkung === null || anmerkung === '' ? null : (
                <p className={erklaerung === null ? undefined : 'mt-1 text-text-leise'}>
                  <TextMitPfeil text={anmerkung} />
                </p>
              )}
            </InfoKnopf>
          )}
        </span>
      </TableHead>
      <TableCell className="pl-0 py-2 text-right align-top">
        <span
          className={cn(
            'font-medium',
            richtungTon[richtung],
            onDetails !== undefined && linkVariants({ abstand: 'weit', hover: 'gruppe' }),
          )}
        >
          <RichtungsPfeil pfeil={pfeil} className="mr-1" />
          {angezeigterWert}
        </span>
        {onDetails === undefined ? null : (
          <button
            type="button"
            onClick={onDetails}
            aria-label={de.kennzahlen.detailsOeffnen(bezeichnung)}
            className="absolute inset-0 cursor-pointer"
          />
        )}
        {nebenwert === null || nebenwert === '' ? null : (
          <span className="block text-xs text-text-leise">{angezeigterNebenwert}</span>
        )}
      </TableCell>
    </TableRow>
  );
}
