/*
 * Die Reiter des Vermoegen/Rendite-Schalters der Verlauf-Kachel — TabsList/TabsTrigger,
 * wie Fensterwahl in Kachel 5. Der `Tabs`-Root samt TabsContent sitzt in VerlaufKachel,
 * weil er Kopf (werkzeuge) und Koerper (children) derselben Kachel gemeinsam umschliessen
 * muss — hier stehen nur die Reiter fuer den Kachelkopf.
 */

import { de } from '@/i18n/de';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';

export function Verlaufwahl() {
  return (
    <TabsList aria-label={de.verlauf.ansicht}>
      <TabsTrigger value="vermoegen">{de.verlauf.vermoegen}</TabsTrigger>
      <TabsTrigger value="rendite">{de.verlauf.rendite}</TabsTrigger>
    </TabsList>
  );
}
