/*
 * Die ganze Anwendung: eine Seite, sechs Kacheln, kein Router.
 *
 * Es gibt nichts zu navigieren — alles, was das Dashboard weiss, passt untereinander.
 * Ein Router waere eine Abhaengigkeit fuer null Zustaende. [P-06]
 *
 * `staleTime: Infinity`: die Daten aendern sich ausschliesslich durch einen Lauf, und
 * ein Lauf raeumt danach selbst den Cache. Ein Zeitablauf, der im Hintergrund neu
 * ladet, wuerde nur dieselben Zahlen noch einmal holen. [10.3]
 *
 * Der Drift-Banner steht ueber allem, nicht in einer Kachel: er betrifft jede Zahl
 * auf dieser Seite, nicht eine davon. Aus demselben Grund stehen die Hinweise des
 * letzten Laufs und der Ablauf der MCP-Anmeldung hier und nicht als Fussnote unter
 * dem Aktualisieren-Knopf: sie gelten der Seite, nicht dem Knopf. Den Anmeldeablauf
 * haelt weiterhin `Aktualisieren` allein (eine Abfrage, eine Mutation) — hier wird er
 * nur ueber `onAnmeldungStatus` mitgelesen, nicht verdoppelt.
 */

import { useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { ArrowUpRight, ChartLine, RefreshCw } from 'lucide-react';

import { de } from '@/i18n/de';
import { api, istNetzFehler, schluessel } from '@/lib/api';
import { istDemoModus } from '@/lib/demoModus';
import { tokenVorhanden } from '@/lib/token';
import { zeitpunktKurz } from '@/lib/format';
import { linkVariants } from '@/lib/linkStil';
import { cn } from '@/lib/utils';
import { useElementHoehe } from '@/hooks/useElementHoehe';
import { useMedienAbfrage } from '@/hooks/useMedienAbfrage';
import { Aktualisieren, type McpAnmeldungStatus } from '@/components/Aktualisieren';
import { AktualisierenHinweise } from '@/components/AktualisierenHinweise';
import { Driftbanner } from '@/components/Driftbanner';
import { Fehlergrenze } from '@/components/Fehlergrenze';
import { Laufhinweise } from '@/components/Laufhinweise';
import { Leuchtfilter } from '@/components/Leuchtfilter';
import { McpAnmeldungHinweise } from '@/components/McpAnmeldungHinweise';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { VerlaufKachel } from '@/features/verlauf/VerlaufKachel';
import { AufteilungKachel } from '@/features/aufteilung/AufteilungKachel';
import { KennzahlenKachel } from '@/features/kennzahlen/KennzahlenKachel';
import { LookThroughKacheln } from '@/features/top25/LookThroughKacheln';
import { FluesseKachel } from '@/features/fluesse/FluesseKachel';
import { GewinnquellenKachel } from '@/features/gewinnquellen/GewinnquellenKachel';
import { SparplaeneKachel } from '@/features/sparplaene/SparplaeneKachel';

// Zielgröße: ohne Innenabstand sind die Footer-Links nur 17 px hoch (WCAG 2.5.8).
const FUSS_LINK = cn(linkVariants(), 'inline-block py-1');

const abfragen = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={abfragen}>
      <Seite />
    </QueryClientProvider>
  );
}

/** Der sichtbare Teil. Eigene Komponente, weil er Abfragen benutzt. */
function Seite() {
  const health = useQuery({ queryKey: schluessel.health, queryFn: api.health });
  // Dieselbe Query wie in `Aktualisieren` — react-query teilt sich den Cache ueber
  // den Schluessel, kein zweiter Netzwerkzugriff.
  const lauf = useQuery({ queryKey: schluessel.lauf, queryFn: api.lauf });
  const stand = zeitpunktKurz(health.data?.stand);
  const [anmeldungStatus, setAnmeldungStatus] = useState<McpAnmeldungStatus>({
    noetig: false,
    erstmals: false,
    laeuft: false,
    erfolg: false,
    fehler: null,
    onAnmelden: () => {},
    onAktualisieren: () => {},
  });
  const aufteilungRef = useRef<HTMLDivElement>(null);
  const aufteilungHoehe = useElementHoehe(aufteilungRef);
  // Ausgeklappt kehrt die Hoehen-Bindung zwischen Aufteilung und Kennzahlen bewusst um:
  // normalerweise fuehrt Aufteilung, hier fuehrt die aufgeklappte, ungebundene Kennzahlen-
  // Kachel, und Aufteilung waechst mit, damit die beiden Nachbarkacheln nicht auseinanderfallen.
  const kennzahlenRef = useRef<HTMLDivElement>(null);
  const kennzahlenHoehe = useElementHoehe(kennzahlenRef);
  const [kennzahlenAusgeklappt, setKennzahlenAusgeklappt] = useState(false);
  // Entspricht `xl:` im Grid unten: erst ab dort stehen die beiden nebeneinander.
  const nebeneinander = useMedienAbfrage('(width >= 80rem)');
  // Ohne `erfolg` und `fehler`: deren Alerts bieten schon selbst die naechste Aktion an.
  const willkommen =
    health.data?.drift.stufe === 'leer' &&
    !anmeldungStatus.noetig &&
    !anmeldungStatus.laeuft &&
    !anmeldungStatus.erfolg &&
    anmeldungStatus.fehler === null &&
    !istDemoModus() &&
    // Nur vor dem allerersten Lauf: einen gescheiterten erklaert schon `Laufhinweise`.
    lauf.data !== undefined &&
    lauf.data.laufId === null;
  // Solange ein Alert die Aktion anbietet, waeren Knopf und Stand im Kopf doppelt.
  const kopfAusblenden = willkommen || anmeldungStatus.noetig || anmeldungStatus.laeuft;

  return (
    <div className="min-h-screen text-text">
      <Leuchtfilter />
      <Toaster position="top-center" />

      <a
        href="#kacheln"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:rounded-md focus:border focus:border-rand focus:bg-flaeche focus:px-3 focus:py-2"
      >
        {de.seite.skip}
      </a>

      {/* Fehlt der Server, scheitert jede Kachel gleich; gemeldet wird das nur hier, einmal. */}
      {istNetzFehler(health.error) ? (
        <p role="alert" className="sr-only">{de.fehler.netz}</p>
      ) : null}

      {istDemoModus() && <DemoBand />}

      <header className="mx-auto flex max-w-8xl flex-wrap items-end justify-between gap-4 px-4 pt-6 pb-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-balance text-text sm:text-3xl">
            {de.seite.titel}
            {istDemoModus() && de.seite.titelDemoZusatz}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {!kopfAusblenden && stand !== null && <p className="text-xs text-text-leise">{de.seite.stand(stand)}</p>}
          <Aktualisieren onAnmeldungStatus={setAnmeldungStatus} verborgen={kopfAusblenden} />
        </div>
      </header>

      <div className="mx-auto flex max-w-8xl flex-col gap-2 px-4 has-[[role=status],[role=alert]]:mb-4">
        <Driftbanner drift={health.data?.drift} />
        <AktualisierenHinweise kannAktualisieren={tokenVorhanden()} />
        {willkommen ? (
          <Alert role="status" variant="gewinn">
            <ChartLine aria-hidden="true" />
            <AlertTitle>{de.seite.willkommenTitel}</AlertTitle>
            <AlertDescription>{de.seite.willkommen}</AlertDescription>
            <AlertAction>
              <Button type="button" size="sm" disabled={!tokenVorhanden()} onClick={anmeldungStatus.onAktualisieren}>
                <RefreshCw aria-hidden="true" />
                {de.aktualisieren.knopf}
              </Button>
            </AlertAction>
          </Alert>
        ) : null}
        <Laufhinweise
          laufId={lauf.data?.laufId ?? null}
          hinweise={lauf.data?.hinweise ?? []}
          quellen={anmeldungStatus.noetig ? {} : (lauf.data?.quellen ?? {})}
          fehler={anmeldungStatus.noetig || lauf.data?.status !== 'fehler' ? null : (lauf.data.fehler ?? null)}
          onAktualisieren={anmeldungStatus.onAktualisieren}
        />
        <McpAnmeldungHinweise {...anmeldungStatus} />
      </div>

      <main id="kacheln" tabIndex={-1} aria-label={de.seite.haupt} className="mx-auto max-w-8xl px-4 pb-4 outline-none">
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.55fr)]">
          <div className="xl:col-span-2">
            <VerlaufKachel />
          </div>
          <div ref={aufteilungRef}>
            <AufteilungKachel hoehe={nebeneinander && kennzahlenAusgeklappt ? kennzahlenHoehe : null} />
          </div>
          <div ref={kennzahlenRef}>
            <KennzahlenKachel
              hoehe={nebeneinander ? aufteilungHoehe : null}
              onAusgeklapptAendern={setKennzahlenAusgeklappt}
            />
          </div>
          {/* Nur mit `top25` in einstellungen.json [ADR-038]. */}
          {health.data?.top25 === true ? (
            <div className="xl:col-span-2">
              <LookThroughKacheln />
            </div>
          ) : null}
          <div className="xl:col-span-2">
            <GewinnquellenKachel />
          </div>
          <div className="flex flex-col self-stretch">
            <FluesseKachel />
          </div>
          <div className="flex flex-col self-stretch">
            <SparplaeneKachel />
          </div>
        </div>
      </main>

      <footer className="mx-auto flex max-w-8xl flex-wrap items-center justify-between gap-2 px-4 pb-8 text-xs text-text-leise">
        {health.data === undefined ? null : (
          <p>
            {de.seite.fussVersion(health.data.version)} ·{' '}
            <a
              href="https://github.com/jx42/Scapio#readme" /* INV-AUSNAHME: feste Adresse, kein Wert — ADR-046 */
              target="_blank"
              rel="noopener noreferrer"
              aria-label={de.seite.fussReadmeOeffnen}
              className={FUSS_LINK}
            >
              {de.seite.fussReadme}
            </a>{' '}
            ·{' '}
            <a
              href="https://github.com/jx42/Scapio/releases" /* INV-AUSNAHME: feste Adresse, kein Wert — ADR-022 */
              target="_blank"
              rel="noopener noreferrer"
              aria-label={de.seite.fussVersionenOeffnen}
              className={FUSS_LINK}
            >
              {de.seite.fussVersionen}
            </a>{' '}
            ·{' '}
            <a
              href="/assets/drittlizenzen.txt" /* INV-AUSNAHME: feste Adresse, kein Wert; gleich DRITTLIZENZEN_DATEI — ADR-055 */
              target="_blank"
              rel="noopener noreferrer"
              aria-label={de.seite.fussLizenzenOeffnen}
              className={FUSS_LINK}
            >
              {de.seite.fussLizenzen}
            </a>
          </p>
        )}
        <p>{de.seite.fussHinweis}</p>
        <p>
          {de.seite.fussQuellen}{' '}
          <a
            href="https://scalable.capital" /* INV-AUSNAHME: feste Adresse, kein Wert — ADR-022 */
            target="_blank"
            rel="noopener noreferrer"
            aria-label={de.seite.fussScalableOeffnen}
            className={FUSS_LINK}
          >
            {de.seite.fussScalable}
          </a>{' '}
          ·{' '}
          <a
            href="https://ec.europa.eu/eurostat" /* INV-AUSNAHME: feste Adresse, kein Wert — ADR-021 */
            target="_blank"
            rel="noopener noreferrer"
            aria-label={de.seite.fussEurostatOeffnen}
            className={FUSS_LINK}
          >
            {de.seite.fussEurostat}
          </a>{' '}
          ·{' '}
          <a
            href="https://data.ecb.europa.eu/" /* INV-AUSNAHME: feste Adresse, kein Wert — ADR-021 */
            target="_blank"
            rel="noopener noreferrer"
            aria-label={de.seite.fussEzbOeffnen}
            className={FUSS_LINK}
          >
            {de.seite.fussEzb}
          </a>
        </p>
      </footer>
    </div>
  );
}

/**
 * Nur in der Demo: wer sie öffnet, kommt meist von außen und sucht das Projekt dahinter. [ADR-052]
 * Sticky, damit der Hinweis bei jeder Zahl mitläuft; unter `sm` die Kurzfassung in einer Zeile,
 * sonst fräße das Band ein Viertel des Bildschirms.
 */
function DemoBand() {
  return (
    <aside aria-label={de.seite.demoBand} data-demo-band className="sticky top-0 z-40 bg-demo-band text-demo-band-text">
      <p className="mx-auto flex max-w-8xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
        <span className="sm:hidden">{de.seite.demoBandTextKurz}</span>
        <span className="max-sm:hidden">{de.seite.demoBandText}</span>
        <a
          href="https://github.com/jx42/Scapio" /* INV-AUSNAHME: feste Adresse, kein Wert — ADR-052 */
          target="_blank"
          rel="noopener noreferrer"
          aria-label={de.seite.demoBandLinkOeffnen}
          className={cn(linkVariants(), 'inline-flex min-h-6 items-center gap-1 font-semibold hover:text-demo-band-text')}
        >
          <span className="sm:hidden">{de.seite.demoBandLinkKurz}</span>
          <span className="max-sm:hidden">{de.seite.demoBandLink}</span>
          <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </a>
      </p>
    </aside>
  );
}

/** Die aeusserste Fehlergrenze: stuerzt der Rahmen, bleibt eine Erklaerung stehen. */
export function AppMitGrenze() {
  return (
    <Fehlergrenze>
      <App />
    </Fehlergrenze>
  );
}
