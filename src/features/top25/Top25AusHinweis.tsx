/*
 * Ohne diesen Hinweis ist Top 25 nur über das README auffindbar. Er erklärt nur, die
 * Seite schaltet nichts um: INV-08 lässt keine Einstellungsroute zu.
 */

import { de } from '@/i18n/de';
import { cn } from '@/lib/utils';
import { linkVariants } from '@/lib/linkStil';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function Top25AusHinweis() {
  return (
    <Popover>
      <PopoverTrigger className={cn(linkVariants({ abstand: 'weit' }), 'min-h-6 w-fit cursor-pointer text-left')}>
        {de.top25.ausHinweis}
      </PopoverTrigger>
      <PopoverContent aria-label={de.top25.ausHinweis}>
        <ol className="list-decimal space-y-1 pl-4">
          {de.top25.ausSchritte.map((schritt) => (
            <li key={schritt}>{schritt}</li>
          ))}
        </ol>
      </PopoverContent>
    </Popover>
  );
}
