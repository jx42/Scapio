/**
 * Tageswerte: Wertpapiere, Cash, Gesamt, eingezahltes Kapital.
 *
 * Depotwert je Tag = Summe(menge × kurs) + cash. Das ist die Rekonstruktion, um die
 * es der ganzen Anwendung geht — es gibt keine Portfoliowert-Zeitreihe von der Bank. [P-01]
 */

import type { Cent, KursE6, MengeE8 } from './dezimal.ts';
import { alsText, wert } from './dezimal.ts';
import { sha256 } from './hash.ts';
import type { Tag } from './kalender.ts';
import { plusTage, vergleiche } from './kalender.ts';
import type { Kurspunkt, Rasterwert } from './kursraster.ts';
import { letzterKursBis } from './kursraster.ts';
import { baueCashreihe, baueEinzahlungsreihe, baueMengenreihe } from './mengenreihe.ts';
import type { DepotTag, Fluss, Isin, Tx } from './typen.ts';
import { einordnen, zaehlt } from './typen.ts';
import { ausgeglicheneUebertraege, bewerteAusgaenge, istWertpapieruebertrag } from './uebertraege.ts';

export type Eingaben = {
  readonly transaktionen: readonly Tx[];
  /** Kursraster je ISIN, bereits verschmolzen und vorwaerts gefuellt. */
  readonly raster: ReadonlyMap<Isin, ReadonlyMap<Tag, Rasterwert>>;
  /**
   * Dieselben Kurse ungerastert, je ISIN. Traegt einen Tag, den das Raster wegen der
   * Fuellgrenze offen laesst — sonst faellt der Depotwert dort auf den Cash-Anteil,
   * obwohl sich am Kurs nichts geaendert hat. [letzterKursBis]
   */
  readonly punkteJeIsin: ReadonlyMap<Isin, readonly Kurspunkt[]>;
  readonly von: Tag;
  readonly bis: Tag;
};

export type Tageszeile = DepotTag & {
  /** Wert je Position an diesem Tag, fuer Aufteilung und Look-Through. */
  readonly positionen: ReadonlyMap<Isin, Cent>;
  readonly eingabeHash: string;
};

/**
 * Externe Fluesse: echtes Kapital hinein oder heraus. Grundlage jeder Renditerechnung. [P-05]
 *
 * Ein ausgeglichenes Uebertragspaar (siehe `uebertraege.ts`) ist trotz `TRANSFER_IN`/
 * `TRANSFER_OUT`-Typ kein externer Fluss — derselbe Bestand verlaesst das Depot und
 * kommt unveraendert zurueck. Ohne diese Ausnahme erschiene ein depotinterner Wechsel
 * als Ab- und Zufluss im eingezahlten Kapital, im portfolioweiten XIRR und im TWR.
 */
export function externeFluesse(transaktionen: readonly Tx[], ausgeglichen: ReadonlySet<string>): Fluss[] {
  const fluesse: Fluss[] = [];
  for (const tx of transaktionen) {
    if (!zaehlt(tx)) continue;
    if (einordnen(tx.typ) !== 'extern') continue;
    if (ausgeglichen.has(tx.id)) continue;
    fluesse.push({ tag: tx.tag, betrag: tx.betragCent });
  }
  return fluesse.sort((a, b) => vergleiche(a.tag, b.tag));
}

/** Ertraege: Zinsen, Bonus, Steuererstattung. Teil der Rendite, kein Kapitaleinsatz. */
export function ertraege(transaktionen: readonly Tx[]): Fluss[] {
  const fluesse: Fluss[] = [];
  for (const tx of transaktionen) {
    if (!zaehlt(tx)) continue;
    if (einordnen(tx.typ) !== 'ertrag') continue;
    fluesse.push({ tag: tx.tag, betrag: tx.betragCent });
  }
  return fluesse.sort((a, b) => vergleiche(a.tag, b.tag));
}

/**
 * Investitionsfluesse: Kauf und Verkauf von Wertpapieren, das Gegenstueck zu
 * `externeFluesse`. Siehe ADR-008.
 *
 * `externeFluesse` schliesst genau das aus, was hier gezaehlt wird — ein Kauf schiebt
 * Geld nur von der Cash- auf die Wertpapierseite desselben Depots und ist deshalb kein
 * Kapitalfluss fuer XIRR/TWR. Fuer die Frage "wie viel Geld steckt in welchem Monat neu
 * in Wertpapieren" ist dieselbe Bewegung aber genau die gesuchte: ein Kauf zaehlt positiv
 * (Geld verlaesst die Cash-Seite), ein Verkauf negativ, spiegelbildlich zum Vorzeichen aus
 * `betragCent`. Deshalb `-tx.betragCent` statt `tx.betragCent`.
 *
 * FEE und TAX sind trotz Wertpapierbezug (etwa eine Vorabpauschale auf eine bestimmte
 * ISIN) keine Investition, sondern eine Kostenbuchung, und bleiben aussen vor. Ein
 * `TRANSFER_IN`/`TRANSFER_OUT` ist ein Depotuebertrag, kein Kauf, und zaehlt hier ebenfalls
 * nicht — er gehoert zu `externeFluesse`.
 */
export function investitionsFluesse(transaktionen: readonly Tx[]): Fluss[] {
  const fluesse: Fluss[] = [];
  for (const tx of transaktionen) {
    if (!zaehlt(tx)) continue;
    if (tx.art !== 'WERTPAPIER') continue;
    if (einordnen(tx.typ) !== 'intern') continue;
    const t = tx.typ.toUpperCase();
    if (t === 'FEE' || t === 'TAX') continue;
    fluesse.push({ tag: tx.tag, betrag: -tx.betragCent });
  }
  return fluesse.sort((a, b) => vergleiche(a.tag, b.tag));
}

/**
 * Kanonische Serialisierung der Eingaben eines Tages.
 *
 * Diese Definition darf sich nicht aendern, ohne dass KERN_VERSION steigt — sonst
 * gilt jede gespeicherte Zeile als frisch, obwohl sie nach anderer Logik entstand.
 * Sortiert nach ISIN, `bigint` als Dezimalzeichenkette, `JSON.stringify` ueber Arrays.
 */
export function kanonischeEingabe(
  mengen: readonly (readonly [Isin, MengeE8])[],
  kurse: readonly (readonly [Isin, KursE6])[],
  cash: Cent,
): string {
  const m = [...mengen].sort((a, b) => vergleiche(a[0], b[0])).map(([i, v]) => [i, alsText(v)]);
  const k = [...kurse].sort((a, b) => vergleiche(a[0], b[0])).map(([i, v]) => [i, alsText(v)]);
  return JSON.stringify({ mengen: m, kurse: k, cash: alsText(cash) });
}

export function eingabeHash(
  mengen: readonly (readonly [Isin, MengeE8])[],
  kurse: readonly (readonly [Isin, KursE6])[],
  cash: Cent,
): string {
  return sha256(kanonischeEingabe(mengen, kurse, cash));
}

/**
 * Baut die Tageswertreihe.
 *
 * Ein Tag gilt als lueckenhaft, wenn eine Position mit Bestand an diesem Tag keinen
 * gerasterten Kurs hat. Die Bewertung faellt dann auf den letzten gemessenen Kurs
 * zurueck, unabhaengig von der Fuellgrenze des Rasters — ein veralteter Kurs verzerrt
 * den Verlauf weniger als eine Position, die fuer einen Tag auf null faellt und danach
 * wieder erscheint. Nur wenn es ueberhaupt noch keinen Kurs gab, fehlt die Position
 * wie bisher ganz.
 */
export function baueDepotreihe(eingaben: Eingaben): Tageszeile[] {
  const { raster, punkteJeIsin, von, bis } = eingaben;

  // Einmal fuer den gesamten Aufbau berechnet und ueberallhin durchgereicht statt an
  // jeder Stelle neu — die Paarerkennung ist ISIN-gruppiert und deshalb unabhaengig
  // davon, ob sie auf der vollen Liste oder einer gefilterten Teilliste laeuft.
  const ausgeglichen = ausgeglicheneUebertraege(eingaben.transaktionen);
  const transaktionen = bewerteAusgaenge(eingaben.transaktionen, ausgeglichen, (isin, tag) =>
    letzterKursBis(punkteJeIsin.get(isin) ?? [], tag),
  );

  const mengenreihe = baueMengenreihe(transaktionen, von, bis, ausgeglichen);
  const cashreihe = baueCashreihe(transaktionen, von, bis, ausgeglichen);
  const einzahlungen = baueEinzahlungsreihe(externeFluesse(transaktionen, ausgeglichen), von, bis);

  // Cash-Bewegungen je Tag, fuer den Eingabe-Hash. Ein ausgeglichenes Uebertragspaar
  // ist an keiner Stelle der Anwendung ein Vorgang — auch der Fingerabdruck des Tages
  // soll einen Nicht-Vorgang als Nicht-Vorgang sehen, nicht als Bewegung mit Betrag null.
  const cashBewegung = new Map<Tag, Cent>();
  for (const tx of transaktionen) {
    if (!zaehlt(tx)) continue;
    if (ausgeglichen.has(tx.id) || istWertpapieruebertrag(tx)) continue;
    cashBewegung.set(tx.tag, (cashBewegung.get(tx.tag) ?? 0n) + tx.betragCent);
  }

  const zeilen: Tageszeile[] = [];

  for (let t = von; vergleiche(t, bis) <= 0; t = plusTage(t, 1)) {
    const positionen = new Map<Isin, Cent>();
    const mengenHeute: [Isin, MengeE8][] = [];
    const kurseHeute: [Isin, KursE6][] = [];

    let wertpapiere = 0n;
    let lueckenhaft = false;

    for (const [isin, reihe] of mengenreihe.menge) {
      const menge = reihe.get(t);
      if (menge === undefined || menge === 0n) continue;

      mengenHeute.push([isin, menge]);

      const gerastert = raster.get(isin)?.get(t);
      let kurs: KursE6 | null;
      if (gerastert !== undefined) {
        kurs = gerastert.kurs;
      } else {
        lueckenhaft = true;
        kurs = letzterKursBis(punkteJeIsin.get(isin) ?? [], t);
      }
      // Kein Kurs, auch nicht in der Vergangenheit: der Tag ist unvollstaendig,
      // nicht null wert — die Position fehlt in der Summe statt sie zu erfinden.
      if (kurs === null) continue;

      kurseHeute.push([isin, kurs]);
      const positionswert = wert(menge, kurs);
      positionen.set(isin, positionswert);
      wertpapiere += positionswert;
    }

    const cash = cashreihe.get(t) ?? 0n;

    zeilen.push({
      tag: t,
      wertpapiereCent: wertpapiere,
      cashCent: cash,
      gesamtCent: wertpapiere + cash,
      nettoEinzahlungKumCent: einzahlungen.get(t) ?? 0n,
      lueckenhaft,
      positionen,
      eingabeHash: eingabeHash(mengenHeute, kurseHeute, cashBewegung.get(t) ?? 0n),
    });
  }

  return zeilen;
}

export type Hochwassermarke = {
  /** Letzter Tag, fuer den eine gueltige Zeile vorliegt. */
  readonly letzterBerechneterTag: Tag | null;
  /** Aeltester Tag mit geaenderter Transaktion, falls es einen gibt. */
  readonly aeltesteGeaenderteTransaktion: Tag | null;
  /** Aeltester Tag mit geaendertem Kurs, falls es einen gibt. */
  readonly aeltesterGeaenderterKurs: Tag | null;
  readonly gespeicherteKernVersion: number | null;
  readonly aktuelleKernVersion: number;
  /** Erster Tag der gesamten Historie. Rueckfall, wenn alles neu muss. */
  readonly ersterTag: Tag;
};

/**
 * Ab welchem Tag muss neu gerechnet werden?
 *
 * Minimum aus: letzter berechneter Tag + 1, aelteste geaenderte Transaktion,
 * aeltester geaenderter Kurs — und dem Anfang der Zeit, wenn KERN_VERSION gesprungen ist.
 */
export function startTagFuerNeuberechnung(marke: Hochwassermarke): Tag {
  if (marke.gespeicherteKernVersion !== marke.aktuelleKernVersion) return marke.ersterTag;

  const kandidaten: Tag[] = [];
  if (marke.letzterBerechneterTag !== null) kandidaten.push(plusTage(marke.letzterBerechneterTag, 1));
  else kandidaten.push(marke.ersterTag);
  if (marke.aeltesteGeaenderteTransaktion !== null) kandidaten.push(marke.aeltesteGeaenderteTransaktion);
  if (marke.aeltesterGeaenderterKurs !== null) kandidaten.push(marke.aeltesterGeaenderterKurs);

  let kleinster = kandidaten[0]!;
  for (const k of kandidaten) if (vergleiche(k, kleinster) < 0) kleinster = k;

  // Nie vor den Anfang der Historie.
  return vergleiche(kleinster, marke.ersterTag) < 0 ? marke.ersterTag : kleinster;
}
