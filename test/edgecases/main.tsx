/*
 * Einstieg der Testseite. Ohne `?fall=` die Uebersicht in Tabs, mit `?fall=` ein Rahmen:
 * die ganze App oder eine einzelne Kachel, jeweils mit gestubbtem `fetch`. Rahmen, weil
 * `src/App.tsx` einen QueryClient auf Modulebene haelt und sich Cache, Toasts und
 * localStorage sonst zwischen den Faellen mischten.
 */

import { StrictMode, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import './edgecases.css';
import { AppMitGrenze } from '@/App';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/sonner';
import { VerlaufKachel } from '@/features/verlauf/VerlaufKachel';
import { AufteilungKachel } from '@/features/aufteilung/AufteilungKachel';
import { KennzahlenKachel } from '@/features/kennzahlen/KennzahlenKachel';
import { Top25Kachel } from '@/features/top25/Top25Kachel';
import { FluesseKachel } from '@/features/fluesse/FluesseKachel';
import { SparplaeneKachel } from '@/features/sparplaene/SparplaeneKachel';

import {
  AktualisierenElemente,
  AnmeldungElemente,
  DriftElemente,
  KachelElemente,
  LaufElemente,
  StatusseitenElemente,
} from './elemente.tsx';
import { FAELLE, type Ansicht, type Fall } from './faelle.ts';
import { installiereStub, type Basis } from './stub.ts';

/* -------------------------------------------------------------------------- Rahmen */

const KACHELN: Record<Exclude<Ansicht, 'seite'>, ComponentType> = {
  verlauf: VerlaufKachel,
  kennzahlen: KennzahlenKachel,
  aufteilung: AufteilungKachel,
  top25: Top25Kachel,
  fluesse: FluesseKachel,
  sparplaene: SparplaeneKachel,
};

async function starteFall(fall: Fall, ziel: HTMLElement): Promise<void> {
  const basis = (await (await fetch('/__edgecases/basis.json')).json()) as Basis;
  installiereStub(fall, basis);
  try {
    if (fall.zielaufteilung === undefined) localStorage.removeItem('portfolio.zielaufteilung');
    else localStorage.setItem('portfolio.zielaufteilung', JSON.stringify(fall.zielaufteilung));
  } catch {
    // ohne Speicher eben ohne
  }
  meldeHoehe(fall.id);

  let inhalt: ReactNode;
  if (fall.ansicht === 'seite') {
    inhalt = <AppMitGrenze />;
  } else {
    const Einzeln = KACHELN[fall.ansicht];
    // Dieselben Vorgaben wie der QueryClient in App.tsx.
    const abfragen = new QueryClient({
      defaultOptions: {
        queries: { staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: 1 },
      },
    });
    inhalt = (
      <QueryClientProvider client={abfragen}>
        <Toaster position="top-center" />
        <div className="p-2 text-text">
          <Einzeln />
        </div>
      </QueryClientProvider>
    );
  }

  createRoot(ziel).render(
    <StrictMode>
      {inhalt}
    </StrictMode>,
  );

  const klicks = typeof fall.klick === 'string' ? [fall.klick] : (fall.klick ?? []);
  for (const [i, text] of klicks.entries()) {
    const suche = (): HTMLButtonElement | undefined =>
      [...document.querySelectorAll('button')].find(
        (b) =>
          !b.disabled && ((b.textContent ?? '').trim().startsWith(text) || b.getAttribute('aria-label') === text),
      );
    // Erst wenn die Seite zur Ruhe kommt: vorher fehlt der Toaster, und der Anmeldeknopf
    // haengt noch am Platzhalter-Handler aus dem ersten Render.
    if ((await warteAuf(suche)) === undefined) break;
    await new Promise((fertig) => setTimeout(fertig, i === 0 ? 1000 : 200));
    suche()?.click();
  }
}

/** Die Uebersicht passt die Rahmenhoehe an den Inhalt an — kein zweiter Scrollbalken. */
function meldeHoehe(id: string): void {
  const melde = (): void => {
    // Toasts sind `fixed` und zaehlen nicht zur scrollHeight — ohne sie schnitte der Rahmen
    // einen Toast ab, der unter dem Seitenende steht.
    const toasts = [...document.querySelectorAll('[data-sonner-toast]')].map(
      (t) => t.getBoundingClientRect().bottom + 16,
    );
    const hoehe = Math.ceil(Math.max(document.body.scrollHeight, ...toasts));
    window.parent.postMessage({ edgecase: id, hoehe }, location.origin);
  };
  new ResizeObserver(melde).observe(document.body);
  new MutationObserver(melde).observe(document.body, {
    childList: true,
    subtree: true,
    // Sonner setzt data-mounted erst nach dem Einblenden; vorher ist der Toast noch nach oben versetzt.
    attributeFilter: ['data-mounted', 'data-removed'],
  });
  melde();
}

async function warteAuf<T>(suche: () => T | undefined, ms = 8000): Promise<T | undefined> {
  const ende = Date.now() + ms;
  while (Date.now() < ende) {
    const treffer = suche();
    if (treffer !== undefined) return treffer;
    await new Promise((fertig) => setTimeout(fertig, 100));
  }
  return undefined;
}

/* ---------------------------------------------------------------------- Uebersicht */

const BREITEN = [
  { name: 'Handy', klasse: 'max-w-[390px]' },
  { name: 'Tablet', klasse: 'max-w-[820px]' },
  { name: 'Desktop', klasse: 'max-w-none' },
] as const;

type Tab = { id: string; titel: string; inhalt: () => ReactNode };

const rahmen = (gruppe: string) => () => <Rahmenliste gruppe={gruppe} />;

const TABS: readonly Tab[] = [
  { id: 'seite', titel: 'Ganze Seite', inhalt: rahmen('seite') },
  { id: 'lauf', titel: 'Lauf', inhalt: () => <LaufElemente /> },
  { id: 'anmeldung', titel: 'Anmeldung', inhalt: () => <AnmeldungElemente /> },
  { id: 'statusseiten', titel: 'Bau & Anmeldeseite', inhalt: () => <StatusseitenElemente /> },
  { id: 'aktualisieren', titel: 'Aktualisieren & Toasts', inhalt: () => <AktualisierenElemente /> },
  { id: 'drift', titel: 'Selbstkontrolle', inhalt: () => <DriftElemente /> },
  { id: 'kachel', titel: 'Kachelzustände', inhalt: () => <KachelElemente /> },
  { id: 'verlauf', titel: 'Verlauf', inhalt: rahmen('verlauf') },
  { id: 'kennzahlen', titel: 'Kennzahlen', inhalt: rahmen('kennzahlen') },
  { id: 'aufteilung', titel: 'Aufteilung', inhalt: rahmen('aufteilung') },
  { id: 'rebalancing', titel: 'Rebalancing', inhalt: rahmen('rebalancing') },
  { id: 'top25', titel: 'Top 25', inhalt: rahmen('top25') },
  { id: 'fluesse', titel: 'Käufe & Sparpläne', inhalt: rahmen('fluesse') },
];

function tabAusAdresse(): string {
  const id = location.hash.slice(1);
  return TABS.some((t) => t.id === id) ? id : 'seite';
}

function Uebersicht() {
  const [breite, setBreite] = useState<(typeof BREITEN)[number]>(BREITEN[2]);
  const [tab, setTab] = useState(tabAusAdresse);
  const [neu, setNeu] = useState(0);

  useEffect(() => {
    const folgen = (): void => setTab(tabAusAdresse());
    window.addEventListener('hashchange', folgen);
    return () => window.removeEventListener('hashchange', folgen);
  }, []);

  return (
    <div className="min-h-screen px-4 py-6 text-text">
      <Tabs
        value={tab}
        onValueChange={(id) => {
          setTab(id);
          history.replaceState(null, '', `#${id}`);
        }}
        className="mx-auto max-w-8xl gap-6"
      >
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h1 className="font-heading text-3xl font-semibold">Randfälle</h1>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div role="group" aria-label="Breite" className="flex items-center gap-1">
                <span className="mr-1 text-text-leise">Breite</span>
                {BREITEN.map((b) => (
                  <button
                    key={b.name}
                    type="button"
                    aria-pressed={b === breite}
                    className={`rounded-md border border-rand px-2 py-1 ${b === breite ? 'bg-bedien-aktiv' : 'hover:bg-bedien'}`}
                    onClick={() => setBreite(b)}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="rounded-md border border-rand px-2 py-1 hover:bg-bedien-aktiv"
                onClick={() => setNeu((n) => n + 1)}
              >
                neu laden
              </button>
            </div>
          </div>
          <TabsList className="h-auto flex-wrap justify-start">
            {TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="flex-none">
                {t.titel}
              </TabsTrigger>
            ))}
          </TabsList>
        </header>

        {TABS.map((t) => (
          <TabsContent key={`${t.id}-${String(neu)}`} value={t.id} className={`w-full ${breite.klasse}`}>
            {t.inhalt()}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function Rahmenliste({ gruppe }: { gruppe: string }) {
  return (
    <div className="flex flex-col gap-10">
      {FAELLE.filter((f) => f.gruppe === gruppe).map((f) => (
        <FallRahmen key={f.id} fall={f} />
      ))}
    </div>
  );
}

function FallRahmen({ fall }: { readonly fall: Fall }) {
  const [neu, setNeu] = useState(0);
  const [hoehe, setHoehe] = useState(fall.mindesthoehe ?? 200);
  const adresse = `?fall=${encodeURIComponent(fall.id)}`;

  useEffect(() => {
    const empfange = (e: MessageEvent<{ edgecase?: string; hoehe?: number }>): void => {
      if (e.origin !== location.origin || e.data.edgecase !== fall.id || typeof e.data.hoehe !== 'number') return;
      setHoehe(Math.max(e.data.hoehe, fall.mindesthoehe ?? 0));
    };
    window.addEventListener('message', empfange);
    return () => window.removeEventListener('message', empfange);
  }, [fall]);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold">{fall.titel}</h2>
        <code className="text-xs text-text-leise">{fall.id}</code>
        <button type="button" className="text-xs text-text-leise underline" onClick={() => setNeu((n) => n + 1)}>
          neu laden
        </button>
        <a className="text-xs text-text-leise underline" href={adresse} target="_blank" rel="noreferrer">
          einzeln öffnen
        </a>
      </div>
      {fall.beschreibung === undefined ? null : <p className="text-sm text-text-leise">{fall.beschreibung}</p>}
      <iframe
        key={neu}
        title={fall.titel}
        src={adresse}
        className="w-full rounded-lg border border-rand bg-grund"
        style={{ height: `${String(hoehe)}px` }}
      />
    </section>
  );
}

/* --------------------------------------------------------------------------- Start */

// Am Ende, weil das `await` unten sonst Konstanten weiter unten vor ihrer Zuweisung erreicht.
const wurzel = document.getElementById('wurzel');
if (wurzel === null) throw new Error('Kein Element mit der id "wurzel" in der Seite.');

// Rahmen und Uebersicht teilen sich den Ursprung: ein ausgeblendeter Hinweis soll nicht
// beim naechsten Laden fehlen, und die Jahrestabelle eines Falls nicht in jedem anderen stehen.
try {
  localStorage.removeItem('portfolio.ausgeblendet');
  localStorage.removeItem('portfolio.kacheln-ausgeblendet');
  localStorage.removeItem('portfolio.verlaufDarstellung');
} catch {
  // ohne Speicher eben ohne
}

const fallId = new URLSearchParams(location.search).get('fall');

if (fallId === null) {
  createRoot(wurzel).render(
    <StrictMode>
      <Uebersicht />
    </StrictMode>,
  );
} else {
  const fall = FAELLE.find((f) => f.id === fallId);
  if (fall === undefined) {
    wurzel.textContent = `Unbekannter Fall: ${fallId}`;
  } else {
    await starteFall(fall, wurzel);
  }
}
