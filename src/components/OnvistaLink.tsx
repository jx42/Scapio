/*
 * Link zur ISIN bei onvista; ohne Link, wenn `isin` nicht dem ISIN-Muster entspricht.
 * `target="_blank"` mit `rel="noopener noreferrer"` gegen Reverse-Tabnabbing und
 * Referrer-Leck. Begruendet in ADR-021.
 */

import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';

import { de } from '@/i18n/de';
import { onvistaLink } from '@/lib/onvista';
import { linkVariants } from '@/lib/linkStil';
import { cn } from '@/lib/utils';

export type OnvistaLinkProps = {
  readonly isin: string;
  readonly name: string;
  readonly children: ReactNode;
  readonly className?: string;
};

export function OnvistaLink({ isin, name, children, className }: OnvistaLinkProps) {
  const link = onvistaLink(isin);
  if (link === null) return <>{children}</>;
  return (
    <a
      href={link} /* INV-AUSNAHME: link kommt aus onvistaLink(), geschlossener Zeichenraum — ADR-021 */
      target="_blank"
      rel="noopener noreferrer"
      // eslint-disable-next-line no-restricted-syntax -- Zusatz zum Link, dessen Ziel aria-label und sichtbarer Text schon nennen (test/keinTooltip.test.ts).
      title={de.aufteilung.onvistaTitel}
      aria-label={de.aufteilung.onvistaOeffnen(name)}
      className={cn(linkVariants(), 'inline-flex shrink-0 items-center gap-0.5 text-xs text-text-leise', className)}
    >
      {children}
      <ArrowUpRight aria-hidden="true" className="size-3.5" />
    </a>
  );
}
