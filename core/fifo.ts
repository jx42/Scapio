/**
 * Einstand je Position nach FIFO.
 *
 * Verkaeufe verbrauchen die aeltesten Tranchen zuerst; der Einstand der verbleibenden
 * Anteile ist der investierte Betrag. Daraus entstehen Gewicht, investierter Betrag,
 * absoluter und prozentualer Gewinn — und der positionseigene XIRR.
 */

import type { Cent, MengeE8 } from './dezimal.ts';
import { rundeAufCent } from './dezimal.ts';
import type { Tag } from './kalender.ts';
import { istVor, vergleiche } from './kalender.ts';
import type { Isin, Tx } from './typen.ts';
import { einordnen, istSteuer, zaehlt } from './typen.ts';
import { istWertpapieruebertrag } from './uebertraege.ts';

export type Tranche = {
  readonly tag: Tag;
  readonly menge: MengeE8;
  /** Anschaffungskosten der noch offenen Menge dieser Tranche. */
  readonly kosten: Cent;
};

export type Positionseinstand = {
  readonly menge: MengeE8;
  readonly einstand: Cent;
  readonly realisiert: Cent;
  readonly tranchen: readonly Tranche[];
};

/** Ein einzelner Verkauf mit seinem nach FIFO abgerechneten Gewinn. */
export type RealisierteVerkaufszeile = {
  readonly txId: string;
  readonly tag: Tag;
  readonly isin: Isin;
  readonly gewinnCent: Cent;
};

/**
 * Eine Vorgaenger-ISIN, deren Einstand per Kapitalmassnahme in diese ISIN gewandert ist:
 * ihre Fluesse bis `bis` gehoeren anteilig (`zaehler / nenner`) zum Positions-IZF der neuen.
 */
export type Herkunft = {
  readonly isin: Isin;
  readonly bis: Tag;
  readonly zaehler: bigint;
  readonly nenner: bigint;
};

export type FifoErgebnis = {
  readonly einstaende: ReadonlyMap<Isin, Positionseinstand>;
  /** Ein Eintrag je Verkaufstransaktion, aelteste zuerst — die Quelle fuer "Realisierte Gewinne" im Detail. */
  readonly verkaeufe: readonly RealisierteVerkaufszeile[];
  /** Vorgaenger je ISIN nach ISIN-Wechseln, transitiv aufgeloest. */
  readonly herkunft: ReadonlyMap<Isin, readonly Herkunft[]>;
  /** Abgaenge des ganzen Bestands ohne Betrag und ohne Zugang am selben Tag, als Verlust gebucht. */
  readonly ausbuchungen: number;
};

/**
 * FIFO ueber alle Wertpapiertransaktionen.
 *
 * Der Betrag eines Kaufs ist aus Depotsicht negativ; die Anschaffungskosten sind sein
 * Betrag. Ein Verkauf loest Tranchen anteilig auf und schreibt die Differenz zwischen
 * Erloes und anteiligen Kosten als realisierten Gewinn fort.
 *
 * Ausnahme: ein `TRANSFER_OUT`, dem fuer dieselbe ISIN ein `TRANSFER_IN` mit exakt
 * derselben Menge gegenuebersteht, ist kein Verkauf — die Anteile verlassen das Depot
 * und kommen unveraendert zurueck (ein depotinterner Uebertrag, keine Marktransaktion).
 * Beide Buchungen werden uebergangen; die Tranchen bleiben unberuehrt. Ohne diese
 * Ausnahme wuerde jeder solche Uebertrag den kompletten seit dem Kauf aufgelaufenen
 * Buchgewinn als "realisiert" ausweisen, obwohl kein Cent geflossen ist. Ein
 * unpaariger `TRANSFER_OUT`/`TRANSFER_IN` (echter Depotwechsel zu einer anderen Bank)
 * bleibt wie bisher Verkauf bzw. Kauf zum Uebertragswert — mehr weiss der Rechenkern
 * ueber dessen Herkunft nicht. Die Paarerkennung selbst steht in `uebertraege.ts`, weil
 * dieselbe Ausnahme auch ausserhalb von FIFO gilt.
 *
 * Zweite Ausnahme: eine Bewegung mit Betrag 0, die kein Uebertrag ist, ist eine
 * Kapitalmassnahme und bucht den Einstand um, statt ihn zu realisieren — siehe
 * `bucheUm`. [ADR-043]
 *
 * `ausgeglichen` kommt vom Aufrufer, einmal ueber die gesamte Historie berechnet — die
 * Paarerkennung in `ausgeglicheneUebertraege()` ist ohnehin je ISIN gruppiert, das
 * Ergebnis fuer eine ISIN ist also dasselbe, ob man es auf der vollen Liste oder auf
 * einer nach ISIN gefilterten Teilliste berechnet.
 */
export function fifo(transaktionen: readonly Tx[], ausgeglichen: ReadonlySet<string>): FifoErgebnis {
  const relevant: Tx[] = [];
  for (const tx of transaktionen) {
    if (!zaehlt(tx)) continue;
    if (tx.art !== 'WERTPAPIER') continue;
    if (tx.isin === null || tx.mengeE8 === null || tx.mengeE8 === 0n) continue;
    if (ausgeglichen.has(tx.id)) continue;
    relevant.push(tx);
  }
  relevant.sort((a, b) => vergleiche(a.tag, b.tag) || vergleiche(a.ts, b.ts));

  const buch: Buch = { offen: new Map(), realisiert: new Map(), verkaeufe: [], herkunft: new Map(), ausbuchungen: 0 };
  for (const tx of relevant) if (!buch.offen.has(tx.isin!)) buch.offen.set(tx.isin!, []);

  let i = 0;
  while (i < relevant.length) {
    const tag = relevant[i]!.tag;
    const tagesTx: Tx[] = [];
    while (i < relevant.length && relevant[i]!.tag === tag) tagesTx.push(relevant[i++]!);

    // Kapitalmassnahmen wirken zum Tagesbeginn: ein Kauf am Ex-Tag ist schon in neuen Stuecken.
    bucheUm(buch, tagesTx.filter(istKapitalmassnahme), tag);
    for (const tx of tagesTx) if (!istKapitalmassnahme(tx)) bucheHandel(buch, tx);
  }

  const ergebnis = new Map<Isin, Positionseinstand>();
  for (const [isin, offen] of buch.offen) {
    let menge = 0n;
    let einstand = 0n;
    for (const t of offen) {
      menge += t.menge;
      einstand += t.kosten;
    }
    ergebnis.set(isin, {
      menge,
      einstand,
      realisiert: buch.realisiert.get(isin) ?? 0n,
      tranchen: offen.map((t) => ({ tag: t.tag, menge: t.menge, kosten: t.kosten })),
    });
  }

  buch.verkaeufe.sort((a, b) => vergleiche(a.tag, b.tag));
  return { einstaende: ergebnis, verkaeufe: buch.verkaeufe, herkunft: buch.herkunft, ausbuchungen: buch.ausbuchungen };
}

type OffeneTranche = { tag: Tag; menge: MengeE8; kosten: Cent };

/** Einstand einer abgegangenen Position, der auf den Zugang einer anderen ISIN am selben Tag wartet. */
type Umbuchung = { readonly txId: string; readonly isin: Isin; readonly kosten: Cent };

type Buch = {
  readonly offen: Map<Isin, OffeneTranche[]>;
  readonly realisiert: Map<Isin, Cent>;
  readonly verkaeufe: RealisierteVerkaufszeile[];
  readonly herkunft: Map<Isin, Herkunft[]>;
  ausbuchungen: number;
};

/**
 * Split, Zusammenlegung, ISIN-Wechsel: Stuecke kommen oder gehen ohne Geld. Als Kauf
 * oder Verkauf zu 0 gebucht, ergaebe das Scheinverluste und einen Einstand von 0.
 * Uebertraege zaehlen nicht dazu — ihr fehlender Wert ist ein anderer Fall (`uebertraege.ts`).
 */
export function istKapitalmassnahme(tx: Tx): boolean {
  return tx.betragCent === 0n && !istWertpapieruebertrag(tx);
}

function bestandVon(offen: readonly OffeneTranche[]): MengeE8 {
  let menge = 0n;
  for (const t of offen) menge += t.menge;
  return menge;
}

/** Verteilt `neu` Stuecke anteilig auf die Tranchen; die Kosten bleiben, wo sie sind. */
function skaliere(offen: OffeneTranche[], neu: MengeE8, alt: MengeE8): void {
  let rest = neu;
  for (let k = 0; k < offen.length; k += 1) {
    const t = offen[k]!;
    const menge = k === offen.length - 1 ? rest : rundeAufCent(t.menge * neu, alt);
    rest -= menge;
    offen[k] = { tag: t.tag, menge, kosten: t.kosten };
  }
}

/**
 * Bucht die Kapitalmassnahmen eines Tages, saldiert je ISIN:
 * - Zugang zu einem Bestand: Split, die Stuecke werden mehr, der Einstand bleibt.
 * - Abgang, nach dem Bestand bleibt: Zusammenlegung, die Stuecke werden weniger, der Einstand bleibt.
 * - Abgang des ganzen Bestands: der Einstand geht an einen Zugang ohne Vorbestand am selben
 *   Tag (ISIN-Wechsel), bei mehreren Zugaengen anteilig nach Menge. Ohne einen solchen
 *   Zugang ist es ein realisierter Verlust — ueber Tage gepaart, landete ein Delisting in
 *   fremden Gratisstuecken. [ADR-053]
 * - Zugang ohne Vorbestand und ohne Abgang am selben Tag: Gratisstuecke, Einstand 0.
 */
function bucheUm(buch: Buch, massnahmen: readonly Tx[], tag: Tag): void {
  if (massnahmen.length === 0) return;

  const saldo = new Map<Isin, { menge: MengeE8; txId: string }>();
  for (const tx of massnahmen) {
    const s = saldo.get(tx.isin!);
    saldo.set(tx.isin!, { menge: (s?.menge ?? 0n) + tx.mengeE8!, txId: s?.txId ?? tx.id });
  }

  const topf: Umbuchung[] = [];
  const neueIsins: { isin: Isin; menge: MengeE8 }[] = [];
  for (const [isin, { menge, txId }] of saldo) {
    if (menge === 0n) continue;
    const offen = buch.offen.get(isin)!;
    const bestand = bestandVon(offen);
    if (menge > 0n && bestand <= 0n) {
      neueIsins.push({ isin, menge });
    } else if (bestand + menge > 0n) {
      skaliere(offen, bestand + menge, bestand);
    } else {
      let kosten = 0n;
      for (const t of offen) kosten += t.kosten;
      offen.length = 0;
      topf.push({ txId, isin, kosten });
    }
  }

  if (neueIsins.length === 0) {
    for (const u of topf) {
      buch.realisiert.set(u.isin, (buch.realisiert.get(u.isin) ?? 0n) - u.kosten);
      buch.verkaeufe.push({ txId: u.txId, tag, isin: u.isin, gewinnCent: -u.kosten });
      buch.ausbuchungen += 1;
    }
    return;
  }

  let kosten = 0n;
  for (const u of topf) kosten += u.kosten;

  let gesamtMenge = 0n;
  for (const n of neueIsins) gesamtMenge += n.menge;
  let rest = kosten;
  neueIsins.forEach((n, k) => {
    const anteil = k === neueIsins.length - 1 ? rest : rundeAufCent(kosten * n.menge, gesamtMenge);
    rest -= anteil;
    buch.offen.get(n.isin)!.push({ tag, menge: n.menge, kosten: anteil });

    if (topf.length === 0) return;
    const herkunft = buch.herkunft.get(n.isin) ?? [];
    for (const u of topf) {
      herkunft.push({ isin: u.isin, bis: tag, zaehler: n.menge, nenner: gesamtMenge });
      for (const h of buch.herkunft.get(u.isin) ?? []) {
        herkunft.push({ isin: h.isin, bis: h.bis, zaehler: h.zaehler * n.menge, nenner: h.nenner * gesamtMenge });
      }
    }
    buch.herkunft.set(n.isin, herkunft);
  });
}

function bucheHandel(buch: Buch, tx: Tx): void {
  const isin = tx.isin!;
  const offen = buch.offen.get(isin)!;
  const menge = tx.mengeE8!;

  if (menge > 0n) {
    // Kauf: Kosten sind der Betrag ohne Vorzeichen.
    const kosten = tx.betragCent < 0n ? -tx.betragCent : tx.betragCent;
    offen.push({ tag: tx.tag, menge, kosten });
    return;
  }

  // Verkauf: aelteste Tranchen zuerst.
  let zuVerkaufen = -menge;
  const erloes = tx.betragCent < 0n ? -tx.betragCent : tx.betragCent;
  let verbrauchteKosten = 0n;
  const gesamtVerkauft = zuVerkaufen;

  while (zuVerkaufen > 0n && offen.length > 0) {
    const tranche = offen[0]!;

    if (tranche.menge <= zuVerkaufen) {
      verbrauchteKosten += tranche.kosten;
      zuVerkaufen -= tranche.menge;
      offen.shift();
      continue;
    }

    // Tranche wird angebrochen: Kosten anteilig, einmal gerundet.
    const anteiligeKosten = rundeAufCent(tranche.kosten * zuVerkaufen, tranche.menge);
    verbrauchteKosten += anteiligeKosten;
    offen[0] = {
      tag: tranche.tag,
      menge: tranche.menge - zuVerkaufen,
      kosten: tranche.kosten - anteiligeKosten,
    };
    zuVerkaufen = 0n;
  }

  // Was ueber den bekannten Bestand hinaus verkauft wird, hat keinen Einstand.
  // Das passiert bei unvollstaendiger Historie und wird als reiner Erloes gebucht,
  // statt die Rechnung mit einem negativen Bestand zu vergiften.
  const tatsaechlichVerkauft = gesamtVerkauft - zuVerkaufen;
  const anteiligerErloes =
    tatsaechlichVerkauft === gesamtVerkauft ? erloes : rundeAufCent(erloes * tatsaechlichVerkauft, gesamtVerkauft);

  const gewinn = anteiligerErloes - verbrauchteKosten;
  buch.realisiert.set(isin, (buch.realisiert.get(isin) ?? 0n) + gewinn);
  buch.verkaeufe.push({ txId: tx.id, tag: tx.tag, isin, gewinnCent: gewinn });
}

/**
 * Cashflows einer einzelnen Position fuer den positionseigenen XIRR, aus Anlegersicht:
 * Kaeufe und Uebertraege herein negativ, Verkaeufe und Uebertraege hinaus positiv,
 * Ausschuettungen positiv, Positionswert am Stichtag als Abschluss.
 *
 * Das Vorzeichen folgt der Menge, nicht dem Betrag: ein `TRANSFER_IN` traegt seinen
 * Uebertragswert positiv, obwohl er aus Anlegersicht ein Einsatz ist wie ein Kauf.
 * Ohne die Ausschuettungen erschiene ein ausschuettender ETF um genau seine
 * Ausschuettungsrendite schlechter als ein thesaurierender mit derselben Entwicklung.
 *
 * Ein ausgeglichenes Uebertragspaar (siehe `fifo()` oben) ist auch hier kein Kauf und
 * kein Verkauf — sonst verzerrt der erfundene Cashflow genau den XIRR dieser Position.
 *
 * Nach einem ISIN-Wechsel gehoeren die Fluesse der Vorgaenger bis zum Wechseltag anteilig
 * dazu (`herkunft` aus `fifo()`). Ohne sie stuende am Anfang nur die Umbuchung zu 0, und
 * der IZF der neuen ISIN waere ein Vielfaches des echten. [ADR-053]
 *
 * `stichtag` ist der Tag, zu dem `wertCent` gilt — der letzte Tag der Depotreihe.
 */
export function positionsFluesse(
  transaktionen: readonly Tx[],
  isin: Isin,
  wertCent: Cent,
  stichtag: Tag,
  ausgeglichen: ReadonlySet<string>,
  herkunft: readonly Herkunft[] = [],
): { tag: Tag; betrag: Cent }[] {
  const fluesse = eigeneFluesse(transaktionen, isin, null, ausgeglichen);
  for (const h of herkunft) {
    for (const f of eigeneFluesse(transaktionen, h.isin, h.bis, ausgeglichen)) {
      fluesse.push({ tag: f.tag, betrag: rundeAufCent(f.betrag * h.zaehler, h.nenner) });
    }
  }

  fluesse.push({ tag: stichtag, betrag: wertCent });
  return fluesse.sort((a, b) => vergleiche(a.tag, b.tag));
}

function eigeneFluesse(
  transaktionen: readonly Tx[],
  isin: Isin,
  bis: Tag | null,
  ausgeglichen: ReadonlySet<string>,
): { tag: Tag; betrag: Cent }[] {
  const fluesse: { tag: Tag; betrag: Cent }[] = [];

  for (const tx of transaktionen) {
    if (!zaehlt(tx)) continue;
    if (ausgeglichen.has(tx.id)) continue;
    if (bis !== null && istVor(bis, tx.tag)) continue;

    if (tx.art === 'WERTPAPIER' && tx.isin === isin && tx.mengeE8 !== null && tx.mengeE8 !== 0n) {
      const betrag = tx.betragCent < 0n ? -tx.betragCent : tx.betragCent;
      fluesse.push({ tag: tx.tag, betrag: tx.mengeE8 > 0n ? -betrag : betrag });
      continue;
    }

    if (einordnen(tx.typ) === 'ertrag' && !istSteuer(tx.typ) && (tx.isin ?? tx.bezugIsin) === isin) {
      fluesse.push({ tag: tx.tag, betrag: tx.betragCent });
    }
  }

  return fluesse;
}
