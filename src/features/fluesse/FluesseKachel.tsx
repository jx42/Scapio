/*
 * Kachel 5, Container.
 */

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { de } from '@/i18n/de';
import { FENSTER, api, kachelZustand, schluessel, type Fenster } from '@/lib/api';
import { useGespeichert } from '@/lib/speicher';
import { Kachel } from '@/components/Kachel';
import { Driftfussnote } from '@/components/Driftbanner';
import { FluesseAnsicht } from '@/features/fluesse/FluesseAnsicht';
import { Fensterwahl } from '@/features/fluesse/Fensterwahl';

export function FluesseKachel() {
  const [fenster, setFenster] = useGespeichert<Fenster>('fenster', '12m', FENSTER);

  const abfrage = useQuery({
    queryKey: schluessel.fluesse(fenster),
    queryFn: () => api.fluesse(fenster),
    // Ohne das waere jeder neue Schluessel `isPending`: Skeleton statt Chart, dann
    // Neuaufbau — das Flackern beim Umschalten.
    placeholderData: keepPreviousData,
  });

  const daten = abfrage.data;

  const zustand = kachelZustand(abfrage, () => false, de.fluesse.leer);

  return (
    <Kachel
      titel={de.fluesse.titel}
      id="fluesse"
      zustand={zustand}
      ladehoehe="mittel"
      className="flex-1 pb-2"
      werkzeuge={zustand.art === 'bereit' ? <Fensterwahl gewaehlt={fenster} onWahl={setFenster} /> : undefined}
      fussnoten={<Driftfussnote drift={daten?.drift} />}
    >
      {daten === undefined ? null : (
        <FluesseAnsicht monate={daten.monate} schnittCent={daten.schnittCent} fenster={fenster} />
      )}
    </Kachel>
  );
}
