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

  it('rechnet die Inflation Dezember gegen Dezember und die Realrendite nach Fisher', () => {
    const vpi = new Map([
      ['2023-12', 100],
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
    const [voll, laufend] = zeilen;
    expect(voll!.teuerung).toBeCloseTo(0.02, 12);
    expect(voll!.teuerungBisMonat).toBe('2024-12');
    expect(voll!.real).toBeCloseTo(1.1 / 1.02 - 1, 12);
    // Laufendes Jahr: bis zum letzten veroeffentlichten Monat, nicht fortgeschrieben.
    expect(laufend!.teuerung).toBeCloseTo(103 / 102 - 1, 12);
    expect(laufend!.teuerungBisMonat).toBe('2025-03');
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
