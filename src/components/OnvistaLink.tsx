/*
 * Link zur ISIN bei onvista; ohne Link, wenn `isin` nicht dem ISIN-Muster entspricht.
 * `target="_blank"` mit `rel="noopener noreferrer"` gegen Reverse-Tabnabbing und
 * Referrer-Leck. Begruendet in ADR-021.
 */

import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';

import { de } from '@/i18n/de';
import { onvistaLink } from '@/lib/onvista';
import { badgeVariants } from '@/components/ui/badge';
import { linkVariants } from '@/lib/linkStil';
import { cn } from '@/lib/utils';

export type OnvistaLinkProps = {
  readonly isin: string;
  readonly name: string;
  readonly children: ReactNode;
  readonly className?: string;
  /**
   * `link`: shadcn-Badge-Variante `link` statt des dezenten Umfeld-Stils. `name`: der Name selbst ist
   * der Link; Strich und Pfeil erst bei Hover oder Fokus, sonst wäre jede Legendenzeile unterstrichen.
   */
  readonly variant?: 'dezent' | 'link' | 'name';
};

export function OnvistaLink({ isin, name, children, className, variant = 'dezent' }: OnvistaLinkProps) {
  const link = onvistaLink(isin);
  if (link === null) return <>{children}</>;
  const stil =
    variant === 'name'
      ? cn(linkVariants({ strich: 'hover' }), 'group/link')
      : variant === 'link'
        ? badgeVariants({ variant: 'link', className: 'gap-0.5 font-medium tracking-normal normal-case' })
        : cn(linkVariants(), 'inline-flex shrink-0 items-center gap-0.5 text-xs text-text-leise');
  return (
    <a
      href={link} /* INV-AUSNAHME: link kommt aus onvistaLink(), geschlossener Zeichenraum — ADR-021 */
      target="_blank"
      rel="noopener noreferrer"
      title={de.aufteilung.onvistaTitel}
      aria-label={de.aufteilung.onvistaOeffnen(name)}
      className={cn(stil, className)}
    >
      {children}
      <ArrowUpRight
        aria-hidden="true"
        className={cn(
          variant === 'name' ? 'size-4' : 'size-3.5',
          // Ohne Breite im Fluss (`-mr-4.5`): sonst bräche der unsichtbare Pfeil schmal in eine eigene Zeile.
          variant === 'name' &&
            'ml-0.5 -mr-4.5 inline align-baseline opacity-0 transition-opacity group-hover/link:opacity-100 group-focus-visible/link:opacity-100',
        )}
      />
    </a>
  );
}
