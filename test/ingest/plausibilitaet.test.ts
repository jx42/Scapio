/**
 * Die Zeilen der Pruefliste aus Bauanleitung 6.4 — je Zeile ein Test fuer den guten und
 * einer fuer den schlechten Fall, und vor allem: der Beleg, dass genau die beiden ersten
 * Zeilen abbrechen und alle anderen nur einen Hinweis hinterlassen.
 *
 * Der Unterschied ist die eigentliche Aussage dieser Datei. Ein Lauf, der wegen einer
 * um 2 € danebenliegenden Wertsumme abbricht, zeigt gar keine Zahl; ein Lauf,
 * der eine negative Menge durchwinkt, zeigt eine falsche.
 */

import { describe, expect, it } from 'vitest';
import type { Cent, KursE6, MengeE8 } from '../../core/dezimal.ts';
import { zuCent } from '../../core/dezimal.ts';
import type { Tag } from '../../core/kalender.ts';
import type { Isin } from '../../core/typen.ts';
import {
  Befunde,
  FRUEHESTER_TAG,
  meldeSpruenge,
  PlausibilitaetsFehler,
  pruefeHistorienbeginn,
  pruefeKurs,
  pruefeMenge,
  pruefeSummen,
  pruefeUebertraege,
  pruefeVpiReihe,
  tagIstBrauchbar,
} from '../../ingest/plausibilitaet.ts';
import { uebertragRaus, uebertragRein } from '../hilfen.ts';

const T = (s: string): Tag => s as Tag;
const HEUTE = T('2026-08-26');

describe('Befunde', () => {
  it('sammelt und wiederholt sich nicht', () => {
    const b = new Befunde();
    expect(b.leer).toBe(true);
    b.hinweis('storniert', { anzahl: 1 });
    b.hinweis('storniert', { anzahl: 1 });
    b.hinweis('storniert', { anzahl: 2 });
    expect(b.hinweise).toEqual([
      { art: 'storniert', werte: { anzahl: 1 } },
      { art: 'storniert', werte: { anzahl: 2 } },
    ]);
    expect(b.leer).toBe(false);
  });
});

describe('Zeile 1: Menge >= 0, Kurs > 0 — Abbruch', () => {
  it('laesst null und positive Mengen durch', () => {
    expect(() => pruefeMenge('holdings', 'IE00B4L5Y983', 0n as MengeE8)).not.toThrow();
    expect(() => pruefeMenge('holdings', 'IE00B4L5Y983', 100n as MengeE8)).not.toThrow();
  });

  it('bricht bei negativer Menge ab', () => {
    const fehler = fangen(() => pruefeMenge('holdings', 'IE00B4L5Y983', -1n as MengeE8));
    expect(fehler).toBeInstanceOf(PlausibilitaetsFehler);
    expect((fehler as PlausibilitaetsFehler).code).toBe('E_PLAUSIBEL');
    expect((fehler as PlausibilitaetsFehler).quelle).toBe('holdings');
  });

  it('bricht bei Kurs <= 0 ab, auch bei genau 0', () => {
    expect(() => pruefeKurs('chart', 'IE00B4L5Y983', 1n as KursE6)).not.toThrow();
    expect(() => pruefeKurs('chart', 'IE00B4L5Y983', 0n as KursE6)).toThrowError(PlausibilitaetsFehler);
    expect(() => pruefeKurs('chart', 'IE00B4L5Y983', -1n as KursE6)).toThrowError(PlausibilitaetsFehler);
  });
});

describe('Zeile 2: Datum nicht in der Zukunft, nicht vor 2015 — verwerfen', () => {
  it('behaelt einen Tag in der Spanne, Raender eingeschlossen', () => {
    const b = new Befunde();
    expect(tagIstBrauchbar(b, 'chart', FRUEHESTER_TAG, HEUTE)).toBe(true);
    expect(tagIstBrauchbar(b, 'chart', HEUTE, HEUTE)).toBe(true);
    expect(b.leer).toBe(true);
  });

  it('verwirft einen Tag vor 2015 mit Hinweis, ohne zu werfen', () => {
    const b = new Befunde();
    expect(tagIstBrauchbar(b, 'chart', T('2014-12-31'), HEUTE)).toBe(false);
    expect(b.hinweise).toEqual([{ art: 'punkteZuFrueh', werte: { quelle: 'chart', grenze: FRUEHESTER_TAG } }]);
  });

  it('verwirft einen Tag in der Zukunft mit Hinweis', () => {
    const b = new Befunde();
    expect(tagIstBrauchbar(b, 'chart', T('2026-08-27'), HEUTE)).toBe(false);
    expect(b.hinweise).toEqual([{ art: 'punkteInZukunft', werte: { quelle: 'chart' } }]);
  });

  it('meldet hundert verworfene Punkte als einen Hinweis', () => {
    const b = new Befunde();
    for (let i = 1; i <= 100; i += 1) tagIstBrauchbar(b, 'chart', T(`2014-01-${String(i % 28 + 1).padStart(2, '0')}`), HEUTE);
    expect(b.hinweise).toHaveLength(1);
  });
});

describe('Zeile 4: Positionswerte + Cash = Gesamtwert ± 1 € — Hinweis', () => {
  const positionen = [zuCent('1000.00'), zuCent('2000.00')] as Cent[];
  /** Der Regelfall: die Bank hat nach dem letzten Kurs gerechnet, beide Seiten sind vergleichbar. */
  const VERGLEICHBAR = {
    kurseAus: '2026-09-04T20:59:58.692Z',
    gesamtAus: '2026-09-05T19:06:53.595Z',
    laufAb: '2026-09-07T19:00:00.000Z',
  };

  it('schweigt bei einer Abweichung von genau 1 €', () => {
    const b = new Befunde();
    pruefeSummen(b, positionen, zuCent('500.00') as Cent, zuCent('3499.00') as Cent, VERGLEICHBAR);
    expect(b.leer).toBe(true);
  });

  it('meldet eine groessere Abweichung — mit Groessenordnung statt Betrag', () => {
    const b = new Befunde();
    pruefeSummen(b, positionen, zuCent('500.00') as Cent, zuCent('2400.00') as Cent, VERGLEICHBAR);
    // Der Betrag selbst gehoert nicht in einen Hinweis, der in der Oberflaeche landet.
    expect(b.hinweise).toEqual([{ art: 'summenAbweichung', werte: { zehnerpotenz: 3 } }]);
  });

  it('schweigt, wenn ein Kurs juenger ist als der Gesamtwert der Bank', () => {
    // Der beobachtete Alltag: die Bank hat Freitagabend gerechnet, die Kurse laufen am
    // Montag weiter. Die Abweichung ist dann der Kursgang, kein Befund. [ADR-015]
    const b = new Befunde();
    pruefeSummen(b, positionen, zuCent('500.00') as Cent, zuCent('2400.00') as Cent, {
      kurseAus: '2026-09-07T10:21:24.134Z',
      gesamtAus: '2026-09-05T19:06:53.595Z',
      laufAb: VERGLEICHBAR.laufAb,
    });
    expect(b.leer).toBe(true);
  });

  it('schweigt, wenn die Bank live bewertet — ihr Stand faellt in den Lauf', () => {
    // Beobachtet am 28.09.2026 um 21:21: Kurse bis 19:21:41Z, Bewertung 19:21:50Z, Lauf ab
    // 19:21:46Z. Die Differenz (4,13 €, im Lauf davor −3,71 €) war Kursgang. [ADR-033]
    const b = new Befunde();
    pruefeSummen(b, positionen, zuCent('500.00') as Cent, zuCent('2400.00') as Cent, {
      kurseAus: '2026-09-28T19:21:41.850Z',
      gesamtAus: '2026-09-28T19:21:50.184Z',
      laufAb: '2026-09-28T19:21:46.381Z',
    });
    expect(b.leer).toBe(true);
  });

  it('prueft einen Schlussstand, der vor dem Lauf feststand', () => {
    const b = new Befunde();
    pruefeSummen(b, positionen, zuCent('500.00') as Cent, zuCent('2400.00') as Cent, {
      kurseAus: '2026-09-25T20:59:56.404Z',
      gesamtAus: '2026-09-25T21:00:00.000Z',
      laufAb: '2026-09-27T19:29:27.008Z',
    });
    expect(b.hinweise).toHaveLength(1);
  });

  it('prueft weiter, wenn Kurse und Gesamtwert auf dieselbe Sekunde fallen', () => {
    const b = new Befunde();
    const gleich = '2026-09-05T19:06:53.595Z';
    pruefeSummen(b, positionen, zuCent('500.00') as Cent, zuCent('2400.00') as Cent, {
      kurseAus: gleich,
      gesamtAus: gleich,
      laufAb: VERGLEICHBAR.laufAb,
    });
    expect(b.hinweise).toHaveLength(1);
  });

  it('prueft weiter, wenn ein Zeitstempel fehlt oder unlesbar ist', () => {
    // Eine Selbstkontrolle, die sich bei jeder Unklarheit abschaltet, kontrolliert nichts.
    for (const stand of [
      { kurseAus: null, gesamtAus: '2026-09-05T19:06:53.595Z', laufAb: VERGLEICHBAR.laufAb },
      { kurseAus: '2026-09-07T10:21:24.134Z', gesamtAus: null, laufAb: VERGLEICHBAR.laufAb },
      { kurseAus: 'gestern', gesamtAus: '2026-09-05T19:06:53.595Z', laufAb: VERGLEICHBAR.laufAb },
      { kurseAus: '2026-09-04T20:59:58.692Z', gesamtAus: '2026-09-05T19:06:53.595Z', laufAb: null },
    ]) {
      const b = new Befunde();
      pruefeSummen(b, positionen, zuCent('500.00') as Cent, zuCent('2400.00') as Cent, stand);
      expect(b.hinweise).toHaveLength(1);
    }
  });
});

describe('Zeile 5: Tagessprung > 30 % — auffaellig, Hinweis, kein Abbruch', () => {
  it('schweigt ohne auffaellige Kurse', () => {
    const b = new Befunde();
    meldeSpruenge(b, new Set());
    expect(b.leer).toBe(true);
  });

  it('meldet Anzahl und Zeitraum, ein Hinweis je ISIN', () => {
    const b = new Befunde();
    meldeSpruenge(b, new Set(['IE00B4L5Y983 2020-03-12', 'IE00B4L5Y983 2020-03-16', 'DE000A0S9GB0 2024-08-05']));
    expect(b.hinweise).toEqual([
      { art: 'tagessprung', werte: { isin: 'DE000A0S9GB0', name: null, anzahl: 1, von: '2024-08-05', bis: '2024-08-05' } },
      { art: 'tagessprung', werte: { isin: 'IE00B4L5Y983', name: null, anzahl: 2, von: '2020-03-12', bis: '2020-03-16' } },
    ]);
  });

  it('nutzt den Fondsnamen statt der ISIN, wenn bekannt', () => {
    const b = new Befunde();
    meldeSpruenge(b, new Set(['IE00B4L5Y983 2020-03-12']), new Map([['IE00B4L5Y983', 'iShares Core MSCI World']]));
    expect(b.hinweise[0]!.werte).toMatchObject({ name: 'iShares Core MSCI World' });
  });
});

describe('Zeile 6: Transaktionsliste beginnt nach dem ersten Kauf — Hinweis', () => {
  it('schweigt, wenn die Liste frueh genug beginnt', () => {
    const b = new Befunde();
    pruefeHistorienbeginn(b, T('2019-01-02'), T('2019-01-02'));
    expect(b.leer).toBe(true);
  });

  it('schweigt, wenn eine der beiden Angaben fehlt', () => {
    const b = new Befunde();
    pruefeHistorienbeginn(b, null, T('2019-01-02'));
    pruefeHistorienbeginn(b, T('2019-01-02'), null);
    expect(b.leer).toBe(true);
  });

  it('meldet die Luecke und nennt seed.json', () => {
    // Ohne diesen Hinweis waere die kumulierte Einzahlung zu klein und jede
    // Rendite zu gross — der Fehler, der am ehesten unbemerkt bliebe.
    const b = new Befunde();
    pruefeHistorienbeginn(b, T('2021-06-01'), T('2019-01-02'));
    expect(b.hinweise).toEqual([
      { art: 'historienbeginn', werte: { ersterTransaktionsTag: '2021-06-01', ersterKaufTag: '2019-01-02' } },
    ]);
  });
});

describe('Zeile 7: Monatssprung des Verbraucherpreisindex > 3 % — Hinweis', () => {
  const reihe = [
    { monat: '2026-05', indexWert: 129.2 },
    { monat: '2026-06', indexWert: 129.4 },
    { monat: '2026-07', indexWert: 129.6 },
  ];

  it('schweigt bei einer normalen Preisentwicklung', () => {
    const b = new Befunde();
    pruefeVpiReihe(b, reihe);
    expect(b.leer).toBe(true);
  });

  it('schweigt bei einer leeren oder einelementigen Reihe', () => {
    const b = new Befunde();
    pruefeVpiReihe(b, []);
    pruefeVpiReihe(b, [{ monat: '2026-07', indexWert: 129.6 }]);
    expect(b.leer).toBe(true);
  });

  it('meldet die Naht, wenn eine Umbasierung misslingt', () => {
    // Genau der Fall, gegen den es geht: der nachgefuellte Rand landet auf der falschen
    // Basis. In der Oberflaeche waere das nicht zu sehen — die Realrendite waere nur falsch.
    const b = new Befunde();
    pruefeVpiReihe(b, [...reihe, { monat: '2026-08', indexWert: 103.84 }]);
    expect(b.hinweise).toEqual([{ art: 'vpiSprung', werte: { monate: ['2026-08'], schwelleProzent: 3 } }]);
  });

  it('sieht die Reihe unabhaengig von ihrer Reihenfolge', () => {
    const b = new Befunde();
    pruefeVpiReihe(b, [{ monat: '2026-08', indexWert: 103.84 }, ...reihe]);
    expect(b.hinweise).toHaveLength(1);
  });
});

describe('die Trennlinie zwischen Abbruch und Hinweis', () => {
  it('wirft nur in den beiden Faellen aus Zeile 1', () => {
    const b = new Befunde();
    // Alles hier ist grob falsch — und nichts davon darf den Lauf beenden.
    expect(() => {
      tagIstBrauchbar(b, 'chart', T('1999-01-01'), HEUTE);
      pruefeSummen(b, [zuCent('1.00') as Cent], 0n as Cent, zuCent('99999.00') as Cent, {
        kurseAus: null,
        gesamtAus: null,
        laufAb: null,
      });
      meldeSpruenge(b, new Set(['IE00B4L5Y983 2020-03-12']));
      pruefeHistorienbeginn(b, T('2021-06-01'), T('2019-01-02'));
      pruefeVpiReihe(b, [
        { monat: '2026-07', indexWert: 129.6 },
        { monat: '2026-08', indexWert: 103.84 },
      ]);
    }).not.toThrow();
    expect(b.hinweise).toHaveLength(5);
  });
});

function fangen(f: () => void): unknown {
  try {
    f();
    return null;
  } catch (fehler) {
    return fehler;
  }
}

describe('Zeile 6b: Uebertrag herein ohne Wert — Hinweis [ADR-043]', () => {
  const isin = 'IE00B4L5Y983' as Isin;

  it('meldet einen unverpaarten Eingang mit Betrag 0', () => {
    const b = new Befunde();
    pruefeUebertraege(b, [uebertragRein('2024-03-12', isin, '10', '0')]);
    expect(b.hinweise).toEqual([{ art: 'uebertragOhneWert', werte: { isin, tag: '2024-03-12' } }]);
  });

  it('schweigt bei einem Paar und bei einem Eingang mit Wert', () => {
    const b = new Befunde();
    pruefeUebertraege(b, [
      uebertragRaus('2024-03-10', isin, '10', '0'),
      uebertragRein('2024-03-12', isin, '10', '0'),
      uebertragRein('2024-05-02', isin, '5', '500'),
    ]);
    expect(b.hinweise).toEqual([]);
  });
});
