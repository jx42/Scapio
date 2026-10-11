import { describe, expect, it } from 'vitest';
import { GROB_AB_TAGEN, LEERES_ERGEBNIS, twr } from '../../core/twr.ts';
import { depotTag, fluss } from '../hilfen.ts';

describe('twr', () => {
  it('misst die reine Wertentwicklung ohne Fluesse', () => {
    const e = twr([depotTag('2026-01-01', '1000'), depotTag('2026-01-02', '1100')], []);
    expect(e.gesamt).toBeCloseTo(0.1, 12);
    expect(e.teilperioden).toBe(1);
  });

  it('ist gegen den Zeitpunkt der Einzahlung unempfindlich', () => {
    // Zwei Depots mit derselben Wertentwicklung, aber verschiedenem Timing:
    // die TWR muss beide gleich bewerten. Genau dafuer gibt es sie.
    const ohne = twr(
      [depotTag('2026-01-01', '1000'), depotTag('2026-01-02', '1100'), depotTag('2026-01-03', '1210')],
      [],
    );
    // Die Einzahlung steht dem Anleger die ganze Periode zur Verfuegung:
    // 2000 zu Periodenbeginn, je Periode 10 Prozent.
    const mit = twr(
      [depotTag('2026-01-01', '1000'), depotTag('2026-01-02', '2200'), depotTag('2026-01-03', '2420')],
      [fluss('2026-01-02', '1000')],
    );
    expect(mit.gesamt).toBeCloseTo(ohne.gesamt, 12);
  });

  it('rechnet den Cashflow zum Periodenbeginn', () => {
    // 1000 + 100 eingezahlt, Endwert 1100: keine Rendite, kein Gewinn.
    const e = twr([depotTag('2026-01-01', '1000'), depotTag('2026-01-02', '1100')], [fluss('2026-01-02', '100')]);
    expect(e.gesamt).toBeCloseTo(0, 12);
  });

  it('normiert den Index auf 100 und traegt ihn fort', () => {
    const e = twr([depotTag('2026-01-01', '1000'), depotTag('2026-01-02', '1100')], []);
    expect(e.index[0]).toEqual({ tag: '2026-01-01', wert: 100 });
    expect(e.index[1]!.wert).toBeCloseTo(110, 9);
  });

  it('rechnet unter einem Jahr NICHT aufs Jahr hoch', () => {
    // Drei gute Wochen sind nicht 400 % im Jahr.
    const e = twr([depotTag('2026-01-01', '1000'), depotTag('2026-01-21', '1300')], []);
    expect(e.gesamt).toBeCloseTo(0.3, 12);
    expect(e.proJahr).toBeNull();
  });

  it('rechnet ab einem Jahr aufs Jahr hoch', () => {
    const e = twr([depotTag('2024-01-01', '1000'), depotTag('2026-01-01', '1210')], []);
    expect(e.gesamt).toBeCloseTo(0.21, 12);
    expect(e.proJahr).toBeCloseTo(Math.pow(1.21, 365 / 731) - 1, 12);
  });

  it('rechnet bei genau 365 Tagen schon aufs Jahr hoch, bei 364 noch nicht', () => {
    const jahr = twr([depotTag('2025-01-01', '1000'), depotTag('2026-01-01', '1100')], []);
    expect(jahr.proJahr).toBeCloseTo(0.1, 12);
    const knapp = twr([depotTag('2025-01-01', '1000'), depotTag('2025-12-31', '1100')], []);
    expect(knapp.proJahr).toBeNull();
  });

  it('meldet grob, sobald zwischen zwei Werten mehr als die Grenze liegt', () => {
    const fein = twr([depotTag('2026-01-01', '1000'), depotTag('2026-01-21', '1100')], []);
    expect(fein.grob).toBe(false);
    expect(GROB_AB_TAGEN).toBe(20);

    const grob = twr([depotTag('2026-01-01', '1000'), depotTag('2026-01-22', '1100')], []);
    expect(grob.grob).toBe(true);
  });

  it('ueberspringt eine Periode mit leerem Depot, statt Unendlich zu verketten', () => {
    // Am 02. ist das Depot leer und es fliesst nichts: eine Rendite auf nichts
    // gibt es nicht, die Periode wird uebersprungen statt als Unendlich verkettet.
    const e = twr(
      [
        depotTag('2026-01-01', '0'),
        depotTag('2026-01-02', '0'),
        depotTag('2026-01-03', '1000'),
        depotTag('2026-01-04', '1100'),
      ],
      [fluss('2026-01-03', '1000')],
    );
    expect(Number.isFinite(e.gesamt)).toBe(true);
    expect(e.gesamt).toBeCloseTo(0.1, 12);
    expect(e.teilperioden).toBe(2);
    expect(e.index).toHaveLength(4);
  });

  it('rechnet auch dann, wenn die Reihe unsortiert kommt', () => {
    const e = twr([depotTag('2026-01-02', '1100'), depotTag('2026-01-01', '1000')], []);
    expect(e.gesamt).toBeCloseTo(0.1, 12);
    expect(e.index[0]!.tag).toBe('2026-01-01');
  });

  it('ergibt aus weniger als zwei Tagen das leere Ergebnis', () => {
    expect(twr([], [])).toEqual(LEERES_ERGEBNIS);
    expect(twr([depotTag('2026-01-01', '1000')], [])).toEqual(LEERES_ERGEBNIS);
  });

  it('rechnet nicht aufs Jahr hoch, wenn das Depot alles verloren hat', () => {
    const e = twr([depotTag('2024-01-01', '1000'), depotTag('2026-01-01', '0')], []);
    expect(e.gesamt).toBeCloseTo(-1, 12);
    expect(e.proJahr).toBeNull();
  });

  it('verkettet mehrere Teilperioden multiplikativ', () => {
    const e = twr(
      [depotTag('2026-01-01', '1000'), depotTag('2026-01-02', '1100'), depotTag('2026-01-03', '990')],
      [],
    );
    expect(e.gesamt).toBeCloseTo(1.1 * 0.9 - 1, 12);
    expect(e.teilperioden).toBe(2);
  });

  it('ueberspringt einen luekenhaften Tag, statt eine Phantomrendite zu verketten', () => {
    // Am 02. fehlt der Kurs: der Tag wird auf 0 kollabiert und als luekenhaft markiert.
    // Ohne Ueberspringen waere das ein Sturz auf -100 % gefolgt von einer erfundenen
    // Erholung. Die echte Bewegung ist 1000 -> 1100, also +10 % ueber die ganze Spanne.
    const e = twr(
      [
        depotTag('2026-01-01', '1000'),
        depotTag('2026-01-02', '0', { lueckenhaft: true }),
        depotTag('2026-01-03', '1100'),
      ],
      [],
    );
    expect(e.gesamt).toBeCloseTo(0.1, 12);
    expect(e.teilperioden).toBe(1);
    expect(e.index).toHaveLength(3);
    expect(e.index[1]!.wert).toBeCloseTo(100, 9);
  });

  it('traegt einen Cashflow von einem luekenhaften Tag zum naechsten brauchbaren Tag mit', () => {
    // Die Einzahlung faellt auf den luekenhaften Tag. Sie darf nicht gegen den
    // unbekannten Wert dieses Tages verrechnet werden, sondern zaehlt erst zum
    // naechsten brauchbaren Periodenbeginn: 1000 + 100 eingezahlt, Endwert 1210 -> +10 %.
    const e = twr(
      [
        depotTag('2026-01-01', '1000'),
        depotTag('2026-01-02', '0', { lueckenhaft: true }),
        depotTag('2026-01-03', '1210'),
      ],
      [fluss('2026-01-02', '100')],
    );
    expect(e.gesamt).toBeCloseTo(0.1, 12);
    expect(e.teilperioden).toBe(1);
  });
});

describe('twr — Modified Dietz ueber mehrtaegige Perioden', () => {
  it('gewichtet eine Einzahlung am Periodenende nur mit ihrer Zeit im Depot', () => {
    // Monatsraster: 1000 am 1., am 31. kommen 1000 dazu, Endwert 2100. Mit vollem Gewicht
    // waeren das 100/2000 = 5 %; gearbeitet hat 30 Tage lang aber nur das alte Kapital. [ADR-036]
    const e = twr([depotTag('2026-01-01', '1000'), depotTag('2026-01-31', '2100')], [fluss('2026-01-31', '1000')]);
    expect(e.gesamt).toBeCloseTo(100 / (1000 + 1000 / 30), 12);
  });

  it('gibt einer Einzahlung am ersten Tag nach Periodenbeginn volles Gewicht', () => {
    const e = twr(
      [
        depotTag('2026-01-01', '1000'),
        depotTag('2026-01-02', '0', { lueckenhaft: true }),
        depotTag('2026-01-31', '2200'),
      ],
      [fluss('2026-01-02', '1000')],
    );
    expect(e.gesamt).toBeCloseTo(0.1, 12);
  });
});

describe('twr — Abfluss zum Tagesende [ADR-043]', () => {
  it('misst eine Entnahme von 90 % an einem Tag mit +10 % als +10 %', () => {
    // 1000 -> 1100 durch Kurs, dann 990 entnommen: Endwert 110.
    const e = twr([depotTag('2026-01-01', '1000'), depotTag('2026-01-02', '110')], [fluss('2026-01-02', '-990')]);
    expect(e.gesamt).toBeCloseTo(0.1, 12);
  });

  it('misst eine Aufloesung bei +10 % und einen Neubeginn danach ohne Totalverlust', () => {
    const e = twr(
      [
        depotTag('2026-01-01', '1000'),
        depotTag('2026-01-02', '0'),
        depotTag('2026-01-03', '0'),
        depotTag('2026-01-04', '500'),
        depotTag('2026-01-05', '550'),
      ],
      [fluss('2026-01-02', '-1100'), fluss('2026-01-04', '500')],
    );
    expect(e.gesamt).toBeCloseTo(1.1 * 1.1 - 1, 12);
    expect(e.grob).toBe(false);
  });

  it('bewertet einen Uebertrag hinaus an einem Kurstag als Entnahme zum Tageswert', () => {
    // Der Ausgang (1200) uebersteigt den Vortageswert (1000); mit Gewicht 1 waere die Basis negativ.
    const e = twr([depotTag('2026-01-01', '1000'), depotTag('2026-01-02', '0')], [fluss('2026-01-02', '-1200')]);
    expect(e.gesamt).toBeCloseTo(0.2, 12);
  });

  it('ueberspringt eine Periode mit Basis <= 0 und markiert sie als grob', () => {
    // Monatsraster: der Abfluss mitten im Monat uebersteigt den Anfangswert so weit,
    // dass die gewichtete Basis negativ wird.
    const e = twr(
      [depotTag('2026-01-01', '100'), depotTag('2026-01-02', '0', { lueckenhaft: true }), depotTag('2026-01-15', '0')],
      [fluss('2026-01-02', '-200')],
    );
    expect(e.teilperioden).toBe(0);
    expect(e.gesamt).toBe(0);
    expect(e.grob).toBe(true);
  });
});
