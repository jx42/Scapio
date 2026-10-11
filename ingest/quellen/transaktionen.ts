/**
 * Quelle `transaktionen`: die vollstaendige Historie der Bank, plus `seed.json`.
 *
 * Dies ist die EINZIGE Quelle, deren Ausfall den Lauf beendet (§6.1) — ohne Transaktionen
 * gibt es keine Mengenreihe, keine Einzahlungen und damit keine einzige richtige Zahl.
 *
 * Zwei Dinge entstehen hier, die spaeter nirgends mehr entstehen koennen:
 *
 *   1. Die Einordnung `istExtern` ueber `core/typen.ts`. Sie entscheidet die Rendite [P-05]
 *      und wird deshalb nicht hier, sondern an genau einer Stelle im Rechenkern getroffen.
 *   2. Kurspunkte mit Herkunft `transaktion` — `betrag / menge` ist der tatsaechlich
 *      ausgefuehrte Kurs. In der Fruehzeit des Depots sind das die einzigen Stuetzstellen,
 *      die es gibt, und sie schlagen jeden Chartwert (Rang 4). [P-02]
 *
 * Jede Zeile traegt genau einen befuellten Zweig (`security`/`cash`/`nonTradeSecurity`),
 * passend zu `kind` — durchgesetzt von `Transaktionszeile.refine()` in `schema.ts`. Fuer
 * `kind: 'security'` mit `transactionType: 'SINGLE'` (manueller Kauf/Verkauf) sagt der
 * Typ selbst nichts ueber die Richtung; die steht in `security.side`.
 *
 * ANNAHME ueber die Vorzeichen (von `npm run vertrag` bestaetigt): die Bank liefert
 * `amount` und `quantity` ohne verlaessliche Vorzeichenkonvention. Wir normalisieren
 * deterministisch nach dem Typ — Kauf: Geld raus, Stuecke rein; Verkauf: umgekehrt;
 * `*_OUT`/`WITHDRAWAL`/`PAYOUT`: Geld raus. Alles andere behaelt das gelieferte
 * Vorzeichen. Deterministisch heisst hier auch: idempotent.
 */

import { readFileSync } from 'node:fs';
import type { Cent, MengeE8 } from '../../core/dezimal.ts';
import { betragVon, rundeAufCent } from '../../core/dezimal.ts';
import type { Tag } from '../../core/kalender.ts';
import { istVor, tagAus } from '../../core/kalender.ts';
import type { Kurspunkt } from '../../core/kursraster.ts';
import type { Art, Status } from '../../core/typen.ts';
import { einordnen, istBekannterTyp } from '../../core/typen.ts';
import type { NeueTx } from '../../db/repository/transaktion.ts';
import { seedPfad } from '../../shared/konfiguration.ts';
import { McpFehler, mcpAufrufRoh } from '../mcp.ts';
import { entschaerfe } from '../fremdtext.ts';
import type { Ernte, Kontext } from '../importieren.ts';
import { tagIstBrauchbar } from '../plausibilitaet.ts';
import { GRENZE, pruefe, SeedDatei, TransaktionenAntwort } from '../schema.ts';
import type { Transaktionszeile } from '../schema.ts';
import type { LaufFehlerCode } from '../../shared/laufFehler.ts';

export const QUELLE = 'transaktionen';
const TOOL = 'mcp__claude_ai_Scalable_Capital__list_portfolio_transactions';

/** Typen, bei denen Geld das Depot verlaesst und Stuecke hineinkommen. */
const KAUF = /(^|_)(BUY|SAVINGS_PLAN|SUBSCRIPTION|PURCHASE)($|_)/;
/** Typen, bei denen Stuecke das Depot verlassen und Geld hereinkommt. */
const VERKAUF = /(^|_)(SELL|SALE|REDEMPTION)($|_)/;
/**
 * Typen, bei denen Geld das Depot verlaesst, ohne dass Stuecke bewegt werden.
 * `TRANSFER_OUT` passt ueber die `_OUT$`-Endung zufaellig ebenfalls, ist aber ein
 * Depotuebertrag in Wertpapierform — dort bewegen sich sehr wohl Stuecke. Er bekommt
 * deshalb vor dieser Pruefung einen eigenen Zweig.
 */
const ABFLUSS = /(_OUT$)|(^WITHDRAWAL$)|(^PAYOUT$)|(^SEPA_DIRECT_DEBIT$)/;

export type Transaktionsernte = {
  readonly transaktionen: readonly NeueTx[];
  readonly kurspunkte: readonly Kurspunkt[];
  readonly ersterTag: Tag | null;
};

export async function holeTransaktionen(ctx: Kontext): Promise<Ernte<Transaktionsernte>> {
  const roh = await mcpAufrufRoh(TOOL, {
    konfiguration: ctx.konfiguration,
    sicherung: ctx.mcp,
    melde: ctx.melde,
  });

  // Jede Seite einzeln durch zod. Eine kaputte Seite darf nicht als gueltige durchgehen.
  const seiten = roh.bloecke.map((b) => pruefe(QUELLE, TransaktionenAntwort, b));

  // `page.totalCount` ist entgegen dem Namen KEINE laufende Gesamtzahl ueber die
  // Cursor-Kette, sondern auf jeder Seite gleich `returnedCount` — belegt an einer echten
  // Vierseiten-Antwort (100/100/100/74), obwohl die Historie 374 Zeilen umfasst. Ein
  // Abgleich der Gesamtzahl abgerufener IDs gegen die letzte Seite brach deshalb JEDEN
  // Lauf mit mehr als einer Seite ab [E_MCP_UNVOLLSTAENDIG] — das war der Vorfall, nicht
  // der, den die Pruefung verhindern sollte. Was sich mit dem Feld tatsaechlich pruefen
  // laesst: dass jede Seite so viele Zeilen traegt, wie sie selbst behauptet.
  for (const seite of seiten) {
    if (seite.transactions.length !== seite.page.returnedCount) {
      throw new McpFehler(
        'E_MCP_UNVOLLSTAENDIG',
        TOOL,
        `${QUELLE}: Seite behauptet ${String(seite.page.returnedCount)} Zeilen, geliefert wurden ${String(seite.transactions.length)}.`,
      );
    }
  }

  const nachId = new Map<string, NeueTx>();
  const kurspunkte: Kurspunkt[] = [];
  const unbekannteTypen = new Set<string>();
  let ersterTag: Tag | null = null;

  for (const seite of seiten) {
    for (const zeile of seite.transactions) {
      const isoZeit = zeile.lastEventAt;
      let tag: Tag;
      try {
        tag = tagAus(isoZeit);
      } catch {
        ctx.befunde.hinweis('zeileOhneZeitstempel', { quelle: QUELLE });
        continue;
      }
      if (!tagIstBrauchbar(ctx.befunde, QUELLE, tag, ctx.heute)) continue;

      const abgeleitet = ableiten(zeile);
      if (abgeleitet === null) {
        // Durch `Transaktionszeile.refine()` in schema.ts eigentlich ausgeschlossen —
        // Sicherheitsnetz, falls die Bank `kind` und Zweig doch einmal auseinanderlaufen laesst.
        ctx.befunde.hinweis('zeileOhneZweig', { quelle: QUELLE });
        continue;
      }
      const { typ, art, isin, bezugIsin, menge, betrag } = abgeleitet;
      if (!istBekannterTyp(typ)) unbekannteTypen.add(typ);

      const status = alsStatus(zeile.status);

      const { betragCent, mengeE8 } = vorzeichen(typ, betrag, menge);

      const tx: NeueTx = {
        id: zeile.id,
        ts: isoZeit,
        tag,
        art,
        typ,
        isin,
        bezugIsin,
        mengeE8,
        betragCent,
        beschreibung: zeile.description === null ? null : entschaerfe(zeile.description).slice(0, GRENZE.name),
        status,
        istExtern: einordnen(typ) === 'extern',
        storniert: false,
        gesehenAm: ctx.jetzt,
      };

      nachId.set(tx.id, tx);
      if (ersterTag === null || istVor(tag, ersterTag)) ersterTag = tag;

      const punkt = kurspunktAus(tx);
      if (punkt !== null) kurspunkte.push(punkt);
    }
  }

  // Anfangsbestand ergaenzen — nur, wo die Bank nichts geliefert hat. [P-13]
  for (const tx of leseSeed(ctx)) {
    if (!nachId.has(tx.id)) {
      nachId.set(tx.id, tx);
      if (ersterTag === null || istVor(tx.tag, ersterTag)) ersterTag = tx.tag;
      const punkt = kurspunktAus(tx);
      if (punkt !== null) kurspunkte.push(punkt);
    }
  }

  if (unbekannteTypen.size > 0) {
    // Unbekannte Typen gelten im Rechenkern als intern und verschieben die Rendite
    // deshalb NICHT heimlich — sie stehen hier, damit jemand sie einordnet.
    ctx.befunde.hinweis('unbekannteTypen', {
      typen: [...unbekannteTypen].map((t) => t.replace(/[^A-Z0-9_]/g, '?')).sort(), // Fremdtext entschaerfen [INV-06]
    });
  }

  const transaktionen = [...nachId.values()].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));

  return {
    daten: { transaktionen, kurspunkte, ersterTag },
    quelle: QUELLE,
    rohJson: roh.rohJson,
  };
}

type Abgeleitet = {
  readonly typ: string;
  readonly art: Art;
  readonly isin: string | null;
  /** Bezugswertpapier einer Cash-Buchung — bewegt keine Stuecke. Siehe `Tx.bezugIsin`. */
  readonly bezugIsin: string | null;
  readonly menge: MengeE8 | null;
  readonly betrag: Cent;
};

/**
 * Liest Typ, Art, ISIN, Menge und Betrag aus dem einen befuellten Zweig der Zeile.
 * `null`, wenn `kind` und Zweig auseinanderlaufen — durch `Transaktionszeile.refine()`
 * in schema.ts eigentlich ausgeschlossen, hier trotzdem abgefangen statt mit `!` erzwungen.
 *
 * Der Typ ist fuer `kind: 'cash'`/`'non_trade_security'` schlicht der `transactionType`
 * des Zweigs. Fuer `kind: 'security'` gilt dasselbe, AUSSER bei `transactionType: 'SINGLE'`
 * (manueller Kauf/Verkauf ueber die Order-Maske): dort sagt `side` (`BUY`/`SELL`), nicht
 * `transactionType`, in welche Richtung das Geld fliesst — `SINGLE` selbst trifft weder
 * auf `KAUF` noch auf `VERKAUF` zu.
 */
function ableiten(zeile: Transaktionszeile): Abgeleitet | null {
  if (zeile.kind === 'cash') {
    const c = zeile.cash;
    if (c === null) return null;
    // `relatedIsin` ist der einzige Ort, an dem die Bank sagt, WOFUER eine Steuer oder
    // Ausschuettung gebucht wurde. Nicht nach `isin`, sondern nach `bezugIsin`: die Zeile
    // bewegt keine Stuecke und darf in FIFO und Mengenreihe keine Position aufmachen.
    return {
      typ: c.transactionType.toUpperCase(),
      art: 'CASH',
      isin: null,
      bezugIsin: c.relatedIsin,
      menge: null,
      betrag: c.amount,
    };
  }
  if (zeile.kind === 'non_trade_security') {
    const n = zeile.nonTradeSecurity;
    if (n === null) return null;
    return {
      typ: n.transactionType.toUpperCase(),
      art: 'WERTPAPIER',
      isin: n.isin,
      bezugIsin: null,
      menge: n.quantity,
      betrag: n.amount,
    };
  }
  const s = zeile.security;
  if (s === null) return null;
  const roh = s.transactionType.toUpperCase();
  const typ = roh === 'SINGLE' ? (s.side ?? roh).toUpperCase() : roh;
  return { typ, art: 'WERTPAPIER', isin: s.isin, bezugIsin: null, menge: s.quantity, betrag: s.amount };
}

function alsStatus(roh: string): Status {
  const s = roh.toUpperCase();
  if (s === 'EXECUTED' || s === 'PENDING' || s === 'CANCELED') return s;
  if (s === 'SETTLED') return 'EXECUTED';
  if (s === 'CANCELLED' || s === 'REJECTED' || s === 'FAILED') return 'CANCELED';
  // Alles Unbekannte gilt als schwebend: es zaehlt nicht mit, verschwindet aber auch nicht.
  return 'PENDING';
}

function vorzeichen(
  typ: string,
  betrag: Cent,
  menge: MengeE8 | null,
): { betragCent: Cent; mengeE8: MengeE8 | null } {
  const b = betragVon(betrag);
  const m = menge === null ? null : betragVon(menge);

  if (KAUF.test(typ)) return { betragCent: -b, mengeE8: m };
  if (VERKAUF.test(typ)) return { betragCent: b, mengeE8: m === null ? null : -m };
  // Depotuebertrag in Wertpapierform hinaus: Geld-Vorzeichen wie ABFLUSS, aber die
  // Stuecke verlassen das Depot wie bei VERKAUF — sonst zaehlt die Mengenreihe sie
  // doppelt, weil der `TRANSFER_IN` vom Gegenkonto sie ohnehin schon dazuzaehlt.
  if (typ === 'TRANSFER_OUT') return { betragCent: -b, mengeE8: m === null ? null : -m };
  if (ABFLUSS.test(typ)) return { betragCent: -b, mengeE8: menge };
  return { betragCent: betrag, mengeE8: menge };
}

/**
 * Der ausgefuehrte Kurs: |Betrag| / |Menge|, in KursE6.
 *
 *   Cent / 1e-8 Stueck  =  betrag * 1e12 / menge  in 1e-6 EUR
 *
 * Gerundet wird ueber `rundeAufCent` — die einzige Rundungsstelle des Projekts;
 * sie rundet einen Bruch kaufmaennisch auf eine Ganzzahl, hier eben auf 1e-6. [INV-02]
 */
function kurspunktAus(tx: NeueTx): Kurspunkt | null {
  if (tx.isin === null || tx.mengeE8 === null) return null;
  const menge = betragVon(tx.mengeE8);
  if (menge === 0n) return null;
  const kurs = rundeAufCent(betragVon(tx.betragCent) * 10n ** 12n, menge);
  if (kurs <= 0n) return null;
  return { isin: tx.isin, tag: tx.tag, kurs, herkunft: 'transaktion', abgerufenAm: tx.gesehenAm };
}

/** Handgepflegte Datei, kein Fremdtext — trotzdem nennt die Meldung nur den Code-Anker, nie den Inhalt. */
export class SeedFehler extends Error {
  readonly code = 'E_SEED_KAPUTT' satisfies LaufFehlerCode;
  constructor() {
    super('seed.json im Datenverzeichnis ist kein gueltiges JSON. Siehe docs/RUNBOOK.md, E_SEED_KAPUTT.');
    this.name = 'SeedFehler';
  }
}

/**
 * `seed.json` ist optional und darf ein leeres Array enthalten. Ist die Datei kaputt,
 * ist das ein Fehler — eine halb gelesene Anfangsbilanz waere schlimmer als keine.
 */
function leseSeed(ctx: Kontext): NeueTx[] {
  const datei = seedPfad(ctx.konfiguration);
  let roh: string;
  try {
    roh = readFileSync(datei, 'utf8');
  } catch {
    return [];
  }

  // Ohne eigenen Code stuende im Lauf nur `E_UNBEKANNT` — und Transaktionen sind die
  // einzige Quelle, deren Ausfall den ganzen Lauf beendet. `JSON.parse` bleibt im
  // `pruefe`-Ausdruck, so verlangt es INV-12; nur der SyntaxError bekommt den eigenen Code.
  let inhalt: ReturnType<typeof SeedDatei.parse>;
  try {
    inhalt = pruefe('seed.json', SeedDatei, JSON.parse(roh));
  } catch (fehler) {
    throw fehler instanceof SyntaxError ? new SeedFehler() : fehler;
  }
  const txs: NeueTx[] = [];

  for (const e of inhalt.anfangsbestand) {
    const tag = tagAus(e.ts);
    const typ = e.typ.toUpperCase();
    txs.push({
      // Der Praefix haelt eigene Zeilen von denen der Bank getrennt — auch beim
      // Stornieren verschwundener Transaktionen im Import.
      id: e.id.startsWith('seed:') ? e.id : `seed:${e.id}`,
      ts: e.ts,
      tag,
      art: e.art,
      typ,
      isin: e.isin ?? null,
      bezugIsin: null,
      mengeE8: e.menge ?? null,
      betragCent: e.betrag,
      beschreibung: e.beschreibung ?? null,
      status: 'EXECUTED',
      istExtern: einordnen(typ) === 'extern',
      storniert: false,
      gesehenAm: ctx.jetzt,
    });
  }

  if (txs.length > 0) {
    ctx.befunde.hinweis('seedUebernommen', { zeilen: txs.length });
  }
  return txs;
}
