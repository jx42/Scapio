import { describe, expect, it } from 'vitest';
import { baueBenchmarkreihe, risikofreiesRaster } from '../../core/benchmark.ts';
import { zuCent, zuKursE6 } from '../../core/dezimal.ts';
import type { Tag } from '../../core/kalender.ts';
import { plusTage, vergleiche } from '../../core/kalender.ts';
import type { Rasterwert } from '../../core/kursraster.ts';
import type { Zinsreihe } from '../../core/risiko.ts';
import { T, fluss } from '../hilfen.ts';

/** Konstanter Kurs ueber eine Spanne, als Rasterwert-Map wie sie `rasterFuer` liefert. */
function konstantesRaster(von: string, bis: string, kursEuro: string): Map<Tag, Rasterwert> {
  const raster = new Map<Tag, Rasterwert>();
  for (let t = T(von); vergleiche(t, T(bis)) <= 0; t = plusTage(t, 1)) {
    raster.set(t, { kurs: zuKursE6(kursEuro), gefuellt: false });
  }
  return raster;
}

describe('baueBenchmarkreihe', () => {
  it('Grundfall: konstanter Kurs ergibt keinen Gewinn', () => {
    const raster = konstantesRaster('2026-01-01', '2026-01-05', '100');
    const reihe = baueBenchmarkreihe({
      fluesse: [fluss('2026-01-02', '1000')],
      raster,
      von: T('2026-01-02'),
      bis: T('2026-01-03'),
    });

    expect(reihe.map((z) => z.tag)).toEqual([T('2026-01-02'), T('2026-01-03')]);
    for (const z of reihe) {
      expect(z.wertpapiereCent).toBe(zuCent('1000'));
      expect(z.cashCent).toBe(0n);
      expect(z.gesamtCent).toBe(zuCent('1000'));
      expect(z.nettoEinzahlungKumCent).toBe(zuCent('1000'));
      expect(z.gesamtCent - z.nettoEinzahlungKumCent).toBe(0n);
      expect(z.lueckenhaft).toBe(false);
    }
  });

  it('Verdoppelt: Kursverdopplung nach einer Einzahlung ergibt Gewinn = Einzahlung', () => {
    const raster = new Map<Tag, Rasterwert>([
      [T('2026-01-02'), { kurs: zuKursE6('100'), gefuellt: false }],
      [T('2026-01-03'), { kurs: zuKursE6('200'), gefuellt: false }],
    ]);
    const reihe = baueBenchmarkreihe({
      fluesse: [fluss('2026-01-02', '1000')],
      raster,
      von: T('2026-01-02'),
      bis: T('2026-01-03'),
    });

    const tag2 = reihe.find((z) => z.tag === T('2026-01-02'))!;
    expect(tag2.wertpapiereCent).toBe(zuCent('1000'));

    const tag3 = reihe.find((z) => z.tag === T('2026-01-03'))!;
    expect(tag3.wertpapiereCent).toBe(zuCent('2000'));
    expect(tag3.cashCent).toBe(0n);
    expect(tag3.nettoEinzahlungKumCent).toBe(zuCent('1000'));
    expect(tag3.gesamtCent - tag3.nettoEinzahlungKumCent).toBe(zuCent('1000'));
  });

  it('Auszahlung: eine Auszahlung verkauft Anteile bis zur Deckung', () => {
    const raster = konstantesRaster('2026-01-02', '2026-01-03', '100');
    const reihe = baueBenchmarkreihe({
      fluesse: [fluss('2026-01-02', '1000'), fluss('2026-01-03', '-300')],
      raster,
      von: T('2026-01-02'),
      bis: T('2026-01-03'),
    });

    // Tag 2: 1000 Euro bei Kurs 100 -> 10 Anteile, kein Cash uebrig.
    const tag2 = reihe.find((z) => z.tag === T('2026-01-02'))!;
    expect(tag2.wertpapiereCent).toBe(zuCent('1000'));
    expect(tag2.cashCent).toBe(0n);

    // Tag 3: Auszahlung 300 Euro, bei gleichem Kurs durch Verkauf von 3 der 10 Anteile
    // gedeckt. Cash faellt wieder auf 0, Wertpapierseite auf 700 Euro. Konstanter Kurs,
    // also weiterhin kein Gewinn.
    const tag3 = reihe.find((z) => z.tag === T('2026-01-03'))!;
    expect(tag3.wertpapiereCent).toBe(zuCent('700'));
    expect(tag3.cashCent).toBe(0n);
    expect(tag3.nettoEinzahlungKumCent).toBe(zuCent('700'));
    expect(tag3.gesamtCent - tag3.nettoEinzahlungKumCent).toBe(0n);
  });

  it('Kurslücke: ein Tag ohne Kurs bleibt als Cash liegen und wird lueckenhaft markiert', () => {
    const raster = new Map<Tag, Rasterwert>([
      [T('2026-01-02'), { kurs: zuKursE6('100'), gefuellt: false }],
      // 2026-01-03 fehlt bewusst: eine echte Luecke, nicht vorwaerts gefuellt.
      [T('2026-01-04'), { kurs: zuKursE6('100'), gefuellt: false }],
    ]);
    const reihe = baueBenchmarkreihe({
      fluesse: [fluss('2026-01-02', '500'), fluss('2026-01-03', '200')],
      raster,
      von: T('2026-01-02'),
      bis: T('2026-01-04'),
    });

    // Tag 2: 500 Euro investiert -> 5 Anteile bei Kurs 100.
    const tag2 = reihe.find((z) => z.tag === T('2026-01-02'))!;
    expect(tag2.wertpapiereCent).toBe(zuCent('500'));
    expect(tag2.cashCent).toBe(0n);
    expect(tag2.lueckenhaft).toBe(false);

    // Tag 3: kein Kurs -> die neue Einzahlung von 200 Euro bleibt als Cash liegen,
    // die bestehenden 5 Anteile werden zum letzten bekannten Kurs weiterbewertet.
    const tag3 = reihe.find((z) => z.tag === T('2026-01-03'))!;
    expect(tag3.lueckenhaft).toBe(true);
    expect(tag3.cashCent).toBe(zuCent('200'));
    expect(tag3.wertpapiereCent).toBe(zuCent('500'));
    expect(tag3.gesamtCent).toBe(zuCent('700'));

    // Tag 4: Kurs kehrt zurueck, die liegen gebliebenen 200 Euro werden nachinvestiert.
    const tag4 = reihe.find((z) => z.tag === T('2026-01-04'))!;
    expect(tag4.lueckenhaft).toBe(false);
    expect(tag4.cashCent).toBe(0n);
    expect(tag4.wertpapiereCent).toBe(zuCent('700'));
  });

  it('Fluss vor Fensterbeginn: zaehlt am ersten Fenstertag bereits als investierte Position', () => {
    const raster = konstantesRaster('2026-01-01', '2026-01-11', '100');
    const reihe = baueBenchmarkreihe({
      fluesse: [fluss('2026-01-01', '1000')],
      raster,
      von: T('2026-01-10'),
      bis: T('2026-01-11'),
    });

    expect(reihe.map((z) => z.tag)).toEqual([T('2026-01-10'), T('2026-01-11')]);
    const ersterFenstertag = reihe[0]!;
    // Waere erst ab `von` simuliert worden, staende hier 0 statt der schon
    // investierten 1000 Euro aus dem Fluss vom 2026-01-01.
    expect(ersterFenstertag.wertpapiereCent).toBe(zuCent('1000'));
    expect(ersterFenstertag.cashCent).toBe(0n);
    expect(ersterFenstertag.nettoEinzahlungKumCent).toBe(zuCent('1000'));
    expect(ersterFenstertag.gesamtCent - ersterFenstertag.nettoEinzahlungKumCent).toBe(0n);
  });

  it('liefert eine leere Reihe ohne Fluesse', () => {
    const raster = konstantesRaster('2026-01-01', '2026-01-05', '100');
    const reihe = baueBenchmarkreihe({ fluesse: [], raster, von: T('2026-01-02'), bis: T('2026-01-03') });
    for (const z of reihe) {
      expect(z.wertpapiereCent).toBe(0n);
      expect(z.cashCent).toBe(0n);
      expect(z.gesamtCent).toBe(0n);
      expect(z.nettoEinzahlungKumCent).toBe(0n);
    }
  });
});

describe('risikofreiesRaster', () => {
  it('startet bei 1,000000 am ersten Tag mit einem Zinswert', () => {
    const zinsreihe: Zinsreihe = new Map([[T('2026-01-01'), 0.0365]]);
    const raster = risikofreiesRaster(zinsreihe, T('2026-01-01'), T('2026-01-01'));

    expect(raster.get(T('2026-01-01'))).toEqual({ kurs: zuKursE6('1'), gefuellt: false });
  });

  it('verzinst jeden Folgetag mit dem zuletzt bekannten Satz auf 365 Tage', () => {
    // 0,0365 = 3,65 % p.a., wie in `db/repository/zins.ts` gespeichert (`roh / 100`).
    const zinsreihe: Zinsreihe = new Map([[T('2026-01-01'), 0.0365]]);
    const raster = risikofreiesRaster(zinsreihe, T('2026-01-01'), T('2026-01-03'));

    // 3,65 %/365 Tage = 0,01 %/Tag, also je Tag mal 1,0001.
    expect(raster.get(T('2026-01-02'))).toEqual({ kurs: zuKursE6('1.0001'), gefuellt: true });
    expect(raster.get(T('2026-01-03'))).toEqual({ kurs: zuKursE6('1.00020001'), gefuellt: true });
  });

  it('fuehrt den letzten bekannten Satz ueber eine Luecke (Wochenende) fort', () => {
    const zinsreihe: Zinsreihe = new Map([
      [T('2026-01-01'), 0.0365],
      [T('2026-01-04'), 0.073],
    ]);
    const raster = risikofreiesRaster(zinsreihe, T('2026-01-01'), T('2026-01-04'));

    // Tag 2 und 3 ohne eigenen Zinswert: weiter mit dem Satz vom 1.1., als gefuellt markiert.
    expect(raster.get(T('2026-01-02'))!.gefuellt).toBe(true);
    expect(raster.get(T('2026-01-03'))!.gefuellt).toBe(true);
    // Tag 4 hat wieder einen eigenen Wert.
    expect(raster.get(T('2026-01-04'))!.gefuellt).toBe(false);
  });

  it('laesst Tage vor dem ersten Zinswert ohne Eintrag', () => {
    const zinsreihe: Zinsreihe = new Map([[T('2026-01-03'), 0.0365]]);
    const raster = risikofreiesRaster(zinsreihe, T('2026-01-01'), T('2026-01-03'));

    expect(raster.has(T('2026-01-01'))).toBe(false);
    expect(raster.has(T('2026-01-02'))).toBe(false);
    expect(raster.get(T('2026-01-03'))).toEqual({ kurs: zuKursE6('1'), gefuellt: false });
  });

  it('liefert ein leeres Raster ohne jeden Zinswert', () => {
    const zinsreihe: Zinsreihe = new Map();
    const raster = risikofreiesRaster(zinsreihe, T('2026-01-01'), T('2026-01-05'));

    expect(raster.size).toBe(0);
  });
});
