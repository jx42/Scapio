import type { ReactNode } from 'react';

import { richtungPfeil, vorzeichen } from '@/lib/format';
import type { Richtung } from '@/lib/format';
import { RichtungsPfeil } from '@/components/RichtungsPfeil';
import { Badge } from '@/components/ui/badge';

/** Badge-Text ist Zahl, kein Etikett: keine Grossschreibung, gleich breite Ziffern. */
const BADGE_ZAHL = 'font-medium tracking-normal normal-case tabular-nums';

const gewinnVariante: Record<Richtung, 'gewinnLeise' | 'verlustLeise' | 'default'> = {
  auf: 'gewinnLeise',
  ab: 'verlustLeise',
  neutral: 'default',
};

/** Badge in Gewinn-/Verlustfarbe mit Pfeil; der Wert daneben steht ohne Vorzeichen. */
export function RichtungsBadge({ wert, children }: { readonly wert: number; readonly children: ReactNode }) {
  return (
    <Badge variant={gewinnVariante[vorzeichen(wert).richtung]} className={BADGE_ZAHL}>
      <RichtungsPfeil pfeil={richtungPfeil(wert)} />
      {children}
    </Badge>
  );
}
