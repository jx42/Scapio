/*
 * Richtungspfeil als Lucide-Icon. `format.ts` liefert die Richtung weiter als Text
 * (▲/▼), damit sie in Zaehlern und Zeichenketten mitlaeuft; hier wird sie erst bei der
 * Darstellung zum Icon. Die Strichstärke folgt dem Schriftgewicht (`--pfeil-strich`, theme.css).
 */

import { Fragment } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';

import { de } from '@/i18n/de';
import { cn } from '@/lib/utils';

const { auf, ab } = de.kennzahlen.richtungPfeil;

export function RichtungsPfeil({ pfeil, className }: { readonly pfeil: string; readonly className?: string }) {
  if (pfeil !== auf && pfeil !== ab) return null;
  const Icon = pfeil === auf ? ArrowUp : ArrowDown;
  const bezeichnung = pfeil === auf ? de.kennzahlen.richtungPositiv : de.kennzahlen.richtungNegativ;
  return (
    <Icon
      role="img"
      aria-label={bezeichnung}
      className={cn('inline-block size-[1em] shrink-0 align-[-0.125em] [stroke-width:var(--pfeil-strich,1.75)]', className)}
    />
  );
}

/** Text, in dem jedes ▲/▼ (samt folgendem festem Leerraum) durch das Icon ersetzt wird. */
export function TextMitPfeil({ text }: { readonly text: string }) {
  return (
    <>
      {text.split(/([▲▼])\u00a0?/).map((teil, index) =>
        // split mit Capture-Gruppe: ungerade Indizes sind die Pfeile.
        index % 2 === 1 ? (
          <RichtungsPfeil key={index} pfeil={teil} className="mr-0.5" />
        ) : (
          <Fragment key={index}>{teil}</Fragment>
        ),
      )}
    </>
  );
}
