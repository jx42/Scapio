/*
 * Kachel 4, Container.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info, TriangleAlert } from 'lucide-react';

import { de } from '@/i18n/de';
import { api, kachelZustand, schluessel } from '@/lib/api';
import { Kachel } from '@/components/Kachel';
import { Button } from '@/components/ui/button';
import { Driftfussnote } from '@/components/Driftbanner';
import { FehlendeFondsListe } from '@/features/top25/FehlendeFondsListe';
import { Top25Ansicht } from '@/features/top25/Top25Ansicht';
import { Top25Dialog } from '@/features/top25/Top25Dialog';
import { Top25FondsAnleitung } from '@/features/top25/Top25FondsAnleitung';
import { prozent, zahl } from '@/lib/format';

const ID = 'top25';

export function Top25Kachel() {
  const abfrage = useQuery({ queryKey: schluessel.top25, queryFn: api.top25 });
  const daten = abfrage.data;
  const [dialogOffen, setDialogOffen] = useState(false);

  const top25Anteil = daten?.topAnteil ?? 0;
  const fehlendeFonds = daten?.fehlendeFonds ?? [];
  const leer = daten === undefined || daten.zeilen.length === 0;
  // Ohne jeden bekannten Fonds gibt es nichts aufzulisten — dann die Anleitung zu funds.json.
  const zeigeAnleitung =
    fehlendeFonds.length === 0 && daten !== undefined && daten.zeilen.length === 0 && daten.drift.stufe !== 'leer';

  const detailKnopf =
    fehlendeFonds.length > 0 || zeigeAnleitung ? (
      <Button
        type="button"
        variant="link"
        onClick={() => setDialogOffen(true)}
        className="h-auto gap-1 p-0 font-normal whitespace-normal"
      >
        {zeigeAnleitung ? (
          <>
            <Info aria-hidden="true" className="size-3.5" />
            {de.top25.leerAnleitungTitel}
          </>
        ) : (
          <>
            <TriangleAlert aria-hidden="true" className="size-3.5 text-warnung" />
            {de.top25.fehlendeFondsUntertitel(zahl(fehlendeFonds.length))}
          </>
        )}
      </Button>
    ) : null;

  // Leer: der Knopf steht im Kasten statt des Satzes, sonst im Untertitel.
  const zustand = kachelZustand(abfrage, (d) => d.zeilen.length === 0, detailKnopf ?? de.top25.leer);

  const untertitel =
    leer ? undefined : top25Anteil === 0 ? (
      (detailKnopf ?? undefined)
    ) : (
      <>
        {de.top25.untertitel(prozent(top25Anteil), zahl(daten.anzahlUnternehmen))}
        {detailKnopf === null ? null : (
          <>
            {' · '}
            {detailKnopf}
          </>
        )}
      </>
    );

  return (
    <>
      <Kachel
        titel={de.top25.titel}
        untertitel={untertitel}
        id={ID}
        zustand={zustand}
          ladehoehe="gross"
        className="pb-2"
        fussnoten={<Driftfussnote drift={daten?.drift} />}
      >
        {daten === undefined ? null : <Top25Ansicht zeilen={daten.zeilen} />}
      </Kachel>
      {zeigeAnleitung ? (
        <Top25Dialog
          offen={dialogOffen}
          onOpenChange={setDialogOffen}
          titel={de.top25.leerAnleitungTitel}
          beschreibung={de.top25.leerAnleitungBeschreibung}
        >
          <Top25FondsAnleitung />
        </Top25Dialog>
      ) : (
        <Top25Dialog
          offen={dialogOffen}
          onOpenChange={setDialogOffen}
          titel={de.top25.fehlendeFondsTitel}
          beschreibung={de.top25.fehlendeFondsBeschreibung}
        >
          <FehlendeFondsListe abdeckung={daten?.abdeckung ?? 0} fehlendeFonds={fehlendeFonds} />
        </Top25Dialog>
      )}
    </>
  );
}
