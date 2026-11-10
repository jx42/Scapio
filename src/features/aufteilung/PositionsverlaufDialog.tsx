/*
 * Kursentwicklung einer Position, weitere lassen sich einblenden. Nur Ansicht: die Daten kommen
 * aus der Kachel. Die Auswahl lebt hier und beginnt über `key` bei jedem Öffnen neu.
 */

import { useState } from 'react';

import { de } from '@/i18n/de';
import type { KursZeitraum, PositionsverlaufLinie, Positionsverlauf, PositionZeile } from '@/lib/api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Driftfussnote } from '@/components/Driftbanner';
import { InfoKnopf } from '@/components/InfoKnopf';
import { ringFarbe } from '@/components/Ring';
import { FehlerZustand, LadeZustand } from '@/components/Zustaende';
import { CHART_REIHE } from '@/lib/farben';
import { Zeitraumwahl } from '@/features/verlauf/Zeitraumwahl';
import { PositionsverlaufChart, type SichtbareLinie } from '@/features/aufteilung/PositionsverlaufChart';
import { Positionsfilter } from '@/features/aufteilung/Positionsfilter';

export type PositionsverlaufDialogProps = {
  /** Die geklickte Position: anfangs als einzige eingeblendet. */
  readonly isin: string;
  readonly positionen: readonly PositionZeile[];
  readonly zeitraum: KursZeitraum;
  readonly ergebnis: {
    readonly daten: Positionsverlauf | undefined;
    readonly fehler: Error | null;
  };
  readonly onZeitraum: (zeitraum: KursZeitraum) => void;
  readonly onSchliessen: () => void;
};

export function PositionsverlaufDialog({
  isin,
  positionen,
  zeitraum,
  ergebnis,
  onZeitraum,
  onSchliessen,
}: PositionsverlaufDialogProps) {
  const [auswahl, setAuswahl] = useState<ReadonlySet<string>>(() => new Set([isin]));
  // Scheitert ein Zeitraum, bleiben die übrigen wählbar.
  const [angeboten, setAngeboten] = useState<readonly KursZeitraum[]>(['max']);
  const { daten, fehler } = ergebnis;
  if (daten !== undefined && daten.zeitraeume !== angeboten) setAngeboten(daten.zeitraeume);

  const umschalten = (ziel: string) => {
    setAuswahl((vorher) => {
      const naechste = new Set(vorher);
      if (!naechste.delete(ziel)) naechste.add(ziel);
      return naechste;
    });
  };

  return (
    <Dialog open onOpenChange={(offen) => { if (!offen) onSchliessen(); }}>
      <DialogContent className="max-h-[90vh] sm:max-w-6xl">
        <DialogHeader className="flex-row flex-wrap items-center pr-9">
          <DialogTitle>{de.positionsverlauf.titel}</DialogTitle>
          <InfoKnopf bezeichnung={de.positionsverlauf.titel}>
            <p>{de.positionsverlauf.infoMass}</p>
            <p className="mt-2 text-text-leise">{de.positionsverlauf.infoKaeufe}</p>
          </InfoKnopf>
          <DialogDescription className="sr-only">{de.positionsverlauf.beschreibung}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Positionsfilter
            eintraege={positionen.map((p, index) => ({
              isin: p.isin,
              name: p.name,
              farbe: ringFarbe(index),
              sichtbar: auswahl.has(p.isin),
            }))}
            onUmschalten={umschalten}
          />
          <Zeitraumwahl
            gewaehlt={zeitraum}
            angeboten={angeboten}
            eigenMoeglich={false}
            onWahl={onZeitraum}
            onEigen={() => undefined}
          />
        </div>

        <Flaeche daten={daten} fehler={fehler} linien={sichtbareLinien(positionen, auswahl, daten?.linien ?? [])} />
        <Driftfussnote drift={daten?.drift} />
      </DialogContent>
    </Dialog>
  );
}

function sichtbareLinien(
  positionen: readonly PositionZeile[],
  auswahl: ReadonlySet<string>,
  antwort: readonly PositionsverlaufLinie[],
): SichtbareLinie[] {
  // Die Farbe kommt vom Platz im Ring, die Reihenfolge der Antwort bedeutet nichts.
  return positionen.flatMap((p, index) =>
    auswahl.has(p.isin)
      ? [
          {
            isin: p.isin,
            name: p.name,
            farbe: ringFarbe(index),
            gestrichelt: index >= CHART_REIHE.length,
            kaeufe: antwort.find((l) => l.isin === p.isin)?.kaeufe ?? [],
          },
        ]
      : [],
  );
}

function Hinweis({ text }: { readonly text: string }) {
  return <p className="grid h-140 place-content-center px-4 text-center text-text-leise">{text}</p>;
}

function Flaeche({
  daten,
  fehler,
  linien,
}: {
  readonly daten: Positionsverlauf | undefined;
  readonly fehler: Error | null;
  readonly linien: readonly SichtbareLinie[];
}) {
  if (daten === undefined) {
    return <div className="h-140">{fehler === null ? <LadeZustand /> : <FehlerZustand text={fehler.message} />}</div>;
  }
  if (linien.length === 0) return <Hinweis text={de.positionsverlauf.leer} />;
  const mitKursen = linien.some((l) => daten.punkte.some((p) => (p.werte[l.isin] ?? null) !== null));
  if (!mitKursen) return <Hinweis text={de.positionsverlauf.ohneKurse} />;
  return <PositionsverlaufChart punkte={daten.punkte} linien={linien} />;
}
