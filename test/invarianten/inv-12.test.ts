/**
 * INV-12 — Jede fremde Antwort geht durch zod, bevor sie die Datenbank beruehrt.
 *
 * Fremd ist alles, was nicht aus diesem Ordner kommt: die Bank, iShares, Eurostat, der
 * Cache auf der Platte. Ein fehlendes Feld, eine Zahl als Text, ein Array mit 400.000
 * Zeilen — das faellt hier auf, an einer Stelle, mit einer Meldung, die die Quelle
 * nennt. Ohne diese Grenze faellt es irgendwo auf, als `undefined` in einer Rendite.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  GRENZE,
  Geld,
  HoldingsAntwort,
  Isin,
  SchemaFehler,
  Transaktionszeile,
  pruefe,
} from '../../ingest/schema.ts';
import { alsListe, dateien, sucheImCode } from './quellen.ts';

const INGEST = dateien(['ingest']);
const QUELLEN = INGEST.filter((q) => q.pfad.startsWith('ingest/quellen/'));

describe('INV-12 — jede Quelle prueft', () => {
  it('findet alle Quellendateien', () => {
    expect(QUELLEN.length).toBeGreaterThanOrEqual(6);
  });

  it('ruft in jeder Quelle `pruefe` auf', () => {
    for (const q of QUELLEN) {
      const rufe = sucheImCode([q], /\bpruefe\s*\(/);
      expect(rufe.length, `${q.pfad} prueft nichts`).toBeGreaterThan(0);
    }
  });

  it('holt das Schema in jeder Quelle aus `schema.ts`', () => {
    for (const q of QUELLEN) {
      expect(q.inhalt, `${q.pfad} importiert nicht aus schema.ts`).toMatch(/from '\.\.\/schema\.ts'/);
    }
  });

  it('reicht jedes geparste JSON unmittelbar an `pruefe` weiter', () => {
    // Wo `JSON.parse` steht, ist gleichgueltig — entscheidend ist, dass sein Ergebnis
    // die Quelle nicht als `unknown` verlaesst. Deshalb muss es im selben Ausdruck an
    // `pruefe` gehen. Eine Zwischenvariable waere die Luecke, durch die ein
    // ungeprueftes Objekt weiterwandern kann.
    const treffer = sucheImCode(QUELLEN, /JSON\s*\.\s*parse/);
    const ohnePruefung = treffer.filter((t) => !/pruefe\s*\([^)]*JSON\s*\.\s*parse/.test(t.text));
    expect(ohnePruefung, `Geparstes JSON ohne Pruefung:\n${alsListe(ohnePruefung)}`).toEqual([]);
    expect(treffer.length, 'Kein JSON.parse gefunden — der Test prueft nichts').toBeGreaterThan(0);
  });

  it('vertraut keinem Feld ohne Pruefung', () => {
    // `as unknown as X` haengt `unknown` nur als Zwischenschritt ein, um TypeScripts
    // Pruefung der Zusicherung selbst zu umgehen — am Ende steht dieselbe unbewiesene
    // Behauptung wie bei `as X` direkt, deshalb zaehlt beides.
    const treffer = sucheImCode(
      INGEST,
      /\bas\s+(?:unknown\s+as\s+)?(Holdings|Transaktionsseite|Chart|Sparplaene|any)\b/,
    );
    expect(treffer, `Typzusicherung statt Pruefung:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('reicht keine unbekannten Felder durch', () => {
    // Ohne `.strict()` schneidet zod Unbekanntes ab; `.passthrough()` fuehrte es ungeprueft
    // im Ergebnis mit [ADR-030].
    const treffer = sucheImCode(INGEST, /\.passthrough\s*\(|\blooseObject\b|\.catchall\s*\(/);
    expect(treffer, `Ungepruefte Felder im Ergebnis:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('schreibt aus dem Ingest nichts in die Datenbank, was nicht durch eine Quelle kam', () => {
    // Die Schreibstellen kennen `Importdaten` — und die entsteht ausschliesslich aus
    // den Rueckgaben der Quellen, die alle durch `pruefe` gegangen sind.
    const schreibend = sucheImCode(INGEST, /repo\s*\.\s*\w+\s*\.\s*(schreibe|ersetze)/);
    const dateipfade = [...new Set(schreibend.map((t) => t.pfad))].sort();
    expect(dateipfade).toEqual(['ingest/importieren.ts', 'ingest/neuberechnung.ts']);
  });
});

describe('INV-12 — die Pruefung greift wirklich', () => {
  it('wirft einen SchemaFehler, der die Quelle nennt', () => {
    expect(() => pruefe('holdings', HoldingsAntwort, { unsinn: true })).toThrow(SchemaFehler);
    try {
      pruefe('holdings', HoldingsAntwort, { unsinn: true });
      expect.unreachable('Kein Fehler geworfen');
    } catch (f) {
      expect(f).toBeInstanceOf(SchemaFehler);
      expect((f as SchemaFehler).message).toContain('holdings');
    }
  });

  it('nennt in der Meldung keinen Inhalt', () => {
    // Ein Depotwert oder ein Kontostand darf nicht im Protokoll landen, auch nicht
    // als Teil einer Fehlermeldung.
    try {
      pruefe('holdings', z.object({ betrag: Geld }), { betrag: 'nicht-lesbar-4711' });
      expect.unreachable('Kein Fehler geworfen');
    } catch (f) {
      expect((f as Error).message).not.toContain('4711');
    }
  });

  it('nennt bei einem falschen enum-Wert nur den Pfad und den Code, nie den fremden Wert', () => {
    // zods eigene Meldung zu `invalid_value` zitiert den erhaltenen Wert woertlich —
    // genau das darf `pruefe` nicht durchreichen. [INV-12]
    const fremderWert = 'GEHEIMER-STATUS-4711';
    try {
      pruefe('holdings', z.object({ status: z.enum(['EXECUTED', 'CANCELED']) }), { status: fremderWert });
      expect.unreachable('Kein Fehler geworfen');
    } catch (f) {
      expect(f).toBeInstanceOf(SchemaFehler);
      expect((f as Error).message).not.toContain(fremderWert);
      expect((f as Error).message).toContain('status');
    }
  });

  it('nennt bei einem unbekannten Schluessel nur harmlose Namen, aber keinen Wert', () => {
    // Auch der Schluessel ist fremder Text: ein harmloser Name bleibt lesbar, alles andere
    // (Steuerzeichen, zu lang) wird zu `?`. Der Wert dahinter erscheint nie. [INV-12]
    const harmlos = 'geheimesInternesFeld4711';
    const escape = '\u001b[31mrot';
    const lang = 'x'.repeat(200);
    try {
      pruefe('holdings', z.object({ status: z.string() }).strict(), {
        status: 'ok',
        [harmlos]: 'GEHEIMER-WERT-4711',
        [escape]: true,
        [lang]: true,
      });
      expect.unreachable('Kein Fehler geworfen');
    } catch (f) {
      expect(f).toBeInstanceOf(SchemaFehler);
      const text = (f as Error).message;
      expect(text).toContain('unrecognized_keys');
      expect(text).toContain(`(${harmlos}, ?, ?)`);
      expect(text).not.toContain('\u001b');
      expect(text).not.toContain(lang);
      expect(text).not.toContain('GEHEIMER-WERT-4711');
    }
  });

  it('nennt hoechstens fuenf unbekannte Schluessel', () => {
    const roh = Object.fromEntries(Array.from({ length: 9 }, (_, n) => [`feld${String(n)}`, 1]));
    try {
      pruefe('holdings', z.object({}).strict(), roh);
      expect.unreachable('Kein Fehler geworfen');
    } catch (f) {
      const text = (f as Error).message;
      expect(text).toContain('feld4');
      expect(text).not.toContain('feld5');
    }
  });

  it('lehnt eine ISIN ab, die keine ist', () => {
    for (const kaputt of ['', 'DE', 'ie00b4l5y983', 'IE00B4L5Y98', 'IE00B4L5Y983X', '<script>']) {
      expect(Isin.safeParse(kaputt).success, kaputt).toBe(false);
    }
    expect(Isin.safeParse('IE00B4L5Y983').success).toBe(true);
  });

  it('macht aus einer Zahl-Zeichenkette eine bigint, ohne parseFloat', () => {
    expect(Geld.parse('10.671')).toBe(1067n);
    expect(Geld.parse(0.1 + 0.2)).toBe(30n);
    expect(typeof Geld.parse('1')).toBe('bigint');
  });

  it('weist eine unlesbare Zahl als Befund zurueck, nicht als Ausnahme', () => {
    const ergebnis = Geld.safeParse('zwölf euro');
    expect(ergebnis.success).toBe(false);
  });

  it('deckelt jede Liste, damit eine Antwort den Speicher nicht sprengt', () => {
    for (const [name, grenze] of Object.entries(GRENZE)) {
      expect(grenze, `GRENZE.${name} ist nicht gesetzt`).toBeGreaterThan(0);
    }
    const zuLang = { positions: Array.from({ length: GRENZE.positionen + 1 }, () => ({})) };
    expect(HoldingsAntwort.safeParse(zuLang).success, 'Eine zu lange Liste kommt durch').toBe(false);
  });

  it('laesst kein unbekanntes Feld in die Datenbank durchsickern', () => {
    // Eine echte, gueltige Zeile im `cash`-Zweig — erst geprueft, dass sie fuer sich
    // allein durchgeht, dann mit genau einem zusaetzlichen Feld. `.strict()` lehnt die
    // zweite komplett ab statt das fremde Feld still wegzuschneiden: unbekannt heisst
    // hier "die ganze Zeile ist verdaechtig", nicht "ein Feld ignorieren".
    const zeile = {
      id: 'x1',
      kind: 'cash' as const,
      category: 'sonstiges',
      status: 'EXECUTED',
      currency: 'EUR',
      isCancellation: false,
      lastEventAt: '2026-01-05T10:00:00+01:00',
      description: null,
      custodian: 'Scalable',
      security: null,
      cash: { relatedIsin: null, transactionType: 'DEPOSIT', amount: '100' },
      nonTradeSecurity: null,
      eltif: null,
    };
    expect(Transaktionszeile.safeParse(zeile).success, 'die gueltigen Felder allein haetten parsen muessen').toBe(
      true,
    );
    const mitExtrafeld = { ...zeile, boesesExtrafeld: '<script>alert(1)</script>' };
    expect(
      Transaktionszeile.safeParse(mitExtrafeld).success,
      'ein unbekanntes Feld haette das strikte Schema ablehnen muessen',
    ).toBe(false);
  });

  it('haelt Fremdtext als Text — auch wenn er wie Markup aussieht', () => {
    const name = '<img src=x onerror=alert(1)>';
    const ergebnis = z.object({ name: z.string().max(GRENZE.name) }).safeParse({ name });
    expect(ergebnis.success).toBe(true);
    expect(ergebnis.success && ergebnis.data.name, 'Der Text wurde unterwegs veraendert').toBe(name);
  });
});
