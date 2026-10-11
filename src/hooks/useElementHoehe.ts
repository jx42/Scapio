/*
 * Misst die Rand-Hoehe eines Elements laufend per ResizeObserver.
 *
 * Kennzahlen bindet darueber seine eigene Kachel-Hoehe an die gemessene Hoehe von
 * Aufteilung (siehe App.tsx und Kachel.tsx, Prop `hoehe`) — ohne diesen Hook gaebe es
 * keinen Weg, "genauso hoch wie die Nachbarkachel" ohne feste Pixelzahl umzusetzen.
 */
import { useEffect, useState, type RefObject } from 'react';

export function useElementHoehe(ref: RefObject<HTMLElement | null>): number | null {
  const [hoehe, setHoehe] = useState<number | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return undefined;

    const beobachter = new ResizeObserver((eintraege) => {
      const eintrag = eintraege[0];
      if (eintrag === undefined) return;
      const rand = eintrag.borderBoxSize?.[0];
      setHoehe(Math.round(rand === undefined ? eintrag.contentRect.height : rand.blockSize));
    });

    beobachter.observe(element, { box: 'border-box' });
    return () => beobachter.disconnect();
  }, [ref]);

  return hoehe;
}
