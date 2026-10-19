import { describe, expect, it } from 'vitest';
import { zuCent, zuMengeE8 } from '../../core/dezimal.ts';
import { fifo, positionsFluesse } from '../../core/fifo.ts';
import type { Isin } from '../../core/typen.ts';
import { ausgeglicheneUebertraege } from '../../core/uebertraege.ts';
import { EUROPA, T, WELT, einzahlung, kauf, tx, uebertragRaus, uebertragRein, verkauf } from '../hilfen.ts';

describe('fifo', () => {
  it('summiert Kaeufe zu Menge und Einstand', () => {
    const txe = [kauf('2026-01-05', WELT, '1', '100'), kauf('2026-02-05', WELT, '1', '120')];
    const e = fifo(txe, ausgeglicheneUebertraege(txe)).einstaende.get(WELT)!;
    expect(e.menge).toBe(zuMengeE8('2'));
    expect(e.einstand).toBe(zuCent('220'));
    expect(e.realisiert).toBe(0n);
    expect(e.tranchen).toHaveLength(2);
  });

  it('verbraucht die aelteste Tranche zuerst', () => {
    // Gekauft zu 100 und zu 120, verkauft eines fuer 130.
    const txe = [
      kauf('2026-01-05', WELT, '1', '100'),
      kauf('2026-02-05', WELT, '1', '120'),
      verkauf('2026-03-05', WELT, '1', '130'),
    ];
    const e = fifo(txe, ausgeglicheneUebertraege(txe)).einstaende.get(WELT)!;
    expect(e.menge).toBe(zuMengeE8('1'));
    expect(e.einstand).toBe(zuCent('120'));
    expect(e.realisiert).toBe(zuCent('30'));
    expect(e.tranchen).toHaveLength(1);
    expect(e.tranchen[0]!.tag).toBe('2026-02-05');
  });

  it('bricht eine Tranche anteilig an und rundet dabei einmal', () => {
    // 3 Stueck fuer 100,00 EUR; 1 Stueck verkauft -> Kosten 33,33 EUR.
    const txe = [kauf('2026-01-05', WELT, '3', '100'), verkauf('2026-02-05', WELT, '1', '40')];
    const e = fifo(txe, ausgeglicheneUebertraege(txe)).einstaende.get(WELT)!;
    expect(e.menge).toBe(zuMengeE8('2'));
    expect(e.einstand).toBe(zuCent('66.67'));
    expect(e.realisiert).toBe(zuCent('40') - zuCent('33.33'));
    // Was verbraucht wurde und was bleibt, ergibt zusammen wieder den vollen Kaufpreis.
    expect(e.einstand + zuCent('33.33')).toBe(zuCent('100'));
  });

  it('laesst nach einem Vollverkauf nichts offen', () => {
    const txe = [kauf('2026-01-05', WELT, '2', '200'), verkauf('2026-02-05', WELT, '2', '250')];
    const e = fifo(txe, ausgeglicheneUebertraege(txe)).einstaende.get(WELT)!;
    expect(e.menge).toBe(0n);
    expect(e.einstand).toBe(0n);
    expect(e.realisiert).toBe(zuCent('50'));
    expect(e.tranchen).toEqual([]);
  });

  it('sortiert selbst, statt der Eingabereihenfolge zu glauben', () => {
    const txe = [
      verkauf('2026-03-05', WELT, '1', '130'),
      kauf('2026-02-05', WELT, '1', '120'),
      kauf('2026-01-05', WELT, '1', '100'),
    ];
    const gemischt = fifo(txe, ausgeglicheneUebertraege(txe)).einstaende.get(WELT)!;
    expect(gemischt.einstand).toBe(zuCent('120'));
    expect(gemischt.realisiert).toBe(zuCent('30'));
  });

  it('entscheidet bei gleichem Tag nach dem Zeitstempel', () => {
    const txe = [
      kauf('2026-01-05', WELT, '1', '100', { ts: '2026-01-05T09:00:00+01:00' }),
      kauf('2026-01-05', WELT, '1', '120', { ts: '2026-01-05T15:00:00+01:00' }),
      verkauf('2026-01-05', WELT, '1', '130', { ts: '2026-01-05T17:00:00+01:00' }),
    ];
    const e = fifo(txe, ausgeglicheneUebertraege(txe)).einstaende.get(WELT)!;
    expect(e.einstand).toBe(zuCent('120'));
    expect(e.realisiert).toBe(zuCent('30'));
  });

  it('vergiftet die Rechnung nicht mit einem negativen Bestand', () => {
    // Unvollstaendige Historie: verkauft wird mehr, als bekannt ist.
    const txe = [kauf('2026-01-05', WELT, '1', '100'), verkauf('2026-02-05', WELT, '3', '300')];
    const e = fifo(txe, ausgeglicheneUebertraege(txe)).einstaende.get(WELT)!;
    expect(e.menge).toBe(0n);
    expect(e.einstand).toBe(0n);
    // Nur der Anteil, der einen Einstand hatte, geht in den realisierten Gewinn.
    expect(e.realisiert).toBe(zuCent('100') - zuCent('100'));
  });

  it('haelt ISINs getrennt', () => {
    const txe = [kauf('2026-01-05', WELT, '1', '100'), kauf('2026-01-05', EUROPA, '1', '50')];
    const alle = fifo(txe, ausgeglicheneUebertraege(txe)).einstaende;
    expect(alle.get(WELT)!.einstand).toBe(zuCent('100'));
    expect(alle.get(EUROPA)!.einstand).toBe(zuCent('50'));
  });

  it('uebergeht Cash, Stornos, Schwebendes und Nullmengen', () => {
    const txe = [
      einzahlung('2026-01-01', '1000'),
      kauf('2026-01-05', WELT, '1', '100', { storniert: true }),
      kauf('2026-01-05', WELT, '1', '100', { status: 'CANCELED' }),
      kauf('2026-01-05', WELT, '0', '0'),
    ];
    const alle = fifo(txe, ausgeglicheneUebertraege(txe)).einstaende;
    expect(alle.size).toBe(0);
  });

  it('behandelt einen Verkauf ohne jeden Kauf als reinen Erloes', () => {
    const txe = [verkauf('2026-02-05', WELT, '1', '130')];
    const e = fifo(txe, ausgeglicheneUebertraege(txe)).einstaende.get(WELT)!;
    expect(e.menge).toBe(0n);
    expect(e.realisiert).toBe(0n);
  });

  it('sortiert nach Zeitstempel unabhaengig von der Eingabereihenfolge', () => {
    // Dieselben drei Umsaetze wie im Test "entscheidet bei gleichem Tag", aber
    // absteigend statt aufsteigend eingereiht — das Ergebnis darf sich nicht aendern.
    const txe = [
      verkauf('2026-01-05', WELT, '1', '130', { ts: '2026-01-05T17:00:00+01:00' }),
      kauf('2026-01-05', WELT, '1', '120', { ts: '2026-01-05T15:00:00+01:00' }),
      kauf('2026-01-05', WELT, '1', '100', { ts: '2026-01-05T09:00:00+01:00' }),
    ];
    const e = fifo(txe, ausgeglicheneUebertraege(txe)).einstaende.get(WELT)!;
    expect(e.einstand).toBe(zuCent('120'));
    expect(e.realisiert).toBe(zuCent('30'));
  });

  it('behandelt gleichen Zeitstempel als Gleichstand und behaelt die Eingabereihenfolge', () => {
    // Zwei Kaeufe mit identischem Tag und identischem Zeitstempel: der Sortierschritt
    // liefert 0, ein stabiler Sort verkauft dann die zuerst genannte Tranche zuerst.
    const gleicherTs = '2026-01-05T09:00:00+01:00';
    const txe = [
      kauf('2026-01-05', WELT, '1', '100', { ts: gleicherTs }),
      kauf('2026-01-05', WELT, '1', '120', { ts: gleicherTs }),
      verkauf('2026-02-05', WELT, '1', '130'),
    ];
    const e = fifo(txe, ausgeglicheneUebertraege(txe)).einstaende.get(WELT)!;
    expect(e.einstand).toBe(zuCent('120'));
    expect(e.realisiert).toBe(zuCent('30'));
  });

  it('nimmt beim Erloes den Betrag, auch wenn er entgegen der ueblichen Richtung negativ ankommt', () => {
    // betragCent ist im Typ nicht an typ='SELL' gebunden; ein Verkauf mit negativem
    // Betrag muss denselben Erloes ergeben wie einer mit positivem.
    const negTxe = [
      kauf('2026-01-05', WELT, '2', '200'),
      tx({ tag: '2026-02-05', art: 'WERTPAPIER', typ: 'SELL', isin: WELT, mengeE8: -zuMengeE8('1'), betragCent: -zuCent('130') }),
    ];
    const negativ = fifo(negTxe, ausgeglicheneUebertraege(negTxe)).einstaende.get(WELT)!;
    const posTxe = [kauf('2026-01-05', WELT, '2', '200'), verkauf('2026-02-05', WELT, '1', '130')];
    const positiv = fifo(posTxe, ausgeglicheneUebertraege(posTxe)).einstaende.get(WELT)!;
    expect(negativ.realisiert).toBe(positiv.realisiert);
    expect(negativ.einstand).toBe(positiv.einstand);
  });

  it('behandelt ein ausgeglichenes Uebertragspaar nicht als Verkauf', () => {
    // Gekauft zu 100, dann komplett hinaus- und tags darauf zum aktuellen (hoeheren)
    // Wert wieder hereinuebertragen — derselbe Bestand, keine Marktransaktion.
    const txe = [
      kauf('2026-01-05', WELT, '1', '100'),
      uebertragRaus('2026-03-05', WELT, '1', '150'),
      uebertragRein('2026-03-06', WELT, '1', '151'),
    ];
    const e = fifo(txe, ausgeglicheneUebertraege(txe)).einstaende.get(WELT)!;
    expect(e.menge).toBe(zuMengeE8('1'));
    expect(e.einstand).toBe(zuCent('100'));
    expect(e.realisiert).toBe(0n);
    expect(e.tranchen).toEqual([{ tag: T('2026-01-05'), menge: zuMengeE8('1'), kosten: zuCent('100') }]);
  });

  it('gleicht ein Uebertragspaar unabhaengig von der Reihenfolge im Jahr aus', () => {
    const txe = [
      uebertragRein('2026-01-05', WELT, '2', '200'),
      uebertragRaus('2026-01-10', WELT, '2', '210'),
      kauf('2026-02-05', WELT, '1', '100'),
    ];
    const eingang = fifo(txe, ausgeglicheneUebertraege(txe)).einstaende.get(WELT)!;
    expect(eingang.menge).toBe(zuMengeE8('1'));
    expect(eingang.einstand).toBe(zuCent('100'));
    expect(eingang.realisiert).toBe(0n);
  });

  it('behandelt einen unpaarigen Uebertrag hinaus weiterhin wie einen Verkauf', () => {
    // Echter Depotwechsel zu einer anderen Bank: kein passendes TRANSFER_IN vorhanden.
    const txe = [kauf('2026-01-05', WELT, '1', '100'), uebertragRaus('2026-03-05', WELT, '1', '150')];
    const e = fifo(txe, ausgeglicheneUebertraege(txe)).einstaende.get(WELT)!;
    expect(e.menge).toBe(0n);
    expect(e.realisiert).toBe(zuCent('50'));
  });

  it('behandelt einen unpaarigen Uebertrag herein weiterhin wie einen Kauf', () => {
    // Zuzug von einer anderen Bank ohne bekannte Herkunft: Uebertragswert als Einstand.
    const txe = [uebertragRein('2026-01-05', WELT, '1', '100')];
    const e = fifo(txe, ausgeglicheneUebertraege(txe)).einstaende.get(WELT)!;
    expect(e.menge).toBe(zuMengeE8('1'));
    expect(e.einstand).toBe(zuCent('100'));
    expect(e.realisiert).toBe(0n);
  });

  it('paart nur exakt gleiche Mengen, nicht die Summe zweier kleinerer', () => {
    const txe = [
      kauf('2026-01-05', WELT, '3', '300'),
      uebertragRaus('2026-03-05', WELT, '3', '450'),
      uebertragRein('2026-03-06', WELT, '1', '150'),
      uebertragRein('2026-03-06', WELT, '2', '300'),
    ];
    const e = fifo(txe, ausgeglicheneUebertraege(txe)).einstaende.get(WELT)!;
    // Kein einzelnes TRANSFER_IN mit Menge 3: der Verkauf bleibt ein Verkauf,
    // beide TRANSFER_IN bleiben Kaeufe zum Uebertragswert.
    expect(e.menge).toBe(zuMengeE8('3'));
    expect(e.einstand).toBe(zuCent('450'));
    expect(e.realisiert).toBe(zuCent('150'));
  });
});

describe('positionsFluesse', () => {
  it('haengt den heutigen Wert als letzten Fluss an', () => {
    const txe = [kauf('2026-01-05', WELT, '1', '100'), verkauf('2026-03-05', WELT, '1', '130')];
    const f = positionsFluesse(txe, WELT, zuCent('0'), T('2026-08-26'), ausgeglicheneUebertraege(txe));
    expect(f).toEqual([
      { tag: '2026-01-05', betrag: -zuCent('100') },
      { tag: '2026-03-05', betrag: zuCent('130') },
      { tag: '2026-08-26', betrag: 0n },
    ]);
  });

  it('nimmt nur die eigene ISIN', () => {
    const txe = [kauf('2026-01-05', WELT, '1', '100'), kauf('2026-01-05', EUROPA, '1', '50')];
    const f = positionsFluesse(txe, WELT, zuCent('110'), T('2026-08-26'), ausgeglicheneUebertraege(txe));
    expect(f).toHaveLength(2);
    expect(f[1]!.betrag).toBe(zuCent('110'));
  });

  it('sortiert nach Tag', () => {
    const txe = [kauf('2026-03-05', WELT, '1', '120'), kauf('2026-01-05', WELT, '1', '100')];
    const f = positionsFluesse(txe, WELT, zuCent('250'), T('2026-08-26'), ausgeglicheneUebertraege(txe));
    expect(f.map((x) => x.tag)).toEqual(['2026-01-05', '2026-03-05', '2026-08-26']);
  });

  it('uebergeht Stornos und Schwebendes', () => {
    const txe = [
      kauf('2026-01-05', WELT, '1', '100'),
      kauf('2026-01-06', WELT, '1', '100', { storniert: true }),
      kauf('2026-01-07', WELT, '1', '100', { status: 'PENDING' }),
    ];
    const f = positionsFluesse(txe, WELT, zuCent('100'), T('2026-08-26'), ausgeglicheneUebertraege(txe));
    expect(f).toEqual([
      { tag: '2026-01-05', betrag: -zuCent('100') },
      { tag: '2026-08-26', betrag: zuCent('100') },
    ]);
  });

  it('bucht fuer ein ausgeglichenes Uebertragspaar weder Kauf noch Verkauf', () => {
    // Regressionstest: ohne die Ausnahme verzerrt der erfundene Erloes/Einstand genau
    // den XIRR dieser Position.
    const txe = [
      kauf('2026-01-05', WELT, '1', '100'),
      uebertragRaus('2026-03-05', WELT, '1', '150'),
      uebertragRein('2026-03-06', WELT, '1', '151'),
    ];
    const f = positionsFluesse(txe, WELT, zuCent('160'), T('2026-08-26'), ausgeglicheneUebertraege(txe));
    expect(f).toEqual([
      { tag: '2026-01-05', betrag: -zuCent('100') },
      { tag: '2026-08-26', betrag: zuCent('160') },
    ]);
  });

  it('bucht einen unpaarigen Uebertrag als Fluss nach der Richtung der Menge', () => {
    // Herein ist eingesetztes Kapital (negativ), hinaus ein Rueckfluss (positiv) —
    // unabhaengig davon, mit welchem Vorzeichen die Bank den Betrag liefert. [ADR-036]
    const txe = [uebertragRein('2026-01-05', WELT, '2', '200'), uebertragRaus('2026-06-05', WELT, '1', '120')];
    const f = positionsFluesse(txe, WELT, zuCent('130'), T('2026-08-26'), ausgeglicheneUebertraege(txe));
    expect(f).toEqual([
      { tag: '2026-01-05', betrag: -zuCent('200') },
      { tag: '2026-06-05', betrag: zuCent('120') },
      { tag: '2026-08-26', betrag: zuCent('130') },
    ]);
  });

  it('zaehlt Ausschuettungen der Position mit, Steuern nicht', () => {
    const txe = [
      kauf('2026-01-05', WELT, '1', '100'),
      tx({ tag: '2026-04-01', typ: 'DISTRIBUTION', art: 'CASH', isin: WELT, betragCent: zuCent('2') }),
      tx({ tag: '2026-04-01', typ: 'TAX', art: 'CASH', bezugIsin: WELT, betragCent: -zuCent('0.5') }),
      tx({ tag: '2026-05-01', typ: 'DISTRIBUTION', art: 'CASH', isin: EUROPA, betragCent: zuCent('3') }),
    ];
    const f = positionsFluesse(txe, WELT, zuCent('105'), T('2026-08-26'), ausgeglicheneUebertraege(txe));
    expect(f).toEqual([
      { tag: '2026-01-05', betrag: -zuCent('100') },
      { tag: '2026-04-01', betrag: zuCent('2') },
      { tag: '2026-08-26', betrag: zuCent('105') },
    ]);
  });
});

describe('fifo — Kapitalmassnahmen mit Betrag 0 [ADR-043]', () => {
  const massnahme = (tag: string, isin: Isin, menge: string) =>
    tx({ tag, typ: 'CORPORATE_ACTION', art: 'WERTPAPIER', isin, mengeE8: zuMengeE8(menge), betragCent: 0n });

  it('Split: mehr Stuecke, derselbe Einstand, Verkauf danach gegen den alten Einstand', () => {
    const txe = [
      kauf('2026-01-05', WELT, '10', '1000'),
      massnahme('2026-02-01', WELT, '40'),
      verkauf('2026-03-01', WELT, '25', '600'),
    ];
    const e = fifo(txe, ausgeglicheneUebertraege(txe)).einstaende.get(WELT)!;
    expect(e.menge).toBe(zuMengeE8('25'));
    expect(e.einstand).toBe(zuCent('500'));
    expect(e.realisiert).toBe(zuCent('100'));
  });

  it('Zusammenlegung: weniger Stuecke, kein realisierter Verlust', () => {
    const txe = [kauf('2026-01-05', WELT, '100', '1000'), massnahme('2026-02-01', WELT, '-90')];
    const r = fifo(txe, ausgeglicheneUebertraege(txe));
    const e = r.einstaende.get(WELT)!;
    expect(e.menge).toBe(zuMengeE8('10'));
    expect(e.einstand).toBe(zuCent('1000'));
    expect(e.realisiert).toBe(0n);
    expect(r.verkaeufe).toEqual([]);
  });

  it('ISIN-Wechsel: der Einstand wandert zur neuen ISIN', () => {
    const txe = [
      kauf('2026-01-05', WELT, '10', '1000'),
      massnahme('2026-02-01', WELT, '-10'),
      massnahme('2026-02-01', EUROPA, '20'),
    ];
    const r = fifo(txe, ausgeglicheneUebertraege(txe));
    expect(r.einstaende.get(WELT)).toMatchObject({ menge: 0n, einstand: 0n, realisiert: 0n });
    expect(r.einstaende.get(EUROPA)).toMatchObject({ menge: zuMengeE8('20'), einstand: zuCent('1000'), realisiert: 0n });
  });

  it('Abgang und Zugang an verschiedenen Tagen: Totalverlust und Gratisstuecke, kein Uebertrag [ADR-053]', () => {
    // Ueber Tage gepaart, landete ein Delisting im Einstand fremder Gratisstuecke.
    const txe = [
      kauf('2026-01-05', WELT, '10', '1000'),
      massnahme('2026-02-01', WELT, '-10'),
      massnahme('2026-02-02', EUROPA, '10'),
    ];
    const r = fifo(txe, ausgeglicheneUebertraege(txe));
    expect(r.einstaende.get(WELT)!.realisiert).toBe(zuCent('-1000'));
    expect(r.einstaende.get(EUROPA)).toMatchObject({ menge: zuMengeE8('10'), einstand: 0n });
    expect(r.ausbuchungen).toBe(1);
    expect(r.herkunft.get(EUROPA)).toBeUndefined();
  });

  it('Ausbuchung ohne Zugang: am selben Tag ein realisierter Verlust', () => {
    const txe = [kauf('2026-01-05', WELT, '10', '1000'), massnahme('2026-02-01', WELT, '-10')];
    const r = fifo(txe, ausgeglicheneUebertraege(txe));
    expect(r.einstaende.get(WELT)!.realisiert).toBe(zuCent('-1000'));
    expect(r.verkaeufe).toEqual([{ txId: txe[1]!.id, tag: '2026-02-01', isin: WELT, gewinnCent: zuCent('-1000') }]);
    expect(r.ausbuchungen).toBe(1);
  });

  it('ISIN-Wechsel: die neue ISIN kennt ihre Vorgaengerin, auch ueber zwei Wechsel', () => {
    const DRITTE = 'ZZ0000000009' as Isin;
    const txe = [
      kauf('2026-01-05', WELT, '10', '1000'),
      massnahme('2026-02-01', WELT, '-10'),
      massnahme('2026-02-01', EUROPA, '20'),
      massnahme('2026-03-01', EUROPA, '-20'),
      massnahme('2026-03-01', DRITTE, '5'),
    ];
    const r = fifo(txe, ausgeglicheneUebertraege(txe));
    expect(r.einstaende.get(DRITTE)!.einstand).toBe(zuCent('1000'));
    expect(r.herkunft.get(DRITTE)).toEqual([
      { isin: EUROPA, bis: '2026-03-01', zaehler: zuMengeE8('5'), nenner: zuMengeE8('5') },
      { isin: WELT, bis: '2026-02-01', zaehler: zuMengeE8('20') * zuMengeE8('5'), nenner: zuMengeE8('20') * zuMengeE8('5') },
    ]);
    expect(r.ausbuchungen).toBe(0);
  });

  it('Positions-IZF nach ISIN-Wechsel: der Kauf der Vorgaengerin ist der Einsatz [ADR-053]', () => {
    const txe = [
      kauf('2024-01-02', WELT, '10', '1000'),
      massnahme('2024-06-03', WELT, '-10'),
      massnahme('2024-06-03', EUROPA, '10'),
      kauf('2024-09-02', EUROPA, '5', '500'),
    ];
    const ausgeglichen = ausgeglicheneUebertraege(txe);
    const { herkunft } = fifo(txe, ausgeglichen);
    const f = positionsFluesse(txe, EUROPA, zuCent('1600'), T('2025-06-03'), ausgeglichen, herkunft.get(EUROPA));
    expect(f.filter((x) => x.betrag !== 0n)).toEqual([
      { tag: '2024-01-02', betrag: -zuCent('1000') },
      { tag: '2024-09-02', betrag: -zuCent('500') },
      { tag: '2025-06-03', betrag: zuCent('1600') },
    ]);
  });

  it('Positions-IZF nach ISIN-Wechsel: spaetere Kaeufe der Vorgaengerin gehoeren nicht dazu', () => {
    const txe = [
      kauf('2024-01-02', WELT, '10', '1000'),
      massnahme('2024-06-03', WELT, '-10'),
      massnahme('2024-06-03', EUROPA, '10'),
      kauf('2024-09-02', WELT, '1', '90'),
    ];
    const ausgeglichen = ausgeglicheneUebertraege(txe);
    const { herkunft } = fifo(txe, ausgeglichen);
    const f = positionsFluesse(txe, EUROPA, zuCent('1100'), T('2025-06-03'), ausgeglichen, herkunft.get(EUROPA));
    expect(f.filter((x) => x.betrag !== 0n).map((x) => x.tag)).toEqual(['2024-01-02', '2025-06-03']);
  });

  it('Gratisstuecke ohne Vorbestand: Einstand 0', () => {
    const txe = [massnahme('2026-02-01', EUROPA, '5')];
    expect(fifo(txe, ausgeglicheneUebertraege(txe)).einstaende.get(EUROPA)).toMatchObject({ menge: zuMengeE8('5'), einstand: 0n });
  });
});
