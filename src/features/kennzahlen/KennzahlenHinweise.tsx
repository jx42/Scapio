/*
 * Die Hinweise des Rechenkerns als `HinweisKnopf` in der Titelzeile des Verlaufs, der
 * die Kennzahlenkarten traegt.
 * Codes ohne Satz in `de.kennzahlen.hinweis` erklaert schon eine andere Stelle der Seite.
 */

import { de } from '@/i18n/de';
import type { Hinweis } from '@/lib/api';
import { zahl } from '@/lib/format';
import { HinweisKnopf } from '@/components/HinweisKnopf';

const t: Readonly<Record<string, string | ((anzahl: number, text: string) => string)>> = de.kennzahlen.hinweis;

/** Die Saetze zu den Hinweisen, die nur hier stehen — leer, wenn es keinen gibt. */
export function kennzahlenHinweisSaetze(hinweise: readonly Hinweis[] | undefined): readonly string[] {
  return (hinweise ?? []).flatMap(({ code, anzahl }) => {
    const satz = t[code];
    if (satz === undefined) return [];
    return [typeof satz === 'string' ? satz : satz(anzahl ?? 0, zahl(anzahl ?? 0))];
  });
}

export function KennzahlenHinweise({ saetze }: { readonly saetze: readonly string[] }) {
  return (
    <HinweisKnopf
      anzahl={saetze.length}
      titel={de.kennzahlen.hinweiseTitel}
      beschreibung={de.kennzahlen.hinweiseBeschreibung}
    >
      <ul className="flex flex-col text-sm text-text-leise">
        {saetze.map((satz) => (
          <li key={satz} className="border-b border-rand py-3 first:pt-0 last:border-b-0 last:pb-0">
            {satz}
          </li>
        ))}
      </ul>
    </HinweisKnopf>
  );
}
