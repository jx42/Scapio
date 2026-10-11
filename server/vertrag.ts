/**
 * Der API-Vertrag: ein Typ je Route, wortgleich das, was die Handler in `server/routen/`
 * tatsaechlich zurueckgeben. `src/lib/api.ts` importiert von hier ausschliesslich per
 * `import type` — die Zeile verschwindet beim Bau, kein Serverpfad landet im Bundle. [INV-11]
 *
 * Diese Datei ersetzt keine Laufzeitpruefung: die JSON-Schemas fuer `schema.response`
 * stehen an den Routen und sind ueber `objektSchema` (`server/json.ts`) an diese Typen
 * gebunden. Was hier steht, ist die TypeScript-Seite desselben Vertrags — geprueft durch
 * die Rueckgabetyp-Annotation jedes Handlers, durch `objektSchema` und durch den
 * Vertragstest in `test/api/vertrag.test.ts`.
 */

import type { LaufSchritt, LaufStatus, QuellenStatus } from '../db/repository/lauf.ts';
import type { Hinweis as LaufHinweis, HinweisArt as LaufHinweisArt } from '../shared/hinweise.ts';
import type {
  DriftJson,
  MaxDrawdownJson,
  SharpeJson,
  Umschlag,
  VolatilitaetJson,
  XirrJson,
} from './json.ts';
import type { Fenster, Zeitraum } from '../shared/zeitfenster.ts';
import { BENCHMARKS, RISIKOFREI, RISIKOFREI_ISIN } from '../shared/benchmarks.ts';
import type { BenchmarkIsin } from '../shared/benchmarks.ts';

export { BENCHMARKS, RISIKOFREI, RISIKOFREI_ISIN };
export type { BenchmarkIsin };

export type { LaufSchritt, LaufStatus, QuellenStatus, Fenster, Zeitraum, LaufHinweis, LaufHinweisArt };
export type Drift = DriftJson;
export type DriftStufe = Drift['stufe'];
export type MitStand = Umschlag;
export type XirrErgebnis = XirrJson;
export type MaxDrawdownErgebnis = MaxDrawdownJson;
export type VolatilitaetErgebnis = VolatilitaetJson;
export type SharpeErgebnis = SharpeJson;

export type Hinweis = {
  readonly code: string;
  readonly text: string;
};

/* -------------------------------------------------------------------- Endpunkte */

export type Health = MitStand & {
  readonly ok: boolean;
  readonly version: string;
  readonly kernVersion: number;
  /** `top25` aus `einstellungen.json`: ohne ihn zeigt die Oberflaeche die Kachel nicht [ADR-038]. */
  readonly top25: boolean;
  readonly lauf: {
    readonly id: number;
    readonly status: LaufStatus;
    readonly gestartet: string;
    readonly beendet: string | null;
  } | null;
};

export type Zeitpunkt = {
  readonly tag: string;
  readonly gesamtCent: number;
  readonly einzahlungKumCent: number;
  /** Gewinn seit Fensterbeginn (dort 0), nicht seit dem ersten Zufluss. */
  readonly gewinnCent: number;
  readonly gewinnProzent: number;
  /** Vergleichslinie als Depotwert: startet am Fensterbeginn beim Depotwert. */
  readonly benchmarkCent?: number;
  /** Gewinn des Vergleichs seit Fensterbeginn, wie `gewinnCent` des Depots. */
  readonly benchmarkGewinnCent?: number;
  readonly benchmarkProzent?: number;
  /** Depotgewinn minus Vergleichsgewinn seit Fensterbeginn, fertig aus `core/kursgewinn.ts`. */
  readonly differenzCent?: number;
  /** Dasselbe in Prozentpunkten (Depot-`gewinnProzent` minus `benchmarkProzent`). */
  readonly differenzProzent?: number;
};

export type MarkenTyp = 'sparplan' | 'kauf' | 'verkauf' | 'ertrag';

export type MarkenVorgang = {
  readonly betragCent: number;
  readonly isin?: string;
  readonly name?: string;
};

export type Marke = {
  readonly tag: string;
  readonly typ: MarkenTyp;
  readonly vorgaenge: readonly MarkenVorgang[];
};

export type Zeitreihe = MitStand & {
  readonly punkte: readonly Zeitpunkt[];
  readonly marken: readonly Marke[];
  readonly grob: boolean;
  readonly reiheLeer: boolean;
  readonly zeitraum: Zeitraum;
  readonly fensterGewinnCent: number;
  readonly fensterGewinnProzent: number;
  readonly benchmark: { readonly isin: string; readonly name: string } | null;
};

export type ErtragsZeile = {
  readonly txId: string;
  readonly tag: string;
  readonly typ: string;
  readonly isin: string | null;
  readonly name: string | null;
  readonly bezug: 'wertpapier' | 'verrechnungskonto' | 'unbekannt';
  readonly betragCent: number;
};

export type RealisierteZeile = {
  readonly txId: string;
  readonly tag: string;
  readonly isin: string;
  readonly name: string;
  readonly gewinnCent: number;
};

export type KennzahlenAntwort = MitStand & {
  readonly investiertCent: number;
  readonly kursgewinnCent: number;
  readonly kursgewinnProzent: number;
  readonly realisiertCent: number;
  readonly zinsenCent: number;
  readonly steuernCent: number;
  readonly gebuehrenCent: number;
  readonly gesamtCent: number;
  readonly twr: number | null;
  readonly twrProJahr: number | null;
  readonly twrGrob: boolean;
  readonly xirr: XirrErgebnis;
  readonly inflation: number | null;
  readonly real: {
    readonly exakt: XirrErgebnis;
    readonly fisher: number | null;
    readonly basisMonat: string;
    readonly teuerungBisMonat: string | null;
    readonly fortgeschriebeneMonate: readonly string[];
    readonly teuerungLaufendesJahr: number | null;
  };
  readonly maxDrawdown: MaxDrawdownErgebnis;
  readonly volatilitaetProJahr: VolatilitaetErgebnis;
  readonly sharpe: SharpeErgebnis;
  readonly sparrateCent: number;
  readonly sparrate12Cent: number;
  readonly hinweise: readonly Hinweis[];
  readonly zinsenTransaktionen: readonly ErtragsZeile[];
  readonly steuernTransaktionen: readonly ErtragsZeile[];
  readonly gebuehrenTransaktionen: readonly ErtragsZeile[];
  readonly realisierteVerkaeufe: readonly RealisierteZeile[];
};

export type PositionZeile = {
  readonly isin: string;
  readonly name: string;
  /** `STOCK`, `ETF`, ...; `null`, solange die Bank die Art nicht gemeldet hat. */
  readonly art: string | null;
  readonly wertCent: number;
  readonly anteil: number;
  readonly investiertCent: number;
  readonly gewinnCent: number;
  readonly gewinnProzent: number;
  readonly realisiertCent: number;
  readonly xirr: XirrErgebnis;
};

export type Aufteilung = MitStand & {
  readonly positionen: readonly PositionZeile[];
  readonly cashCent: number;
  readonly cashAnteil: number;
};

export type Fondsanteil = {
  readonly isin: string;
  readonly name?: string;
  readonly anteilCent: number;
};

export type UnternehmenZeile = {
  readonly rang: number;
  readonly name: string;
  readonly isin: string;
  readonly exposureCent: number;
  readonly anteilDepot: number;
  readonly ausFonds: readonly Fondsanteil[];
  readonly sektor: string | null;
  readonly land: string | null;
};

export type FehlenderFondsFall = 'gesperrt' | 'abrufGescheitert';

export type FehlenderFonds = {
  readonly isin: string;
  readonly name: string;
  readonly anbieter: string;
  readonly fall: FehlenderFondsFall;
};

export type Top25 = MitStand & {
  readonly zeilen: readonly UnternehmenZeile[];
  readonly topAnteil: number;
  readonly abdeckung: number;
  readonly durchschautCent: number;
  readonly anzahlUnternehmen: number;
  readonly fehlendeFonds: readonly FehlenderFonds[];
};

export type Monatsfluss = {
  readonly monat: string;
  readonly nettoCent: number;
};

export type Fluesse = MitStand & {
  readonly monate: readonly Monatsfluss[];
  readonly schnittCent: number;
  readonly schnitt12Cent: number;
  readonly medianCent: number;
  readonly fenster: Fenster;
};

export type Sparplan = {
  readonly isin: string;
  readonly name: string;
  readonly betragCent: number;
  readonly frequenz: string;
  readonly tagImMonat: number | null;
  readonly naechste: string | null;
};

export type Sparplaene = MitStand & {
  readonly plaene: readonly Sparplan[];
  readonly summeCent: number;
};

export type Lauf = MitStand & {
  readonly laufId: number | null;
  readonly status: LaufStatus | null;
  /** Nur waehrend `laufend` gesetzt, und nur in den Abrufen (`LAUF_SCHRITTE`). */
  readonly schritt: LaufSchritt | null;
  readonly quellen: Readonly<Record<string, QuellenStatus>>;
  readonly hinweise: readonly LaufHinweis[];
  readonly gestartet: string | null;
  readonly beendet: string | null;
  readonly fehler: { readonly code: string; readonly text: string | null } | null;
};

export type McpAnmeldung = MitStand & {
  readonly angemeldet: boolean;
  readonly laeuft: boolean;
  readonly fehler: { readonly code: string; readonly text: string } | null;
};

export type RefreshAntwort = MitStand & {
  readonly laufId: number | null;
};
