/*
 * Die Kachel — der einzige Rahmen, in dem auf dieser Seite etwas steht.
 *
 * Sie rendert <section aria-labelledby> mit sichtbarer Ueberschrift und kapselt
 * ErrorBoundary, Skeleton, Leer- und Fehlerzustand.
 * Jede Kachel benutzt sie; keine baut ihre Zustaende selbst nach. Der Vertrag steht in
 * Abschnitt 10.2 der Bauanleitung:
 *
 *   <Kachel titel="Verlauf" id="verlauf" zustand={…}>…</Kachel>
 */

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Fehlergrenze } from '@/components/Fehlergrenze';
import { FehlerZustand, LadeZustand, LeerZustand, type Ladehoehe } from '@/components/Zustaende';

export type KachelZustand =
  | { readonly art: 'laedt' }
  | { readonly art: 'leer'; readonly text?: ReactNode; readonly inhalt?: ReactNode }
  | { readonly art: 'fehler'; readonly text?: string; readonly hinweis?: string | null; readonly still?: boolean }
  | { readonly art: 'bereit' };

export type KachelProps = {
  readonly titel: string;
  /** Kurzer Zusatz unter dem Titel, etwa eine Grundgesamtheit — auch mit eingebettetem Knopf. */
  readonly untertitel?: ReactNode;
  /** Zusatz rechtsbündig auf der Grundlinie des Titels, statt darunter. */
  readonly nebentitel?: ReactNode;
  /** Erklaerung zur Kachel als `InfoKnopf` direkt hinter dem Titel. */
  readonly info?: ReactNode;
  readonly id: string;
  readonly zustand: KachelZustand;
  /** Hoehe des Skeletons — es soll so gross sein wie das, was spaeter kommt. */
  readonly ladehoehe?: Ladehoehe;
  /** Bedienelemente in der Kopfzeile, etwa die Zeitraumwahl. */
  readonly werkzeuge?: ReactNode;
  /** Fussnoten unter dem Inhalt, etwa der Drift-Hinweis oder die Grob-Anmerkung. */
  readonly fussnoten?: ReactNode;
  /** Zusätzliche CSS-Klassen für die Section. */
  readonly className?: string;
  readonly children: ReactNode;
};

export function Kachel({
  titel,
  untertitel,
  nebentitel,
  info,
  id,
  zustand,
  ladehoehe = 'mittel',
  werkzeuge,
  fussnoten,
  className,
  children,
}: KachelProps) {
  const titelId = `${id}-titel`;

  return (
    <Card
      asChild
      className={cn('flex flex-col p-4 pb-0', className)}
    >
      <section id={id} aria-labelledby={titelId}>
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3 px-2">
          <div className={cn((werkzeuge === undefined || nebentitel !== undefined) && 'min-w-0 flex-1')}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <div className="flex items-center gap-1">
                <h2 id={titelId} className="font-heading text-xl font-semibold text-text">
                  {titel}
                </h2>
                {info}
              </div>
              {nebentitel === undefined ? null : (
                <p className="text-sm text-text-leise">{nebentitel}</p>
              )}
            </div>
            {untertitel === undefined ? null : (
              <p className="text-sm text-text-leise">{untertitel}</p>
            )}
          </div>
          {werkzeuge === undefined ? null : <div className="flex flex-wrap items-center gap-2 max-sm:w-full">{werkzeuge}</div>}
        </header>

        <div
          className={cn('px-2', zustand.art === 'leer' && 'flex flex-1 flex-col pb-4')}
        >
          <Fehlergrenze>
            {zustand.art === 'laedt' ? <LadeZustand hoehe={ladehoehe} /> : null}
            {zustand.art === 'leer' ? (
              <LeerZustand text={zustand.text}>{zustand.inhalt}</LeerZustand>
            ) : null}
            {zustand.art === 'fehler' ? (
              <FehlerZustand text={zustand.text} hinweis={zustand.hinweis} still={zustand.still} />
            ) : null}
            {zustand.art === 'bereit' ? children : null}
          </Fehlergrenze>
        </div>

        {zustand.art === 'bereit' && fussnoten !== undefined ? (
          <div className="mt-4 flex flex-col gap-1 px-2 text-xs text-text-leise">
            {fussnoten}
          </div>
        ) : null}
      </section>
    </Card>
  );
}
