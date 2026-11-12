/*
 * Die einzige Stelle, an der eine Zahl zu einer Zeichenkette wird.
 *
 * Alles laeuft ueber Intl mit fester Sprache 'de-DE'. Keine Komponente formatiert
 * selbst: kein toFixed, kein toLocaleString, keine handgebaute Prozentzeichenkette.
 * Sonst stehen am Ende drei Schreibweisen fuer denselben Betrag auf einer Seite. [P-06]
 *
 * Cent kommen als ganze JSON-Zahl herein und werden hier — und nur hier — durch 100
 * geteilt. Gerechnet wird damit nicht; das passiert im Rechenkern in `bigint`. [INV-02]
 * Tage kommen als "YYYY-MM-DD" in Europe/Berlin und werden ohne Zeitzonenumrechnung
 * gelesen, damit aus dem 1. nicht der 31. wird. [INV-03]
 */

import { de } from '@/i18n/de';
import type { MaxDrawdownErgebnis, SharpeErgebnis, VolatilitaetErgebnis, XirrErgebnis } from '@/lib/api';

const ZEITZONE = 'Europe/Berlin';

const euroFormat = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const euroMitZeichenFormat = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
});

const euroKompaktFormat = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  compactDisplay: 'short',
  maximumFractionDigits: 0,
});

const prozentFormat = new Intl.NumberFormat('de-DE', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const prozentMitZeichenFormat = new Intl.NumberFormat('de-DE', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});

const KLEINSTER_ANTEIL = 0.001;
const anteilFormat = new Intl.NumberFormat('de-DE', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const anteilMitZeichenFormat = new Intl.NumberFormat('de-DE', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

/** Eingabefeld eines Zielanteils: Prozent mit genau einer Nachkommastelle, ohne Zeichen. */
const zielEingabeFormat = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  useGrouping: false,
});

const zahlFormat = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Fuer dimensionslose Verhaeltniszahlen wie die Sharpe-Ratio: zwei Nachkommastellen, mit Vorzeichen. */
const verhaeltnisFormat = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});

const verhaeltnisOhneZeichenFormat = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const tagFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

const monatFormat = new Intl.DateTimeFormat('de-DE', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const monatKurzFormat = new Intl.DateTimeFormat('de-DE', {
  month: '2-digit',
  year: '2-digit',
  timeZone: 'UTC',
});

const tagMonatFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});

const jahrFormat = new Intl.DateTimeFormat('de-DE', {
  year: 'numeric',
  timeZone: 'UTC',
});

const zeitpunktTagFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: ZEITZONE,
});

/** Nur fuer `kalendertagNummer`: die Teile des Berliner Kalendertags als Zahlen. */
const kalendertagTeileFormat = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  timeZone: ZEITZONE,
});

// 'always', nicht 'auto': sonst hiesse es bei zwei Tagen "vorgestern" statt "vor 2 Tagen".
const relativFormat = new Intl.RelativeTimeFormat('de-DE', { numeric: 'always' });

/** Ist die Zahl brauchbar? Alles andere wird als "unbekannt" behandelt, nie als NaN gezeigt. */
function istZahl(wert: unknown): wert is number {
  return typeof wert === 'number' && Number.isFinite(wert);
}

/** Cent-Ganzzahl als Euro-Betrag. `mitVorzeichen` setzt ein "+" vor positive Werte. */
export function euroAusCent(cent: number, mitVorzeichen = false): string {
  if (!istZahl(cent)) return '—';
  const euro = cent / 100;
  return mitVorzeichen ? euroMitZeichenFormat.format(euro) : euroFormat.format(euro);
}

/**
 * Fuer Achsenbeschriftungen: kuerzt erst ab 1 Million ("1,5 Mio. €"); darunter steht
 * der volle Betrag ("150.000 €") — Intl kuerzt bei 'compact' Waehrungsbetraegen unter
 * dieser Schwelle nicht weiter. Nie fuer eine Kennzahl.
 */
export function euroKompaktAusCent(cent: number): string {
  if (!istZahl(cent)) return '—';
  return euroKompaktFormat.format(cent / 100);
}

/**
 * Verhaeltniszahl als Prozent, immer mit zwei Nachkommastellen: 0,1123 wird zu
 * "11,23 %". Die API liefert Verhaeltnisse, keine Prozentwerte — das ist die Stelle,
 * an der beides auseinandergehalten wird. Zwei Nachkommastellen fuer Renditen und
 * Kennzahlen — dieselbe Genauigkeit wie bei der Sharpe-Ratio, und fein genug fuer die
 * Drift-Abweichung, deren kleinste Schwelle bei 0,1 % liegt [RUNBOOK.md].
 */
export function prozent(anteil: number, mitVorzeichen = false): string {
  if (!istZahl(anteil)) return '—';
  return mitVorzeichen ? prozentMitZeichenFormat.format(anteil) : prozentFormat.format(anteil);
}

/**
 * Anteil in einer Tabellenspalte, mit einer Nachkommastelle: 0,1123 wird zu "11,2 %".
 * Eine Spalte von Anteilen liest sich als Verteilung; die zweite Stelle waere dort nur Rauschen.
 */
export function anteilProzent(anteil: number, mitVorzeichen = false): string {
  if (!istZahl(anteil)) return '—';
  if (mitVorzeichen) return anteilMitZeichenFormat.format(anteil);
  // „0,0 %“ hieße „nichts“, obwohl etwas da ist.
  if (anteil > 0 && anteil < KLEINSTER_ANTEIL / 2) return `<\u00A0${anteilFormat.format(KLEINSTER_ANTEIL)}`;
  return anteilFormat.format(anteil);
}

/** Prozent aus einer Zahl, die schon in Prozent steht (12,5 statt 0,125), etwa aus einem Lauf-Hinweis. */
export function prozentAusProzentzahl(wertProzent: number): string {
  return prozent(wertProzent / 100);
}

/** Basispunkte als Inhalt eines Prozentfelds: 7000 wird zu "70,0". */
export function zielEingabe(bp: number): string {
  if (!istZahl(bp)) return '';
  return zielEingabeFormat.format(bp / 100);
}

/** Blanke Zahl ohne Einheit, etwa fuer einen Index. */
export function zahl(wert: number): string {
  if (!istZahl(wert)) return '—';
  return zahlFormat.format(wert);
}

/** Dimensionslose Verhaeltniszahl mit zwei Nachkommastellen, etwa die Sharpe-Ratio. */
export function verhaeltniszahl(wert: number, mitVorzeichen = true): string {
  if (!istZahl(wert)) return '—';
  return (mitVorzeichen ? verhaeltnisFormat : verhaeltnisOhneZeichenFormat).format(wert);
}

/** Pfeil statt "+"/"-": "▲" ab > 0, "▼" ab < 0, sonst leer. Der Wert daneben steht ohne Vorzeichen. */
export function richtungPfeil(wert: number): string {
  if (!istZahl(wert) || wert === 0) return '';
  return wert > 0 ? de.kennzahlen.richtungPfeil.auf : de.kennzahlen.richtungPfeil.ab;
}

export type Richtung = 'auf' | 'ab' | 'neutral';

export type Vorzeichen = {
  readonly richtung: Richtung;
  /** Pfeilzeichen (▲/▼), gerendert von `RichtungsPfeil` — Gewinn und Verlust nie allein ueber Farbe. [P-06] */
  readonly pfeil: string;
  readonly zeichen: string;
};

export function vorzeichen(wert: number): Vorzeichen {
  if (!istZahl(wert) || wert === 0) {
    return { richtung: 'neutral', pfeil: '', zeichen: '' };
  }
  return wert > 0
    ? { richtung: 'auf', pfeil: richtungPfeil(wert), zeichen: '+' }
    : { richtung: 'ab', pfeil: richtungPfeil(wert), zeichen: '-' };
}

/** Ein Wert fuer die Anzeige: Betrag ohne Vorzeichen, dazu Richtung und Pfeil. */
export type Richtungswert = { readonly wert: string; readonly richtung: Richtung; readonly pfeil: string };

/**
 * Betrag, Richtung und Pfeil aus EINEM Wert. Wer den Betrag selbst per `Math.abs`
 * formatiert und den Pfeil getrennt setzt, zeigt einen Verlust als Gewinn, sobald der
 * Pfeil an einer Stelle fehlt — deshalb verbietet eslint `Math.abs` als Argument.
 * `null` ist nicht berechenbar: Satz statt Zahl, keine Richtung.
 */
export function richtungswert(wert: number | null, formatieren: (betrag: number) => string): Richtungswert {
  if (wert === null) return { wert: de.xirr.nichtBerechenbar, richtung: 'neutral', pfeil: '' };
  const { richtung, pfeil } = vorzeichen(wert);
  return { wert: formatieren(Math.abs(wert)), richtung, pfeil };
}

/** Nur der Betrag, fuer einen Nebenwert, dessen Richtung schon am Hauptwert daneben steht. */
export function betragOhneVorzeichen(wert: number, formatieren: (betrag: number) => string): string {
  return formatieren(Math.abs(wert));
}

/** Kuerzt auf hoechstens `zeichen` Zeichen, mit Auslassungspunkten. Fuer Beschriftungen im Chart. */
export function gekuerzt(text: string, zeichen: number): string {
  return text.length <= zeichen ? text : `${text.slice(0, Math.max(1, zeichen - 1)).trimEnd()}…`;
}

/** Liest "YYYY-MM-DD" ohne Zeitzonenumrechnung. Gibt null bei allem anderen. */
function tagAlsDatum(tag: string): Date | null {
  if (typeof tag !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(tag)) return null;
  const datum = new Date(`${tag}T00:00:00Z`);
  return Number.isNaN(datum.getTime()) ? null : datum;
}

function monatAlsDatum(monat: string): Date | null {
  if (typeof monat !== 'string' || !/^\d{4}-\d{2}$/.test(monat)) return null;
  const datum = new Date(`${monat}-01T00:00:00Z`);
  return Number.isNaN(datum.getTime()) ? null : datum;
}

/** "2026-08-26" wird zu "26.08.2026". Unlesbares bleibt unveraendert stehen. */
export function datumKurz(tag: string): string {
  const datum = tagAlsDatum(tag);
  return datum === null ? String(tag ?? '') : tagFormat.format(datum);
}

/** "2026-08-26" wird zu "08.26" — fuer Chart-Achsen, wo der volle Tag nicht hinpasst. */
function datumAlsMonatJahr(tag: string): string {
  const datum = tagAlsDatum(tag);
  return datum === null ? String(tag ?? '') : monatKurzFormat.format(datum);
}

/** "2026-08-26" wird zu "26.08." — fuer Chart-Achsen kurzer Zeitraeume, wo Monat und Jahr nichts unterscheiden. */
export function datumAlsTagMonat(tag: string): string {
  const datum = tagAlsDatum(tag);
  return datum === null ? String(tag ?? '') : tagMonatFormat.format(datum);
}

const MS_JE_TAG = 86_400_000;

/** Ganze UTC-Tage seit 1970: nur die Lage auf einer zeitgetreuen Achse, keine Kennzahl. */
export function tagAchsenwert(tag: string): number {
  const datum = tagAlsDatum(tag);
  return datum === null ? 0 : datum.getTime() / MS_JE_TAG;
}

const ZEITACHSE_WOCHEN_BIS_TAGE = 120;
const ZEITACHSE_WOCHEN_SCHRITTE = [1, 2, 3, 4, 6, 8] as const;
const ZEITACHSE_MONATS_SCHRITTE = [1, 2, 3, 6, 12, 24] as const;
const ZEITACHSE_HOECHSTENS_TICKS = 6;
/** Ein Tick so nah am rechten Rand liefe mit seiner Beschriftung aus dem Chart. */
const ZEITACHSE_RAND_ANTEIL = 0.07;
const TAGE_JE_WOCHE = 7;
/** Der 1.1.1970 war ein Donnerstag: Tag + 3 ist bei Montagen durch 7 teilbar. */
const MONTAG_VERSATZ = 3;
const MONATE_JE_JAHR = 12;

/** Aus dem Text gelesen: Datumsteile eines `Date` gibt es nur im Kalender. [INV-03] */
function monatsIndex(tag: string): number {
  return Number(tag.slice(0, 4)) * MONATE_JE_JAHR + Number(tag.slice(5, 7)) - 1;
}

function monatsErster(index: number): number {
  return Date.UTC(Math.floor(index / MONATE_JE_JAHR), index % MONATE_JE_JAHR, 1) / MS_JE_TAG;
}

function wochenTicks(von: number, bis: number, schritt: number): number[] {
  const ticks: number[] = [];
  for (let woche = Math.ceil((von + MONTAG_VERSATZ) / TAGE_JE_WOCHE); woche * TAGE_JE_WOCHE - MONTAG_VERSATZ <= bis; woche++) {
    if (woche % schritt === 0) ticks.push(woche * TAGE_JE_WOCHE - MONTAG_VERSATZ);
  }
  return ticks;
}

function monatsTicks(ersterTag: string, von: number, bis: number, schritt: number): number[] {
  const ticks: number[] = [];
  for (let index = monatsIndex(ersterTag); monatsErster(index) <= bis; index++) {
    if (index % schritt === 0 && monatsErster(index) >= von) ticks.push(monatsErster(index));
  }
  return ticks;
}

function kleinsterSchritt(
  schritte: readonly number[],
  ticksFuer: (schritt: number) => number[],
): { schritt: number; ticks: number[] } {
  const gefunden = schritte.map((schritt) => ({ schritt, ticks: ticksFuer(schritt) }));
  return (
    gefunden.find((stufe) => stufe.ticks.length <= ZEITACHSE_HOECHSTENS_TICKS) ??
    gefunden.at(-1) ?? { schritt: 1, ticks: [] }
  );
}

/**
 * Ticks und Beschriftung einer zeitgetreuen Achse, immer kalendertreu und nie an Datenzeilen
 * gebunden: an einem Monatsende stünde sonst der falsche Monat.
 */
export function zeitachse(ersterTag: string, letzterTag: string): { ticks: number[]; format: (x: number) => string } {
  const von = tagAchsenwert(ersterTag);
  const bis = tagAchsenwert(letzterTag);
  const spanne = bis - von;
  const grenze = bis - spanne * ZEITACHSE_RAND_ANTEIL;
  const ohneRand = (ticks: number[]) => (spanne === 0 ? ticks : ticks.filter((tick) => tick <= grenze));

  if (spanne < ZEITACHSE_WOCHEN_BIS_TAGE) {
    const { ticks } = kleinsterSchritt(ZEITACHSE_WOCHEN_SCHRITTE, (s) => ohneRand(wochenTicks(von, bis, s)));
    return { ticks, format: (x) => tagMonatFormat.format(new Date(x * MS_JE_TAG)) };
  }
  const { ticks } = kleinsterSchritt(ZEITACHSE_MONATS_SCHRITTE, (s) => ohneRand(monatsTicks(ersterTag, von, bis, s)));
  return { ticks, format: (x) => monatKurzFormat.format(new Date(x * MS_JE_TAG)) };
}

/** Ab dieser Spannweite in Tagen beschriftet die Zeitachse Monat und Jahr statt Tag und Monat. */
const ACHSE_TAG_MONAT_BIS_TAGE = 92;

/**
 * Achsenformat nach Spannweite: ein Zeitraum unter drei Monaten braucht Tag und Monat, sonst
 * tragen alle Ticks dieselbe Beschriftung; darueber genuegen Monat und Jahr.
 */
export function achsenDatumFormat(ersterTag: string | undefined, letzterTag: string | undefined): (tag: string) => string {
  return achseNachMonat(ersterTag, letzterTag) ? datumAlsMonatJahr : datumAlsTagMonat;
}

/** Ob die Zeitachse Monat und Jahr zeigt (siehe `achsenDatumFormat`). */
export function achseNachMonat(ersterTag: string | undefined, letzterTag: string | undefined): boolean {
  const von = ersterTag === undefined ? null : tagAlsDatum(ersterTag);
  const bis = letzterTag === undefined ? null : tagAlsDatum(letzterTag);
  if (von === null || bis === null) return true;
  return (bis.getTime() - von.getTime()) / 86_400_000 > ACHSE_TAG_MONAT_BIS_TAGE;
}

/** "2026-08" wird zu "August 2026". */
export function monatLang(monat: string): string {
  const datum = monatAlsDatum(monat);
  return datum === null ? String(monat ?? '') : monatFormat.format(datum);
}

/** "2026-08" wird zu "08.26" — fuer Achsen, wo "August 2026" nicht hinpasst. */
export function monatKurz(monat: string): string {
  const datum = monatAlsDatum(monat);
  return datum === null ? String(monat ?? '') : monatKurzFormat.format(datum);
}

/** "2026-08-15" wird zu "2026-08" — Schluessel fuer den Monatswechsel, ohne Date. */
export function monatSchluessel(tag: string): string {
  return tag.slice(0, 7);
}

/** "2026-08-15" wird zu 8. */
export function monatsnummer(tag: string): number {
  return Number(tag.slice(5, 7));
}

/** "2026-08" wird zu "2026". */
export function jahrAusMonat(monat: string): string {
  const datum = monatAlsDatum(monat);
  return datum === null ? String(monat ?? '') : jahrFormat.format(datum);
}

const MINUTE_MS = 60_000;
const STUNDE_MS = 60 * MINUTE_MS;
const TAG_MS = 24 * STUNDE_MS;
/** Ab so vielen Kalendertagen steht das Datum statt eines Abstands. */
const DATUM_AB_TAGEN = 7;

/** Fortlaufende Nummer des Kalendertags in Europe/Berlin — die Differenz zweier ist die Zahl der Mitternaechte dazwischen. */
function kalendertagNummer(datum: Date): number {
  const teile = kalendertagTeileFormat.formatToParts(datum);
  const teil = (art: Intl.DateTimeFormatPartTypes): number => Number(teile.find((t) => t.type === art)?.value);
  return Date.UTC(teil('year'), teil('month') - 1, teil('day')) / TAG_MS;
}

function grossAnfang(text: string): string {
  return text.charAt(0).toLocaleUpperCase('de-DE') + text.slice(1);
}

/**
 * Wann zuletzt aktualisiert wurde, relativ zu `jetzt`: Minuten, Stunden, dann Kalendertage
 * in Europe/Berlin, ab sieben Tagen das Datum. Ab 24 Stunden zaehlen Mitternaechte, nicht
 * 24-Stunden-Bloecke — sonst waere Freitag 18 Uhr am Montag um 9 Uhr "vor 2 Tagen".
 * Ein Zeitpunkt in der Zukunft (Uhr verstellt, Takt noch nicht nachgezogen) gilt als gerade.
 */
export function aktualisiertRelativ(iso: string | null | undefined, jetzt: Date): string | null {
  if (typeof iso !== 'string' || iso === '') return null;
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return null;

  const abstand = jetzt.getTime() - datum.getTime();
  if (abstand < MINUTE_MS) return de.seite.aktualisiertGerade;
  if (abstand < STUNDE_MS)
    return de.seite.aktualisiert(grossAnfang(relativFormat.format(-Math.floor(abstand / MINUTE_MS), 'minute')));
  if (abstand < TAG_MS)
    return de.seite.aktualisiert(grossAnfang(relativFormat.format(-Math.floor(abstand / STUNDE_MS), 'hour')));

  const tage = kalendertagNummer(jetzt) - kalendertagNummer(datum);
  if (tage <= 1) return de.seite.aktualisiertGestern;
  if (tage < DATUM_AB_TAGEN) return de.seite.aktualisiert(grossAnfang(relativFormat.format(-tage, 'day')));
  return de.seite.aktualisiertAm(zeitpunktTagFormat.format(datum));
}

/** Nur der Tag eines Zeitpunkts — fuer Stellen, an denen die Uhrzeit nicht hinpasst. */
export function zeitpunktNurTag(iso: string | null | undefined): string | null {
  if (typeof iso !== 'string' || iso === '') return null;
  const datum = new Date(iso);
  return Number.isNaN(datum.getTime()) ? null : zeitpunktTagFormat.format(datum);
}

/** Tag im Monat als Ordnungszahl: 4 wird zu "4." */
export function tagImMonat(tag: number): string {
  if (!istZahl(tag)) return '—';
  return `${zahlFormat.format(tag)}.`;
}

/* ------------------------------------------------------------------ XIRR-Ausgang */

export type XirrAnzeige = {
  /** Was in der Wertspalte steht — nie "NaN", nie leer, nie ein blosser Bindestrich. */
  readonly wert: string;
  /** Der erklaerende Satz bei einem Fehlschlag, sonst null. */
  readonly satz: string | null;
  /** Die Rate, falls es eine gibt — fuer Farbe und Pfeil. */
  readonly rate: number | null;
};

/**
 * XirrErgebnis ist eine Union und kann fehlschlagen. Jeder Ausgang bekommt einen
 * deutschen Satz: ein leeres Feld sieht aus wie ein Fehler der Oberflaeche, und ein
 * Bindestrich ohne Erklaerung ist eine Zumutung. [P-06]
 */
export function xirrAnzeige(ergebnis: XirrErgebnis | null | undefined): XirrAnzeige {
  if (ergebnis === null || ergebnis === undefined) {
    return { wert: de.xirr.nichtBerechenbar, satz: de.xirr.zu_wenige_fluesse, rate: null };
  }
  if (ergebnis.art === 'ok') {
    return { wert: prozent(Math.abs(ergebnis.rate)), satz: ergebnis.mehrdeutig ? de.xirr.mehrdeutig : null, rate: ergebnis.rate };
  }
  return { wert: de.xirr.nichtBerechenbar, satz: de.xirr[ergebnis.art], rate: null };
}

/**
 * Angezeigte Realrendite: die exakte ueber deflationierte Zahlungen, ersatzweise die
 * Fisher-Gleichung, wenn jene scheitert. [ADR-036]
 */
export function realRendite(real: {
  readonly exakt: XirrErgebnis;
  readonly fisher: number | null;
}): { readonly rate: number | null; readonly ersatz: boolean } {
  if (real.exakt.art === 'ok') return { rate: real.exakt.rate, ersatz: false };
  return { rate: real.fisher, ersatz: real.fisher !== null };
}

/* -------------------------------------------------------------- Risikokennzahlen */

/** `null`, wenn nicht berechenbar — die Kennzahl wird dann nicht angezeigt. */
export function volatilitaetAnzeige(ergebnis: VolatilitaetErgebnis | null | undefined): string | null {
  return ergebnis?.art === 'ok' ? prozent(ergebnis.proJahr) : null;
}

export type MaxDrawdownAnzeige = {
  readonly wert: string;
  readonly satz: string | null;
  readonly zeitraum: string | null;
};

export function maxDrawdownAnzeige(ergebnis: MaxDrawdownErgebnis | null | undefined): MaxDrawdownAnzeige {
  if (ergebnis === null || ergebnis === undefined || ergebnis.art !== 'ok') {
    return { wert: de.xirr.nichtBerechenbar, satz: de.kennzahlen.maxDrawdownZuWenigDaten, zeitraum: null };
  }
  return {
    wert: prozent(Math.abs(ergebnis.anteil)),
    satz: null,
    zeitraum: de.kennzahlen.maxDrawdownZeitraum(datumKurz(ergebnis.tagHoch), datumKurz(ergebnis.tagTief)),
  };
}

export type SharpeAnzeige = {
  readonly wert: string;
  /** Anders als bei Kursgewinn/TWR/XIRR: nur negativ ist rot, ab null bleibt es neutral/weiss. */
  readonly richtung: Richtung;
  readonly zinsSatz: string;
  /** Grobe Einordnung der Sharpe-Ratio in Worten. */
  readonly bewertung: string;
};

/** Grenzen an der ueblichen Faustregel: negativ schwach, ab 2 sehr gut. */
function sharpeBewertung(wert: number): string {
  if (wert < 0) return de.kennzahlen.sharpeBewertung.sehrSchlecht;
  if (wert <= 0.6) return de.kennzahlen.sharpeBewertung.solide;
  if (wert <= 1) return de.kennzahlen.sharpeBewertung.gut;
  return de.kennzahlen.sharpeBewertung.sehrGut;
}

/** `null`, wenn nicht berechenbar — die Kennzahl wird dann nicht angezeigt. */
export function sharpeAnzeige(ergebnis: SharpeErgebnis | null | undefined): SharpeAnzeige | null {
  if (ergebnis?.art !== 'ok') return null;
  const rot = ergebnis.wert < 0;
  return {
    wert: verhaeltniszahl(ergebnis.wert, false),
    richtung: rot ? 'ab' : 'neutral',
    zinsSatz: prozent(ergebnis.zinsProJahr),
    bewertung: sharpeBewertung(ergebnis.wert),
  };
}
