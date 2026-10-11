import { describe, expect, it } from 'vitest';
import { zuCent, zuMengeE8 } from '../../core/dezimal.ts';
import { baueCashreihe, baueEinzahlungsreihe, baueMengenreihe, mengenAenderungen } from '../../core/mengenreihe.ts';
import { ausgeglicheneUebertraege } from '../../core/uebertraege.ts';
import { EUROPA, T, WELT, einzahlung, fluss, kauf, tx, uebertragRaus, uebertragRein, verkauf } from '../hilfen.ts';

describe('mengenAenderungen', () => {
  it('summiert mehrere Bewegungen desselben Tages', () => {
    const txe = [
      kauf('2026-01-05', WELT, '1', '100'),
      kauf('2026-01-05', WELT, '2', '200'),
    ];
    const a = mengenAenderungen(txe, ausgeglicheneUebertraege(txe));
    expect(a.get(WELT)!.get(T('2026-01-05'))).toBe(zuMengeE8('3'));
  });

  it('uebergeht Cash, Stornos und Schwebendes', () => {
    const txe = [
      einzahlung('2026-01-05', '500'),
      kauf('2026-01-06', WELT, '1', '100', { storniert: true }),
      kauf('2026-01-07', WELT, '1', '100', { status: 'PENDING' }),
      tx({ tag: '2026-01-08', art: 'WERTPAPIER', isin: WELT, mengeE8: null }),
    ];
    const a = mengenAenderungen(txe, ausgeglicheneUebertraege(txe));
    expect(a.size).toBe(0);
  });

  it('uebergeht ein ausgeglichenes Uebertragspaar vollstaendig', () => {
    // Regressionstest fuer den beobachteten Einbruch: ein depotinterner Wechsel darf
    // die Stueckzahl weder auf null fallen lassen noch spaeter zurueckspringen.
    const txe = [
      kauf('2026-01-05', WELT, '1', '100'),
      uebertragRaus('2026-03-05', WELT, '1', '150'),
      uebertragRein('2026-03-06', WELT, '1', '151'),
    ];
    const a = mengenAenderungen(txe, ausgeglicheneUebertraege(txe));
    expect(a.get(WELT)!.get(T('2026-03-05'))).toBeUndefined();
    expect(a.get(WELT)!.get(T('2026-03-06'))).toBeUndefined();
  });
});

describe('baueMengenreihe', () => {
  it('kumuliert und fuellt bis zum Ende der Spanne vorwaerts', () => {
    const txe = [kauf('2026-01-05', WELT, '1', '100'), kauf('2026-01-08', WELT, '2', '200')];
    const reihe = baueMengenreihe(txe, T('2026-01-05'), T('2026-01-10'), ausgeglicheneUebertraege(txe));
    const welt = reihe.menge.get(WELT)!;
    expect(welt.get(T('2026-01-05'))).toBe(zuMengeE8('1'));
    expect(welt.get(T('2026-01-07'))).toBe(zuMengeE8('1'));
    expect(welt.get(T('2026-01-08'))).toBe(zuMengeE8('3'));
    expect(welt.get(T('2026-01-10'))).toBe(zuMengeE8('3'));
  });

  it('laesst Tage vor der ersten Transaktion leer, nicht null', () => {
    // Eine Position, die es noch nicht gab, hat keinen Wert — nicht den Wert null.
    const txe = [kauf('2026-01-05', WELT, '1', '100')];
    const reihe = baueMengenreihe(txe, T('2026-01-01'), T('2026-01-06'), ausgeglicheneUebertraege(txe));
    const welt = reihe.menge.get(WELT)!;
    expect(welt.has(T('2026-01-04'))).toBe(false);
    expect(welt.has(T('2026-01-05'))).toBe(true);
  });

  it('faellt nach einem Vollverkauf auf null, ohne die ISIN zu verlieren', () => {
    const txe = [kauf('2026-01-05', WELT, '3', '300'), verkauf('2026-01-09', WELT, '3', '330')];
    const reihe = baueMengenreihe(txe, T('2026-01-05'), T('2026-01-10'), ausgeglicheneUebertraege(txe));
    const welt = reihe.menge.get(WELT)!;
    expect(welt.get(T('2026-01-09'))).toBe(0n);
    expect(welt.get(T('2026-01-10'))).toBe(0n);
    expect(reihe.endbestand.get(WELT)).toBe(0n);
  });

  it('nennt den ersten Tag der gesamten Historie, auch aus einer Cash-Buchung', () => {
    const txe = [kauf('2026-01-05', WELT, '1', '100'), einzahlung('2026-01-02', '500')];
    const reihe = baueMengenreihe(txe, T('2026-01-01'), T('2026-01-10'), ausgeglicheneUebertraege(txe));
    expect(reihe.ersterTag).toBe('2026-01-02');
  });

  it('haelt mehrere ISINs auseinander', () => {
    const txe = [kauf('2026-01-05', WELT, '1', '100'), kauf('2026-01-05', EUROPA, '5', '250')];
    const reihe = baueMengenreihe(txe, T('2026-01-05'), T('2026-01-06'), ausgeglicheneUebertraege(txe));
    expect(reihe.menge.get(WELT)!.get(T('2026-01-06'))).toBe(zuMengeE8('1'));
    expect(reihe.menge.get(EUROPA)!.get(T('2026-01-06'))).toBe(zuMengeE8('5'));
  });

  it('nennt einen Endbestand, der ueber die Spanne hinausgeht', () => {
    const txe = [kauf('2026-01-05', WELT, '1', '100'), kauf('2026-02-05', WELT, '1', '100')];
    const reihe = baueMengenreihe(txe, T('2026-01-01'), T('2026-01-31'), ausgeglicheneUebertraege(txe));
    expect(reihe.menge.get(WELT)!.get(T('2026-01-31'))).toBe(zuMengeE8('1'));
    expect(reihe.endbestand.get(WELT)).toBe(zuMengeE8('2'));
  });

  it('uebergeht eine stornierte Transaktion bei der Suche nach dem ersten Tag', () => {
    // Die stornierte Buchung liegt vor der gueltigen — zaehlte sie mit, waere sie
    // faelschlich der "erste Tag" der Historie.
    const txe = [kauf('2026-01-05', WELT, '1', '100'), kauf('2026-01-02', WELT, '1', '100', { storniert: true })];
    const reihe = baueMengenreihe(txe, T('2026-01-01'), T('2026-01-10'), ausgeglicheneUebertraege(txe));
    expect(reihe.ersterTag).toBe('2026-01-05');
  });

  it('ergibt aus nichts eine leere Reihe ohne ersten Tag', () => {
    const reihe = baueMengenreihe([], T('2026-01-01'), T('2026-01-05'), ausgeglicheneUebertraege([]));
    expect(reihe.menge.size).toBe(0);
    expect(reihe.ersterTag).toBeNull();
  });
});

describe('baueCashreihe', () => {
  it('zieht den Kaufbetrag von der Cash-Seite ab', () => {
    const txe = [einzahlung('2026-01-01', '1000'), kauf('2026-01-05', WELT, '1', '400')];
    const reihe = baueCashreihe(txe, T('2026-01-01'), T('2026-01-06'), ausgeglicheneUebertraege(txe));
    expect(reihe.get(T('2026-01-04'))).toBe(zuCent('1000'));
    expect(reihe.get(T('2026-01-05'))).toBe(zuCent('600'));
    expect(reihe.get(T('2026-01-06'))).toBe(zuCent('600'));
  });

  it('nimmt alles vor der Spanne als Anfangsbestand mit', () => {
    const txe = [einzahlung('2025-12-01', '1000')];
    const reihe = baueCashreihe(txe, T('2026-01-01'), T('2026-01-02'), ausgeglicheneUebertraege(txe));
    expect(reihe.get(T('2026-01-01'))).toBe(zuCent('1000'));
  });

  it('uebergeht Stornos', () => {
    const txe = [einzahlung('2026-01-01', '1000', { storniert: true })];
    const reihe = baueCashreihe(txe, T('2026-01-01'), T('2026-01-01'), ausgeglicheneUebertraege(txe));
    expect(reihe.get(T('2026-01-01'))).toBe(0n);
  });

  it('laesst ein ausgeglichenes Uebertragspaar den Cashbestand unveraendert', () => {
    // Der Uebertragswert ist kein Cent, der tatsaechlich floss.
    const txe = [
      einzahlung('2026-01-01', '1000'),
      uebertragRaus('2026-03-05', WELT, '1', '150'),
      uebertragRein('2026-03-06', WELT, '1', '151'),
    ];
    const reihe = baueCashreihe(txe, T('2026-03-04'), T('2026-03-07'), ausgeglicheneUebertraege(txe));
    expect(reihe.get(T('2026-03-04'))).toBe(zuCent('1000'));
    expect(reihe.get(T('2026-03-05'))).toBe(zuCent('1000'));
    expect(reihe.get(T('2026-03-06'))).toBe(zuCent('1000'));
    expect(reihe.get(T('2026-03-07'))).toBe(zuCent('1000'));
  });

  it('bucht den Wert eines unpaarigen Uebertrags nicht als Cash', () => {
    // Die Stuecke zaehlt die Mengenreihe; stuende der Betrag zusaetzlich im Cash, waere
    // der Wert doppelt im Depot. [ADR-036]
    const txe = [
      einzahlung('2026-01-01', '1000'),
      uebertragRein('2026-03-05', WELT, '1', '150'),
      uebertragRaus('2026-06-05', EUROPA, '1', '80'),
    ];
    const reihe = baueCashreihe(txe, T('2026-03-04'), T('2026-06-06'), ausgeglicheneUebertraege(txe));
    expect(reihe.get(T('2026-03-05'))).toBe(zuCent('1000'));
    expect(reihe.get(T('2026-06-06'))).toBe(zuCent('1000'));
  });
});

describe('baueEinzahlungsreihe', () => {
  it('kumuliert externe Fluesse und haelt den Stand', () => {
    const reihe = baueEinzahlungsreihe(
      [fluss('2026-01-02', '500'), fluss('2026-01-05', '300'), fluss('2026-01-09', '-100')],
      T('2026-01-01'),
      T('2026-01-10'),
    );
    expect(reihe.get(T('2026-01-01'))).toBe(0n);
    expect(reihe.get(T('2026-01-02'))).toBe(zuCent('500'));
    expect(reihe.get(T('2026-01-04'))).toBe(zuCent('500'));
    expect(reihe.get(T('2026-01-08'))).toBe(zuCent('800'));
    expect(reihe.get(T('2026-01-10'))).toBe(zuCent('700'));
  });

  it('zaehlt Fluesse vor der Spanne in den Anfangsstand', () => {
    const reihe = baueEinzahlungsreihe([fluss('2025-06-01', '1000')], T('2026-01-01'), T('2026-01-02'));
    expect(reihe.get(T('2026-01-02'))).toBe(zuCent('1000'));
  });
});

describe('baueMengenreihe — Anfangsbestand', () => {
  it('nimmt den Bestand aus der Zeit vor `von` mit', () => {
    // Eine Neuberechnung ab einem spaeteren Tag darf frueher Gekauftes nicht vergessen:
    // sonst zeigt das Depot ploetzlich null Stueck und der Wert bricht ein.
    const txe = [kauf('2026-01-02', WELT, '5', '500'), kauf('2026-01-03', WELT, '1', '100')];
    const r = baueMengenreihe(txe, T('2026-01-10'), T('2026-01-11'), ausgeglicheneUebertraege(txe));
    expect(r.menge.get(WELT)?.get(T('2026-01-10'))).toBe(zuMengeE8('6'));
    expect(r.menge.get(WELT)?.get(T('2026-01-11'))).toBe(zuMengeE8('6'));
  });
});
