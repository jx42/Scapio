/**
 * Synthetisches Szenario fuer den Durchstich-Test und den Demo-Server: ein plausibles, in
 * sich stimmiges Depot mit Teilverkaeufen, Steuern und Gebuehren — FIFO-Bewertung ist bereits
 * in core/ getestet, hier geht es darum, echten Recharts-Content unter der echten CSP zu rendern und in
 * `npm run demo` plausible Kursverlaeufe zu zeigen, ohne ein echtes Depot preiszugeben.
 *
 * Das Depot haelt sieben Positionen: World-ETF (iShares), Schwellenlaender-ETF (Vanguard),
 * Euro-Anleihe-ETF (State Street), Gold-ETC (Invesco), NVIDIA, dazu ein Technologiefonds
 * (BlackRock) und ein Bitcoin-ETP (21Shares) fuer die Arten FUND und CRYPTO_ETP. Durchschaubar
 * sind nur der iShares-Fonds und die Einzelaktie — Vanguard und State Street
 * fuehren keinen abrufbaren Katalog (ADR-018), ETC, ETP und Fonds haben keine
 * Bestandteile. Genau deshalb steht die Abdeckungsquote auf der Top-25-Kachel bei rund 60 %:
 * das ist der Zustand, den die Anwendung abbilden soll, keine Luecke im Szenario.
 *
 * Alle Kurse kommen aus `kurshistorie-modelliert.json`, Tagesraster 2025-01-02 bis 2026-02-27.
 * Keine Reihe ist ein echter Boersenkurs: echte Tageskurse stehen unter der Lizenz des
 * Anbieters, die MIT-Lizenz des Repositorys deckt ihre Weitergabe nicht. Die Reihen sind an
 * wenige oeffentlich bekannte Eckpunkte gehaengt und dazwischen erfunden; wie, steht im
 * `hinweis` der Datei.
 *
 * Laeuft der Demo-Server an einem spaeteren Tag — was der Normalfall ist —, endet das Szenario
 * trotzdem am letzten Tag mit Kursen: `begrenzeAufHistorie` kappt das angefragte `heute`
 * dort, statt Kurse oder Verlauf zu erfinden. Der Verlauf zeigt also nie mehr Tage, als
 * Kurse vorliegen.
 *
 * `erzeugeSzenario` selbst bleibt eine reine Funktion: keine Uhr, kein Zufall [INV-04].
 * Der Aufrufer liefert `heute` und `jetzt` (den Zeitpunkt des Laufs) von aussen herein; das
 * Laden der Kurshistorie ist ein einmaliger Dateizugriff auf eine im Repository liegende,
 * unveraenderliche Datei beim Import dieses Moduls, kein Zugriff auf ein externes System.
 */

import { readFileSync } from 'node:fs';
import { BENCHMARKS } from '../../shared/benchmarks.ts';
import type { BenchmarkIsin } from '../../shared/benchmarks.ts';
import type { Cent, KursE6, MengeE8 } from '../../core/dezimal.ts';
import { alsTag, monateZwischen, monatsSpanne, monatVon, plusTage, spanne, vergleiche } from '../../core/kalender.ts';
import type { Tag } from '../../core/kalender.ts';
import type { Bestandteil } from '../../core/lookthrough.ts';
import { einordnen } from '../../core/typen.ts';
import type { Bestand, Isin } from '../../core/typen.ts';
import type { Aufloesung } from '../../db/repository/fondsAufloesung.ts';
import type { NeuerKurs } from '../../db/repository/kurs.ts';
import type { Sparplan } from '../../db/repository/sparplan.ts';
import type { NeueTx } from '../../db/repository/transaktion.ts';
import type { Vpiwert } from '../../db/repository/vpi.ts';
import type { Zinswert } from '../../db/repository/zins.ts';

export const START: Tag = alsTag('2025-01-02');
export const WELT_ISIN = 'IE00B4L5Y983';
export const EM_ISIN = 'IE00B3VVMM84';
export const ANLEIHE_ISIN = 'IE00B41RYL63';
export const GOLD_ISIN = 'IE00B579F325';
export const AKTIE_ISIN = 'US67066G1040';
export const FONDS_ISIN = 'LU0171310443';
export const KRYPTO_ISIN = 'CH0454664001';
const WELT_NAME = 'iShares Core MSCI World UCITS ETF';
const EM_NAME = 'Vanguard FTSE Emerging Markets UCITS ETF';
const ANLEIHE_NAME = 'SPDR Bloomberg Euro Aggregate Bond UCITS ETF';
const GOLD_NAME = 'Invesco Physical Gold ETC';
const AKTIE_NAME = 'NVIDIA Corp.';
const FONDS_NAME = 'BGF World Technology Fund Class A2 EUR';
const KRYPTO_NAME = '21shares Bitcoin ETP';
const CASH_ISIN = 'CASH';

export type Szenario = {
  readonly transaktionen: readonly NeueTx[];
  readonly kurse: readonly NeuerKurs[];
  readonly sparplan: Sparplan;
  readonly vpiWerte: readonly Vpiwert[];
  readonly zinsWerte: readonly Zinswert[];
  readonly bestandteile: ReadonlyMap<Isin, readonly Bestandteil[]>;
  readonly aufloesungen: readonly Aufloesung[];
  readonly bestand: readonly Bestand[];
  /** ISIN → Wertpapierart, wie sie der Ingest aus get_security_quote ablegt. */
  readonly arten: ReadonlyMap<Isin, string>;
  readonly lauf: { readonly gestartet: string; readonly beendet: string };
};

type Modellhistorie = {
  readonly tage: readonly string[];
  readonly weltEuro: readonly number[];
  readonly emEuro: readonly number[];
  readonly vanguardEmEuro: readonly number[];
  readonly nvidiaEuro: readonly number[];
  readonly invescoGoldEuro: readonly number[];
  readonly spdrAnleiheEuro: readonly number[];
  readonly msciAcwiEuro: readonly number[];
  readonly sp500Euro: readonly number[];
  readonly daxEuro: readonly number[];
  readonly msciEuropeEuro: readonly number[];
  readonly xetraGoldEuro: readonly number[];
  readonly iSharesGovtBondEuro: readonly number[];
  readonly bitcoinEuro: readonly number[];
  readonly fondsEuro: readonly number[];
};

function ladeDatei<T>(name: string): T {
  const datei = new URL(name, import.meta.url);
  return JSON.parse(readFileSync(datei, 'utf8')) as T;
}

function euroZuKursE6(euro: number): bigint {
  return BigInt(Math.round(euro * 1_000_000));
}

type Kursreihe = { readonly reihe: ReadonlyMap<Tag, bigint>; readonly erster: Tag; readonly letzter: Tag };

/**
 * Baut fuer jeden Kalendertag zwischen dem ersten und letzten Tag der Rohdaten einen Kurs.
 * Wochenenden und Feiertage haben keinen eigenen Handelskurs und uebernehmen den letzten
 * gehandelten Schlusskurs — dieselbe Fortschreibung, die auch echte Kursraster brauchen.
 */
function fortschreiben(tage: readonly string[], werte: readonly number[]): Kursreihe {
  const ersterTagText = tage[0];
  const letzterTagText = tage[tage.length - 1];
  if (ersterTagText === undefined || letzterTagText === undefined) throw new Error('Kurshistorie ist leer');

  const punkte = new Map<string, bigint>();
  tage.forEach((t, i) => {
    const wert = werte[i];
    if (wert === undefined) throw new Error(`Kurshistorie: Wert fehlt fuer ${t}`);
    punkte.set(t, euroZuKursE6(wert));
  });

  const erster = alsTag(ersterTagText);
  const letzter = alsTag(letzterTagText);
  const reihe = new Map<Tag, bigint>();
  let laufenderKurs: bigint | null = null;
  for (const t of spanne(erster, letzter)) {
    const heutiger = punkte.get(t);
    if (heutiger !== undefined) laufenderKurs = heutiger;
    if (laufenderKurs === null) throw new Error(`Kurshistorie: kein Kurs vor ${t}`);
    reihe.set(t, laufenderKurs);
  }
  return { reihe, erster, letzter };
}

const MODELL = ladeDatei<Modellhistorie>('./kurshistorie-modelliert.json');

const WELT_REIHE = fortschreiben(MODELL.tage, MODELL.weltEuro);
const EM_REIHE = fortschreiben(MODELL.tage, MODELL.vanguardEmEuro);
const ANLEIHE_REIHE = fortschreiben(MODELL.tage, MODELL.spdrAnleiheEuro);
const GOLD_REIHE = fortschreiben(MODELL.tage, MODELL.invescoGoldEuro);
const AKTIE_REIHE = fortschreiben(MODELL.tage, MODELL.nvidiaEuro);
const FONDS_REIHE = fortschreiben(MODELL.tage, MODELL.fondsEuro);
const KRYPTO_REIHE = fortschreiben(MODELL.tage, MODELL.bitcoinEuro);

/** Die sieben gehaltenen Positionen in der Reihenfolge, in der sie gekauft werden. */
const POSITIONEN = [
  { isin: WELT_ISIN, name: WELT_NAME, reihe: WELT_REIHE },
  { isin: EM_ISIN, name: EM_NAME, reihe: EM_REIHE },
  { isin: ANLEIHE_ISIN, name: ANLEIHE_NAME, reihe: ANLEIHE_REIHE },
  { isin: GOLD_ISIN, name: GOLD_NAME, reihe: GOLD_REIHE },
  { isin: AKTIE_ISIN, name: AKTIE_NAME, reihe: AKTIE_REIHE },
  { isin: FONDS_ISIN, name: FONDS_NAME, reihe: FONDS_REIHE },
  { isin: KRYPTO_ISIN, name: KRYPTO_NAME, reihe: KRYPTO_REIHE },
] as const;

/**
 * Kurse fuer die Benchmarks aus `benchmarks.ts`, die keine eigene Position im Depot haben.
 * `MSCI World` (WELT_ISIN) ist selbst Position und braucht hier keinen Eintrag. Ohne die
 * uebrigen acht Reihen kaeme die jeweilige ISIN ohne einzige Kurszeile in die Demo-DB, und
 * die Vergleichslinie im Verlauf bliebe fuer sie leer — das war der Fehler, den dieser Kommentar
 * verhindern soll: `erzeugeSzenario` iteriert unten ueber `BENCHMARKS` und wirft, sobald eine
 * ISIN hier fehlt, statt die Fixture stillschweigend hinter der Liste zuruecklassen.
 */
const BENCHMARK_OHNE_POSITION_REIHEN: Partial<Record<BenchmarkIsin, Kursreihe>> = {
  IE00BKM4GZ66: fortschreiben(MODELL.tage, MODELL.emEuro),
  IE00B6R52259: fortschreiben(MODELL.tage, MODELL.msciAcwiEuro),
  IE00B5BMR087: fortschreiben(MODELL.tage, MODELL.sp500Euro),
  DE0005933931: fortschreiben(MODELL.tage, MODELL.daxEuro),
  IE00B4K48X80: fortschreiben(MODELL.tage, MODELL.msciEuropeEuro),
  DE000A0S9GB0: fortschreiben(MODELL.tage, MODELL.xetraGoldEuro),
  IE00B4WXJJ64: fortschreiben(MODELL.tage, MODELL.iSharesGovtBondEuro),
};

/**
 * Kappt ein angefragtes `heute` auf den letzten Tag mit Kursen. `erzeugeSzenario` fragt
 * dank dieser Grenze nie einen Kurs jenseits der Historie an — der Aufrufer (`seed.ts`) ruft
 * das vor `erzeugeSzenario` und `berechneNeu` auf, damit Szenario und Verlauf konsistent am
 * selben Tag enden, egal an welchem Kalendertag der Demo-Server tatsaechlich laeuft.
 */
export function begrenzeAufHistorie(heute: Tag): Tag {
  return vergleiche(heute, WELT_REIHE.letzter) > 0 ? WELT_REIHE.letzter : heute;
}

/** Kurs an einem beliebigen Tag der Historie. */
function kursAm(historie: Kursreihe, tag: Tag): bigint {
  const treffer = historie.reihe.get(tag);
  if (treffer === undefined) throw new Error(`Kein Kurs fuer ${tag} — ausserhalb der Kurshistorie`);
  return treffer;
}

/**
 * Vereinfachtes €STR-Modell: sigmoid-Abstieg von rund 2,9 % (Zinsniveau Anfang 2025) auf ein
 * Plateau bei rund 2,0 % (ab Sommer 2025) — grob die Form des echten EZB-Zinssenkungszyklus
 * dieser Jahre, ohne den echten Datensatz nachzubilden.
 */
function zinsProJahr(tage: number): number {
  const jahre = tage / 365;
  const fortschritt = 1 / (1 + Math.exp(6 * (jahre - 0.4)));
  return 0.02 + fortschritt * 0.01;
}

/** menge (E8) fuer einen Kaufbetrag in Cent zu einem gegebenen Kurs. Kein Rest, wie bei echten Sparplankaeufen ueblich. */
function mengeAusBetrag(betragCentAbs: bigint, kurs: bigint): bigint {
  return (betragCentAbs * 10n ** 12n) / kurs;
}

const ARTEN_DEMO: Readonly<Partial<Record<string, string>>> = {
  [AKTIE_ISIN]: 'STOCK',
  [FONDS_ISIN]: 'FUND',
  [KRYPTO_ISIN]: 'CRYPTO_ETP',
};

export function erzeugeSzenario(heute: Tag, jetzt: string): Szenario {
  let idZaehler = 0;
  const naechsteId = () => `e2e-${String((idZaehler += 1)).padStart(4, '0')}`;

  const transaktionen: NeueTx[] = [];
  const mengenE8 = new Map<string, bigint>(POSITIONEN.map((p) => [p.isin, 0n]));
  // Durchschnittlicher Einstand je Position, nur fuer die Steuer; der Kern rechnet FIFO.
  const kostenCent = new Map<string, bigint>(POSITIONEN.map((p) => [p.isin, 0n]));
  let verlusttopfCent = 0n;
  let cashGesamtCent = 0n;

  function fuege(t: Omit<NeueTx, 'id' | 'gesehenAm' | 'istExtern' | 'storniert' | 'status' | 'bezugIsin'>): void {
    transaktionen.push({
      ...t,
      bezugIsin: null,
      id: naechsteId(),
      status: 'EXECUTED',
      istExtern: einordnen(t.typ) === 'extern',
      storniert: false,
      gesehenAm: jetzt,
    });
    cashGesamtCent += t.betragCent;
  }

  /** Ordergebuehr wie beim Broker, nicht beim Sparplan. */
  function ordergebuehr(ts: string, tag: Tag): void {
    fuege({ ts, tag, art: 'CASH', typ: 'FEE', isin: null, mengeE8: null, betragCent: -99n as Cent, beschreibung: 'Ordergebuehr' });
  }

  /** Abgeltungsteuer samt Soli. */
  function versteuere(ts: string, tag: Tag, isin: string, steuerpflichtigCent: bigint): void {
    const steuerCent = (steuerpflichtigCent * 26_375n) / 100_000n;
    if (steuerCent <= 0n) return;
    fuege({ ts, tag, art: 'CASH', typ: 'TAX', isin, mengeE8: null, betragCent: -steuerCent as Cent, beschreibung: 'Kapitalertragsteuer und Soli' });
  }

  /**
   * Ein Teilverkauf zum Kurs des Tages: `anteilProzent` des Bestands, der bis zu diesem
   * Aufruf gekauft wurde. Der Erloes geht aufs Verrechnungskonto. Nach `heute` faellt er aus.
   */
  function verkaufe(tag: Tag, uhrzeit: string, versatz: '+01:00' | '+02:00', position: (typeof POSITIONEN)[number], anteilProzent: bigint, beschreibung: string): void {
    if (vergleiche(tag, heute) > 0) return;
    const kurs = kursAm(position.reihe, tag);
    const menge = ((mengenE8.get(position.isin) ?? 0n) * anteilProzent) / 100n;
    const erloesCent = (menge * kurs) / 10n ** 12n;
    const kosten = ((kostenCent.get(position.isin) ?? 0n) * anteilProzent) / 100n;
    mengenE8.set(position.isin, (mengenE8.get(position.isin) ?? 0n) - menge);
    kostenCent.set(position.isin, (kostenCent.get(position.isin) ?? 0n) - kosten);
    const ts = `${tag}T${uhrzeit}${versatz}`;
    ordergebuehr(ts, tag);
    // Ein Verlust fuellt den Verlusttopf, ein Gewinn wird zuerst mit ihm verrechnet.
    const gewinnCent = erloesCent - kosten;
    const verrechnet = gewinnCent <= 0n ? gewinnCent : gewinnCent < verlusttopfCent ? gewinnCent : verlusttopfCent;
    verlusttopfCent -= verrechnet;
    versteuere(ts, tag, position.isin, gewinnCent - verrechnet);
    fuege({
      ts,
      tag,
      art: 'WERTPAPIER',
      typ: 'SELL',
      isin: position.isin,
      mengeE8: -menge as MengeE8,
      betragCent: erloesCent as Cent,
      beschreibung,
    });
  }

  /**
   * Ein Kauf zum Kurs des Tages. Liegt der Tag hinter `heute`, faellt er aus — sonst
   * behauptete der Bestand Stuecke, fuer die es im Verlauf keinen Tag gibt.
   */
  function kaufe(tag: Tag, uhrzeit: string, position: (typeof POSITIONEN)[number], betragCent: bigint, typ: 'BUY' | 'SAVINGS_PLAN', beschreibung: string): void {
    if (vergleiche(tag, heute) > 0) return;
    const kurs = kursAm(position.reihe, tag);
    const menge = mengeAusBetrag(betragCent, kurs);
    mengenE8.set(position.isin, (mengenE8.get(position.isin) ?? 0n) + menge);
    kostenCent.set(position.isin, (kostenCent.get(position.isin) ?? 0n) + betragCent);
    if (typ === 'BUY') ordergebuehr(`${tag}T${uhrzeit}+01:00`, tag);
    fuege({
      ts: `${tag}T${uhrzeit}+01:00`,
      tag,
      art: 'WERTPAPIER',
      typ,
      isin: position.isin,
      mengeE8: menge as MengeE8,
      betragCent: -betragCent as Cent,
      beschreibung,
    });
  }

  // Erste Einzahlung und der Grundstock: 50 % World, 20 % Schwellenlaender, rund 17 %
  // Anleihen, gut 8 % Gold, 5 % Einzelaktie.
  fuege({ ts: `${START}T09:00:00+01:00`, tag: START, art: 'CASH', typ: 'CASH_TRANSFER_IN', isin: null, mengeE8: null, betragCent: 1_000_000n as Cent, beschreibung: 'Erste Einzahlung' });

  const kaufTag1 = plusTage(START, 1);
  const [weltPosition, emPosition, anleihePosition, goldPosition, aktiePosition, fondsPosition, kryptoPosition] = POSITIONEN;
  kaufe(kaufTag1, '09:05:00', weltPosition, 500_000n, 'BUY', 'Kauf World');
  kaufe(kaufTag1, '09:06:00', emPosition, 200_000n, 'BUY', 'Kauf Schwellenlaender');
  kaufe(kaufTag1, '09:07:00', anleihePosition, 165_000n, 'BUY', 'Kauf Euro-Anleihen');
  kaufe(kaufTag1, '09:08:00', goldPosition, 85_000n, 'BUY', 'Kauf Gold');
  kaufe(kaufTag1, '09:09:00', aktiePosition, 50_000n, 'BUY', 'Kauf NVIDIA');

  // Fonds und Krypto-ETP aus einer eigenen Einzahlung am Folgetag.
  const kaufTag2 = plusTage(START, 2);
  if (vergleiche(kaufTag2, heute) <= 0) {
    fuege({ ts: `${kaufTag2}T08:00:00+01:00`, tag: kaufTag2, art: 'CASH', typ: 'CASH_TRANSFER_IN', isin: null, mengeE8: null, betragCent: 300_000n as Cent, beschreibung: 'Einzahlung fuer Fonds und Krypto-ETP' });
    kaufe(kaufTag2, '09:05:00', fondsPosition, 200_000n, 'BUY', 'Kauf Technologiefonds');
    kaufe(kaufTag2, '09:06:00', kryptoPosition, 100_000n, 'BUY', 'Kauf Bitcoin-ETP');
  }

  // Nachkauf der Einzelaktie nach dem Kurssturz im April 2025, aus einer eigenen Einzahlung.
  const nachkaufTag = alsTag('2025-04-11');
  if (vergleiche(nachkaufTag, heute) <= 0) {
    fuege({ ts: `${plusTage(nachkaufTag, -1)}T08:00:00+02:00`, tag: plusTage(nachkaufTag, -1), art: 'CASH', typ: 'CASH_TRANSFER_IN', isin: null, mengeE8: null, betragCent: 150_000n as Cent, beschreibung: 'Einzahlung fuer Nachkauf' });
    kaufe(nachkaufTag, '09:30:00', aktiePosition, 150_000n, 'BUY', 'Nachkauf NVIDIA');
  }

  // Monatlicher Sparplan: World am 15., ab Februar 2025, per Dauerauftrag vorfinanziert —
  // sonst wuerde das Verrechnungskonto ueber die Laufzeit ins Minus laufen.
  const sparplanBetragCent = 50_000n as Cent;
  const ersterSparplanMonat = '2025-02';
  const letzterMoeglicheMonat = monatVon(heute);
  for (const monat of monatsSpanne(ersterSparplanMonat, letzterMoeglicheMonat)) {
    const ausfuehrung = alsTag(`${monat}-15`);
    if (vergleiche(ausfuehrung, heute) > 0) continue;
    fuege({
      ts: `${ausfuehrung}T07:00:00+01:00`,
      tag: ausfuehrung,
      art: 'CASH',
      typ: 'CASH_TRANSFER_IN',
      isin: null,
      mengeE8: null,
      betragCent: sparplanBetragCent,
      beschreibung: 'Dauerauftrag fuer Sparplan',
    });
    kaufe(ausfuehrung, '08:00:00', weltPosition, sparplanBetragCent, 'SAVINGS_PLAN', 'Sparplan World');
  }

  // Vierteljaehrliche Dividende auf World, leicht steigend.
  for (const monat of monatsSpanne(START.slice(0, 7), letzterMoeglicheMonat)) {
    const [, monatsNr] = monat.split('-');
    if (!['03', '06', '09', '12'].includes(monatsNr as string)) continue;
    const ausschuettung = alsTag(`${monat}-20`);
    if (vergleiche(ausschuettung, START) < 0 || vergleiche(ausschuettung, heute) > 0) continue;
    const jahreSeitStart = monateZwischen(START.slice(0, 7), monat) / 12;
    const betrag = BigInt(4_000 + Math.round(300 * jahreSeitStart));
    fuege({
      ts: `${ausschuettung}T10:00:00+02:00`,
      tag: ausschuettung,
      art: 'CASH',
      typ: 'DIVIDEND',
      isin: WELT_ISIN,
      mengeE8: null,
      betragCent: betrag as Cent,
      beschreibung: 'Ausschuettung World',
    });
    // Ohne Verlusttopf: die Schleife laeuft vor den Verkaeufen, der Topf waere nicht chronologisch.
    versteuere(`${ausschuettung}T10:00:00+02:00`, ausschuettung, WELT_ISIN, betrag);
  }

  // PRIME+-Abo, monatlich am Ersten.
  for (const monat of monatsSpanne(START.slice(0, 7), letzterMoeglicheMonat)) {
    const abbuchung = alsTag(`${monat}-01`);
    if (vergleiche(abbuchung, START) < 0 || vergleiche(abbuchung, heute) > 0) continue;
    fuege({ ts: `${abbuchung}T06:00:00+01:00`, tag: abbuchung, art: 'CASH', typ: 'FEE', isin: null, mengeE8: null, betragCent: -499n as Cent, beschreibung: 'PRIME+ Abo' });
  }

  // Teilverkaeufe: NVIDIA mit Gewinn (reicht ueber beide FIFO-Lose), Schwellenlaender,
  // Technologiefonds und Bitcoin-ETP mit Verlust im Kurssturz — die beiden letzten so tief,
  // dass die Position insgesamt im Minus bleibt —, Gold mit Gewinn. Nach dem letzten Kauf je
  // Position, in zeitlicher Folge wegen des Verlusttopfs.
  verkaufe(alsTag('2025-04-08'), '10:15:00', '+02:00', emPosition, 25n, 'Verkauf Schwellenlaender (Teil)');
  verkaufe(alsTag('2025-04-11'), '10:00:00', '+02:00', kryptoPosition, 50n, 'Verkauf Bitcoin-ETP (Teil)');
  verkaufe(alsTag('2025-04-11'), '10:05:00', '+02:00', fondsPosition, 50n, 'Verkauf Technologiefonds (Teil)');
  verkaufe(alsTag('2025-10-15'), '11:00:00', '+02:00', aktiePosition, 55n, 'Verkauf NVIDIA (Teil)');
  verkaufe(alsTag('2025-12-15'), '09:45:00', '+01:00', goldPosition, 30n, 'Verkauf Gold (Teil)');

  transaktionen.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));

  // Taeglicher Kurs je ISIN und taeglicher €STR-Satz ueber die gesamte Historie.
  const kurse: NeuerKurs[] = [];
  const zinsWerte: Zinswert[] = [];
  let tageSeitStart = 0;
  for (const t of spanne(START, heute)) {
    for (const position of POSITIONEN) {
      kurse.push({ isin: position.isin, tag: t, kurs: kursAm(position.reihe, t) as KursE6, herkunft: 'chart_max' });
    }
    for (const benchmark of BENCHMARKS) {
      if (POSITIONEN.some((p) => p.isin === benchmark.isin)) continue;
      const reihe = BENCHMARK_OHNE_POSITION_REIHEN[benchmark.isin];
      if (reihe === undefined) throw new Error(`Keine Kursreihe fuer Benchmark ${benchmark.name} (${benchmark.isin}) in der Demo-Fixture`);
      kurse.push({ isin: benchmark.isin, tag: t, kurs: kursAm(reihe, t) as KursE6, herkunft: 'chart_max' });
    }
    zinsWerte.push({ tag: t, zinsProJahr: zinsProJahr(tageSeitStart), quelle: 'ecb' });
    tageSeitStart += 1;
  }

  // Sparplan-Stammdaten (aktueller Stand, keine Historie).
  let naechsteAusfuehrung = alsTag(`${letzterMoeglicheMonat}-15`);
  if (vergleiche(naechsteAusfuehrung, heute) <= 0) {
    const [jahrStr, monatStr] = letzterMoeglicheMonat.split('-');
    const naechsterMonat = Number(monatStr) === 12 ? `${Number(jahrStr) + 1}-01` : `${jahrStr}-${String(Number(monatStr) + 1).padStart(2, '0')}`;
    naechsteAusfuehrung = alsTag(`${naechsterMonat}-15`);
  }
  const sparplan: Sparplan = {
    isin: WELT_ISIN,
    name: WELT_NAME,
    betragCent: sparplanBetragCent,
    frequenz: 'MONTHLY',
    tagImMonat: 15,
    naechsteAusfuehrung,
    stand: jetzt,
  };

  // Verbraucherpreisindex, monatlich, leicht steigend.
  const vpiWerte: Vpiwert[] = [];
  for (const monat of monatsSpanne(START.slice(0, 7), letzterMoeglicheMonat)) {
    const monate = monateZwischen(START.slice(0, 7), monat);
    const indexWert = 100 * Math.pow(1.025, monate / 12);
    vpiWerte.push({ monat, indexWert, quelle: 'eurostat' });
  }

  const weltBestandteile: Bestandteil[] = [
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'US0378331005', name: 'Apple Inc.', gewicht: 0.07, sektor: 'Information Technology', land: 'United States' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'US5949181045', name: 'Microsoft Corp.', gewicht: 0.065, sektor: 'Information Technology', land: 'United States' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'US67066G1040', name: 'NVIDIA Corp.', gewicht: 0.055, sektor: 'Information Technology', land: 'United States' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'US0231351067', name: 'Amazon.com Inc.', gewicht: 0.04, sektor: 'Consumer Discretionary', land: 'United States' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'US02079K3059', name: 'Alphabet Inc.', gewicht: 0.035, sektor: 'Communication', land: 'United States' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'US30303M1027', name: 'Meta Platforms Inc.', gewicht: 0.025, sektor: 'Communication', land: 'United States' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'US11135F1012', name: 'Broadcom Inc.', gewicht: 0.02, sektor: 'Information Technology', land: 'United States' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'US88160R1014', name: 'Tesla Inc.', gewicht: 0.015, sektor: 'Consumer Discretionary', land: 'United States' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'US5324571083', name: 'Eli Lilly & Co.', gewicht: 0.011, sektor: 'Health Care', land: 'United States' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'US46625H1005', name: 'JPMorgan Chase & Co.', gewicht: 0.011, sektor: 'Financials', land: 'United States' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'US0846707026', name: 'Berkshire Hathaway Inc.', gewicht: 0.01, sektor: 'Financials', land: 'United States' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'US92826C8394', name: 'Visa Inc.', gewicht: 0.008, sektor: 'Financials', land: 'United States' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'US64110L1061', name: 'Netflix Inc.', gewicht: 0.008, sektor: 'Communication', land: 'United States' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'US68389X1054', name: 'Oracle Corp.', gewicht: 0.007, sektor: 'Information Technology', land: 'United States' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'US57636Q1040', name: 'Mastercard Inc.', gewicht: 0.007, sektor: 'Financials', land: 'United States' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'US30231G1022', name: 'Exxon Mobil Corp.', gewicht: 0.006, sektor: 'Energy', land: 'United States' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'US22160K1051', name: 'Costco Wholesale Corp.', gewicht: 0.006, sektor: 'Consumer Staples', land: 'United States' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'US9311421039', name: 'Walmart Inc.', gewicht: 0.006, sektor: 'Consumer Staples', land: 'United States' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'US4781601046', name: 'Johnson & Johnson', gewicht: 0.005, sektor: 'Health Care', land: 'United States' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'US7427181091', name: 'Procter & Gamble Co.', gewicht: 0.005, sektor: 'Consumer Staples', land: 'United States' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'US4370761029', name: 'Home Depot Inc.', gewicht: 0.005, sektor: 'Consumer Discretionary', land: 'United States' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'US00287Y1091', name: 'AbbVie Inc.', gewicht: 0.005, sektor: 'Health Care', land: 'United States' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'US0605051046', name: 'Bank of America Corp.', gewicht: 0.005, sektor: 'Financials', land: 'United States' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'DE0007164600', name: 'SAP SE', gewicht: 0.005, sektor: 'Information Technology', land: 'Germany' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'NL0010273215', name: 'ASML Holding NV', gewicht: 0.0045, sektor: 'Information Technology', land: 'Netherlands' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'CH0038863350', name: 'Nestle SA', gewicht: 0.0035, sektor: 'Consumer Staples', land: 'Switzerland' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'US0079031078', name: 'Advanced Micro Devices Inc.', gewicht: 0.003, sektor: 'Information Technology', land: 'United States' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'US79466L3024', name: 'Salesforce Inc.', gewicht: 0.003, sektor: 'Information Technology', land: 'United States' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'CH0012032048', name: 'Roche Holding AG', gewicht: 0.003, sektor: 'Health Care', land: 'Switzerland' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'CH0012005267', name: 'Novartis AG', gewicht: 0.003, sektor: 'Health Care', land: 'Switzerland' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'GB0009895292', name: 'AstraZeneca PLC', gewicht: 0.003, sektor: 'Health Care', land: 'United Kingdom' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'DK0062498333', name: 'Novo Nordisk A/S', gewicht: 0.003, sektor: 'Health Care', land: 'Denmark' },
    { fondsIsin: WELT_ISIN, unternehmenIsin: 'JP3633400001', name: 'Toyota Motor Corp.', gewicht: 0.003, sektor: 'Consumer Discretionary', land: 'Japan' },
  ];
  weltBestandteile.push(...weltRest(WELT_ISIN));
  // Nur der iShares-Fonds hat Bestandteile. Vanguard und State Street fuehren keinen
  // abrufbaren Katalog (ADR-018), der Gold-ETC hat keine — die Top-25-Kachel zeigt das samt
  // direkt gehaltener NVIDIA-Aktie als Abdeckungsquote von rund 60 %, nicht als Fehler.
  const bestandteile = new Map<Isin, readonly Bestandteil[]>([[WELT_ISIN, weltBestandteile]]);

  /**
   * Was ein Katalogabruf ueber die gehaltenen ISINs herausfinden wuerde. Nur das iShares-Haus
   * fuehrt einen abrufbaren Katalog; die uebrigen sechs ISINs kennt keiner — `unbekannt`, und
   * damit ausdruecklich kein Fall fuer die Liste der fehlenden Fonds (`server/lesemodell.ts`):
   * eine Einzelaktie waere von einem ungeprueften Fonds nicht zu unterscheiden.
   */
  const aufloesungen: Aufloesung[] = [
    {
      isin: WELT_ISIN,
      anbieter: 'ishares',
      durchsicht: 'moeglich',
      adresse: '251881',
      geprueftAm: heute,
    },
    ...[EM_ISIN, ANLEIHE_ISIN, GOLD_ISIN, AKTIE_ISIN, FONDS_ISIN, KRYPTO_ISIN].map((isin) => ({
      isin,
      anbieter: null,
      durchsicht: 'unbekannt' as const,
      adresse: null,
      geprueftAm: heute,
    })),
  ];

  // Bestand ist eine Momentaufnahme, deren Werte wortwoertlich aus denselben Formeln
  // stammen, die auch depot_tag speisen — nur so bleibt die Drift exakt null (core/drift.ts).
  const bestand: Bestand[] = [
    ...POSITIONEN.map((position) => ({
      isin: position.isin,
      name: position.name,
      mengeE8: (mengenE8.get(position.isin) ?? 0n) as MengeE8,
      kursE6: kursAm(position.reihe, heute) as KursE6,
      stand: jetzt,
    })),
    { isin: CASH_ISIN, name: 'Verrechnungskonto', mengeE8: (cashGesamtCent * 1_000_000n) as MengeE8, kursE6: 1_000_000n as KursE6, stand: jetzt },
  ];

  return {
    transaktionen,
    kurse,
    sparplan,
    vpiWerte,
    zinsWerte,
    bestandteile,
    aufloesungen,
    bestand,
    arten: new Map(POSITIONEN.map((p) => [p.isin, ARTEN_DEMO[p.isin] ?? 'ETF'])),
    lauf: { gestartet: jetzt, beendet: jetzt },
  };
}

/**
 * Der Rest des World-ETFs hinter den 33 benannten Unternehmen: rund 1.300 erfundene, je unter
 * 0,1 % — so viele Unternehmen, wie ein echter MSCI World haelt, und Laender und Sektoren
 * ungefaehr wie im Index. Keins reicht in die Top 25. Die ISIN traegt `SYN` statt einer
 * Kennnummer, damit niemand sie fuer echt haelt.
 */
function weltRest(fondsIsin: Isin): Bestandteil[] {
  // Land, Kuerzel, Anzahl, Gewicht in Prozent — zusammen mit den 33 benannten rund 99,5 %.
  const laender: readonly (readonly [string, string, number, number])[] = [
    ['United States', 'US', 560, 27.8],
    ['Japan', 'JP', 185, 5.2],
    ['United Kingdom', 'GB', 80, 3.2],
    ['Canada', 'CA', 85, 3.0],
    ['France', 'FR', 60, 2.5],
    ['Germany', 'DE', 55, 1.7],
    ['Australia', 'AU', 60, 1.7],
    ['Switzerland', 'CH', 42, 1.35],
    ['Sweden', 'SE', 40, 0.8],
    ['Spain', 'ES', 20, 0.7],
    ['Italy', 'IT', 20, 0.7],
    ['Netherlands', 'NL', 22, 0.65],
    ['Hong Kong', 'HK', 30, 0.5],
    ['Singapore', 'SG', 15, 0.4],
    ['Denmark', 'DK', 14, 0.3],
    ['Finland', 'FI', 12, 0.3],
    ['Belgium', 'BE', 10, 0.3],
    ['Israel', 'IL', 10, 0.2],
    ['Norway', 'NO', 10, 0.2],
    ['Ireland', 'IE', 8, 0.2],
  ];
  // Je Sektor so viele Plaetze im Umlauf, wie er ungefaehr Gewicht im Rest hat.
  const umlauf: readonly string[] = [
    ['Financials', 12], ['Industrials', 11], ['Health Care', 6], ['Information Technology', 4],
    ['Consumer Staples', 4], ['Materials', 4], ['Energy', 3], ['Consumer Discretionary', 3],
    ['Utilities', 3], ['Real Estate', 2], ['Communication', 1],
  ].flatMap(([sektor, plaetze]) => Array.from({ length: plaetze as number }, () => sektor as string));

  const teile: Bestandteil[] = [];
  let lauf = 0;
  for (const [land, kuerzel, anzahl, prozent] of laender) {
    // Fallend von gross nach klein: Gewicht ~ (anzahl - i), zusammen `prozent`.
    const nenner = (anzahl * (anzahl + 1)) / 2;
    for (let i = 0; i < anzahl; i++) {
      teile.push({
        fondsIsin,
        unternehmenIsin: `${kuerzel}SYN${String(i + 1).padStart(7, '0')}`,
        name: `Unternehmen ${kuerzel} ${String(i + 1)}`,
        gewicht: ((prozent / 100) * (anzahl - i)) / nenner,
        sektor: umlauf[lauf++ % umlauf.length]!,
        land,
      });
    }
  }
  return teile;
}
