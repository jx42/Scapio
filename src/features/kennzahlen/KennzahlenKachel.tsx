/*
 * Kachel 3, Container. Eine Abfrage, keine Auswahl — die Kennzahlen haben keinen
 * Schalter, den man falsch stellen koennte.
 */

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { de } from '@/i18n/de';
import { api, kachelZustand, schluessel } from '@/lib/api';
import { useGespeicherterSchalter } from '@/lib/speicher';
import { Kachel } from '@/components/Kachel';
import { Driftfussnote } from '@/components/Driftbanner';
import { KennzahlenAnsicht } from '@/features/kennzahlen/KennzahlenAnsicht';
import { KennzahlenHinweise, kennzahlenHinweisSaetze } from '@/features/kennzahlen/KennzahlenHinweise';

export type KennzahlenKachelProps = {
  /** Aussenhoehe in Pixeln, gemessen an Aufteilung — siehe `Kachel`-Prop `hoehe`. */
  readonly hoehe?: number | null;
  /**
   * Meldet nach jedem Umschalten, ob die Kachel gerade aufgeklappt ist — `Seite`
   * (App.tsx) spiegelt das, damit Aufteilung auf die dadurch gewachsene Kennzahlen-
   * Hoehe mitwaechst, statt neben einer viel groesseren Nachbarkachel zu verkuemmern.
   */
  readonly onAusgeklapptAendern?: (ausgeklappt: boolean) => void;
};

export function KennzahlenKachel({ hoehe = null, onAusgeklapptAendern }: KennzahlenKachelProps) {
  const abfrage = useQuery({ queryKey: schluessel.kennzahlen, queryFn: api.kennzahlen });
  const daten = abfrage.data;

  // Ausgeklappt sprengt die Bindung an Aufteilung bewusst: die Kachel waechst auf ihre
  // volle Hoehe (s. u. `hoeheOffen`), damit auch die durch die Kuerzung versteckten
  // Kennzahlen erreichbar bleiben. Nach dem Neuladen steht sie ohne feste Hoehe, also
  // ebenfalls voll da, nur ohne Animation.
  const [ausgeklappt, setAusgeklappt] = useGespeicherterSchalter('kennzahlenAusgeklappt', false);
  useEffect(() => {
    onAusgeklapptAendern?.(ausgeklappt);
  }, [ausgeklappt, onAusgeklapptAendern]);

  // Von KennzahlenAnsicht beim Aufklappen einmalig gemeldete Zielhoehe (in Pixeln) —
  // erst damit hat die Kachel auf beiden Seiten eine feste Zahl und kann dazwischen
  // animieren, statt zwischen fester Hoehe und `auto` hin- und herzuspringen.
  const [hoeheOffen, setHoeheOffen] = useState<number | null>(null);

  const zustand = kachelZustand(abfrage, (d) => d.drift.stufe === 'leer');
  const hinweisSaetze = kennzahlenHinweisSaetze(daten?.hinweise);

  return (
    <Kachel
      titel={de.kennzahlen.titel}
      id="kennzahlen"
      zustand={zustand}
      ladehoehe="gross"
      className="pb-2"
      werkzeuge={hinweisSaetze.length === 0 ? undefined : <KennzahlenHinweise saetze={hinweisSaetze} />}
      fussnoten={<Driftfussnote drift={daten?.drift} />}
      hoehe={ausgeklappt ? hoeheOffen : hoehe}
    >
      {daten === undefined ? null : (
        <KennzahlenAnsicht
          daten={daten}
          ausgeklappt={ausgeklappt}
          hoehe={hoehe}
          onVolleHoeheAendern={setHoeheOffen}
          aufAusklappenUmschalten={() => setAusgeklappt(!ausgeklappt)}
        />
      )}
    </Kachel>
  );
}
