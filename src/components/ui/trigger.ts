// Auslöserstil der Menüs im Kachelkopf (Linienwahl, Benchmarkwahl) — vorher Teil von
// `select.tsx`, das sonst niemand benutzte (ADR-024).
import { cva } from 'class-variance-authority';

export const triggerVariants = cva(
  'flex w-fit cursor-pointer items-center justify-between gap-2 rounded-md lichtkante lichtkante-hover bg-bedien px-3 text-xs font-medium text-text-leise whitespace-nowrap outline-none transition-farben hover:text-text data-[state=open]:text-text focus-visible:border-fokus focus-visible:ring-[3px] focus-visible:ring-fokus/50 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
  {
    variants: {
      size: { default: 'h-9', sm: 'h-8' },
      /** Eine Auswahl ist gesetzt: Schrift hell wie beim gewählten Segment. */
      aktiv: { true: 'text-text', false: '' },
    },
    defaultVariants: { size: 'default', aktiv: false },
  },
);
