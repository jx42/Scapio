/*
 * Kachel 1, Container: holt die Zeitreihe und haelt die zwei Auswahlzustaende.
 *
 * Hier — und nur hier — wird gefragt, geladen und entschieden, welchen Zustand die
 * Kachel zeigt. Die Ansicht darunter bekommt fertige Werte und rendert. [P-06]
 *
 * Ansicht und Zeitraum ueberleben ein Neuladen im localStorage; ein Dashboard, das bei
 * jedem Start wieder auf "1W" springt, wird zweimal am Tag umgestellt.
 *
 * Leer ist die Kachel nur, wenn es GAR KEINE Reihe gibt (`reiheLeer`) — vor dem ersten
 * Lauf. Ein Fenster ohne Punkte ist kein Leerzustand: dort bleibt die Ansicht samt
 * Zeitraumwahl stehen und zeigt ihren eigenen Hinweis. Sonst verschwaende mit dem
 * Diagramm auch die Bedienung, mit der man das leere Fenster wieder verlassen koennte —
 * der gespeicherte Zeitraum haelt die Kachel dann ueber jedes Neuladen hinweg leer.
 *
 * Der frei gewaehlte Zeitraum des Reglers wird nicht gespeichert: er haengt an den Tagen
 * der Reihe, die mit jedem Lauf weiterwandert. In der Demo steht der Regler gesperrt da —
 * der statische Abzug kennt nur die festen Zeitraeume. [ADR-048]
 */

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { de } from '@/i18n/de';
import {
  BENCHMARKS,
  RISIKOFREI,
  STANDARD_BENCHMARK,
  ZEITRAEUME,
  api,
  kachelZustand,
  schluessel,
  type Zeitraum,
  type ZeitraumAuswahl,
} from '@/lib/api';
import { istDemoModus } from '@/lib/demoModus';
import { AN_AUS, useGespeichert, type AnAus } from '@/lib/speicher';
import { Kachel } from '@/components/Kachel';
import { InfoKnopf } from '@/components/InfoKnopf';
import { Driftfussnote, chartGesperrt, sperrtext } from '@/components/Driftbanner';
import { Tabs } from '@/components/ui/tabs';
import { Benchmarkwahl } from '@/features/verlauf/Benchmarkwahl';
import { Linienwahl } from '@/features/verlauf/Linienwahl';
import { VERLAUF_MODI, VerlaufAnsicht, type VerlaufAnsichtModus } from '@/features/verlauf/VerlaufAnsicht';
import { VerlaufKennzahlen } from '@/features/verlauf/VerlaufKennzahlen';
import { Verlaufwahl } from '@/features/verlauf/Verlaufwahl';

/**
 * `useGespeichert` nimmt nur `string`-Werte — `null` ("kein Vergleich") braucht also
 * einen Sentinel fuer den localStorage-Schluessel. Nach aussen (Query, Benchmarkwahl)
 * wird sofort wieder auf `string | null` gewandelt, dort ist der Sentinel nicht sichtbar.
 */
const KEIN_BENCHMARK = 'keiner';
const BENCHMARK_AUSWAHL = [KEIN_BENCHMARK, ...BENCHMARKS.map((b) => b.isin), RISIKOFREI.isin] as const;
type BenchmarkAuswahl = (typeof BENCHMARK_AUSWAHL)[number];

/** Selbe `string`-Beschraenkung wie oben. */

export function VerlaufKachel() {
  const [zeitraum, setZeitraum] = useGespeichert<Zeitraum>('zeitraum', 'max', ZEITRAEUME);
  const [frei, setFrei] = useState<{ readonly von: string; readonly bis: string } | null>(null);
  const [auswahlRunde, setAuswahlRunde] = useState(0);
  const auswahl: ZeitraumAuswahl = frei ?? zeitraum;
  const [modus, setModus] = useGespeichert<VerlaufAnsichtModus>('verlaufModus', 'vermoegen', VERLAUF_MODI);
  const [benchmarkAuswahl, setBenchmarkAuswahl] = useGespeichert<BenchmarkAuswahl>(
    'benchmark',
    STANDARD_BENCHMARK,
    BENCHMARK_AUSWAHL,
  );
  const zeigeRisikofrei = modus === 'rendite';
  // Wechselt der Tab, bevor `onValueChange` unten die Auswahl zuruecksetzen konnte (z.B.
  // beim Laden mit einer alten Auswahl im localStorage), zaehlt hier nur diese Ableitung —
  // Query und Anzeige sehen nie einen risikofreien Vergleich ausserhalb des Rendite-Tabs.
  const benchmark =
    benchmarkAuswahl === KEIN_BENCHMARK || (!zeigeRisikofrei && benchmarkAuswahl === RISIKOFREI.isin)
      ? null
      : benchmarkAuswahl;
  const [zeigeEinzahlungAuswahl, setZeigeEinzahlungAuswahl] = useGespeichert<AnAus>('linieEinzahlung', 'an', AN_AUS);
  const [zeigeZufluesseAuswahl, setZeigeZufluesseAuswahl] = useGespeichert<AnAus>('linieZufluesse', 'aus', AN_AUS);

  const abfrage = useQuery({
    queryKey: schluessel.zeitreihe(auswahl, benchmark),
    queryFn: () => api.zeitreihe(auswahl, benchmark),
    // Ohne das waere jeder neue Schluessel `isPending`: Skeleton statt Chart, dann
    // Neuaufbau — das Flackern beim Umschalten.
    placeholderData: keepPreviousData,
  });
  const kennzahlenAbfrage = useQuery({ queryKey: schluessel.kennzahlen, queryFn: api.kennzahlen });

  // Scheitert der freie Zeitraum, zurueck auf den festen: die Fehlerkachel zeigte weder
  // Regler noch Segmentleiste, und ohne Neuladen kaeme man nicht mehr heraus.
  if (frei !== null && abfrage.isError) {
    setFrei(null);
    setAuswahlRunde((n) => n + 1);
  }

  const daten = abfrage.data;

  const zustand = kachelZustand(abfrage, (d) => d.reiheLeer);

  return (
    <div className="flex flex-col gap-4">
      <VerlaufKennzahlen daten={kennzahlenAbfrage.data} laedt={kennzahlenAbfrage.isPending} />
      <Tabs
        value={modus}
        onValueChange={(wert) => {
          const neu = wert as VerlaufAnsichtModus;
          setModus(neu);
          // Der risikofreie Zins ist nur im Rendite-Tab waehlbar (ADR-026): eine
          // Auswahl, die beim Verlassen stehen bliebe, waere im Vermoegen-Tab nicht
          // mehr abwaehlbar.
          if (neu !== 'rendite' && benchmarkAuswahl === RISIKOFREI.isin) {
            setBenchmarkAuswahl(KEIN_BENCHMARK);
          }
        }}
      >
        <Kachel
          titel={de.verlauf.titel}
          info={
            <InfoKnopf bezeichnung={de.verlauf.titel} inhaltKlasse="max-w-sm">
              {de.verlauf.kursrasterInfo}
            </InfoKnopf>
          }
          id="verlauf"
          zustand={zustand}
          ladehoehe="gross"
          werkzeuge={
            zustand.art === 'bereit' ? (
              <>
                {modus !== 'vermoegen' ? null : (
                  <Linienwahl
                    zeigeEinzahlung={zeigeEinzahlungAuswahl === 'an'}
                    zeigeZufluesse={zeigeZufluesseAuswahl === 'an'}
                    onZeigeEinzahlung={(wert) => {
                      setZeigeEinzahlungAuswahl(wert ? 'an' : 'aus');
                    }}
                    onZeigeZufluesse={(wert) => {
                      setZeigeZufluesseAuswahl(wert ? 'an' : 'aus');
                    }}
                  />
                )}
                <Benchmarkwahl
                  gewaehlt={benchmark}
                  onWahl={(isin) => {
                    setBenchmarkAuswahl((isin ?? KEIN_BENCHMARK) as BenchmarkAuswahl);
                  }}
                  zeigeRisikofrei={zeigeRisikofrei}
                />
                <Verlaufwahl />
              </>
            ) : undefined
          }
          fussnoten={<Driftfussnote drift={daten?.drift} />}
        >
          {daten === undefined ? null : (
            <VerlaufAnsicht
              punkte={daten.punkte}
              marken={daten.marken}
              zeitraum={frei === null ? zeitraum : null}
              ausschnitt={daten.ausschnitt}
              tage={daten.tage}
              reglerGesperrt={istDemoModus()}
              auswahlRunde={auswahlRunde}
              modus={modus}
              fensterGewinnCent={daten.fensterGewinnCent}
              fensterGewinnProzent={daten.fensterGewinnProzent}
              gesperrt={chartGesperrt(daten.drift)}
              sperrgrund={sperrtext(daten.drift)}
              onZeitraum={(neu) => {
                setFrei(null);
                setAuswahlRunde((n) => n + 1);
                setZeitraum(neu);
              }}
              onFreierZeitraum={(von, bis) => {
                setFrei({ von, bis });
              }}
              benchmark={daten.benchmark}
              zeigeEinzahlung={zeigeEinzahlungAuswahl === 'an'}
              zeigeZufluesse={zeigeZufluesseAuswahl === 'an'}
            />
          )}
        </Kachel>
      </Tabs>
    </div>
  );
}
