/*
 * Die Selbstkontrolle, sichtbar gemacht.
 *
 * `drift.stufe` steuert mehrere verschiedene Dinge, und deshalb steht die Zuordnung an
 * genau einer Stelle:
 *
 *   ok         nichts
 *   hinweis    Fussnote an der betroffenen Kachel
 *   banner     Banner ueber der Seite
 *   abbruch    Banner UND der Verlauf wird nicht gezeichnet
 *   ausgesetzt Banner: die Gegenprobe war nicht moeglich
 *   leer       nichts: noch keine Reihe, also nichts zu pruefen (Erststart)
 *
 * Lieber eine sichtbare Warnung als eine still falsche Zahl. [P-08]
 */

import { de } from '@/i18n/de';
import type { Drift } from '@/lib/api';
import { prozent } from '@/lib/format';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InfoKnopf } from '@/components/InfoKnopf';

/** Bei 'abbruch' ist die Rekonstruktion falsch — dann wird kein Verlauf gezeichnet. */
export function chartGesperrt(drift: Drift | undefined): boolean {
  return drift?.stufe === 'abbruch';
}

function texte(drift: Drift): { titel: string; text: string; ernst: boolean } | null {
  const abweichung = prozent(drift.abweichung);
  switch (drift.stufe) {
    case 'banner':
      return { titel: de.drift.titelBanner, text: de.drift.banner(abweichung), ernst: false };
    case 'abbruch':
      return { titel: de.drift.titelAbbruch, text: de.drift.abbruch(abweichung), ernst: true };
    case 'ausgesetzt':
      return {
        titel: de.drift.titelAusgesetzt,
        text:
          drift.grund === null || drift.grund === undefined || drift.grund === ''
            ? de.drift.ausgesetztOhneGrund
            : de.drift.ausgesetzt(drift.grund),
        ernst: false,
      };
    default:
      return null;
  }
}

export function Driftbanner({ drift }: { drift: Drift | undefined }) {
  if (drift === undefined) return null;
  const inhalt = texte(drift);
  if (inhalt === null) return null;

  return (
    <Alert
      variant={inhalt.ernst ? 'verlust' : 'warnung'}
      role={inhalt.ernst ? 'alert' : 'status'}
      className="px-4 py-3"
    >
      <AlertTitle className="flex items-center gap-2 font-semibold">
        <span aria-hidden="true">{de.pfeil.ab}</span>
        {inhalt.titel}
        <InfoKnopf bezeichnung={inhalt.titel}>
          <p>{de.drift.erklaerung}</p>
          <p className="mt-1 text-text-leise">{de.drift.handlung}</p>
        </InfoKnopf>
      </AlertTitle>
      <AlertDescription>{inhalt.text}</AlertDescription>
    </Alert>
  );
}

/**
 * Der Satz, der an der Stelle des unterdrueckten Charts steht. Das Banner oben erklaert
 * die Lage der ganzen Seite; die Kachel muss trotzdem sagen, warum genau HIER nichts
 * gezeichnet ist — ein leerer Rahmen ohne Begruendung ist die schlechteste Antwort.
 */
export function sperrtext(drift: Drift | undefined): string | null {
  if (drift === undefined || drift.stufe !== 'abbruch') return null;
  return de.drift.abbruch(prozent(drift.abweichung));
}

/** Die leise Variante: Stufe 'hinweis' bekommt eine Fussnote, kein Banner. */
export function Driftfussnote({ drift }: { drift: Drift | undefined }) {
  if (drift === undefined || drift.stufe !== 'hinweis') return null;
  return <p>{de.drift.fussnote(prozent(drift.abweichung))}</p>;
}
