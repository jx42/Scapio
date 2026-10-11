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
  /** `link`: shadcn-Badge-Variante `link` statt des dezenten Umfeld-Stils. */
  readonly variant?: 'dezent' | 'link';
};

export function OnvistaLink({ isin, name, children, className, variant = 'dezent' }: OnvistaLinkProps) {
  const link = onvistaLink(isin);
  if (link === null) return <>{children}</>;
  const stil =
    variant === 'link'
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
      <ArrowUpRight aria-hidden="true" className="size-3" />
    </a>
  );
}
