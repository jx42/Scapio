/*
 * Die Kachel — der einzige Rahmen, in dem auf dieser Seite etwas steht.
 *
 * Sie rendert <section aria-labelledby> mit sichtbarer Ueberschrift und kapselt
 * ErrorBoundary, Skeleton, Leer- und Fehlerzustand.
 * Jede Kachel benutzt sie; keine baut ihre Zustaende selbst nach. Der Vertrag steht in
 * Abschnitt 10.2 der Bauanleitung:
 *
 * Mit `hoehe` ist sie zugleich INV-05, Ausnahme 3: Kennzahlen bindet seine Hoehe per
 * ResizeObserver an Aufteilung (App.tsx, useElementHoehe) — eine Groesse, die erst zur
 * Laufzeit feststeht, kann kein Tailwind-Utility ausdruecken.
 *
 *   <Kachel titel="Verlauf" id="verlauf" zustand={…}>…</Kachel>
 */

import type { CSSProperties, ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Fehlergrenze } from '@/components/Fehlergrenze';
import { FehlerZustand, LadeZustand, LeerZustand, type Ladehoehe } from '@/components/Zustaende';

export type KachelZustand =
  | { readonly art: 'laedt' }
  | { readonly art: 'leer'; readonly text?: ReactNode; readonly inhalt?: ReactNode }
  | { readonly art: 'fehler'; readonly text?: string; readonly hinweis?: string | null }
  | { readonly art: 'bereit' };

export type KachelProps = {
  readonly titel: string;
  /** Kurzer Zusatz unter dem Titel, etwa eine Grundgesamtheit — auch mit eingebettetem Knopf. */
  readonly untertitel?: ReactNode;
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
  /**
   * Erzwingt die Aussenhoehe in Pixeln, etwa gemessen an einer Nachbarkachel per
   * `useElementHoehe` — der Inhalt wird dann nicht gestaucht, sondern faellt gedeckelt
   * ab (kein Scrollbalken). Ohne Vorgabe waechst die Kachel wie bisher mit dem Inhalt.
   */
  readonly hoehe?: number | null;
  /** Zusätzliche CSS-Klassen für die Section. */
  readonly className?: string;
  readonly children: ReactNode;
};

export function Kachel({
  titel,
  untertitel,
  info,
  id,
  zustand,
  ladehoehe = 'mittel',
  werkzeuge,
  fussnoten,
  hoehe = null,
  className,
  children,
}: KachelProps) {
  const titelId = `${id}-titel`;
  const hoeheFest = hoehe !== null;

  return (
    <Card
      asChild
      className={cn('flex flex-col p-4 pb-0', hoeheFest && 'kachel-hoehe-fest', className)}
      // eslint-disable-next-line react/forbid-component-props -- INV-05, Ausnahme 3: Kennzahlen misst sich an der Hoehe von Aufteilung (useElementHoehe); gesetzt wird nur --kachel-hoehe, die Hoehe selbst steht in theme.css.
      style={hoeheFest ? ({ '--kachel-hoehe': `${hoehe}px` } as CSSProperties) : undefined}
    >
      <section id={id} aria-labelledby={titelId}>
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3 px-2">
          <div className={cn(werkzeuge === undefined && 'min-w-0 flex-1')}>
            <div className="flex items-center gap-1">
              <h2 id={titelId} className="font-heading text-xl font-semibold text-text">
                {titel}
              </h2>
              {info}
            </div>
            {untertitel === undefined ? null : (
              <p className="text-sm text-text-leise">{untertitel}</p>
            )}
          </div>
          {werkzeuge === undefined ? null : <div className="flex flex-wrap items-center gap-2">{werkzeuge}</div>}
        </header>

        <div
          className={cn(
            'px-2',
            hoeheFest && 'min-h-0 flex-1 overflow-hidden',
            zustand.art === 'leer' && 'flex flex-1 flex-col pb-4',
          )}
        >
          <Fehlergrenze>
            {zustand.art === 'laedt' ? <LadeZustand hoehe={ladehoehe} /> : null}
            {zustand.art === 'leer' ? (
              <LeerZustand text={zustand.text}>{zustand.inhalt}</LeerZustand>
            ) : null}
            {zustand.art === 'fehler' ? (
              <FehlerZustand text={zustand.text} hinweis={zustand.hinweis} />
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
