import { cva } from 'class-variance-authority';

/**
 * Der eine Linkstil: Textfarbe des Umfelds, nur der Strich ist halbtransparent; beim Hover
 * wird alles weiss. `weit` für Knöpfe, die wie ein Link aussehen; `gruppe`, wenn eine
 * darüberliegende Fläche den Hover trägt (Kennzahlzeile).
 */
export const linkVariants = cva('underline decoration-current/50 transition-farben', {
  variants: {
    abstand: { eng: 'underline-offset-1', weit: 'underline-offset-4' },
    hover: {
      selbst: 'hover:text-text hover:decoration-current',
      gruppe: 'group-hover:decoration-current',
    },
  },
  defaultVariants: { abstand: 'eng', hover: 'selbst' },
});
