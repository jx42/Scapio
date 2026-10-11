/**
 * INV-03 — Ein Kalendertag ist `YYYY-MM-DD` in Europe/Berlin, immer ueber `core/kalender.ts`.
 *
 * Ein Kauf am 31.12. um 23:30 Berliner Zeit ist ein Kauf vom 31.12., nicht vom 30.12.
 * Wer den Tag mit `toISOString().slice(0, 10)` bildet, bekommt auf einem Rechner in
 * Kalifornien eine andere Historie als hier. Deshalb gibt es genau eine Stelle, an der
 * aus einem Zeitpunkt ein Tag wird.
 */

import { describe, expect, it } from 'vitest';
import { ZEITZONE, alsTag, monatVon, plusTage, tagAus, tageZwischen } from '../../core/kalender.ts';
import { AUSGELIEFERT, alsListe, dateien, suche, sucheImCode } from './quellen.ts';

const QUELLEN = dateien(AUSGELIEFERT);
const AUSSER_KALENDER = QUELLEN.filter((q) => q.pfad !== 'core/kalender.ts');

describe('INV-03 — der Tag kommt aus dem Kalender', () => {
  it('bildet nirgends einen Tag aus einer ISO-Zeichenkette von Hand', () => {
    const treffer = suche(AUSSER_KALENDER, /toISOString\s*\(\s*\)\s*\.\s*(slice|substring|substr|split)/);
    expect(treffer, `Tag von Hand aus ISO geschnitten:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('liest nirgends Datumsteile aus einem Date, ausser im Kalender', () => {
    const treffer = suche(AUSSER_KALENDER, /\.(getFullYear|getMonth|getDate|getUTCFullYear|getUTCMonth|getUTCDate)\s*\(/);
    expect(treffer, `Datumsteile ausserhalb des Kalenders:\n${alsListe(treffer)}`).toEqual([]);
  });

  // Die beiden Fehler, die sonst nur der Lauf unter fremder Zone fand: ein Datum aus
  // Ortszeit-Bestandteilen, und eine Ausgabe in der Zone des Rechners. [ADR-050]
  it('baut kein Date aus Ortszeit-Bestandteilen', () => {
    const treffer = sucheImCode(QUELLEN, /new\s+Date\s*\([^()]*,/);
    expect(treffer, `Date aus Jahr, Monat, Tag in Ortszeit:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('gibt kein Datum in der Zone des Rechners aus', () => {
    const treffer = sucheImCode(QUELLEN, /\.toLocale(Date|Time)?String\s*\(\s*(['"`][^'"`]*['"`]\s*)?\)/);
    expect(treffer, `Datumsausgabe ohne timeZone:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('nennt in jedem DateTimeFormat die Zeitzone', () => {
    const ohne: string[] = [];
    for (const q of QUELLEN) {
      for (const m of q.inhalt.matchAll(/new\s+Intl\.DateTimeFormat\s*\(/g)) {
        const aufruf = q.inhalt.slice(m.index, q.inhalt.indexOf(')', m.index + m[0].length) + 1);
        if (!aufruf.includes('timeZone')) ohne.push(`  ${q.pfad}:${String(q.inhalt.slice(0, m.index).split('\n').length)}`);
      }
    }
    expect(ohne, `DateTimeFormat ohne timeZone:\n${ohne.join('\n')}`).toEqual([]);
  });

  it('bindet die Zeitzone nur im Kalender und in der Anzeigeformatierung', () => {
    // In Kommentaren darf die Zone stehen, sie erklaert dort etwas. Als Wert darf sie
    // an genau zwei Stellen auftauchen: im Kalender, der den Tag bildet, und in
    // `src/lib/format.ts`, das einen Zeitstempel fuer die Anzeige durch `Intl` schickt.
    // Die Oberflaeche importiert bewusst nichts aus `core/` — sie rechnet nicht —,
    // deshalb ist die zweite Nennung eine Kopie und keine Ableitung. Der naechste Test
    // haelt beide aneinander, damit sie nicht auseinanderlaufen koennen.
    const code = AUSSER_KALENDER.filter((q) => q.pfad !== 'src/lib/format.ts');
    const treffer = suche(code, /['"`]Europe\/Berlin['"`]/);
    expect(treffer, `Zeitzone als Wert ausserhalb der zwei erlaubten Stellen:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('haelt die Anzeigezone auf demselben Wert wie der Kalender', () => {
    const format = QUELLEN.find((q) => q.pfad === 'src/lib/format.ts');
    expect(format, 'src/lib/format.ts fehlt').toBeDefined();
    const gefunden = /const ZEITZONE = '([^']+)'/.exec(format?.inhalt ?? '');
    expect(gefunden?.[1], 'Die Oberflaeche formatiert in einer anderen Zone als der Kern rechnet').toBe(ZEITZONE);
    expect(ZEITZONE).toBe('Europe/Berlin');
  });

  it('haelt den Rechenkern frei von `new Date`', () => {
    const kern = QUELLEN.filter((q) => q.pfad.startsWith('core/') && q.pfad !== 'core/kalender.ts');
    const treffer = suche(kern, /new\s+Date\s*\(|Date\s*\.\s*(now|parse|UTC)\s*\(/);
    expect(treffer, `Uhr im Rechenkern:\n${alsListe(treffer)}`).toEqual([]);
  });
});

describe('INV-03 — der Tag ist Berliner Zeit', () => {
  it('schlaegt den Tageswechsel auf die Berliner Seite', () => {
    // 23:30 UTC am 15. ist in Berlin schon der 16.
    expect(tagAus('2026-01-15T23:30:00Z')).toBe('2026-01-16');
    // 00:30 UTC am 16. ist in Berlin der 16., im Sommer wie im Winter.
    expect(tagAus('2026-01-16T00:30:00Z')).toBe('2026-01-16');
    expect(tagAus('2026-07-15T22:30:00Z')).toBe('2026-07-16');
  });

  it('nimmt den Offset ernst, den die Bank mitschickt', () => {
    expect(tagAus('2026-01-01T00:30:00+01:00')).toBe('2026-01-01');
    expect(tagAus('2025-12-31T23:30:00-05:00')).toBe('2026-01-01');
  });

  it('ueberlebt beide Zeitumstellungen', () => {
    expect(plusTage(alsTag('2026-03-28'), 1)).toBe('2026-03-29');
    expect(plusTage(alsTag('2026-03-29'), 1)).toBe('2026-03-30');
    expect(plusTage(alsTag('2026-10-24'), 1)).toBe('2026-10-25');
    expect(plusTage(alsTag('2026-10-25'), 1)).toBe('2026-10-26');
    expect(tageZwischen(alsTag('2026-03-28'), alsTag('2026-03-30'))).toBe(2);
    expect(tageZwischen(alsTag('2026-10-24'), alsTag('2026-10-26'))).toBe(2);
  });

  it('weist alles zurueck, was nicht YYYY-MM-DD ist', () => {
    for (const kaputt of ['2026-1-1', '26-01-01', '2026/01/01', '2026-01-32', '2026-02-30', '', 'heute']) {
      expect(() => alsTag(kaputt), kaputt).toThrow();
    }
  });

  it('bildet den Monat aus dem Tag, nicht aus einer Uhr', () => {
    expect(monatVon(alsTag('2026-12-31'))).toBe('2026-12');
  });

  it('haengt nicht an der Zeitzone des Rechners — dieselbe Suite laeuft unter TZ=UTC und TZ=Pacific/Kiritimati', () => {
    // `npm run test:tz` fuehrt genau diese Datei unter drei Zeitzonen aus.
    // Hier steht nur, was in jeder von ihnen gelten muss.
    expect(tagAus('2026-01-15T23:30:00Z')).toBe('2026-01-16');
    expect(alsTag('2026-01-16')).toBe('2026-01-16');
  });
});
