// shadcn/ui — Slider auf Radix, hier immer mit zwei Griffen (Bereich). Fokusring kommt global aus theme.css.
// Die Lage von Spur und Griffen setzt Radix selbst per style am DOM, nicht dieser Quelltext. [INV-05]
import * as React from 'react';
import { Slider as SliderPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

function Slider({ className, children, ...props }: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn('group relative flex w-full cursor-pointer touch-none items-center select-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50', className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-0.5 w-full grow overflow-hidden rounded-full bg-bedien-aktiv transition-farben group-hover:bg-bedien-rand/40 group-data-[disabled]:bg-bedien-aktiv">
        <SliderPrimitive.Range data-slot="slider-range" className="absolute h-full bg-chart-1/70" />
      </SliderPrimitive.Track>
      {children}
    </SliderPrimitive.Root>
  );
}

function SliderThumb({ className, ...props }: React.ComponentProps<typeof SliderPrimitive.Thumb>) {
  return (
    <SliderPrimitive.Thumb
      data-slot="slider-thumb"
      className={cn(
        // Sichtbar 12 px, Klickziel per Pseudo-Element 24 px. [Barrierefreiheit: min. 24 × 24]
        // Der Hof ist ein box-shadow-Ring, kein outline — das bleibt dem Fokusring.
        'relative block size-3 cursor-ew-resize rounded-full border border-chart-1 bg-grund transition-[background-color,box-shadow,scale] duration-150 before:absolute before:-inset-1.5',
        'hover:scale-125 hover:bg-chart-1 hover:ring-3 hover:ring-chart-1/25 active:scale-125 active:bg-chart-1 active:ring-4 active:ring-chart-1/30',
        'data-[disabled]:cursor-not-allowed data-[disabled]:hover:scale-100 data-[disabled]:hover:bg-grund data-[disabled]:hover:ring-0',
        className,
      )}
      {...props}
    />
  );
}

export { Slider, SliderThumb };
