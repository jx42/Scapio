/*
 * Die Zustaende neben „bereit“: laedt, leer, fehlerhaft. Ein Quellenausfall beim letzten
 * Lauf ist kein Kachelzustand, ihn meldet der Laufhinweis fuer die ganze Seite. [P-08]
 *
 * <Kachel> setzt sie fuer jede Kachel; `LeerZustand` steht zusaetzlich in Ansichten, die
 * innerhalb einer bereiten Kachel leer sein koennen. Keine Kachel baut ein eigenes
 * Ladebild; sonst sieht jede Kachel ein anderes.
 */

import type { ReactNode } from 'react';

import { de } from '@/i18n/de';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

export type Ladehoehe = 'klein' | 'mittel' | 'gross';

const HOEHEN: Record<Ladehoehe, string> = {
  klein: 'h-32',
  mittel: 'h-48',
  gross: 'h-72',
};

/**
 * Skeleton in der Groesse der spaeteren Kachel — das Layout darf beim Nachladen
 * nicht springen. [P-06] Keine Live-Region: sie kaeme schon befuellt ins DOM und
 * wuerde dann unzuverlaessig, bei allen Kacheln zugleich mehrfach vorgelesen.
 */
export function LadeZustand({ hoehe = 'mittel' }: { hoehe?: Ladehoehe }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <span className="sr-only">{de.zustand.laedt}</span>
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-4 w-1/4" />
      <Skeleton className={HOEHEN[hoehe]} />
    </div>
  );
}

const LEER_TITEL = {
  leise: 'font-medium text-text',
  verlust: 'font-semibold text-verlust',
} as const;

/** Ohne Rahmen und ohne Sammeltitel: nur der Satz, mittig in der verfuegbaren Flaeche. */
export function LeerZustand({
  titel,
  text,
  ton = 'leise',
  children,
}: {
  /** Nur fuer Zustaende, die mehr sind als „leer“, etwa ein gesperrtes Chart. */
  titel?: string;
  /** Satz in der Mitte, auch mit eingebettetem Knopf; `null` blendet ihn aus. */
  text?: ReactNode;
  ton?: keyof typeof LEER_TITEL;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-32 flex-1 flex-col items-center justify-center px-4 py-8 text-center">
      {titel === undefined ? null : <p className={cn('text-sm', LEER_TITEL[ton])}>{titel}</p>}
      {text === null ? null : (
        <p className={cn('text-sm text-text-leise', titel !== undefined && 'mt-1')}>
          {text ?? de.zustand.leerBeschreibung}
        </p>
      )}
      {children === undefined ? null : <div className="mt-4 self-stretch text-left">{children}</div>}
    </div>
  );
}

/** `still`: ohne `role="alert"`, weil die Seite denselben Fehler schon einmal meldet. */
export function FehlerZustand({ text, hinweis, still }: { text?: string; hinweis?: string | null; still?: boolean }) {
  return (
    <Alert variant="verlust" role={still === true ? undefined : 'alert'} className="rounded-md px-4 py-4">
      <AlertTitle>{de.zustand.fehler}</AlertTitle>
      {/* Fremdtext? Nein: der Server schickt Code und einen eigenen Satz, nie einen Stacktrace. */}
      <AlertDescription className="text-xs">{text ?? de.zustand.fehlerUnbekannt}</AlertDescription>
      {hinweis !== null && hinweis !== undefined && hinweis !== '' ? (
        <p className="col-start-2 text-xs text-text-leise">{hinweis}</p>
      ) : null}
    </Alert>
  );
}
