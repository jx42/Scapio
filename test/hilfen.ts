/**
 * Baukasten fuer Testdaten.
 *
 * Eine Transaktion hat dreizehn Felder; ein Test interessiert sich fuer zwei davon.
 * `tx()` fuellt den Rest mit Werten, die nichts bedeuten, damit im Test nur steht,
 * worum es geht. Keine Zufallszahlen — jeder Fehlschlag muss wiederholbar sein.
 */

import { zuCent, zuKursE6, zuMengeE8 } from '../core/dezimal.ts';
import type { Tag } from '../core/kalender.ts';
import { alsTag } from '../core/kalender.ts';
import type { Bestand, DepotTag, Fluss, Isin, Tx } from '../core/typen.ts';

export const T = (text: string): Tag => alsTag(text);

let zaehler = 0;

/** Setzt die laufende Nummer zurueck, damit ids zwischen Tests vergleichbar bleiben. */
export function idsZuruecksetzen(): void {
  zaehler = 0;
}

export type TxTeil = Partial<Omit<Tx, 'tag'>> & { tag: string };

export function tx(teil: TxTeil): Tx {
  zaehler += 1;
  const tag = T(teil.tag);
  return {
    id: teil.id ?? `tx-${String(zaehler).padStart(4, '0')}`,
    ts: teil.ts ?? `${teil.tag}T10:00:00+01:00`,
    tag,
    art: teil.art ?? 'WERTPAPIER',
    typ: teil.typ ?? 'BUY',
    isin: teil.isin ?? null,
    bezugIsin: teil.bezugIsin ?? null,
    mengeE8: teil.mengeE8 ?? null,
    betragCent: teil.betragCent ?? 0n,
    beschreibung: teil.beschreibung ?? null,
    status: teil.status ?? 'EXECUTED',
    istExtern: teil.istExtern ?? false,
    storniert: teil.storniert ?? false,
  };
}

/** Kauf: Menge positiv, Betrag negativ — Geld verlaesst die Cash-Seite. */
export function kauf(tag: string, isin: Isin, menge: string, betragEuro: string, extra: Partial<Tx> = {}): Tx {
  return tx({
    tag,
    typ: 'BUY',
    art: 'WERTPAPIER',
    isin,
    mengeE8: zuMengeE8(menge),
    betragCent: -zuCent(betragEuro),
    ...extra,
  });
}

export function verkauf(tag: string, isin: Isin, menge: string, betragEuro: string, extra: Partial<Tx> = {}): Tx {
  return tx({
    tag,
    typ: 'SELL',
    art: 'WERTPAPIER',
    isin,
    mengeE8: -zuMengeE8(menge),
    betragCent: zuCent(betragEuro),
    ...extra,
  });
}

/** Depotinterner Uebertrag hinaus: Menge negativ, Betrag der Uebertragswert. */
export function uebertragRaus(tag: string, isin: Isin, menge: string, betragEuro: string, extra: Partial<Tx> = {}): Tx {
  return tx({
    tag,
    typ: 'TRANSFER_OUT',
    art: 'WERTPAPIER',
    isin,
    mengeE8: -zuMengeE8(menge),
    betragCent: -zuCent(betragEuro),
    ...extra,
  });
}

/** Depotinterner Uebertrag herein: Menge positiv, Betrag der Uebertragswert. */
export function uebertragRein(tag: string, isin: Isin, menge: string, betragEuro: string, extra: Partial<Tx> = {}): Tx {
  return tx({
    tag,
    typ: 'TRANSFER_IN',
    art: 'WERTPAPIER',
    isin,
    mengeE8: zuMengeE8(menge),
    betragCent: zuCent(betragEuro),
    ...extra,
  });
}

/** Externe Einzahlung. */
export function einzahlung(tag: string, betragEuro: string, extra: Partial<Tx> = {}): Tx {
  return tx({
    tag,
    typ: 'CASH_TRANSFER_IN',
    art: 'CASH',
    betragCent: zuCent(betragEuro),
    istExtern: true,
    ...extra,
  });
}

export function auszahlung(tag: string, betragEuro: string, extra: Partial<Tx> = {}): Tx {
  return tx({
    tag,
    typ: 'PAYOUT',
    art: 'CASH',
    betragCent: -zuCent(betragEuro),
    istExtern: true,
    ...extra,
  });
}

/** Ertrag: erhoeht den Wert, ist aber kein eingesetztes Kapital. */
export function zins(tag: string, betragEuro: string, extra: Partial<Tx> = {}): Tx {
  return tx({ tag, typ: 'INTEREST', art: 'CASH', betragCent: zuCent(betragEuro), ...extra });
}

export function fluss(tag: string, betragEuro: string): Fluss {
  return { tag: T(tag), betrag: zuCent(betragEuro) };
}

export function depotTag(tag: string, gesamtEuro: string, teil: Partial<DepotTag> = {}): DepotTag {
  const gesamt = zuCent(gesamtEuro);
  return {
    tag: T(tag),
    wertpapiereCent: teil.wertpapiereCent ?? gesamt,
    cashCent: teil.cashCent ?? 0n,
    gesamtCent: teil.gesamtCent ?? gesamt,
    nettoEinzahlungKumCent: teil.nettoEinzahlungKumCent ?? 0n,
    lueckenhaft: teil.lueckenhaft ?? false,
  };
}

export function bestand(isin: Isin, menge: string, kurs: string, name = isin): Bestand {
  return {
    isin,
    name,
    mengeE8: zuMengeE8(menge),
    kursE6: zuKursE6(kurs),
    stand: '2026-08-26T18:00:00+02:00',
  };
}

/** ISINs, die in mehreren Suiten auftauchen. Erfunden, aber formgueltig. */
export const WELT = 'IE00B4L5Y983';
export const EUROPA = 'IE00B4K48X80';
export const GOLD = 'DE000A0S9GB0';
