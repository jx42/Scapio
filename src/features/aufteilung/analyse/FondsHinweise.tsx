/*
 * Hinweise zu funds.json im Kopf einer Kachel: fehlende Fonds als `HinweisKnopf`, gar kein
 * bekannter Fonds als Link zur Anleitung. Steht neben dem Look-Through oder, wenn der ausbleibt,
 * neben der Aufteilung (ADR-060).
 */

import { useState } from 'react';
import { Info } from 'lucide-react';

import { de } from '@/i18n/de';
import type { Top25 } from '@/lib/api';
import { HinweisKnopf } from '@/components/HinweisKnopf';
import { Button } from '@/components/ui/button';
import { FehlendeFondsListe } from '@/features/aufteilung/analyse/FehlendeFondsListe';
import { Top25Dialog } from '@/features/aufteilung/analyse/Top25Dialog';
import { Top25FondsAnleitung } from '@/features/aufteilung/analyse/Top25FondsAnleitung';

export type FondsHinweiseProps = {
  readonly daten: Top25;
};

export function FondsHinweise({ daten }: FondsHinweiseProps) {
  const [anleitungOffen, setAnleitungOffen] = useState(false);

  if (daten.fehlendeFonds.length > 0) {
    return (
      <HinweisKnopf
        anzahl={daten.fehlendeFonds.length}
        titel={de.top25.fehlendeFondsTitel}
        beschreibung={de.top25.fehlendeFondsBeschreibung}
      >
        <FehlendeFondsListe abdeckung={daten.abdeckung} fehlendeFonds={daten.fehlendeFonds} />
      </HinweisKnopf>
    );
  }
  // Kein Fonds bekannt, auch kein fehlender: dann die Anleitung zu funds.json.
  if (daten.zeilen.length > 0 || daten.drift.stufe === 'leer') return null;

  return (
    <>
      <Button
        type="button"
        variant="link"
        onClick={() => setAnleitungOffen(true)}
        className="h-auto gap-1 p-0 font-normal whitespace-normal"
      >
        <Info aria-hidden="true" className="size-3.5" />
        {de.top25.leerAnleitungTitel}
      </Button>
      <Top25Dialog
        offen={anleitungOffen}
        onOpenChange={setAnleitungOffen}
        titel={de.top25.leerAnleitungTitel}
        beschreibung={de.top25.leerAnleitungBeschreibung}
      >
        <Top25FondsAnleitung />
      </Top25Dialog>
    </>
  );
}
