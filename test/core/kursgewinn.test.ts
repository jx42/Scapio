import { describe, expect, it } from 'vitest';
import { kursgewinnFenster, vergleichImFenster } from '../../core/kursgewinn.ts';
import { T, depotTag } from '../hilfen.ts';

describe('kursgewinnFenster', () => {
  it('bildet je Tag den Gewinn als Depotwert minus eingezahltes Kapital', () => {
    const reihe = [
      depotTag('2026-01-01', '1000', { nettoEinzahlungKumCent: 1000_00n }),
      depotTag('2026-01-02', '1100', { nettoEinzahlungKumCent: 1000_00n }),
    ];
    const f = kursgewinnFenster(reihe, T('2026-01-01'), T('2026-01-02'));
    expect(f.punkte.map((p) => p.gewinnCent)).toEqual([0n, 100_00n]);
    expect(f.punkte[0]!.gewinnProzent).toBeCloseTo(0, 12);
    expect(f.punkte[1]!.gewinnProzent).toBeCloseTo(0.1, 12);
  });

  it('bildet den Fenstergewinn als Differenz von (Depotwert minus Einzahlung) zwischen Fensterende und -beginn', () => {
    const reihe = [
      depotTag('2026-01-01', '1000', { nettoEinzahlungKumCent: 1000_00n }),
      depotTag('2026-01-02', '1300', { nettoEinzahlungKumCent: 1200_00n }),
    ];
    // Gewinn Tag 1: 0, Gewinn Tag 2: 100. Fenstergewinn: 100, bezogen auf 1200 Einzahlung zu Fensterende.
    const f = kursgewinnFenster(reihe, T('2026-01-01'), T('2026-01-02'));
    expect(f.fensterGewinnCent).toBe(100_00n);
    expect(f.fensterGewinnProzent).toBeCloseTo(100 / 1200, 12);
  });

  it('bezieht den Fenstergewinn auf die Einzahlung zu Fensterende, nicht zu -beginn', () => {
    // Regression zu ADR-011: der Fensterbeginn bei "gesamte Historie" ist der
    // allererste Zufluss ueberhaupt, hier nur 1 Cent. Eine Division durch diesen
    // winzigen Betrag wuerde den Gewinn auf eine absurde Prozentzahl aufblasen.
    const reihe = [
      depotTag('2026-01-01', '0.01', { nettoEinzahlungKumCent: 1n }),
      depotTag('2026-06-01', '100000', { nettoEinzahlungKumCent: 90000_00n }),
    ];
    const f = kursgewinnFenster(reihe, T('2026-01-01'), T('2026-06-01'));
    expect(f.fensterGewinnProzent).toBeCloseTo(1_000_000 / 9_000_000, 12);
  });

  it('schneidet auf das gewaehlte Fenster zu, ohne die Reihe davor zu beruecksichtigen', () => {
    const reihe = [
      depotTag('2026-01-01', '1000', { nettoEinzahlungKumCent: 1000_00n }),
      depotTag('2026-01-02', '1100', { nettoEinzahlungKumCent: 1000_00n }),
      depotTag('2026-01-03', '990', { nettoEinzahlungKumCent: 1000_00n }),
    ];
    const f = kursgewinnFenster(reihe, T('2026-01-02'), T('2026-01-03'));
    expect(f.punkte.map((p) => p.tag)).toEqual([T('2026-01-02'), T('2026-01-03')]);
    expect(f.fensterGewinnCent).toBe(-110_00n);
  });

  it('ergibt ein leeres Fenster, wenn kein Tag hineinfaellt', () => {
    const reihe = [depotTag('2026-01-01', '1000', { nettoEinzahlungKumCent: 1000_00n })];
    const f = kursgewinnFenster(reihe, T('2026-02-01'), T('2026-02-28'));
    expect(f.punkte).toEqual([]);
    expect(f.fensterGewinnCent).toBe(0n);
    expect(f.fensterGewinnProzent).toBe(0);
  });

  it('teilt nicht durch 0, wenn zu Fensterbeginn noch nichts eingezahlt war', () => {
    const reihe = [
      depotTag('2026-01-01', '0', { nettoEinzahlungKumCent: 0n }),
      depotTag('2026-01-02', '500', { nettoEinzahlungKumCent: 500_00n }),
    ];
    const f = kursgewinnFenster(reihe, T('2026-01-01'), T('2026-01-02'));
    expect(f.punkte[0]!.gewinnProzent).toBe(0);
  });

  it('teilt nicht durch 0, wenn zu Fensterende nichts mehr eingezahlt ist', () => {
    const reihe = [
      depotTag('2026-01-01', '500', { nettoEinzahlungKumCent: 500_00n }),
      depotTag('2026-01-02', '0', { nettoEinzahlungKumCent: 0n }),
    ];
    const f = kursgewinnFenster(reihe, T('2026-01-01'), T('2026-01-02'));
    expect(f.punkte[1]!.gewinnProzent).toBe(0);
    expect(f.fensterGewinnProzent).toBe(0);
  });
});

describe('kursgewinnFenster, Gewinn ab Fensterbeginn', () => {
  const reihe = [
    depotTag('2026-01-01', '1000', { nettoEinzahlungKumCent: 800_00n }),
    depotTag('2026-01-02', '1100', { nettoEinzahlungKumCent: 800_00n }),
    depotTag('2026-01-03', '1300', { nettoEinzahlungKumCent: 1000_00n }),
  ];

  it('beginnt im Fenster bei 0, auch wenn das Depot davor schon Gewinn hatte', () => {
    // Gewinn absolut: 200, 300, 300. Ab dem 2.1.: 0, 0.
    const f = kursgewinnFenster(reihe, T('2026-01-02'), T('2026-01-03'));
    expect(f.punkte.map((p) => p.gewinnCent)).toEqual([0n, 0n]);
  });

  it('endet im letzten Punkt auf dem Fenstergewinn', () => {
    const f = kursgewinnFenster(reihe, T('2026-01-01'), T('2026-01-03'));
    const letzter = f.punkte[f.punkte.length - 1]!;
    expect(letzter.gewinnCent).toBe(f.fensterGewinnCent);
    expect(letzter.gewinnProzent).toBe(f.fensterGewinnProzent);
    expect(f.fensterGewinnCent).toBe(100_00n);
  });
});

describe('vergleichImFenster', () => {
  const depot = [
    depotTag('2026-01-01', '1000', { nettoEinzahlungKumCent: 800_00n }),
    depotTag('2026-01-02', '1200', { nettoEinzahlungKumCent: 800_00n }),
  ];
  // Das Vergleichsdepot hat schon vorher eine andere Groesse: 900 statt 1000 am 1.1.
  const vergleich = [
    depotTag('2026-01-01', '900', { nettoEinzahlungKumCent: 800_00n }),
    depotTag('2026-01-02', '990', { nettoEinzahlungKumCent: 800_00n }),
  ];

  it('startet die Vergleichslinie beim Depotwert und zaehlt nur den Gewinn im Fenster', () => {
    const p = vergleichImFenster(depot, vergleich, T('2026-01-01'), T('2026-01-02'));
    expect(p.map((x) => x.gewinnCent)).toEqual([0n, 90_00n]);
    // Depotwert 1200 minus Depotgewinn 200 plus Vergleichsgewinn 90.
    expect(p.map((x) => x.wertCent)).toEqual([1000_00n, 1090_00n]);
  });

  it('bildet die Differenz als Depotgewinn minus Vergleichsgewinn, in Cent und in Prozentpunkten', () => {
    const p = vergleichImFenster(depot, vergleich, T('2026-01-01'), T('2026-01-02'));
    // Depot: 0 -> 200 Gewinn, Vergleich: 0 -> 90; Einzahlung beider 800.
    expect(p.map((x) => x.differenzCent)).toEqual([0n, 110_00n]);
    expect(p[0]!.differenzProzent).toBeCloseTo(0, 12);
    expect(p[1]!.differenzProzent).toBeCloseTo(110 / 800, 12);
  });

  it('macht die Differenz negativ, wenn der Vergleich vorn liegt', () => {
    const schwach = [
      depotTag('2026-01-01', '1000', { nettoEinzahlungKumCent: 800_00n }),
      depotTag('2026-01-02', '950', { nettoEinzahlungKumCent: 800_00n }),
    ];
    const p = vergleichImFenster(schwach, vergleich, T('2026-01-01'), T('2026-01-02'));
    expect(p[1]!.differenzCent).toBe(-140_00n);
    expect(p[1]!.differenzProzent).toBeCloseTo(-140 / 800, 12);
  });

  it('laesst Tage aus, die das Depot nicht hat', () => {
    const p = vergleichImFenster([depot[0]!], vergleich, T('2026-01-01'), T('2026-01-02'));
    expect(p.map((x) => x.tag)).toEqual([T('2026-01-01')]);
  });
});
