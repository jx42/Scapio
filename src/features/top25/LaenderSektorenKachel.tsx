/*
 * Kachel 4, rechte Hälfte „Länder & Sektoren“, Container. Dieselbe Abfrage wie die Unternehmen
 * daneben; Hinweise auf fehlende Fonds und die Anleitung stehen nur dort.
 */

import { useQuery } from '@tanstack/react-query';

import { de } from '@/i18n/de';
import { api, kachelZustand, schluessel } from '@/lib/api';
import { Kachel } from '@/components/Kachel';
import { LaenderSektorenAnsicht } from '@/features/top25/LaenderSektorenAnsicht';

const ID = 'laender-sektoren';

export function LaenderSektorenKachel() {
  const abfrage = useQuery({ queryKey: schluessel.top25, queryFn: api.top25 });
  const daten = abfrage.data;
  const zustand = kachelZustand(abfrage, (d) => d.laender.length === 0 && d.sektoren.length === 0, de.top25.leer);

  return (
    <Kachel titel={de.top25.laenderSektoren} id={ID} zustand={zustand} ladehoehe="gross" className="pb-2">
      {daten === undefined ? null : <LaenderSektorenAnsicht laender={daten.laender} sektoren={daten.sektoren} />}
    </Kachel>
  );
}
