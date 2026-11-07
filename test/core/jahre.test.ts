import { describe, expect, it } from 'vitest';
import { jahresuebersicht, type JahreEingaben } from '../../core/jahre.ts';
import { zuCent } from '../../core/dezimal.ts';
import { twr } from '../../core/twr.ts';
import { depotTag, fluss } from '../hilfen.ts';

function eingaben(teil: Partial<JahreEingaben>): JahreEingaben {
  return { reihe: [], externe: [], vergleichsreihe: null, vpi: new Map(), ...teil };
}

const eingezahlt = (euro: string) => ({ nettoEinzahlungKumCent: zuCent(euro) });

describe('jahresuebersicht', () => {
  it('ist leer ohne Reihe', () => {
    expect(jahresuebersicht(eingaben({}))).toEqual([]);
  });

  it('teilt nach Kalenderjahr, aeltestes zuerst, und markiert angebrochene Jahre', () => {
    const zeilen = jahresuebersicht(
      eingaben({
        reihe: [
          depotTag('2024-03-01', '1000', eingezahlt('1000')),
          depotTag('2024-12-31', '1100', eingezahlt('1000')),
          depotTag('2025-06-30', '1210', eingezahlt('1000')),
        ],
        externe: [fluss('2024-03-01', '1000')],
      }),
    );
    expect(zeilen.map((z) => z.jahr)).toEqual(['2024', '2025']);
    expect(zeilen[0]!.ab).toBe('2024-03-01');
    expect(zeilen[0]!.bis).toBeNull();
    expect(zeilen[1]!.ab).toBeNull();
    expect(zeilen[1]!.bis).toBe('2025-06-30');
    expect(zeilen[0]!.twr).toBeCloseTo(0.1, 12);
    expect(zeilen[1]!.twr).toBeCloseTo(0.1, 12);
    expect(zeilen[0]!.gewinnCent).toBe(10000n);
    expect(zeilen[1]!.gewinnCent).toBe(11000n);
    expect(zeilen[0]!.einzahlungCent).toBe(100000n);
    expect(zeilen[1]!.einzahlungCent).toBe(0n);
    expect(zeilen[1]!.endwertCent).toBe(121000n);
  });

  it('multipliziert sich zur Gesamt-TWR', () => {
    const reihe = [
      depotTag('2023-01-02', '1000', eingezahlt('1000')),
      depotTag('2023-07-01', '2300', eingezahlt('2000')),
      depotTag('2023-12-29', '2100', eingezahlt('2000')),
      depotTag('2024-05-02', '2900', eingezahlt('2500')),
      depotTag('2024-12-30', '3100', eingezahlt('2500')),
    ];
    const externe = [fluss('2023-01-02', '1000'), fluss('2023-07-01', '1000'), fluss('2024-05-02', '500')];
    const zeilen = jahresuebersicht(eingaben({ reihe, externe }));
    const produkt = zeilen.reduce((p, z) => p * (1 + z.twr!), 1) - 1;
    expect(produkt).toBeCloseTo(twr(reihe, externe).gesamt!, 12);
  });

  it('rechnet die Inflation Dezember gegen Dezember und die Realrendite als IZF in Kaufkraft', () => {
    const vpi = new Map([
      ['2023-12', 99],
      ['2024-01', 100],
      ['2024-12', 102],
      ['2025-03', 103],
    ]);
    const zeilen = jahresuebersicht(
      eingaben({
        reihe: [
          depotTag('2024-01-01', '1000', eingezahlt('1000')),
          depotTag('2024-12-31', '1100', eingezahlt('1000')),
          depotTag('2025-05-31', '1100', eingezahlt('1000')),
        ],
        externe: [fluss('2024-01-01', '1000')],
        vpi,
      }),
    );
    const [erstes, laufend] = zeilen;
    // Erstes Jahr: ab dem Monat des ersten Flusses, wie dessen Deflation — nicht ab Dezember davor.
    expect(erstes!.teuerung).toBeCloseTo(0.02, 12);
    expect(erstes!.teuerungBisMonat).toBe('2024-12');
    expect(erstes!.izf).toBeCloseTo(0.1, 9);
    // Ohne Fluss nach dem Start faellt der reale IZF mit Fisher aus derselben Zeile zusammen.
    expect(erstes!.real).toBeCloseTo(1.1 / 1.02 - 1, 6);
    // Folgejahr: Dezember gegen Dezember, bis zum letzten veroeffentlichten Monat.
    expect(laufend!.teuerung).toBeCloseTo(103 / 102 - 1, 12);
    expect(laufend!.teuerungBisMonat).toBe('2025-03');
  });

  it('rechnet Inflation und Realrendite des ersten Jahres auf derselben Basis', () => {
    const vpi = new Map([
      ['2024-05', 100],
      ['2024-06', 101],
      ['2024-12', 103],
    ]);
    const [zeile] = jahresuebersicht(
      eingaben({
        reihe: [depotTag('2024-06-15', '10000', eingezahlt('10000')), depotTag('2024-12-31', '10000', eingezahlt('10000'))],
        externe: [fluss('2024-06-15', '10000')],
        vpi,
      }),
    );
    expect(zeile!.izf).toBeCloseTo(0, 9);
    expect(zeile!.teuerung).toBeCloseTo(103 / 101 - 1, 12);
    expect(zeile!.real).toBeCloseTo(1 / (1 + zeile!.teuerung!) - 1, 6);
  });

  it('rechnet den IZF je Jahr ab dem Vorjahresende, geldgewichtet und nicht hochgerechnet', () => {
    const reihe = [
      depotTag('2024-01-01', '1000', eingezahlt('1000')),
      depotTag('2024-12-31', '1000', eingezahlt('1000')),
      depotTag('2025-07-02', '2000', eingezahlt('2000')),
      depotTag('2025-12-31', '2200', eingezahlt('2000')),
    ];
    const externe = [fluss('2024-01-01', '1000'), fluss('2025-07-02', '1000')];
    const [j2024, j2025] = jahresuebersicht(eingaben({ reihe, externe }));
    expect(j2024!.izf).toBeCloseTo(0, 9);
    // TWR: 10 % im zweiten Halbjahr. IZF: das doppelte Kapital erst im Gewinnhalbjahr, also mehr.
    expect(j2025!.twr).toBeCloseTo(0.1, 12);
    const r = j2025!.izf!;
    expect(r).toBeGreaterThan(0.1);
    // 2024-12-31 bis 2025-12-31 sind 365 Tage, die Einzahlung liegt 182 Tage vor dem Ende.
    expect(-1000 * (1 + r) - 1000 * (1 + r) ** (182 / 365) + 2200).toBeCloseTo(0, 6);
  });

  it('rechnet den IZF eines angebrochenen Jahres fuer den Zeitraum, nicht p.a.', () => {
    const [zeile] = jahresuebersicht(
      eingaben({
        reihe: [depotTag('2025-10-01', '1000', eingezahlt('1000')), depotTag('2025-12-31', '1050', eingezahlt('1000'))],
        externe: [fluss('2025-10-01', '1000')],
      }),
    );
    expect(zeile!.izf).toBeCloseTo(0.05, 9);
    expect(zeile!.real).toBeNull();
  });

  it('laesst die Inflation ohne Basismonat leer', () => {
    const [zeile] = jahresuebersicht(
      eingaben({
        reihe: [depotTag('2024-01-01', '1000'), depotTag('2024-12-31', '1100')],
        vpi: new Map([['2024-12', 102]]),
      }),
    );
    expect(zeile!.teuerung).toBeNull();
    expect(zeile!.real).toBeNull();
  });

  it('misst ein Jahr bis zum letzten Tag mit Kurs, nicht bis zu einem lueckenhaften 31.12.', () => {
    // Am 31.12.2024 fehlen Kurse; die Bewegung vom 30.12. zum 02.01. gehoert ins neue Jahr.
    const reihe = [
      depotTag('2024-01-01', '1000'),
      depotTag('2024-12-30', '1100'),
      depotTag('2024-12-31', '1100', { lueckenhaft: true }),
      depotTag('2025-01-02', '1210'),
      depotTag('2025-12-31', '1210'),
    ];
    const [j2024, j2025] = jahresuebersicht(eingaben({ reihe }));
    expect(j2024!.twr).toBeCloseTo(0.1, 12);
    expect(j2025!.twr).toBeCloseTo(0.1, 12);
  });

  it('nimmt den Vergleich nur in Jahren mit Kurs der Benchmark', () => {
    const reihe = [depotTag('2024-01-01', '1000'), depotTag('2024-12-31', '1100'), depotTag('2025-12-31', '1200')];
    const vergleichsreihe = [
      depotTag('2024-01-01', '1000'),
      depotTag('2024-12-31', '1050'),
      depotTag('2025-12-31', '1050', { lueckenhaft: true }),
    ];
    const [j2024, j2025] = jahresuebersicht(eingaben({ reihe, vergleichsreihe }));
    expect(j2024!.vergleich).toBeCloseTo(0.05, 12);
    expect(j2025!.vergleich).toBeNull();
  });
});
