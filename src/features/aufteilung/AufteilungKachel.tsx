/*
 * Kachel 2, Container: die Aufteilung und, mit `top25` [ADR-038], der Reiter Analyse mit Ländern,
 * Sektoren und Unternehmen (ADR-060).
 *
 * Die Aufteilung traegt die Kachel, die Kennzahlen liefern nur die Zahl in der Ringmitte. Faellt
 * die zweite aus, bleibt die Mitte leer und die Kachel steht trotzdem — eine Nebenzahl darf keine
 * Kachel umwerfen. Reiter gibt es erst, wenn der Look-Through Unternehmen kennt: lädt er noch,
 * scheitert er oder kennt er keine, steht die Aufteilung allein, die Hinweise zu funds.json in
 * ihrem Kopf.
 *
 * Die Reiterwahl wird nicht gespeichert: die Aufteilung beantwortet die Hauptfrage, die Analyse
 * ist ein Blick tiefer.
 */

import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import { de } from '@/i18n/de';
import { api, kachelZustand, schluessel } from '@/lib/api';
import { istDemoModus } from '@/lib/demoModus';
import { tokenVorhanden } from '@/lib/token';
import { Kachel } from '@/components/Kachel';
import { Driftfussnote } from '@/components/Driftbanner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AufteilungAnsicht } from '@/features/aufteilung/AufteilungAnsicht';
import { RebalancingDialog } from '@/features/aufteilung/RebalancingDialog';
import { AnalyseAnsicht } from '@/features/aufteilung/analyse/AnalyseAnsicht';
import { FondsHinweise } from '@/features/aufteilung/analyse/FondsHinweise';
import { DEMO_REBALANCING_ZIEL } from '../../../shared/demoAbzug.ts';

type Reiter = 'aufteilung' | 'analyse';

const REITER: readonly { readonly wert: Reiter; readonly bezeichnung: string }[] = [
  { wert: 'aufteilung', bezeichnung: de.aufteilung.reiterAufteilung },
  { wert: 'analyse', bezeichnung: de.aufteilung.reiterAnalyse },
];

export function AufteilungKachel() {
  const [reiter, setReiter] = useState<Reiter>('aufteilung');
  const [hervorgehoben, setHervorgehoben] = useState<string | null>(null);
  const [gehoverter, setGehoverter] = useState<string | null>(null);
  const [anfrage, setAnfrage] = useState<string | null>(null);

  const abfrage = useQuery({ queryKey: schluessel.aufteilung, queryFn: api.aufteilung });
  const kennzahlen = useQuery({ queryKey: schluessel.kennzahlen, queryFn: api.kennzahlen });
  const health = useQuery({ queryKey: schluessel.health, queryFn: api.health });
  const lookThroughAn = health.data?.top25 === true;
  const top25 = useQuery({ queryKey: schluessel.top25, queryFn: api.top25, enabled: lookThroughAn });
  // Ein abgelehntes Ziel wird beim zweiten Versuch nicht richtiger.
  const rebalancing = useQuery({
    queryKey: schluessel.rebalancing(anfrage ?? ''),
    queryFn: () => api.rebalancing(anfrage ?? ''),
    enabled: anfrage !== null,
    retry: false,
  });

  const daten = abfrage.data;
  const lookThrough = top25.data;
  const gesamtCent = kennzahlen.data?.gesamtCent ?? null;
  const ohneUnternehmen = lookThroughAn && lookThrough !== undefined && lookThrough.zeilen.length === 0;
  // Erst mit Unternehmen: lädt der Look-Through noch oder scheitert er, bleibt die Aufteilung allein.
  const mitReitern = lookThroughAn && lookThrough !== undefined && !ohneUnternehmen;
  // Verschwinden die Reiter, gilt die Wahl nicht mehr: kehren sie zurück, beginnt die Kachel wieder
  // mit der Aufteilung, statt ungefragt in die Analyse zu springen.
  if (!mitReitern && reiter !== 'aufteilung') setReiter('aufteilung');
  const analyse = mitReitern && reiter === 'analyse';

  const zustand = analyse
    ? kachelZustand(top25, (d) => d.zeilen.length === 0, de.top25.leer)
    : kachelZustand(abfrage, (d) => d.positionen.length === 0 && d.cashCent === 0, de.aufteilung.leer);
  const fondsHinweise =
    lookThrough !== undefined && (analyse || ohneUnternehmen) ? <FondsHinweise daten={lookThrough} /> : null;

  const kachel = (
    <Kachel
      titel={analyse ? de.aufteilung.analyseTitel : de.aufteilung.titel}
      id="aufteilung"
      zustand={zustand}
      ladehoehe={analyse ? 'gross' : 'mittel'}
      werkzeuge={
        <>
          {fondsHinweise}
          {!analyse && zustand.art === 'bereit' && daten !== undefined ? (
            <RebalancingDialog
              positionen={daten.positionen}
              cashCent={daten.cashCent}
              cashAnteil={daten.cashAnteil}
              gesamtCent={gesamtCent}
              angefragt={anfrage}
              ergebnis={{ daten: rebalancing.data, fehler: rebalancing.error, laedt: rebalancing.isFetching }}
              onBerechnen={setAnfrage}
              festesZiel={istDemoModus() && !tokenVorhanden() ? DEMO_REBALANCING_ZIEL : null}
            />
          ) : null}
          {mitReitern ? (
            <TabsList aria-label={de.aufteilung.ansicht}>
              {REITER.map((r) => (
                <TabsTrigger key={r.wert} value={r.wert}>
                  {r.bezeichnung}
                </TabsTrigger>
              ))}
            </TabsList>
          ) : null}
        </>
      }
      fussnoten={<Driftfussnote drift={analyse ? lookThrough?.drift : daten?.drift} />}
    >
      {analyse ? (
        lookThrough === undefined ? null : (
          <TabsContent value="analyse">
            <AnalyseAnsicht daten={lookThrough} />
          </TabsContent>
        )
      ) : daten === undefined ? null : (
        <AufteilungInhalt mitReitern={mitReitern}>
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
        </AufteilungInhalt>
      )}
    </Kachel>
  );

  if (!mitReitern) return kachel;
  return (
    <Tabs value={analyse ? 'analyse' : 'aufteilung'} onValueChange={(wert) => setReiter(wert as Reiter)} className="gap-0">
      {kachel}
    </Tabs>
  );
}

/** Ohne Reiter gäbe es keinen Tab, der das Panel benennt — dann ohne `tabpanel`. */
function AufteilungInhalt({ mitReitern, children }: { readonly mitReitern: boolean; readonly children: ReactNode }) {
  return mitReitern ? <TabsContent value="aufteilung">{children}</TabsContent> : children;
}
