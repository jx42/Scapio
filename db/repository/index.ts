/**
 * Ein Namensraum je Tabelle. Wer `bestand.alle(db)` schreibt, sieht sofort,
 * welche Tabelle er anfasst — und dass er sie nicht selbst abfragt.
 */

export * as bestand from './bestand.ts';
export * as depotTag from './depotTag.ts';
export * as etfBestandteil from './etfBestandteil.ts';
export * as fondsAufloesung from './fondsAufloesung.ts';
export * as kurs from './kurs.ts';
export * as lauf from './lauf.ts';
export * as rawSnapshot from './rawSnapshot.ts';
export * as sparplan from './sparplan.ts';
export * as transaktion from './transaktion.ts';
export * as vpi from './vpi.ts';
export * as wertpapierArt from './wertpapierArt.ts';
export * as zins from './zins.ts';

export { inTransaktion } from './hilfen.ts';
