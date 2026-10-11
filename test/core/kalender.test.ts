import { describe, expect, it } from 'vitest';
import {
  KalenderFehler,
  ZEITZONE,
  alsTag,
  frueher,
  istVor,
  istWochenende,
  monatVon,
  monateZwischen,
  monatsAnfang,
  monatsEnde,
  monatsSpanne,
  plusTage,
  spaeter,
  spanne,
  tageImMonat,
  tageZwischen,
  tagAus,
  vergleiche,
} from '../../core/kalender.ts';

describe('alsTag', () => {
  it('nimmt gueltige Tage an', () => {
    expect(alsTag('2026-08-26')).toBe('2026-08-26');
    expect(alsTag('2024-02-29')).toBe('2024-02-29');
  });

  it('weist ab, was kein Kalendertag ist', () => {
    for (const kaputt of ['2026-8-26', '26.08.2026', '2026-08-26T00:00:00Z', '', 'heute']) {
      expect(() => alsTag(kaputt), kaputt).toThrow(KalenderFehler);
    }
  });

  it('weist Tage ab, die es nicht gibt', () => {
    expect(() => alsTag('2026-13-01')).toThrow(/Monat/);
    expect(() => alsTag('2026-00-01')).toThrow(/Monat/);
    expect(() => alsTag('2026-02-30')).toThrow(/gibt es nicht/);
    expect(() => alsTag('2025-02-29')).toThrow(/gibt es nicht/);
    expect(() => alsTag('2026-04-31')).toThrow(/gibt es nicht/);
    expect(() => alsTag('2026-01-00')).toThrow(/gibt es nicht/);
  });
});

describe('tagAus', () => {
  it('nennt den Berliner Kalendertag, nicht den UTC-Tag', () => {
    // 23:30 UTC ist in Berlin bereits der Folgetag — im Winter wie im Sommer.
    expect(tagAus('2026-01-15T23:30:00Z')).toBe('2026-01-16');
    expect(tagAus('2026-07-15T23:30:00Z')).toBe('2026-07-16');
    // 00:30 Berliner Zeit bleibt der Berliner Tag, auch wenn UTC noch gestern ist.
    expect(tagAus('2026-01-16T00:30:00+01:00')).toBe('2026-01-16');
  });

  it('bleibt an der Zeitumstellung stehen', () => {
    // Sommerzeit beginnt am 29.03.2026 um 02:00 Berliner Zeit.
    expect(tagAus('2026-03-29T00:30:00Z')).toBe('2026-03-29');
    expect(tagAus('2026-03-29T01:30:00Z')).toBe('2026-03-29');
    // Winterzeit beginnt am 25.10.2026.
    expect(tagAus('2026-10-25T00:30:00Z')).toBe('2026-10-25');
  });

  it('laesst einen bereits kurzen Tag unveraendert durch', () => {
    expect(tagAus('2026-08-26')).toBe('2026-08-26');
    expect(tagAus('  2026-08-26  ')).toBe('2026-08-26');
  });

  it('weist zurueck, was kein Zeitstempel ist', () => {
    expect(() => tagAus('irgendwann')).toThrow(KalenderFehler);
  });

  it('haelt die Zeitzone fest', () => {
    expect(ZEITZONE).toBe('Europe/Berlin');
  });
});

describe('tageImMonat', () => {
  it('kennt die Schaltjahrregel vollstaendig', () => {
    expect(tageImMonat(2024, 2)).toBe(29);
    expect(tageImMonat(2025, 2)).toBe(28);
    expect(tageImMonat(1900, 2)).toBe(28);
    expect(tageImMonat(2000, 2)).toBe(29);
    expect(tageImMonat(2026, 1)).toBe(31);
    expect(tageImMonat(2026, 4)).toBe(30);
  });

  it('faellt bei einem Monat ausserhalb 1..12 auf 31 zurueck', () => {
    // tageImMonat validiert selbst nicht (das tut alsTag vorher) — ruft man es
    // trotzdem direkt mit einem unmoeglichen Monat auf, greift die Rueckfallzahl.
    expect(tageImMonat(2026, 13)).toBe(31);
    expect(tageImMonat(2026, 0)).toBe(31);
  });
});

describe('plusTage und tageZwischen', () => {
  it('rechnet ueber Monats- und Jahresgrenzen', () => {
    expect(plusTage(alsTag('2026-01-31'), 1)).toBe('2026-02-01');
    expect(plusTage(alsTag('2026-12-31'), 1)).toBe('2027-01-01');
    expect(plusTage(alsTag('2024-02-28'), 1)).toBe('2024-02-29');
    expect(plusTage(alsTag('2025-02-28'), 1)).toBe('2025-03-01');
    expect(plusTage(alsTag('2026-03-01'), -1)).toBe('2026-02-28');
  });

  it('zaehlt die Zeitumstellung nicht als halben Tag', () => {
    // Ein Tag ist ein Kalendertag, keine 86.400.000 Millisekunden.
    expect(tageZwischen(alsTag('2026-03-28'), alsTag('2026-03-30'))).toBe(2);
    expect(tageZwischen(alsTag('2026-10-24'), alsTag('2026-10-26'))).toBe(2);
    expect(plusTage(alsTag('2026-03-28'), 1)).toBe('2026-03-29');
    expect(plusTage(alsTag('2026-10-24'), 1)).toBe('2026-10-25');
  });

  it('ist zu tageZwischen invers', () => {
    const start = alsTag('2021-06-14');
    for (const n of [0, 1, 17, 365, 366, 1000, -1, -400]) {
      expect(tageZwischen(start, plusTage(start, n))).toBe(n);
    }
  });

  it('zaehlt ein Schaltjahr mit 366 Tagen', () => {
    expect(tageZwischen(alsTag('2024-01-01'), alsTag('2025-01-01'))).toBe(366);
    expect(tageZwischen(alsTag('2025-01-01'), alsTag('2026-01-01'))).toBe(365);
  });
});

describe('vergleichen', () => {
  it('ordnet Tage', () => {
    const a = alsTag('2026-01-01');
    const b = alsTag('2026-06-01');
    expect(vergleiche(a, b)).toBe(-1);
    expect(vergleiche(b, a)).toBe(1);
    expect(vergleiche(a, a)).toBe(0);
    expect(istVor(a, b)).toBe(true);
    expect(istVor(b, a)).toBe(false);
    expect(frueher(a, b)).toBe(a);
    expect(frueher(b, a)).toBe(a);
    expect(spaeter(a, b)).toBe(b);
    expect(spaeter(b, a)).toBe(b);
  });
});

describe('spanne', () => {
  it('schliesst beide Enden ein', () => {
    expect(spanne(alsTag('2026-02-27'), alsTag('2026-03-02'))).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
  });

  it('ergibt einen Tag, wenn von gleich bis', () => {
    expect(spanne(alsTag('2026-01-01'), alsTag('2026-01-01'))).toEqual(['2026-01-01']);
  });

  it('ergibt nichts, wenn bis vor von liegt', () => {
    expect(spanne(alsTag('2026-01-02'), alsTag('2026-01-01'))).toEqual([]);
  });
});

describe('Monate', () => {
  it('nennt Monat, Anfang und Ende', () => {
    expect(monatVon(alsTag('2026-08-26'))).toBe('2026-08');
    expect(monatsAnfang('2026-08')).toBe('2026-08-01');
    expect(monatsEnde('2026-08')).toBe('2026-08-31');
    expect(monatsEnde('2026-02')).toBe('2026-02-28');
    expect(monatsEnde('2024-02')).toBe('2024-02-29');
    expect(monatsEnde('2026-04')).toBe('2026-04-30');
  });

  it('spannt Monate ueber den Jahreswechsel', () => {
    expect(monatsSpanne('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monatsSpanne('2026-03', '2026-03')).toEqual(['2026-03']);
    expect(monatsSpanne('2026-04', '2026-03')).toEqual([]);
  });

  it('zaehlt Monate als Differenz', () => {
    expect(monateZwischen('2025-11', '2026-02')).toBe(3);
    expect(monateZwischen('2026-02', '2026-02')).toBe(0);
    expect(monateZwischen('2026-02', '2025-11')).toBe(-3);
  });
});

describe('istWochenende', () => {
  it('kennt Samstag und Sonntag', () => {
    expect(istWochenende(alsTag('2026-08-29'))).toBe(true); // Samstag
    expect(istWochenende(alsTag('2026-08-30'))).toBe(true); // Sonntag
    expect(istWochenende(alsTag('2026-08-28'))).toBe(false); // Freitag
    expect(istWochenende(alsTag('2026-08-31'))).toBe(false); // Montag
    expect(istWochenende(alsTag('1970-01-01'))).toBe(false); // Donnerstag
    expect(istWochenende(alsTag('1969-12-28'))).toBe(true); // Sonntag vor der Epoche
  });
});
