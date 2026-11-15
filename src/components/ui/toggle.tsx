// shadcn/ui — nur die Varianten des Toggle; <ToggleGroupItem> traegt sie, ein einzelner Toggle kommt nicht vor.
// Per Touch 36 statt 28 px hoch: die Zeitraum-Chips liegen bei 320 px dicht an dicht.
import { cva } from 'class-variance-authority';

const toggleVariants = cva(
  'inline-flex h-7 pointer-coarse:h-9 cursor-pointer items-center justify-center rounded-sm px-2.5 text-xs font-medium whitespace-nowrap text-text-leise transition-farben hover:text-text disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-bedien-aktiv data-[state=on]:text-text data-[state=on]:inset-ring data-[state=on]:inset-ring-bedien-rand',
  {
    variants: {
      variant: {
        default: '',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export { toggleVariants };
