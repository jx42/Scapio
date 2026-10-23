/*
 * Kachel 2, Container.
 *
 * Zwei Abfragen: die Aufteilung traegt die Kachel, die Kennzahlen liefern nur die
 * Zahl in der Ringmitte. Faellt die zweite aus, bleibt die Mitte leer und die Kachel
 * steht trotzdem — eine Nebenzahl darf keine Kachel umwerfen.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { de } from '@/i18n/de';
import { api, kachelZustand, schluessel } from '@/lib/api';
import { istDemoModus } from '@/lib/demoModus';
import { tokenVorhanden } from '@/lib/token';
import { Kachel } from '@/components/Kachel';
import { Driftfussnote } from '@/components/Driftbanner';
import { AufteilungAnsicht } from '@/features/aufteilung/AufteilungAnsicht';
import { RebalancingDialog } from '@/features/aufteilung/RebalancingDialog';
import { DEMO_REBALANCING_ZIEL } from '../../../shared/demoAbzug.ts';

export type AufteilungKachelProps = {
  /**
   * Aussenhoehe in Pixeln — nur gesetzt, waehrend Kennzahlen aufgeklappt ist und dabei
   * ueber die eigene (natuerliche) Hoehe von Aufteilung hinauswaechst, damit die beiden
   * Nachbarkacheln nicht auseinanderfallen. Siehe `Kachel`-Prop `hoehe`.
   */
  readonly hoehe?: number | null;
};

export function AufteilungKachel({ hoehe = null }: AufteilungKachelProps) {
  const [hervorgehoben, setHervorgehoben] = useState<string | null>(null);
  const [gehoverter, setGehoverter] = useState<string | null>(null);
  const [anfrage, setAnfrage] = useState<string | null>(null);

  const abfrage = useQuery({ queryKey: schluessel.aufteilung, queryFn: api.aufteilung });
  const kennzahlen = useQuery({ queryKey: schluessel.kennzahlen, queryFn: api.kennzahlen });
  // Ein abgelehntes Ziel wird beim zweiten Versuch nicht richtiger.
  const rebalancing = useQuery({
    queryKey: schluessel.rebalancing(anfrage ?? ''),
    queryFn: () => api.rebalancing(anfrage ?? ''),
    enabled: anfrage !== null,
    retry: false,
  });

  const daten = abfrage.data;
  const gesamtCent = kennzahlen.data?.gesamtCent ?? null;

  const zustand = kachelZustand(abfrage, (d) => d.positionen.length === 0 && d.cashCent === 0, de.aufteilung.leer);

  return (
    <Kachel
      titel={de.aufteilung.titel}
      id="aufteilung"
      zustand={zustand}
      ladehoehe="mittel"
      fussnoten={<Driftfussnote drift={daten?.drift} />}
      hoehe={hoehe}
    >
      {daten === undefined ? null : (
        <div className="grid grid-cols-1 gap-3">
          <AufteilungAnsicht
            positionen={daten.positionen}
            cashCent={daten.cashCent}
            cashAnteil={daten.cashAnteil}
            gesamtCent={gesamtCent}
            hervorgehoben={gehoverter ?? hervorgehoben}
            ausgewaehlt={hervorgehoben}
            onHervorheben={setHervorgehoben}
            onHover={setGehoverter}
          />
          {zustand.art === 'bereit' ? (
            <RebalancingDialog
              positionen={daten.positionen}
              cashCent={daten.cashCent}
              cashAnteil={daten.cashAnteil}
              gesamtCent={gesamtCent}
              stand={daten.stand}
              angefragt={anfrage}
              ergebnis={{ daten: rebalancing.data, fehler: rebalancing.error, laedt: rebalancing.isFetching }}
              onBerechnen={setAnfrage}
              festesZiel={istDemoModus() && !tokenVorhanden() ? DEMO_REBALANCING_ZIEL : null}
            />
          ) : null}
        </div>
      )}
    </Kachel>
  );
}
