/*
 * Die Meldungen der Testseite, die nur Props brauchen: jede einzeln, untereinander, ohne
 * App drumherum. Fehlertexte, die `src/lib/api.ts` aus einer Antwort macht, entstehen dort
 * selbst (`echterFehler`) — hier wird kein Satz nachgebaut.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { de } from '@/i18n/de';
import { ApiFehler, api, fehlerZustand } from '@/lib/api';
import { AktualisierenAnsicht, type AktualisierenAnsichtProps, type McpAnmeldungStatus } from '@/components/Aktualisieren';
import { AktualisierenHinweise } from '@/components/AktualisierenHinweise';
import { Driftbanner, Driftfussnote } from '@/components/Driftbanner';
import { Kachel, type KachelZustand } from '@/components/Kachel';
import { Laufhinweise } from '@/components/Laufhinweise';
import { McpAnmeldungHinweise } from '@/components/McpAnmeldungHinweise';
import { Toaster } from '@/components/ui/sonner';

import { drift } from '../ui/fixtures.ts';
import { ALLE_HINWEISE, GESCHEITERTE_QUELLEN, LAUF_FEHLER, NETZ, fehler, json, type Antwort } from './faelle.ts';
import { echterFehler } from './stub.ts';

const nichts = (): void => {};

function Beispiel({ titel, code, children }: { titel: string; code?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className="text-sm font-semibold">{titel}</h3>
        {code === undefined ? null : <code className="text-xs text-text-leise">{code}</code>}
      </div>
      {children}
    </section>
  );
}

function Abschnitt({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="font-heading text-xl font-semibold">{titel}</h2>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- Lauf */

export function LaufElemente() {
  return (
    <div className="flex flex-col gap-10">
      <Abschnitt titel="Lauf gescheitert">
        {LAUF_FEHLER.map(([code, text], i) => (
          <Beispiel key={code} titel={de.laufFehler[code] === undefined ? `${code} (unbekannt)` : code} code={text ?? undefined}>
            <Laufhinweise laufId={100 + i} hinweise={[]} quellen={{}} fehler={{ code, text }} onAktualisieren={nichts} />
          </Beispiel>
        ))}
      </Abschnitt>
      <Abschnitt titel="Einzelne Quellen gescheitert">
        {GESCHEITERTE_QUELLEN.map(([quelle, code], i) => (
          <Beispiel key={quelle} titel={quelle} code={code}>
            <Laufhinweise
              laufId={200 + i}
              hinweise={[{ art: 'quelleGescheitert', werte: { quelle, code } }]}
              quellen={{ [quelle]: 'fehler' }}
              fehler={null}
              onAktualisieren={nichts}
            />
          </Beispiel>
        ))}
        <Beispiel titel="Kurse von drei Papieren, ein Alert" code="E_MCP_DROSSEL">
          <Laufhinweise
            laufId={220}
            hinweise={['IE00B4L5Y983', 'IE00BKM4GZ66', 'US0378331005'].map((isin) => ({
              art: 'quelleGescheitert',
              werte: { quelle: `kurse:${isin}`, code: 'E_MCP_DROSSEL' },
            }))}
            quellen={{}}
            fehler={null}
            onAktualisieren={nichts}
          />
        </Beispiel>
        <Beispiel titel="Bestand und Kontostand, Lauf ohne Code je Quelle">
          <Laufhinweise
            laufId={221}
            hinweise={[]}
            quellen={{ holdings: 'fehler', cash: 'fehler' }}
            fehler={null}
            onAktualisieren={nichts}
          />
        </Beispiel>
      </Abschnitt>
      <Abschnitt titel="Hinweise eines Laufs">
        {ALLE_HINWEISE.map((hinweis, i) => (
          <Beispiel key={i} titel={hinweis.art}>
            <Laufhinweise laufId={300 + i} hinweise={[hinweis]} quellen={{}} fehler={null} onAktualisieren={nichts} />
          </Beispiel>
        ))}
      </Abschnitt>
    </div>
  );
}

/* --------------------------------------------------------------------- Anmeldung */

const ANMELDUNG_RUHE: McpAnmeldungStatus = {
  noetig: false,
  erstmals: false,
  laeuft: false,
  erfolg: false,
  fehler: null,
  onAnmelden: nichts,
  onAktualisieren: nichts,
};

const ANMELDUNG_FAELLE: readonly [string, Partial<McpAnmeldungStatus>][] = [
  ['Noch nie angemeldet', { noetig: true, erstmals: true }],
  ['Anmeldung abgelaufen', { noetig: true }],
  ['Anmeldung läuft im Browser', { laeuft: true }],
  ['Anmeldung abgeschlossen', { erfolg: true }],
  ['Abgelehnt', { fehler: { code: 'E_MCP_ANMELDUNG', text: 'access_denied' } }],
  ['Zeitlimit', { fehler: { code: 'E_MCP_ZEIT', text: 'Keine Rückmeldung nach 5 min' } }],
  ['Scalable nicht erreichbar', { fehler: { code: 'E_MCP_TRANSIENT', text: 'HTTP 503' } }],
  ['Unbekannter Code', { fehler: { code: 'E_GANZ_NEU', text: 'Code aus einer neueren Version' } }],
];

export function AnmeldungElemente() {
  return (
    <Abschnitt titel="MCP-Anmeldung">
      {ANMELDUNG_FAELLE.map(([titel, teil]) => (
        <Beispiel key={titel} titel={titel} code={teil.fehler?.code}>
          <McpAnmeldungHinweise {...ANMELDUNG_RUHE} {...teil} />
        </Beispiel>
      ))}
    </Abschnitt>
  );
}

/* ------------------------------------------------------------------ Statusseiten */

const STATUSSEITEN = [
  { titel: 'Scapio wird gebaut', code: 'server/server.ts', adresse: '/__edgecases/bau.html' },
  { titel: 'Scapio wird gebaut, erster Lauf unterwegs', code: 'server/server.ts', adresse: '/__edgecases/bau-lauf.html' },
  { titel: 'Anmeldung abgeschlossen', code: 'ingest/mcpAnmeldung.ts', adresse: '/__edgecases/anmeldung.html' },
  { titel: 'Anmeldung abgeschlossen, Dashboard folgt', code: 'ingest/mcpAnmeldung.ts', adresse: '/__edgecases/anmeldung-weiter.html' },
] as const;

/** `sandbox` ohne Skripte: der Bau-Hinweis laedt sich sonst alle drei Sekunden neu. */
export function StatusseitenElemente() {
  return (
    <Abschnitt titel="Seiten außerhalb der Oberfläche">
      {STATUSSEITEN.map((s) => (
        <Beispiel key={s.adresse} titel={s.titel} code={s.code}>
          <iframe
            title={s.titel}
            src={s.adresse}
            sandbox=""
            className="h-[28rem] w-full rounded-lg border border-rand bg-grund"
          />
        </Beispiel>
      ))}
    </Abschnitt>
  );
}

/* ----------------------------------------------------------------- Aktualisieren */

const KNOPF_RUHE: AktualisierenAnsichtProps = {
  kannAktualisieren: true,
  demo: false,
  laeuft: false,
  anmeldungNoetig: false,
  anmeldungLaeuft: false,
  onKlick: nichts,
};

const KNOPF_FAELLE: readonly [string, Partial<AktualisierenAnsichtProps>][] = [
  ['Bereit', {}],
  ['Lauf läuft', { laeuft: true }],
  ['Anmeldung nötig', { anmeldungNoetig: true }],
  ['Anmeldung läuft', { anmeldungLaeuft: true }],
  ['Ohne Sitzungsschlüssel', { kannAktualisieren: false }],
];

const HINWEIS_FAELLE: readonly [string, Parameters<typeof AktualisierenHinweise>[0]][] = [
  ['Ohne Sitzungsschlüssel', { kannAktualisieren: false }],
];

type ToastFall = { titel: string; zeige: () => void | Promise<void> };

/** Wie `toastFehler` in Aktualisieren.tsx — die Beschreibung stammt aus dem echten Fehlerpfad. */
async function toastAusAntwort(titel: string, aufruf: () => Promise<unknown>, antwort: Antwort): Promise<void> {
  const f = await echterFehler(aufruf, antwort);
  toast.error(titel, { description: f instanceof ApiFehler ? (f.hinweis ?? f.message) : f.message });
}

const TOKEN_FEHLT = fehler(
  403,
  'E_TOKEN',
  'Der Sitzungsschlüssel fehlt oder passt nicht.',
  'Lade die Seite neu — der Schlüssel wird bei jedem Serverstart neu vergeben.',
);

const TOASTS: readonly ToastFall[] = [
  { titel: 'Lauf erfolgreich', zeige: () => void toast.success(de.aktualisieren.erfolgreich) },
  {
    titel: 'Lauf teilweise',
    zeige: () => void toast.warning(de.aktualisieren.teilweise, { description: de.aktualisieren.teilweiseBeschreibung }),
  },
  { titel: 'Lauf gescheitert', zeige: () => void toast.error(de.aktualisieren.gescheitert) },
  {
    titel: 'Start: Schlüssel fehlt',
    zeige: () => toastAusAntwort(de.aktualisieren.startGescheitert, api.refresh, TOKEN_FEHLT),
  },
  { titel: 'Start: Server weg', zeige: () => toastAusAntwort(de.aktualisieren.startGescheitert, api.refresh, NETZ) },
  {
    titel: 'Anmeldung: Schlüssel fehlt',
    zeige: () => toastAusAntwort(de.aktualisieren.anmeldungStartGescheitert, api.mcpAnmeldenStarten, TOKEN_FEHLT),
  },
  {
    titel: 'Anmeldung: Server weg',
    zeige: () => toastAusAntwort(de.aktualisieren.anmeldungStartGescheitert, api.mcpAnmeldenStarten, NETZ),
  },
  { titel: 'Fonds-Liste kopiert', zeige: () => void toast.success(de.top25.fundsJsonKopiert) },
];

export function AktualisierenElemente() {
  return (
    <div className="flex flex-col gap-10">
      <Abschnitt titel="Knopf">
        {KNOPF_FAELLE.map(([titel, teil]) => (
          <Beispiel key={titel} titel={titel}>
            <div className="flex justify-end rounded-md border border-dashed border-rand p-3">
              <AktualisierenAnsicht {...KNOPF_RUHE} {...teil} />
            </div>
          </Beispiel>
        ))}
      </Abschnitt>
      <Abschnitt titel="Hinweise">
        {HINWEIS_FAELLE.map(([titel, props]) => (
          <Beispiel key={titel} titel={titel}>
            <AktualisierenHinweise {...props} />
          </Beispiel>
        ))}
      </Abschnitt>
      <Abschnitt titel="Toasts">
        <p className="text-sm text-text-leise">Bleiben stehen, bis sie geschlossen werden.</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border border-rand px-2 py-1 text-sm hover:bg-bedien-aktiv"
            onClick={() => {
              for (const t of TOASTS) void t.zeige();
            }}
          >
            alle zeigen
          </button>
          <button
            type="button"
            className="rounded-md border border-rand px-2 py-1 text-sm hover:bg-bedien-aktiv"
            onClick={() => toast.dismiss()}
          >
            alle schließen
          </button>
          {TOASTS.map((t) => (
            <button
              key={t.titel}
              type="button"
              className="rounded-md border border-rand px-2 py-1 text-sm text-text-leise hover:bg-bedien hover:text-text"
              onClick={() => void t.zeige()}
            >
              {t.titel}
            </button>
          ))}
        </div>
        <Toaster position="top-center" expand visibleToasts={TOASTS.length} duration={Infinity} />
      </Abschnitt>
    </div>
  );
}

/* --------------------------------------------------------------- Selbstkontrolle */

const DRIFTS = [
  ['Banner', 'banner', drift('banner', { abweichung: 0.012 })],
  ['Abbruch', 'abbruch', drift('abbruch', { abweichung: 0.035 })],
  ['Ausgesetzt mit Grund', 'ausgesetzt', drift('ausgesetzt', { grund: 'Kontostand nicht abrufbar' })],
  ['Ausgesetzt ohne Grund', 'ausgesetzt', drift('ausgesetzt')],
] as const;

export function DriftElemente() {
  return (
    <Abschnitt titel="Selbstkontrolle">
      {DRIFTS.map(([titel, stufe, d]) => (
        <Beispiel key={titel} titel={titel} code={stufe}>
          <Driftbanner drift={d} />
        </Beispiel>
      ))}
      <Beispiel titel="Hinweis (Fußnote unter dem Verlauf)" code="hinweis">
        <div className="text-xs text-text-leise">
          <Driftfussnote drift={drift('hinweis', { abweichung: 0.002 })} />
        </div>
      </Beispiel>
    </Abschnitt>
  );
}

/* --------------------------------------------------------------- Kachelzustaende */

const ABFRAGE_FEHLER: readonly [string, Antwort][] = [
  ['Server nicht erreichbar', NETZ],
  ['502 ohne Rumpf', { art: 'roh', status: 502, text: '' }],
  [
    '500 vom Server',
    fehler(
      500,
      'E_INTERN',
      'Der Server konnte die Anfrage nicht beantworten.',
      'Starte Scapio neu (Start.command bzw. .bat). Bleibt die Meldung, steht der Grund im Fenster, in dem Scapio läuft; weiter hilft docs/RUNBOOK.md.',
    ),
  ],
  ['500 mit HTML statt JSON', { art: 'roh', status: 500, text: '<html><body>Internal Server Error</body></html>' }],
  ['200 mit kaputtem JSON', { art: 'roh', status: 200, text: '{"stand": ' }],
  ['Sitzungsschlüssel fehlt', TOKEN_FEHLT],
  ['Unbekannter Fehlercode', json({ fehler: { code: 'E_GANZ_NEU', text: 'Ein Satz aus einer neueren Version.' } }, 500)],
];

function Absturz(): ReactNode {
  throw new Error('Absturz für die Testseite');
}

function FehlerKachel({ titel, antwort }: { titel: string; antwort: Antwort }) {
  const [zustand, setZustand] = useState<KachelZustand>({ art: 'laedt' });
  useEffect(() => {
    let aktiv = true;
    void echterFehler(api.health, antwort).then((f) => {
      if (aktiv) setZustand(fehlerZustand(f));
    });
    return () => {
      aktiv = false;
    };
  }, [antwort]);
  return (
    <Beispiel titel={titel}>
      <Kachel titel="Kachel" id={`kachel-${titel}`} zustand={zustand}>
        {null}
      </Kachel>
    </Beispiel>
  );
}

export function KachelElemente() {
  return (
    <div className="flex flex-col gap-10">
      <Abschnitt titel="Allgemeine Zustände">
        <Beispiel titel="Lädt">
          <Kachel titel="Kachel" id="kachel-laedt" zustand={{ art: 'laedt' }}>
            {null}
          </Kachel>
        </Beispiel>
        <Beispiel titel="Leer">
          <Kachel titel="Kachel" id="kachel-leer" zustand={{ art: 'leer' }}>
            {null}
          </Kachel>
        </Beispiel>
        <Beispiel titel="Inhalt stürzt ab (Fehlergrenze)">
          <Kachel titel="Kachel" id="kachel-absturz" zustand={{ art: 'bereit' }}>
            <Absturz />
          </Kachel>
        </Beispiel>
      </Abschnitt>
      <Abschnitt titel="Abfrage gescheitert">
        {ABFRAGE_FEHLER.map(([titel, antwort]) => (
          <FehlerKachel key={titel} titel={titel} antwort={antwort} />
        ))}
      </Abschnitt>
    </div>
  );
}
