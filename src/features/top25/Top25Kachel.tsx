/*
 * Kachel 4, linke Hälfte „Unternehmen“, Container. Länder und Sektoren aus demselben
 * Look-Through stehen in `LaenderSektorenKachel` daneben.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';

import { de } from '@/i18n/de';
import { api, kachelZustand, schluessel } from '@/lib/api';
import { Kachel } from '@/components/Kachel';
import { Button } from '@/components/ui/button';
import { Driftfussnote } from '@/components/Driftbanner';
import { HinweisKnopf } from '@/components/HinweisKnopf';
import { FehlendeFondsListe } from '@/features/top25/FehlendeFondsListe';
import { Top25Ansicht } from '@/features/top25/Top25Ansicht';
import { Top25Dialog } from '@/features/top25/Top25Dialog';
import { Top25FondsAnleitung } from '@/features/top25/Top25FondsAnleitung';
import { anteilProzent, zahl } from '@/lib/format';
import { useGespeicherterSchalter } from '@/lib/speicher';

const ID = 'top25';

export type Top25KachelProps = {
  /** Aussenhoehe in Pixeln, gemessen an Länder & Sektoren — siehe `Kachel`-Prop `hoehe`. */
  readonly hoehe?: number | null;
};

export function Top25Kachel({ hoehe = null }: Top25KachelProps) {
  const abfrage = useQuery({ queryKey: schluessel.top25, queryFn: api.top25 });
  const daten = abfrage.data;
  const [anleitungOffen, setAnleitungOffen] = useState(false);
  const [ausgeklappt, setAusgeklappt] = useGespeicherterSchalter('top25Ausgeklappt', false);

  const top25Anteil = daten?.topAnteil ?? 0;
  const fehlendeFonds = daten?.fehlendeFonds ?? [];
  const leer = daten === undefined || daten.zeilen.length === 0;
  // Ohne jeden bekannten Fonds gibt es nichts aufzulisten — dann die Anleitung zu funds.json.
  const zeigeAnleitung =
    fehlendeFonds.length === 0 && daten !== undefined && daten.zeilen.length === 0 && daten.drift.stufe !== 'leer';

  const anleitungKnopf = zeigeAnleitung ? (
    <Button
      type="button"
      variant="link"
      onClick={() => setAnleitungOffen(true)}
      className="h-auto gap-1 p-0 font-normal whitespace-normal"
    >
      <Info aria-hidden="true" className="size-3.5" />
      {de.top25.leerAnleitungTitel}
    </Button>
  ) : null;

  // Leer ohne bekannten Fonds: der Anleitungsknopf steht im Kasten statt des Satzes.
  const zustand = kachelZustand(abfrage, (d) => d.zeilen.length === 0, anleitungKnopf ?? de.top25.leer);

  const untertitel =
    leer || top25Anteil === 0
      ? undefined
      : de.top25.untertitel(anteilProzent(top25Anteil), zahl(daten.anzahlUnternehmen));

  return (
    <>
      <Kachel
        titel={de.top25.titel}
        nebentitel={untertitel}
        id={ID}
        hoehe={ausgeklappt ? null : hoehe}
        zustand={zustand}
        ladehoehe="gross"
        className="pb-2"
        werkzeuge={
          fehlendeFonds.length === 0 ? undefined : (
            <HinweisKnopf
              anzahl={fehlendeFonds.length}
              titel={de.top25.fehlendeFondsTitel}
              beschreibung={de.top25.fehlendeFondsBeschreibung}
            >
              <FehlendeFondsListe abdeckung={daten?.abdeckung ?? 0} fehlendeFonds={fehlendeFonds} />
            </HinweisKnopf>
          )
        }
        fussnoten={<Driftfussnote drift={daten?.drift} />}
      >
        {daten === undefined ? null : (
          <Top25Ansicht
            zeilen={daten.zeilen}
            gebunden={hoehe !== null}
            ausgeklappt={ausgeklappt}
            onAusgeklapptAendern={setAusgeklappt}
          />
        )}
      </Kachel>
      {zeigeAnleitung ? (
        <Top25Dialog
          offen={anleitungOffen}
          onOpenChange={setAnleitungOffen}
          titel={de.top25.leerAnleitungTitel}
          beschreibung={de.top25.leerAnleitungBeschreibung}
        >
          <Top25FondsAnleitung />
        </Top25Dialog>
      ) : null}
    </>
  );
}
