/*
 * Info-Knopf oben rechts im Kopf einer Kachel.
 *
 * Fasst die Kennzahlen zusammen, die diese Kachel zeigt — wortgleich mit den
 * Erklaerungen aus Kachel 3 (Kennzahlen), nicht neu formuliert. Wer die Erklaerung
 * schon aus Kachel 3 kennt, findet hier denselben Satz wieder statt einer zweiten,
 * moeglicherweise abweichenden Fassung. [P-06]
 *
 * `InfoKnopf` wie in `Kennzahlzeile`, hier mit mehreren
 * Bezeichnung/Text-Paaren statt einem einzelnen Satz.
 */

import { InfoKnopf } from '@/components/InfoKnopf';

export type KachelInfoEintrag = {
  readonly bezeichnung: string;
  readonly text: string;
};

export type KachelInfoProps = {
  /** Titel der Kachel, fuer das aria-label des Knopfs. */
  readonly titel: string;
  readonly eintraege: readonly KachelInfoEintrag[];
};

export function KachelInfo({ titel, eintraege }: KachelInfoProps) {
  return (
    <InfoKnopf bezeichnung={titel} inhaltKlasse="max-w-sm">
      <dl className="flex flex-col gap-2">
        {eintraege.map((eintrag) => (
          <div key={eintrag.bezeichnung}>
            <dt className="font-medium text-text">{eintrag.bezeichnung}</dt>
            <dd>{eintrag.text}</dd>
          </div>
        ))}
      </dl>
    </InfoKnopf>
  );
}
