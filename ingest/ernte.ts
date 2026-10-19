/**
 * Schritt 3 eines Laufs (§6.1, `lauf.ts`): je Quelle abrufen, validieren, archivieren.
 *
 * Reihenfolge der Quellen: holdings → cash → transaktionen → kurse (je ISIN) → sparplaene →
 * gesamtwert → fonds (je Anbieter) → art (je neue ISIN) → vpi → zins. Die teuren zuletzt,
 * damit ein Abbruch moeglichst spaet passiert. Der Ausfall EINER Quelle beendet den Lauf
 * nicht — ausser bei `transaktionen`: ohne Historie gibt es keine einzige richtige Zahl. [P-08]
 *
 * Wie in `lauf.ts` wird nichts geloggt, was aus einer fremden Antwort stammt.
 */

import type { Bestand, Isin } from '../core/typen.ts';
import type { Anbietername, Aufloesung } from '../db/repository/fondsAufloesung.ts';
import type { NeueTx } from '../db/repository/transaktion.ts';
import type { Wertpapierart } from '../db/repository/wertpapierArt.ts';
import * as repo from '../db/repository/index.ts';
import { fondsPfad } from '../shared/konfiguration.ts';
import { BENCHMARKS } from '../shared/benchmarks.ts';
import type { Hinweis } from '../shared/hinweise.ts';
import type { QuellenSchluessel } from '../shared/quellen.ts';
import { ANBIETER } from './anbieter.ts';
import type { KatalogIndex } from './fondsaufloesung.ts';
import { aufloese, istAbgelaufen, katalogeAbrufen } from './fondsaufloesung.ts';
import type { Ernte } from './importieren.ts';
import { ISIN_MUSTER } from './schema.ts';
import { holeAmundi, quelleFuer as amundiQuelle } from './quellen/amundi.ts';
import { holeArt } from './quellen/art.ts';
import { holeCash } from './quellen/cash.ts';
import { holeHoldings } from './quellen/holdings.ts';
import { holeIshares, ladeFonds, quelleFuer as isharesQuelle } from './quellen/ishares.ts';
import { KURSFENSTER_JE_HERKUNFT, holeKurse } from './quellen/kurse.ts';
import { holeGesamtwert } from './quellen/gesamtwert.ts';
import { holeSparplaene } from './quellen/sparplaene.ts';
import { holeTransaktionen } from './quellen/transaktionen.ts';
import { holeVpi, VpiUebersprungen } from './quellen/vpi.ts';
import { holeVpiAktuell, VpiAktuellUebersprungen } from './quellen/vpiAktuell.ts';
import { holeXtrackers, quelleFuer as xtrackersQuelle } from './quellen/xtrackers.ts';
import { holeZins, ZinsUebersprungen } from './quellen/zins.ts';
import type { Lauf, LaufErgebnis, QuellenStatus } from './laufZustand.ts';
import { beendeLauf, codeVon, grundVon, setzeGescheitert, setzeSchritt, setzeStatus } from './laufZustand.ts';

const KURSABRUFE_GLEICHZEITIG = 4;

/** `allSettled` mit hoechstens `n` offenen Aufrufen zugleich. */
async function mitHoechstens<E, T>(n: number, eingaben: readonly E[], arbeit: (e: E) => Promise<T>): Promise<PromiseSettledResult<T>[]> {
  const ergebnisse: PromiseSettledResult<T>[] = new Array(eingaben.length);
  let naechster = 0;
  const arbeiter = async (): Promise<void> => {
    while (naechster < eingaben.length) {
      const i = naechster++;
      try {
        ergebnisse[i] = { status: 'fulfilled', value: await arbeit(eingaben[i]!) };
      } catch (grund) {
        ergebnisse[i] = { status: 'rejected', reason: grund };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, eingaben.length) }, arbeiter));
  return ergebnisse;
}

/**
 * Eine Quelle abrufen, archivieren und ihren Status setzen — das gemeinsame Geruest
 * hinter den frueher rund einem Dutzend fast identischen try/catch-Bloecken.
 * `uebernehme` verarbeitet `ernte.daten` (Zuweisung an den Laufzustand, Sammeln von
 * Kurspunkten) und liefert den Erfolgsstatus zurueck; scheitert der Abruf, setzt diese
 * Funktion selbst `'fehler'` und protokolliert, ohne dass der Aufrufer das wiederholen muss.
 *
 * `ueberspringen` erkennt die "kein Fehler, nur ausgelassen"-Faelle (`VpiUebersprungen`,
 * `ZinsUebersprungen` &c.): liefert es einen Hinweis, gilt die Quelle als `'übersprungen'`
 * mit genau diesem Hinweis statt eines generischen Protokolleintrags. `nachErfolg` laeuft
 * nur bei Erfolg, fuer Seiteneffekte, die mehr als den Status brauchen (etwa `vpi-aktuell`s
 * Protokollzeile mit der Anzahl nachgefuellter Monate).
 */
async function ernte<T>(
  lauf: Lauf,
  quelleName: QuellenSchluessel,
  hole: () => Promise<Ernte<T>>,
  uebernehme: (daten: T) => QuellenStatus,
  sonder?: {
    readonly ueberspringen?: (fehler: unknown) => Hinweis | null;
    readonly nachErfolg?: (daten: T) => void;
  },
): Promise<void> {
  try {
    const e = await hole();
    lauf.schnappschuesse.push({ quelle: e.quelle, abgerufenAm: lauf.jetzt, payloadJson: e.rohJson });
    setzeStatus(lauf, e.quelle, uebernehme(e.daten));
    sonder?.nachErfolg?.(e.daten);
  } catch (fehler) {
    const hinweisUebersprungen = sonder?.ueberspringen?.(fehler) ?? null;
    if (hinweisUebersprungen !== null) {
      setzeStatus(lauf, quelleName, 'übersprungen');
      lauf.befunde.uebernimm(hinweisUebersprungen);
      return;
    }
    setzeGescheitert(lauf, quelleName, fehler);
    lauf.protokoll(`${quelleName} gescheitert: ${grundVon(fehler)}`);
  }
}

/**
 * Reihenfolge: holdings → cash → transaktionen → kurse (je ISIN) → sparplaene → gesamtwert →
 * fonds → art → vpi → vpi-aktuell → zins. Liefert das Ergebnis nur, wenn `transaktionen` ausfaellt:
 * die einzige Quelle, ohne die der Lauf nicht weitergeht.
 */
export async function ernteQuellen(lauf: Lauf): Promise<LaufErgebnis | null> {
  const { ctx } = lauf;

  setzeSchritt(lauf, 'depot');
  await ernte(
    lauf,
    'holdings',
    () => holeHoldings(ctx),
    (daten) => {
      lauf.bestaende = daten.bestaende;
      lauf.kurseAus = daten.kurseAus;
      lauf.kurspunkte.push(...daten.kurspunkte);
      return 'erfolg';
    },
  );

  await ernte(
    lauf,
    'cash',
    () => holeCash(ctx),
    (daten) => {
      lauf.cashCent = daten;
      return 'erfolg';
    },
  );

  // transaktionen: die einzige Quelle, deren Ausfall zaehlt.
  let historie: readonly NeueTx[];
  try {
    const e = await holeTransaktionen(ctx);
    historie = e.daten.transaktionen;
    lauf.transaktionen = historie;
    lauf.ersterTransaktionsTag = e.daten.ersterTag;
    lauf.kurspunkte.push(...e.daten.kurspunkte);
    lauf.schnappschuesse.push({ quelle: e.quelle, abgerufenAm: lauf.jetzt, payloadJson: e.rohJson });
    setzeStatus(lauf, 'transaktionen', 'erfolg');
  } catch (fehler) {
    setzeGescheitert(lauf, 'transaktionen', fehler);
    lauf.protokoll(`transaktionen gescheitert: ${grundVon(fehler)} — Lauf beendet`);
    return beendeLauf(lauf, 'fehler', codeVon(fehler));
  }

  // Benchmark-ISINs bekommen dieselben vier Fenster: die Vergleichslinie soll im letzten Jahr
  // so taggenau sein wie die echte.
  const echteIsins = gesuchteIsins(lauf.bestaende, historie);
  const echteIsinsMenge = new Set(echteIsins);
  const benchmarkIsins = BENCHMARKS.map((b) => b.isin).filter((isin) => !echteIsinsMenge.has(isin));

  // Parallel geholt, in fester Reihenfolge uebernommen: Schnappschuesse und Protokoll
  // sollen nicht vom Zufall der Antwortzeiten abhaengen.
  const kursIsins = [...echteIsins, ...benchmarkIsins];
  setzeSchritt(lauf, 'kurse');
  const kursErnten = await mitHoechstens(KURSABRUFE_GLEICHZEITIG, kursIsins, (isin) => holeKurse(ctx, isin));
  for (const [i, isin] of kursIsins.entries()) {
    const ergebnis = kursErnten[i]!;
    await ernte(
      lauf,
      `kurse:${isin}`,
      () => (ergebnis.status === 'fulfilled' ? Promise.resolve(ergebnis.value) : Promise.reject(ergebnis.reason as Error)),
      (daten) => {
        lauf.kurspunkte.push(...daten.kurspunkte);
        return daten.fehlendeFenster.length === KURSFENSTER_JE_HERKUNFT.length ? 'fehler' : 'erfolg';
      },
    );
  }

  await ernte(
    lauf,
    'sparplaene',
    () => holeSparplaene(ctx),
    (daten) => {
      lauf.sparplaene = daten;
      return 'erfolg';
    },
  );

  await ernte(
    lauf,
    'gesamtwert',
    () => holeGesamtwert(ctx),
    (daten) => {
      lauf.gemeldeterGesamtwert = daten.gesamtCent;
      lauf.gesamtAus = daten.gesamtAus;
      return 'erfolg';
    },
  );

  setzeSchritt(lauf, 'fonds');
  // Ohne `top25` kein Abruf bei iShares, Xtrackers oder Amundi: die Kachel ist aus [ADR-038].
  if (lauf.konfiguration.top25) {
    const manuelleIsins = await ernteManuelleFonds(lauf);
    lauf.fondsAufloesungen = await loeseFondsAuf(lauf, manuelleIsins);
  } else {
    setzeStatus(lauf, 'fonds', 'übersprungen');
  }
  lauf.arten = await ermittleArten(lauf);

  setzeSchritt(lauf, 'inflation');
  await ernte(
    lauf,
    'vpi',
    () => holeVpi(ctx),
    (daten) => {
      lauf.vpiWerte = [...daten];
      return 'erfolg';
    },
    { ueberspringen: (fehler) => (fehler instanceof VpiUebersprungen ? fehler.hinweis : null) },
  );

  // Nach `vpi` und mit dessen Ergebnis: die amtliche Reihe liefert die Ueberlappung fuer
  // die Umbasierung und die Grenze, ab der nachgefuellt wird. Angehaengt wird hinten, damit
  // beim Schreiben (`ON CONFLICT`) der amtliche Wert gewinnt, falls beide denselben Monat
  // kennen. Ein Fehlschlag ist kein Fehler des Laufs: ohne diese Quelle steht das
  // Dashboard auf dem Stand der amtlichen Reihe — dem Stand, den es vorher hatte.
  await ernte(
    lauf,
    'vpi-aktuell',
    () => holeVpiAktuell(ctx, lauf.vpiWerte),
    (daten) => {
      lauf.vpiWerte = [...lauf.vpiWerte, ...daten];
      return 'erfolg';
    },
    {
      ueberspringen: (fehler) => (fehler instanceof VpiAktuellUebersprungen ? fehler.hinweis : null),
      nachErfolg: (daten) => lauf.protokoll(`vpi-aktuell: ${String(daten.length)} Monate nachgefuellt.`),
    },
  );

  await ernte(
    lauf,
    'zins',
    () => holeZins(ctx),
    (daten) => {
      lauf.zinsWerte = [...daten];
      return 'erfolg';
    },
    { ueberspringen: (fehler) => (fehler instanceof ZinsUebersprungen ? fehler.hinweis : null) },
  );

  return null;
}

/** Fonds aus `funds.json` — Vorrang vor der automatischen Aufloesung. */
async function ernteManuelleFonds(lauf: Lauf): Promise<ReadonlySet<Isin>> {
  const { ctx, heute } = lauf;
  let manuelleIsins = new Set<Isin>();
  try {
    const fondsListe = ladeFonds(fondsPfad(ctx.konfiguration));
    manuelleIsins = new Set(fondsListe.map((f) => f.isin));
    for (const fonds of fondsListe) {
      // Eine Verzweigung statt zwei: `quelle` haengt nur an `fonds.anbieter` und wird im
      // Fehlerfall gebraucht, in dem `hole()` selbst nie zurueckkehrt.
      const { hole, quelle } =
        fonds.anbieter === 'ishares'
          ? { hole: () => holeIshares(ctx, fonds), quelle: isharesQuelle(fonds.isin) }
          : fonds.anbieter === 'xtrackers'
            ? { hole: () => holeXtrackers(ctx, fonds), quelle: xtrackersQuelle(fonds.isin) }
            : { hole: () => holeAmundi(ctx, fonds), quelle: amundiQuelle(fonds.isin) };
      try {
        const e = await hole();
        lauf.etfStaende.push({ fondsIsin: fonds.isin, stand: heute, teile: e.daten.teile });
        lauf.schnappschuesse.push({ quelle: e.quelle, abgerufenAm: lauf.jetzt, payloadJson: e.rohJson });
        setzeStatus(lauf, e.quelle, 'erfolg');
      } catch (fehler) {
        setzeStatus(lauf, quelle, 'fehler');
        lauf.protokoll(`${fonds.anbieter} ${fonds.isin} gescheitert: ${grundVon(fehler)}`);
        lauf.befunde.hinweis('fondsNichtAbrufbar', { anbieter: fonds.anbieter, isin: fonds.isin, grund: grundVon(fehler) });
      }
    }
    if (fondsListe.length === 0) setzeStatus(lauf, 'fonds', 'übersprungen');
  } catch (fehler) {
    setzeGescheitert(lauf, 'fonds', fehler);
    lauf.protokoll(`funds.json nicht lesbar: ${grundVon(fehler)}`);
  }
  return manuelleIsins;
}

/**
 * Wertpapierart je gehaltener ISIN, nur fuer ISINs, die `wertpapier_art` noch nicht kennt —
 * die Art aendert sich nie. Eigene Funktion statt `ernte()`: ein Abruf je ISIN, und eine
 * gescheiterte ISIN ist ein Hinweis, kein Fehler des Laufs; `fehler` gilt erst, wenn kein
 * einziger Abruf gelang. Ohne Art faellt die Aufteilung auf das ETF-Profil zurueck. [ADR-025]
 */
async function ermittleArten(lauf: Lauf): Promise<Wertpapierart[]> {
  const { db, ctx } = lauf;
  const bekannt = repo.wertpapierArt.alle(db);
  const gesucht = [...new Set((lauf.bestaende ?? []).map((b) => b.isin))].filter(
    (isin) => ISIN_MUSTER.test(isin) && !bekannt.has(isin),
  );
  if (gesucht.length === 0) return [];

  const arten: Wertpapierart[] = [];
  let scheiterte = 0;
  let letzterFehler: unknown;
  for (const isin of gesucht) {
    try {
      const art = await holeArt(ctx, isin);
      if (art !== null) arten.push(art);
    } catch (fehler) {
      if (ctx.mcp?.ausgeloest === true) {
        setzeGescheitert(lauf, 'art', fehler);
        lauf.protokoll(`art abgebrochen: ${grundVon(fehler)}`);
        return arten;
      }
      scheiterte += 1;
      letzterFehler = fehler;
      lauf.befunde.hinweis('artNichtAbrufbar', { isin, grund: (fehler as Error).name });
    }
  }

  const alleGescheitert = scheiterte === gesucht.length;
  if (alleGescheitert) setzeGescheitert(lauf, 'art', letzterFehler);
  else setzeStatus(lauf, 'art', 'erfolg');
  if (scheiterte > 0) lauf.protokoll(`art: ${String(scheiterte)} von ${String(gesucht.length)} Abrufen gescheitert.`);
  return arten;
}

/**
 * Jede gehaltene ISIN ausser den manuell eingetragenen wird gegen die Kataloge von
 * iShares, Xtrackers und Amundi geprueft — ein Treffer bestimmt Anbieter und
 * Produktschluessel, kein Treffer heisst „kein Fonds oder kein unterstuetzter Anbieter".
 * Eigene Funktion statt `ernte()`: der Ablauf (Katalogabruf, Aufloesung je ISIN,
 * Bestandteile je Treffer) hat eine eigene, mehrstufige Fehlerbehandlung.
 */
async function loeseFondsAuf(lauf: Lauf, manuelleIsins: ReadonlySet<Isin>): Promise<Aufloesung[]> {
  const { db, ctx, heute, konfiguration } = lauf;
  const fondsAufloesungen: Aufloesung[] = [];
  try {
    const gehaltene = [...new Set((lauf.bestaende ?? []).map((b) => b.isin))].filter(
      (isin) => !manuelleIsins.has(isin),
    );
    const bekannt = new Map(gehaltene.map((isin) => [isin, repo.fondsAufloesung.fuerIsin(db, isin)]));
    const abgelaufen = gehaltene.filter((isin) =>
      istAbgelaufen(bekannt.get(isin) ?? null, heute, konfiguration.fondsKatalogFrischeTage),
    );

    let index: KatalogIndex = new Map();
    const ohneKatalog = new Set<Anbietername>();
    if (abgelaufen.length > 0) {
      index = await katalogeAbrufen(ctx, ANBIETER, (name, ergebnis) => {
        const quelle: QuellenSchluessel = `fondskatalog:${name}`;
        if (ergebnis.art === 'erfolg') {
          setzeStatus(lauf, quelle, 'erfolg');
          return;
        }
        ohneKatalog.add(name);
        if (ergebnis.art === 'ohne') {
          setzeStatus(lauf, quelle, 'übersprungen');
          return;
        }
        setzeGescheitert(lauf, quelle, ergebnis.fehler);
        lauf.protokoll(`Katalog ${name} gescheitert: ${grundVon(ergebnis.fehler)}`);
      });
    }

    for (const isin of gehaltene) {
      const bestehend = bekannt.get(isin) ?? null;
      const aufloesung = abgelaufen.includes(isin)
        ? aufloese(isin, index, ohneKatalog, bestehend, heute)
        : bestehend;
      if (aufloesung === null) continue;
      fondsAufloesungen.push(aufloesung);

      if (aufloesung.durchsicht !== 'moeglich' || aufloesung.anbieter === null) continue;
      const anbieterImpl = ANBIETER.find((a) => a.name === aufloesung.anbieter);
      if (anbieterImpl === undefined) continue;

      const eintrag = index.get(isin)?.eintrag ?? null;
      try {
        const { ernte: e, adresse } = await anbieterImpl.bestandteile(ctx, isin, eintrag, aufloesung.adresse);
        lauf.etfStaende.push({ fondsIsin: isin, stand: heute, teile: e.daten.teile });
        lauf.schnappschuesse.push({ quelle: e.quelle, abgerufenAm: lauf.jetzt, payloadJson: e.rohJson });
        setzeStatus(lauf, e.quelle, 'erfolg');
        fondsAufloesungen[fondsAufloesungen.length - 1] = { ...aufloesung, adresse };
      } catch (fehler) {
        setzeStatus(lauf, `${aufloesung.anbieter}:${isin}`, 'fehler');
        lauf.protokoll(`${aufloesung.anbieter} ${isin} (automatisch) gescheitert: ${grundVon(fehler)}`);
        lauf.befunde.hinweis('fondsNichtAbrufbar', { anbieter: aufloesung.anbieter, isin, grund: grundVon(fehler) });
      }
    }
  } catch (fehler) {
    setzeGescheitert(lauf, 'fondsaufloesung', fehler);
    lauf.protokoll(`Fondsaufloesung gescheitert: ${grundVon(fehler)}`);
  }
  return fondsAufloesungen;
}

/** ISINs, die tatsaechlich im Depot vorkommen: im Bestand oder je gehandelt. */
function gesuchteIsins(bestaende: readonly Bestand[] | null, txs: readonly NeueTx[]): Isin[] {
  const menge = new Set<Isin>();
  for (const b of bestaende ?? []) menge.add(b.isin);
  for (const t of txs) if (t.isin !== null) menge.add(t.isin);
  return [...menge].sort();
}
