// shadcn/ui — nur die Varianten des Toggle; <ToggleGroupItem> traegt sie, ein einzelner Toggle kommt nicht vor.
import { cva } from 'class-variance-authority';

const toggleVariants = cva(
  'inline-flex h-7 cursor-pointer items-center justify-center rounded-sm px-2.5 text-xs font-medium whitespace-nowrap text-text-leise transition-farben hover:text-text disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=on]:bg-bedien-aktiv data-[state=on]:text-text data-[state=on]:inset-ring data-[state=on]:inset-ring-bedien-rand',
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
