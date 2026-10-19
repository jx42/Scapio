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
import { FARBE } from '@/lib/farben';

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

const tagZweistelligFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
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

const zeitpunktFormat = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: ZEITZONE,
});

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
 * an der beides auseinandergehalten wird. Zwei Nachkommastellen fuer jeden
 * Prozentwert der Anwendung, ohne Ausnahme — dieselbe Genauigkeit wie bei der
 * Sharpe-Ratio, und fein genug fuer die Drift-Abweichung, deren kleinste Schwelle
 * bei 0,1 % liegt [RUNBOOK.md].
 */
export function prozent(anteil: number, mitVorzeichen = false): string {
  if (!istZahl(anteil)) return '—';
  return mitVorzeichen ? prozentMitZeichenFormat.format(anteil) : prozentFormat.format(anteil);
}

/** Prozent aus einer Zahl, die schon in Prozent steht (12,5 statt 0,125), etwa aus einem Lauf-Hinweis. */
export function prozentAusProzentzahl(wertProzent: number): string {
  return prozent(wertProzent / 100);
}

/** Blanke Zahl ohne Einheit, etwa fuer einen Index. */
export function zahl(wert: number): string {
  if (!istZahl(wert)) return '—';
  return zahlFormat.format(wert);
}

/** Dimensionslose Verhaeltniszahl mit zwei Nachkommastellen, etwa die Sharpe-Ratio. */
function verhaeltniszahl(wert: number, mitVorzeichen = true): string {
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

/**
 * Textfarbe je Richtung — die eine Stelle, die `Richtung` auf ein Tailwind-Utility
 * abbildet. `neutral` ist ausdruecklich NICHT gruen: eine binaere Ternary auf
 * `richtung === 'ab'` faerbt neutrale Werte faelschlich als Gewinn.
 */
export const richtungTon: Record<Richtung, string> = {
  auf: 'text-gewinn',
  ab: 'text-verlust',
  neutral: 'text-text',
};

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

/** Farb-Variable je Richtung, fuer SVG-Attribute, die kein Tailwind-Utility nehmen. */
export const richtungFarbe: Record<Richtung, string> = {
  auf: FARBE.gewinn,
  ab: FARBE.verlust,
  neutral: FARBE.textLeise,
};

/** Punktfarbe je Richtung — Pendant zu `richtungTon` fuer einen Hintergrund statt Text. */
export const richtungBgTon: Record<Richtung, string> = {
  auf: 'bg-gewinn',
  ab: 'bg-verlust',
  neutral: 'bg-text-leise',
};

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

function datumZweistellig(tag: string): string {
  const datum = tagAlsDatum(tag);
  return datum === null ? String(tag ?? '') : tagZweistelligFormat.format(datum);
}

/** "2026-08-26" wird zu "08.26" — fuer Chart-Achsen, wo der volle Tag nicht hinpasst. */
function datumAlsMonatJahr(tag: string): string {
  const datum = tagAlsDatum(tag);
  return datum === null ? String(tag ?? '') : monatKurzFormat.format(datum);
}

/** "2026-08-26" wird zu "26.08." — fuer Chart-Achsen kurzer Zeitraeume, wo Monat und Jahr nichts unterscheiden. */
function datumAlsTagMonat(tag: string): string {
  const datum = tagAlsDatum(tag);
  return datum === null ? String(tag ?? '') : tagMonatFormat.format(datum);
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

/** "2026-08" wird zu "2026". */
export function jahrAusMonat(monat: string): string {
  const datum = monatAlsDatum(monat);
  return datum === null ? String(monat ?? '') : jahrFormat.format(datum);
}

/** ISO-Zeitstempel mit Offset zu "26.08.2026, 12:08" in Europe/Berlin. */
export function zeitpunktKurz(iso: string | null | undefined): string | null {
  if (typeof iso !== 'string' || iso === '') return null;
  const datum = new Date(iso);
  return Number.isNaN(datum.getTime()) ? null : zeitpunktFormat.format(datum);
}

/** Wie `zeitpunktKurz`, aber nur der Tag — fuer Stellen, an denen die Uhrzeit nicht hinpasst. */
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
  /** Derselbe Zeitraum mit zweistelligem Jahr, fuer die halbe Kartenbreite auf dem Handy. */
  readonly zeitraumKurz: string | null;
};

export function maxDrawdownAnzeige(ergebnis: MaxDrawdownErgebnis | null | undefined): MaxDrawdownAnzeige {
  if (ergebnis === null || ergebnis === undefined || ergebnis.art !== 'ok') {
    return { wert: de.xirr.nichtBerechenbar, satz: de.kennzahlen.maxDrawdownZuWenigDaten, zeitraum: null, zeitraumKurz: null };
  }
  return {
    wert: prozent(Math.abs(ergebnis.anteil)),
    satz: null,
    zeitraum: de.kennzahlen.maxDrawdownZeitraum(datumKurz(ergebnis.tagHoch), datumKurz(ergebnis.tagTief)),
    zeitraumKurz: de.kennzahlen.maxDrawdownZeitraum(datumZweistellig(ergebnis.tagHoch), datumZweistellig(ergebnis.tagTief)),
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
