/**
 * Die Pruefliste aus Bauanleitung 6.4, mit genau den dort genannten Folgen. Zeile 3 (Summe der
 * Allocation-Gewichte) ist mit `get_portfolio_performance` entfallen [ADR-032]; die Nummern
 * der uebrigen Zeilen bleiben, weil Tests und ADRs sie nennen.
 *
 * | Pruefung                                    | Bei Verstoss                          |
 * |---------------------------------------------|---------------------------------------|
 * | Menge >= 0, Kurs > 0                        | Abbruch                               |
 * | Datum nicht in der Zukunft, nicht vor 2015  | Punkt verwerfen, Hinweis              |
 * | Summe Positionswerte + Cash = Gesamt +- 1 € | Hinweis, nur bei gleichem Stand [ADR-015] |
 * | Tagessprung eines Kurses > 30 %             | `kurs.auffaellig = 1`, Hinweis        |
 * | Transaktionsliste beginnt nach erstem Kauf  | Hinweis, `seed.json` erwaegen         |
 * | Uebertrag herein ohne Wert, unverpaart       | Hinweis [ADR-043]                     |
 * | Monatssprung des Verbraucherpreisindex > 3 %| Hinweis                               |
 *
 * Befunde werden GESAMMELT, nicht geworfen — sonst reisst der erste Schoenheitsfehler den
 * ganzen Lauf ab, und das Dashboard zeigt lieber eine Zahl mit Fussnote als gar keine.
 * Die beiden Abbruchfaelle sind die Ausnahme: eine negative Menge oder ein Kurs <= 0 ist
 * kein Schoenheitsfehler, sondern ein kaputter Datensatz.
 *
 * Kein I/O. Die Hinweistexte enthalten Anzahlen und ISINs, nie Betraege. Eine Ausnahme:
 * `meldeSpruenge` nennt den Fondsnamen — Fremdtext, aber nur angezeigt (React-Kindknoten,
 * kein `dangerouslySetInnerHTML`, kein `href`), nie ausgewertet. [INV-06]
 */

import type { Cent, KursE6, MengeE8 } from '../core/dezimal.ts';
import { betragVon } from '../core/dezimal.ts';
import type { Tag } from '../core/kalender.ts';
import { istVor, vergleiche } from '../core/kalender.ts';
import type { Tx } from '../core/typen.ts';
import { ausgeglicheneUebertraege, istUebertragOhneWert } from '../core/uebertraege.ts';
import type { Hinweis, HinweisArt, HinweisWerte } from '../shared/hinweise.ts';
import { hinweis } from '../shared/hinweise.ts';
import type { LaufFehlerCode } from '../shared/laufFehler.ts';

/** Frueher als 2015 hat dieses Depot nicht existiert; spaeter als heute existiert nichts. */
export const FRUEHESTER_TAG = '2015-01-01' as Tag;
/**
 * So weit darf der Verbraucherpreisindex von einem Monat zum naechsten hoechstens
 * springen. Die deutsche Teuerung liegt seit Jahrzehnten unter 1 % im Monat; alles
 * darueber ist keine Preisentwicklung, sondern ein Fehler in der Reihe — der
 * wahrscheinlichste ist eine misslungene Umbasierung in `ingest/quellen/vpiAktuell.ts`.
 */
export const VPI_SPRUNG_SCHWELLE = 0.03;
/** Positionswerte + Cash duerfen um so viel vom Gesamtwert abweichen: 1 Euro. */
export const SUMMEN_TOLERANZ_CENT = 100n;

export class PlausibilitaetsFehler extends Error {
  readonly code = 'E_PLAUSIBEL' satisfies LaufFehlerCode;
  readonly quelle: string;
  constructor(quelle: string, meldung: string) {
    super(meldung);
    this.name = 'PlausibilitaetsFehler';
    this.quelle = quelle;
  }
}

/** Sammelstelle. Eine Instanz je Lauf; die Hinweise gehen unveraendert nach `lauf.hinweise_json`. */
export class Befunde {
  readonly hinweise: Hinweis[] = [];
  readonly #gesehen = new Set<string>();

  hinweis<A extends HinweisArt>(art: A, werte: HinweisWerte[A]): void {
    // Ein Hinweis genuegt einmal. Zweihundert gleiche Zeilen helfen niemandem.
    const h = hinweis(art, werte);
    const schluessel = `${h.art} ${JSON.stringify(h.werte)}`;
    if (this.#gesehen.has(schluessel)) return;
    this.#gesehen.add(schluessel);
    this.hinweise.push(h);
  }

  uebernimm(h: Hinweis): void {
    this.hinweis(h.art, h.werte as HinweisWerte[typeof h.art]);
  }

  get leer(): boolean {
    return this.hinweise.length === 0;
  }
}

// --- Zeile 1: Menge >= 0, Kurs > 0 -> Abbruch -------------------------------

/**
 * Eine negative Menge oder ein Kurs <= 0 kann nicht das Ergebnis eines Rundungsfehlers
 * sein. Er wuerde durch Bestand, Wertreihe und Rendite wandern und ueberall falsche
 * Zahlen erzeugen, die plausibel aussehen. Deshalb Abbruch.
 */
export function pruefeMenge(quelle: string, isin: string, menge: MengeE8): void {
  if (menge < 0n) {
    throw new PlausibilitaetsFehler(quelle, `Negative Menge fuer ${isin}.`);
  }
}

export function pruefeKurs(quelle: string, isin: string, kurs: KursE6): void {
  if (kurs <= 0n) {
    throw new PlausibilitaetsFehler(quelle, `Kurs <= 0 fuer ${isin}.`);
  }
}

// --- Zeile 2: Datum nicht in der Zukunft, nicht vor 2015 -> verwerfen -------

/** `true`, wenn der Punkt behalten werden darf. `false` heisst: verwerfen, Hinweis gesetzt. */
export function tagIstBrauchbar(befunde: Befunde, quelle: string, tag: Tag, heute: Tag): boolean {
  if (istVor(tag, FRUEHESTER_TAG)) {
    befunde.hinweis('punkteZuFrueh', { quelle, grenze: FRUEHESTER_TAG });
    return false;
  }
  if (vergleiche(tag, heute) > 0) {
    befunde.hinweis('punkteInZukunft', { quelle });
    return false;
  }
  return true;
}

// --- Zeile 4: Positionswerte + Cash = Gesamtwert +- 1 € -> Hinweis --------

/**
 * Die beiden Zeitpunkte, zu denen die zwei Seiten des Vergleichs gelten. Sie stammen aus
 * den Antworten selbst (`holdings.currentQuote.timestamp`, `overview.timestamps.valuationTimestampUtc`),
 * nicht von der Uhr — die Pruefung bleibt rein.
 */
export type Vergleichsstand = {
  /** Zeitstempel des juengsten Kurses aus `holdings`, ISO 8601. `null` = unbekannt. */
  readonly kurseAus: string | null;
  /** Moment, fuer den der Gesamtwert der Bank gilt, ISO 8601. `null` = unbekannt. */
  readonly gesamtAus: string | null;
  /** Beginn des Laufs, ISO 8601 — vor jedem Abruf. `null` = unbekannt. */
  readonly laufAb: string | null;
};

/**
 * Die eigene Summe steht auf Live-Kursen, der Gesamtwert der Bank auf einem Stand, den sie
 * nur gelegentlich neu rechnet (im Beobachtungsfall: einmal nach Boersenschluss). Waehrend
 * des Handelstages vergleicht die Zeile deshalb zwei verschiedene Momente, und jede normale
 * Kursbewegung reisst die Ein-Euro-Grenze — an einem Depot im sechsstelligen Bereich sind
 * das drei Zehntausendstel Prozent. Der Hinweis war dann taeglich zu sehen und sagte nichts.
 *
 * Also wird nur verglichen, wenn kein Kurs juenger ist als der Stand der Bank. Genau dann
 * beschreiben beide Seiten denselben Moment, und eine Abweichung ist ein echter Befund:
 * eine fehlende Position, ein nicht mitgezaehlter Kontostand, eine doppelte Buchung.
 * Ist ein Kurs juenger, schweigt die Zeile — sie kann nichts pruefen. [ADR-015]
 *
 * Waehrend des Handels bewertet die Bank live: ihr Stand faellt in den Lauf selbst, Sekunden
 * nach den Kursen aus `holdings`, und beide Seiten beschreiben wieder verschiedene Momente.
 * Verglichen wird deshalb nur ein Stand, der schon vor dem Lauf feststand. [ADR-033]
 */
export function pruefeSummen(
  befunde: Befunde,
  positionenCent: readonly Cent[],
  cashCent: Cent,
  gesamtCent: Cent,
  stand: Vergleichsstand,
): void {
  if (!istVergleichbar(stand)) return;
  let summe = cashCent;
  for (const p of positionenCent) summe += p;
  const abweichung = betragVon(summe - gesamtCent);
  if (abweichung > SUMMEN_TOLERANZ_CENT) {
    // Die Abweichung selbst ist ein Geldbetrag und gehoert nicht in den Text —
    // die Groessenordnung genuegt, um den Befund einzuordnen.
    befunde.hinweis('summenAbweichung', { zehnerpotenz: zehnerpotenz(abweichung / 100n) });
  }
}

/**
 * Unbekannter oder unlesbarer Zeitstempel heisst vergleichen, nicht schweigen: eine Zeile,
 * die sich bei jeder Unklarheit selbst abschaltet, ist keine Selbstkontrolle mehr.
 */
function istVergleichbar(stand: Vergleichsstand): boolean {
  const kurse = alsZeitpunkt(stand.kurseAus);
  const gesamt = alsZeitpunkt(stand.gesamtAus);
  const lauf = alsZeitpunkt(stand.laufAb);
  if (gesamt === null) return true;
  if (lauf !== null && gesamt >= lauf) return false;
  return kurse === null || kurse <= gesamt;
}

function alsZeitpunkt(iso: string | null): number | null {
  if (iso === null) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

/** Groessenordnung statt Betrag: "10^3 €" verraet nichts ueber den Kontostand. */
function zehnerpotenz(euro: bigint): number {
  const b = betragVon(euro);
  return b === 0n ? 0 : b.toString().length - 1;
}

// --- Zeile 5: Tagessprung > 30 % -> auffaellig = 1, Hinweis, KEIN Abbruch --

/**
 * Die Erkennung selbst steht in `core/kursraster.ts` (`markiereSpruenge`,
 * `SPRUNG_SCHWELLE = 0.3`) — hier wird nur der Hinweis daraus gemacht. Ein Sprung ist
 * oft echt (Ausschuettung, Split) und darf den Lauf nie beenden.
 *
 * Ein Hinweis je ISIN, mit Zeitraum und — sofern bekannt — Fondsname statt nur ISIN:
 * `nameVon` kommt aus dem aktuellen Bestand und deckt verkaufte oder nicht abgerufene
 * Positionen nicht ab, dann bleibt es bei der ISIN.
 */
export function meldeSpruenge(
  befunde: Befunde,
  auffaellige: ReadonlySet<string>,
  nameVon: ReadonlyMap<string, string> = new Map(),
): void {
  if (auffaellige.size === 0) return;

  const tageProIsin = new Map<string, string[]>();
  for (const eintrag of auffaellige) {
    const leerzeichen = eintrag.indexOf(' ');
    const isin = eintrag.slice(0, leerzeichen);
    const tag = eintrag.slice(leerzeichen + 1);
    const liste = tageProIsin.get(isin);
    if (liste === undefined) tageProIsin.set(isin, [tag]);
    else liste.push(tag);
  }

  for (const isin of [...tageProIsin.keys()].sort()) {
    const tage = tageProIsin.get(isin)!.sort();
    befunde.hinweis('tagessprung', {
      isin,
      name: nameVon.get(isin) ?? null,
      anzahl: tage.length,
      von: tage[0]!,
      bis: tage[tage.length - 1]!,
    });
  }
}

// --- Zeile 6: Transaktionsliste beginnt nach dem ersten bekannten Kauf -----

/**
 * Wenn die aelteste gelieferte Transaktion juenger ist als der aelteste Kurs, den wir
 * ueber einen Kauf kennen, fehlt der Anfang der Historie — dann ist die kumulierte
 * Einzahlung zu klein und jede Rendite zu gross. `seed.json` ist der Ausweg. [P-13]
 */
export function pruefeHistorienbeginn(
  befunde: Befunde,
  ersterTransaktionsTag: Tag | null,
  ersterBekannterKaufTag: Tag | null,
): void {
  if (ersterTransaktionsTag === null || ersterBekannterKaufTag === null) return;
  if (istVor(ersterBekannterKaufTag, ersterTransaktionsTag)) {
    befunde.hinweis('historienbeginn', { ersterTransaktionsTag, ersterKaufTag: ersterBekannterKaufTag });
  }
}

// --- Zeile 6b: ein Uebertrag herein ohne Wert ------------------------------

/**
 * Ein unverpaarter `TRANSFER_IN` ohne Betrag kommt ohne Einstand und ohne Einzahlung ins
 * Depot; sein ganzer Wert erschiene als Kursgewinn. Der Kern schaetzt ihn nicht — der
 * Wert am Uebertragstag gehoert in die Historie, nicht in eine Vermutung. [ADR-043]
 */
export function pruefeUebertraege(befunde: Befunde, transaktionen: readonly Tx[]): void {
  const ausgeglichen = ausgeglicheneUebertraege(transaktionen);
  for (const tx of transaktionen) {
    if (tx.typ.toUpperCase() !== 'TRANSFER_IN' || tx.isin === null) continue;
    if (istUebertragOhneWert(tx, ausgeglichen)) befunde.hinweis('uebertragOhneWert', { isin: tx.isin, tag: tx.tag });
  }
}

// --- Zeile 7: der Verbraucherpreisindex springt nicht ----------------------

/**
 * Zwei Datensaetze bilden eine Preisreihe: die amtliche Reihe und der nachgefuellte Rand
 * ([ADR-017](../docs/entscheidungen/ADR-017-zweiter-eurostat-datensatz-fuer-den-rand.md)).
 * Die Quelle prueft die Umbasierung schon selbst — dort an der Streuung der Quotienten.
 * Das hier ist der zweite Waechter und der unabhaengige: er sieht die fertige Reihe, so wie
 * sie in die Datenbank geht, und faellt auch dann auf, wenn die Naht ganz woanders
 * entstanden ist.
 *
 * Ein Hinweis, kein Abbruch: eine Preisreihe mit einer Delle liefert immer noch eine
 * bessere Realrendite als gar keine.
 */
export function pruefeVpiReihe(befunde: Befunde, werte: readonly { monat: string; indexWert: number }[]): void {
  const sortiert = [...werte].sort((a, b) => (a.monat < b.monat ? -1 : a.monat > b.monat ? 1 : 0));

  const spruenge: string[] = [];
  for (let i = 1; i < sortiert.length; i += 1) {
    const vorher = sortiert[i - 1]!;
    const jetzt = sortiert[i]!;
    if (vorher.indexWert <= 0) continue;
    const sprung = Math.abs(jetzt.indexWert / vorher.indexWert - 1);
    if (sprung > VPI_SPRUNG_SCHWELLE) spruenge.push(jetzt.monat);
  }

  if (spruenge.length === 0) return;
  befunde.hinweis('vpiSprung', { monate: spruenge, schwelleProzent: VPI_SPRUNG_SCHWELLE * 100 });
}
