/*
 * Die Randfaelle der Testseite (`npm run edgecases`), die einen eigenen Rahmen brauchen:
 * eine ganze Seite oder eine einzelne Kachel mit ihrer Abfrage. Jeder Fall ueberschreibt
 * einzelne Routen; alles andere kommt unveraendert aus der Basis (Demo-Depot oder leere
 * Datenbank), die `start/edgecases.ts` aus dem echten Server geholt hat. Meldungen, die
 * nur Props brauchen, stehen in `elemente.tsx`.
 */

import type { Hinweis as LaufHinweis } from '../../shared/hinweise.ts';
import type {
  Aufteilung,
  Drift,
  FehlenderFonds,
  Fluesse,
  Health,
  KennzahlenAntwort,
  Lauf,
  McpAnmeldung,
  Rebalancing,
  Sparplaene,
  Top25,
  Zeitreihe,
} from '../../server/vertrag.ts';
import { ROUTEN_NAMEN, type LesendeRoute } from '../../shared/routen.ts';
import {
  drift,
  maxDrawdownOhne,
  realFixture,
  sharpeOhne,
  volatilitaetOhne,
  xirrOhne,
} from '../ui/fixtures.ts';

export type Route = LesendeRoute | 'refresh' | 'anmelden';

export type Antwort =
  | { readonly art: 'json'; readonly status: number; readonly rumpf: unknown }
  | { readonly art: 'aendern'; readonly aendern: (basis: unknown) => unknown }
  | { readonly art: 'roh'; readonly status: number; readonly text: string }
  | { readonly art: 'haengt' }
  | { readonly art: 'netz' }
  /** Jeder Aufruf nimmt den naechsten Schritt, der letzte bleibt stehen. */
  | { readonly art: 'folge'; readonly schritte: readonly Antwort[] };

export const ANSICHTEN = ['seite', 'verlauf', 'kennzahlen', 'aufteilung', 'top25', 'fluesse', 'sparplaene'] as const;
export type Ansicht = (typeof ANSICHTEN)[number];

export type Fall = {
  readonly id: string;
  /** Tab der Uebersicht. */
  readonly gruppe: string;
  /** Die ganze App oder nur diese Kachel. */
  readonly ansicht: Ansicht;
  readonly titel: string;
  readonly beschreibung?: string;
  readonly basis?: 'demo' | 'leer';
  /** Ersetzt `drift` in jeder Antwort, die eines traegt. */
  readonly drift?: Drift;
  readonly routen?: Partial<Record<Route, Antwort>>;
  /** Beschriftung eines Knopfs, der nach dem Laden einmal geklickt wird, oder eine Folge davon. */
  readonly klick?: string | readonly string[];
  /** Gespeichertes Ziel des Rebalancing-Rechners; ohne Angabe ist der Speicher leer. */
  readonly zielaufteilung?: { readonly ziel: Readonly<Record<string, number>>; readonly ausgeschlossen?: readonly string[] };
  /** Mindesthoehe des Rahmens in px, etwa fuer einen offenen Dialog. */
  readonly mindesthoehe?: number;
};

/* ------------------------------------------------------------------- Bausteine */

export const json = (rumpf: unknown, status = 200): Antwort => ({ art: 'json', status, rumpf });
const aendern = <T>(f: (basis: T) => T): Antwort => ({ art: 'aendern', aendern: (b) => f(b as T) });
export const fehler = (status: number, code: string, text: string, hinweis: string): Antwort =>
  json({ fehler: { code, text, hinweis } }, status);
const folge = (...schritte: Antwort[]): Antwort => ({ art: 'folge', schritte });
export const HAENGT: Antwort = { art: 'haengt' };
export const NETZ: Antwort = { art: 'netz' };

const lauf = (teil: Partial<Lauf>): Antwort => aendern<Lauf>((b) => ({ ...b, ...teil }));
const anmeldung = (teil: Partial<McpAnmeldung>): Antwort =>
  aendern<McpAnmeldung>((b) => ({ ...b, angemeldet: true, laeuft: false, fehler: null, ...teil }));

const alleLesenden = (a: Antwort): Partial<Record<Route, Antwort>> =>
  Object.fromEntries(ROUTEN_NAMEN.map((r) => [r, a]));

const JETZT = '2026-09-23T08:15:00.000Z';
const LAUF_ID = 9001;
const laufend = (quellen: Lauf['quellen'], schritt: Lauf['schritt'] = 'kurse'): Antwort =>
  lauf({ laufId: LAUF_ID, status: 'laufend', schritt, quellen, hinweise: [], gestartet: JETZT, beendet: null, fehler: null });
const beendet = (status: 'erfolg' | 'teilweise' | 'fehler', teil: Partial<Lauf> = {}): Antwort =>
  lauf({ laufId: LAUF_ID, status, schritt: null, hinweise: [], gestartet: JETZT, beendet: JETZT, fehler: null, ...teil });

/** Die Standardantwort der POST-Routen, falls ein Fall sie nicht festlegt. */
export const POST_STANDARD = fehler(
  500,
  'E_TESTSEITE',
  'Auf der Testseite startet nichts.',
  'Dieser Fall legt keine Antwort für den Knopf fest.',
);

export const ISIN_WORLD = 'IE00B4L5Y983';
/** Ein gespeichertes Ziel mit 100 %, damit Berechnen ohne Eingabe frei ist. */
const ZIEL_VOLL = { KONTO: 1000, [ISIN_WORLD]: 9000 };

export const ALLE_HINWEISE: LaufHinweis[] = [
  { art: 'text', werte: { text: 'Ein fertiger Satz aus einer Datenbankzeile von vor der Umstellung auf Arten.' } },
  { art: 'mcpSitzungErneuert', werte: {} },
  { art: 'vpiNichtAngebunden', werte: { quelle: 'eurostat' } },
  { art: 'vpiRandNichtAngebunden', werte: { quelle: 'eurostat' } },
  { art: 'vpiRandOhneBasis', werte: {} },
  { art: 'zinsNichtAngebunden', werte: { quelle: 'ecb' } },
  { art: 'fondsNichtAbrufbar', werte: { anbieter: 'ishares', isin: ISIN_WORLD, grund: 'HTTP 503' } },
  { art: 'artNichtAbrufbar', werte: { isin: 'US0378331005', grund: 'Zeitlimit' } },
  { art: 'storniert', werte: { anzahl: 3 } },
  { art: 'kurslueckenJung', werte: { tage: 4, spanne: 14 } },
  { art: 'selbstkontrolle', werte: { stufe: 'banner', abweichungProzent: 0.8 } },
  { art: 'punkteZuFrueh', werte: { quelle: 'onvista', grenze: '2019-01-01' } },
  { art: 'punkteInZukunft', werte: { quelle: 'onvista' } },
  { art: 'summenAbweichung', werte: { zehnerpotenz: 2 } },
  {
    art: 'tagessprung',
    werte: { isin: ISIN_WORLD, name: 'iShares Core MSCI World', anzahl: 2, von: '2026-03-02', bis: '2026-03-05' },
  },
  { art: 'tagessprung', werte: { isin: 'US0378331005', name: null, anzahl: 1, von: '2026-04-10', bis: '2026-04-10' } },
  { art: 'historienbeginn', werte: { ersterTransaktionsTag: '2019-02-01', ersterKaufTag: '2018-11-15' } },
  { art: 'uebertragOhneWert', werte: { isin: 'IE00B4L5Y983', tag: '2024-03-12' } },
  { art: 'vpiSprung', werte: { monate: ['2026-01', '2026-02'], schwelleProzent: 2 } },
  { art: 'zeileOhneZeitstempel', werte: { quelle: 'transaktionen' } },
  { art: 'zeileOhneZweig', werte: { quelle: 'transaktionen' } },
  { art: 'unbekannteTypen', werte: { typen: ['CORPORATE_ACTION', 'SPIN_OFF'] } },
  { art: 'seedUebernommen', werte: { zeilen: 214 } },
  { art: 'kursfensterNichtAbrufbar', werte: { fenster: '1j', isin: ISIN_WORLD, grund: 'HTTP 404' } },
  { art: 'kursfensterSchema', werte: { fenster: 'max', isin: ISIN_WORLD } },
  { art: 'kursfensterAndereIsin', werte: { fenster: '5j', isin: ISIN_WORLD } },
  { art: 'zinsLuecken', werte: { tage: 6 } },
  { art: 'vpiLuecken', werte: { monate: 2 } },
  { art: 'vpiRandLuecken', werte: { monate: 1 } },
  { art: 'bestandteileSumme', werte: { isin: ISIN_WORLD, prozent: 92.3, positionen: 1500, ohneIsin: 12 } },
  { art: 'transaktionenSeitenGrenze', werte: { seiten: 43, hoechstens: 50 } },
  // Eine Art aus einer neueren Version, die diese Oberflaeche noch nicht kennt.
  { art: 'ausDerZukunft', werte: {} } as unknown as LaufHinweis,
];

/** Je Quellenart ein gescheiterter Abruf, dazu die Codes, die eine eigene Abhilfe haben. */
export const GESCHEITERTE_QUELLEN: [string, string][] = [
  ['holdings', 'E_MCP_TRANSIENT'],
  ['cash', 'E_MCP_ZEIT'],
  ['kurse:' + ISIN_WORLD, 'E_MCP_DROSSEL'],
  ['sparplaene', 'E_SCHEMA'],
  ['gesamtwert', 'E_MCP_ABGELEHNT'],
  ['vpi', 'E_NETZ_STATUS'],
  ['vpi-aktuell', 'E_NETZ_ZEIT'],
  ['zins', 'E_NETZ_DNS'],
  ['art', 'E_MCP_RPC'],
  ['fonds', 'E_UNBEKANNT'],
  ['fondsaufloesung', 'E_UNBEKANNT'],
  ['fondskatalog:xtrackers', 'E_NETZ_STATUS'],
  ['ausDerZukunft', 'E_GANZ_NEU'],
];

export const LAUF_FEHLER: [string, string | null][] = [
  ['E_MCP_ANMELDUNG', 'invalid_token'],
  ['E_MCP_DROSSEL', 'HTTP 429'],
  ['E_MCP_ZEIT', 'Zeitlimit nach 120 s'],
  ['E_MCP_TRANSIENT', 'HTTP 503'],
  ['E_MCP_ABGELEHNT', 'HTTP 403'],
  ['E_MCP_RPC', 'JSON-RPC -32602'],
  ['E_MCP_SEITEN', 'mehr als 200 Seiten'],
  ['E_MCP_UNVOLLSTAENDIG', 'Feld positions fehlt'],
  ['E_SCHEMA', 'transactions[3].amount: Expected string'],
  ['E_STORNO_BREMSE', '1200 statt 1480 Transaktionen'],
  ['E_SEED_KAPUTT', 'Unexpected token } in JSON at position 42'],
  ['E_PLAUSIBEL', 'Menge negativ'],
  ['E_SPERRE', null],
  ['E_ABGEBROCHEN', null],
  ['E_GANZ_NEU', 'Code aus einer neueren Version'],
];

const FEHLENDE_FONDS: FehlenderFonds[] = [
  { isin: 'IE00B4L5Y983', name: 'iShares Core MSCI World', anbieter: 'ishares', fall: 'abrufGescheitert' },
  { isin: 'IE00BJ0KDQ92', name: 'Xtrackers MSCI World', anbieter: 'xtrackers', fall: 'abrufGescheitert' },
  { isin: 'LU1681043599', name: 'Amundi MSCI World', anbieter: 'amundi', fall: 'abrufGescheitert' },
  { isin: 'IE00BWTN6Y99', name: 'First Trust Global Equity Income', anbieter: 'firsttrust', fall: 'gesperrt' },
  { isin: 'IE00BK5BCD43', name: 'L&G Clean Water', anbieter: 'lgim', fall: 'gesperrt' },
  { isin: 'IE00BYZK4552', name: 'Fonds eines unbekannten Anbieters', anbieter: 'neuanbieter', fall: 'gesperrt' },
];

const kennzahlenNichtBerechenbar = aendern<KennzahlenAntwort>((b) => ({
  ...b,
  twr: null,
  twrProJahr: null,
  xirr: xirrOhne('zu_wenige_fluesse'),
  inflation: null,
  real: realFixture(xirrOhne('zu_wenige_fluesse')),
  maxDrawdown: maxDrawdownOhne('zu_wenig_daten'),
  volatilitaetProJahr: volatilitaetOhne('zu_wenig_daten'),
  sharpe: sharpeOhne('zu_wenig_daten'),
}));

/* ------------------------------------------------------------------------ Faelle */

const DRIFT_ABBRUCH = drift('abbruch', { abweichung: 0.035, berechnetGesamtCent: 10_350_00, gemeldetGesamtCent: 10_000_00 });

export const FAELLE: readonly Fall[] = [
  // --- Ganze Seite
  {
    id: 'erstinstallation',
    gruppe: 'seite',
    ansicht: 'seite',
    titel: 'Erstinstallation, noch nie angemeldet',
    beschreibung: 'Leere Datenbank, kein Token auf dem Rechner.',
    basis: 'leer',
    routen: { mcpAnmeldung: anmeldung({ angemeldet: false }) },
  },
  {
    id: 'erstinstallation-angemeldet',
    gruppe: 'seite',
    ansicht: 'seite',
    titel: 'Erstinstallation, angemeldet, noch kein Lauf',
    beschreibung: 'Willkommenstext statt Anmeldehinweis.',
    basis: 'leer',
  },
  {
    id: 'erstinstallation-erster-lauf',
    gruppe: 'seite',
    ansicht: 'seite',
    titel: 'Erstinstallation, erster Lauf läuft',
    basis: 'leer',
    routen: {
      lauf: folge(lauf({}), laufend({ transaktionen: 'erfolg' })),
      refresh: json({ laufId: LAUF_ID }, 202),
    },
    klick: 'Aktualisieren',
  },
  {
    id: 'erstinstallation-gescheitert',
    gruppe: 'seite',
    ansicht: 'seite',
    titel: 'Erstinstallation, erster Lauf gescheitert',
    basis: 'leer',
    routen: {
      lauf: beendet('fehler', {
        quellen: { transaktionen: 'fehler' },
        fehler: { code: 'E_MCP_TRANSIENT', text: 'HTTP 503' },
      }),
    },
  },
  {
    id: 'anmeldung-ablauf',
    gruppe: 'seite',
    ansicht: 'seite',
    titel: 'Anmeldung abgelaufen, Klick auf Anmelden',
    beschreibung: 'Läuft einige Sekunden, dann abgeschlossen. „neu laden“ spielt den Ablauf erneut ab.',
    routen: {
      lauf: beendet('fehler', { fehler: { code: 'E_MCP_ANMELDUNG', text: 'invalid_token' } }),
      mcpAnmeldung: folge(
        anmeldung({}),
        anmeldung({ laeuft: true }),
        anmeldung({ laeuft: true }),
        anmeldung({ laeuft: true }),
        anmeldung({}),
      ),
      anmelden: json({ angemeldet: true, laeuft: true, fehler: null }, 202),
    },
    klick: 'Anmelden',
  },
  {
    id: 'alles-laedt',
    gruppe: 'seite',
    ansicht: 'seite',
    titel: 'Alle Abfragen hängen',
    routen: alleLesenden(HAENGT),
  },
  {
    id: 'server-weg',
    gruppe: 'seite',
    ansicht: 'seite',
    titel: 'Server nicht erreichbar',
    routen: alleLesenden(NETZ),
  },
  {
    id: 'drift-abbruch-seite',
    gruppe: 'seite',
    ansicht: 'seite',
    titel: 'Selbstkontrolle: Abbruch',
    beschreibung: 'Banner oben, Verlauf unterdrückt.',
    drift: DRIFT_ABBRUCH,
  },

  // --- Verlauf
  {
    id: 'verlauf-grob',
    gruppe: 'verlauf',
    ansicht: 'verlauf',
    titel: 'Grobe Reihe',
    routen: { zeitreihe: aendern<Zeitreihe>((b) => ({ ...b, grob: true })) },
  },
  {
    id: 'verlauf-fenster-leer',
    gruppe: 'verlauf',
    ansicht: 'verlauf',
    titel: 'Keine Punkte im gewählten Zeitraum',
    routen: { zeitreihe: aendern<Zeitreihe>((b) => ({ ...b, punkte: [], marken: [], reiheLeer: false })) },
  },
  {
    id: 'verlauf-reihe-leer',
    gruppe: 'verlauf',
    ansicht: 'verlauf',
    titel: 'Reihe ganz leer',
    routen: { zeitreihe: aendern<Zeitreihe>((b) => ({ ...b, punkte: [], marken: [], reiheLeer: true })) },
  },
  {
    id: 'verlauf-drift-abbruch',
    gruppe: 'verlauf',
    ansicht: 'verlauf',
    titel: 'Selbstkontrolle: Abbruch',
    drift: DRIFT_ABBRUCH,
  },
  {
    id: 'verlauf-drift-hinweis',
    gruppe: 'verlauf',
    ansicht: 'verlauf',
    titel: 'Selbstkontrolle: Hinweis (Fußnote)',
    drift: drift('hinweis', { abweichung: 0.002, berechnetGesamtCent: 10_020_00, gemeldetGesamtCent: 10_000_00 }),
  },

  // --- Kennzahlen
  {
    id: 'kennzahlen-nicht-berechenbar',
    gruppe: 'kennzahlen',
    ansicht: 'kennzahlen',
    titel: 'Nichts berechenbar',
    beschreibung: 'TWR null, XIRR zu wenige Flüsse, Inflation null, Drawdown/Volatilität/Sharpe zu wenig Daten.',
    routen: { kennzahlen: kennzahlenNichtBerechenbar },
  },
  {
    id: 'kennzahlen-sonderfaelle',
    gruppe: 'kennzahlen',
    ansicht: 'kennzahlen',
    titel: 'Übrige Sonderfälle',
    beschreibung: 'XIRR ohne Vorzeichenwechsel, Real nicht konvergiert, Sharpe ohne Streuung, TWR grob, fortgeschriebene Monate.',
    routen: {
      kennzahlen: aendern<KennzahlenAntwort>((b) => ({
        ...b,
        twrGrob: true,
        twrProJahr: null,
        xirr: xirrOhne('kein_vorzeichenwechsel'),
        real: { ...b.real, exakt: xirrOhne('nicht_konvergiert'), fortgeschriebeneMonate: ['2026-08', '2026-09'], teuerungBisMonat: '2026-07' },
        sharpe: sharpeOhne('keine_streuung'),
      })),
    },
  },
  {
    id: 'kennzahlen-hinweise',
    gruppe: 'kennzahlen',
    ansicht: 'kennzahlen',
    titel: 'Hinweise aus der Berechnung',
    beschreibung:
      'Alle Codes des Kerns als Fußnoten, je einmal Einzahl und Mehrzahl. H_KEIN_VPI und H_DRIFT_AUSGESETZT bleiben dort still (Inflationszeile, Banner).',
    routen: {
      kennzahlen: aendern<KennzahlenAntwort>((b) => ({
        ...b,
        sharpe: sharpeOhne('kein_zins'),
        hinweise: [
          { code: 'H_UNBEKANNTER_TYP', anzahl: 2 },
          { code: 'H_KURSLUECKE', anzahl: 1 },
          { code: 'H_AUSBUCHUNG', anzahl: 3 },
          { code: 'H_KEIN_VPI', anzahl: null },
          { code: 'H_KEIN_ZINS', anzahl: null },
          { code: 'H_DRIFT_AUSGESETZT', anzahl: null },
        ],
      })),
    },
  },
  {
    id: 'kennzahlen-hinweis-ausbuchung',
    gruppe: 'kennzahlen',
    ansicht: 'kennzahlen',
    titel: 'Ausbuchung als Totalverlust',
    beschreibung: 'Ein über mehrere Tage gebuchter ISIN-Wechsel (H_AUSBUCHUNG, Einzahl).',
    routen: {
      kennzahlen: aendern<KennzahlenAntwort>((b) => ({ ...b, hinweise: [{ code: 'H_AUSBUCHUNG', anzahl: 1 }] })),
    },
  },
  {
    id: 'kennzahlen-kein-zins',
    gruppe: 'kennzahlen',
    ansicht: 'kennzahlen',
    titel: 'Sharpe ohne Zins',
    routen: { kennzahlen: aendern<KennzahlenAntwort>((b) => ({ ...b, sharpe: sharpeOhne('kein_zins') })) },
  },
  {
    id: 'kennzahlen-absturz',
    gruppe: 'kennzahlen',
    ansicht: 'kennzahlen',
    titel: 'Antwort mit falscher Form (Fehlergrenze)',
    beschreibung: 'Kennzahlen ohne Felder.',
    routen: { kennzahlen: aendern<KennzahlenAntwort>((b) => ({ stand: b.stand, drift: b.drift }) as KennzahlenAntwort) },
  },

  // --- Aufteilung
  {
    id: 'aufteilung-nur-bargeld',
    gruppe: 'aufteilung',
    ansicht: 'aufteilung',
    titel: 'Nur Bargeld, keine Positionen',
    routen: { aufteilung: aendern<Aufteilung>((b) => ({ ...b, positionen: [], cashCent: 1_234_56, cashAnteil: 1 })) },
  },
  {
    id: 'aufteilung-art-unbekannt',
    gruppe: 'aufteilung',
    ansicht: 'aufteilung',
    titel: 'Wertpapierart fehlt oder ist unbekannt',
    routen: {
      aufteilung: aendern<Aufteilung>((b) => ({
        ...b,
        positionen: b.positionen.map((p, i) => ({ ...p, art: i === 0 ? null : i === 1 ? 'WARRANT' : p.art })),
      })),
    },
  },
  {
    id: 'aufteilung-leer',
    gruppe: 'aufteilung',
    ansicht: 'aufteilung',
    titel: 'Weder Positionen noch Bargeld',
    routen: { aufteilung: aendern<Aufteilung>((b) => ({ ...b, positionen: [], cashCent: 0, cashAnteil: 0 })) },
  },
  {
    id: 'rebalancing-ohne-ziel',
    gruppe: 'rebalancing',
    ansicht: 'aufteilung',
    titel: 'Rechner ohne gespeichertes Ziel',
    beschreibung: 'Alle Felder leer, Summe 0 %, Berechnen gesperrt.',
    klick: 'Rebalancieren',
    mindesthoehe: 900,
  },
  {
    id: 'rebalancing-summe-falsch',
    gruppe: 'rebalancing',
    ansicht: 'aufteilung',
    titel: 'Summe über 100 %, ein Feld ohne Ziel',
    beschreibung: 'Gespeichert sind 110 %; drei Positionen haben kein Ziel und stehen leer.',
    zielaufteilung: { ziel: { KONTO: 1000, [ISIN_WORLD]: 7000, IE00B3VVMM84: 3000 } },
    klick: 'Rebalancieren',
    mindesthoehe: 900,
  },
  {
    id: 'rebalancing-ergebnis',
    gruppe: 'rebalancing',
    ansicht: 'aufteilung',
    titel: 'Berechnet, eine Position ausgeschlossen',
    zielaufteilung: { ziel: ZIEL_VOLL, ausgeschlossen: ['IE00B3VVMM84'] },
    klick: ['Rebalancieren', 'Berechnen'],
    mindesthoehe: 1000,
  },
  {
    id: 'rebalancing-parameter',
    gruppe: 'rebalancing',
    ansicht: 'aufteilung',
    titel: 'Ziel vom Server abgelehnt (E_PARAMETER)',
    routen: {
      rebalancing: fehler(400, 'E_PARAMETER', 'Der Parameter ziel ist unbekannt oder ungültig.', 'Prüfe die Adresse.'),
    },
    zielaufteilung: { ziel: ZIEL_VOLL },
    klick: ['Rebalancieren', 'Berechnen'],
    mindesthoehe: 900,
  },
  {
    id: 'rebalancing-drift-banner',
    gruppe: 'rebalancing',
    ansicht: 'aufteilung',
    titel: 'Selbstkontrolle: Banner',
    routen: {
      rebalancing: aendern<Rebalancing>((b) => ({
        ...b,
        drift: drift('banner', { abweichung: 0.008, berechnetGesamtCent: 10_080_00, gemeldetGesamtCent: 10_000_00 }),
      })),
    },
    zielaufteilung: { ziel: ZIEL_VOLL },
    klick: ['Rebalancieren', 'Berechnen'],
    mindesthoehe: 1000,
  },
  {
    id: 'rebalancing-drift-abbruch',
    gruppe: 'rebalancing',
    ansicht: 'aufteilung',
    titel: 'Selbstkontrolle: Abbruch, kein Ergebnis',
    routen: { rebalancing: aendern<Rebalancing>((b) => ({ ...b, drift: DRIFT_ABBRUCH })) },
    zielaufteilung: { ziel: ZIEL_VOLL },
    klick: ['Rebalancieren', 'Berechnen'],
    mindesthoehe: 900,
  },
  {
    id: 'rebalancing-kein-lauf',
    gruppe: 'rebalancing',
    ansicht: 'aufteilung',
    titel: 'Noch kein Lauf',
    beschreibung: 'Leere Kachel, kein Rebalancing-Knopf.',
    basis: 'leer',
  },

  // --- Top 25
  {
    id: 'top25-aus',
    gruppe: 'top25',
    ansicht: 'seite',
    titel: 'Top 25 ausgeschaltet (Vorgabe)',
    beschreibung: 'Ohne "top25": true in einstellungen.json fehlt die Kachel ganz.',
    routen: { health: aendern<Health>((b) => ({ ...b, top25: false })) },
  },
  {
    id: 'top25-fonds-fehlen',
    gruppe: 'top25',
    ansicht: 'top25',
    titel: 'Einige Fonds fehlen, Dialog offen',
    beschreibung: 'Jeder Anbieter, beide Fälle, ein unbekannter Anbieter.',
    routen: { top25: aendern<Top25>((b) => ({ ...b, fehlendeFonds: FEHLENDE_FONDS, abdeckung: 0.62 })) },
    klick: 'Details von',
    mindesthoehe: 900,
  },
  {
    id: 'top25-alle-fehlen',
    gruppe: 'top25',
    ansicht: 'top25',
    titel: 'Alle Fonds fehlen',
    routen: {
      top25: aendern<Top25>((b) => ({
        ...b,
        zeilen: [],
        fehlendeFonds: FEHLENDE_FONDS,
        abdeckung: 0,
        durchschautCent: 0,
        anzahlUnternehmen: 0,
        topAnteil: 0,
      })),
    },
  },
  {
    id: 'top25-keine-fonds',
    gruppe: 'top25',
    ansicht: 'top25',
    titel: 'Keine Fonds hinterlegt (Anleitung)',
    routen: {
      top25: aendern<Top25>((b) => ({
        ...b,
        zeilen: [],
        fehlendeFonds: [],
        abdeckung: 0,
        durchschautCent: 0,
        anzahlUnternehmen: 0,
        topAnteil: 0,
      })),
    },
  },

  // --- Fluesse und Sparplaene
  {
    id: 'fluesse-leer',
    gruppe: 'fluesse',
    ansicht: 'fluesse',
    titel: 'Keine Monate mit Flüssen',
    routen: {
      fluesse: aendern<Fluesse>((b) => ({ ...b, monate: [], schnittCent: 0, schnitt12Cent: 0, medianCent: 0 })),
    },
  },
  {
    id: 'sparplaene-leer',
    gruppe: 'fluesse',
    ansicht: 'sparplaene',
    titel: 'Keine Sparpläne',
    routen: { sparplaene: aendern<Sparplaene>((b) => ({ ...b, plaene: [], summeCent: 0 })) },
  },
  {
    id: 'sparplaene-sonderfaelle',
    gruppe: 'fluesse',
    ansicht: 'sparplaene',
    titel: 'Unbekannte Frequenz, fehlende Tage, langer Name',
    routen: {
      sparplaene: aendern<Sparplaene>((b) => ({
        ...b,
        plaene: [
          { isin: 'IE00B3RBWM25', name: 'Vanguard FTSE All-World', betragCent: 250_00, frequenz: 'EVERY_FORTNIGHT', tagImMonat: null, naechste: null },
          { isin: 'IE00BYX2JD69', name: 'Ein Fonds mit einem ausgesprochen langen Namen, der in keine Zeile passt', betragCent: 25_00, frequenz: 'QUARTERLY', tagImMonat: 31, naechste: null },
          ...b.plaene,
        ],
      })),
    },
  },
];
