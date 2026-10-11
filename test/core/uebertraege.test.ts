import { describe, expect, it } from 'vitest';
import { zuCent, zuKursE6 } from '../../core/dezimal.ts';
import { ausgeglicheneUebertraege, bewerteAusgaenge } from '../../core/uebertraege.ts';
import { EUROPA, WELT, kauf, uebertragRaus, uebertragRein } from '../hilfen.ts';

describe('ausgeglicheneUebertraege', () => {
  it('paart nicht ueber mehr als 30 Tage', () => {
    // Zwei Ueberträge Monate auseinander sind zwei echte Depotwechsel, kein Paar. [ADR-036]
    const raus = uebertragRaus('2026-01-05', WELT, '1', '150');
    const rein = uebertragRein('2026-02-05', WELT, '1', '151');
    expect(ausgeglicheneUebertraege([raus, rein])).toEqual(new Set());
    const reinNah = uebertragRein('2026-02-04', WELT, '1', '151');
    expect(ausgeglicheneUebertraege([raus, reinNah])).toEqual(new Set([raus.id, reinNah.id]));
  });

  it('paart keine stornierte oder schwebende Buchung', () => {
    const raus = uebertragRaus('2026-03-05', WELT, '1', '150');
    const storno = uebertragRein('2026-03-06', WELT, '1', '151', { storniert: true });
    const schwebend = uebertragRein('2026-03-06', WELT, '1', '151', { status: 'PENDING' });
    expect(ausgeglicheneUebertraege([raus, storno, schwebend])).toEqual(new Set());
  });

  it('findet ein gepaartes Uebertragspaar derselben ISIN', () => {
    const raus = uebertragRaus('2026-03-05', WELT, '1', '150');
    const rein = uebertragRein('2026-03-06', WELT, '1', '151');
    const ausgeschlossen = ausgeglicheneUebertraege([raus, rein]);
    expect(ausgeschlossen).toEqual(new Set([raus.id, rein.id]));
  });

  it('ignoriert die Reihenfolge im Jahr', () => {
    const rein = uebertragRein('2026-01-05', WELT, '2', '200');
    const raus = uebertragRaus('2026-01-10', WELT, '2', '210');
    const ausgeschlossen = ausgeglicheneUebertraege([rein, raus]);
    expect(ausgeschlossen).toEqual(new Set([rein.id, raus.id]));
  });

  it('laesst einen unpaarigen Uebertrag hinaus unberuehrt', () => {
    const raus = uebertragRaus('2026-03-05', WELT, '1', '150');
    expect(ausgeglicheneUebertraege([raus])).toEqual(new Set());
  });

  it('laesst einen unpaarigen Uebertrag herein unberuehrt', () => {
    const rein = uebertragRein('2026-01-05', WELT, '1', '100');
    expect(ausgeglicheneUebertraege([rein])).toEqual(new Set());
  });

  it('paart nur exakt gleiche Mengen, nicht die Summe zweier kleinerer', () => {
    const raus = uebertragRaus('2026-03-05', WELT, '3', '450');
    const reinA = uebertragRein('2026-03-06', WELT, '1', '150');
    const reinB = uebertragRein('2026-03-06', WELT, '2', '300');
    expect(ausgeglicheneUebertraege([raus, reinA, reinB])).toEqual(new Set());
  });

  it('paart mehrere Paare unabhaengig voneinander', () => {
    const rausA = uebertragRaus('2026-03-05', WELT, '1', '150');
    const reinA = uebertragRein('2026-03-06', WELT, '1', '151');
    const rausB = uebertragRaus('2026-03-05', EUROPA, '2', '100');
    const reinB = uebertragRein('2026-03-06', EUROPA, '2', '101');
    const ausgeschlossen = ausgeglicheneUebertraege([rausA, reinA, rausB, reinB]);
    expect(ausgeschlossen).toEqual(new Set([rausA.id, reinA.id, rausB.id, reinB.id]));
  });

  it('bindet einen Treffer nicht doppelt, wenn zwei Uebertraege dieselbe Menge tragen', () => {
    // Zwei TRANSFER_OUT mit gleicher Menge, aber nur ein passendes TRANSFER_IN:
    // genau ein Paar wird ausgeschlossen, das andere TRANSFER_OUT bleibt ein Verkauf.
    const rausA = uebertragRaus('2026-03-05', WELT, '1', '150', { id: 'raus-a' });
    const rausB = uebertragRaus('2026-03-05', WELT, '1', '150', { id: 'raus-b' });
    const rein = uebertragRein('2026-03-06', WELT, '1', '151', { id: 'rein' });
    const ausgeschlossen = ausgeglicheneUebertraege([rausA, rausB, rein]);
    expect(ausgeschlossen.size).toBe(2);
    expect(ausgeschlossen.has('rein')).toBe(true);
    expect(ausgeschlossen.has('raus-a') || ausgeschlossen.has('raus-b')).toBe(true);
    expect(ausgeschlossen.has('raus-a') && ausgeschlossen.has('raus-b')).toBe(false);
  });

  it('ignoriert andere Transaktionstypen und Cash-Buchungen', () => {
    const k = kauf('2026-01-05', WELT, '1', '100');
    expect(ausgeglicheneUebertraege([k])).toEqual(new Set());
  });

  it('bindet keine Uebertraege verschiedener ISIN aneinander', () => {
    const raus = uebertragRaus('2026-03-05', WELT, '1', '150');
    const rein = uebertragRein('2026-03-06', EUROPA, '1', '151');
    expect(ausgeglicheneUebertraege([raus, rein])).toEqual(new Set());
  });
});

describe('bewerteAusgaenge [ADR-043]', () => {
  it('bewertet einen unverpaarten Ausgang ohne Betrag zum Kurs seines Tages', () => {
    const raus = uebertragRaus('2026-03-02', WELT, '4', '0');
    const [bewertet] = bewerteAusgaenge([raus], new Set(), () => zuKursE6('125'));
    expect(bewertet!.betragCent).toBe(zuCent('-500'));
  });

  it('laesst Paare, Ausgaenge mit Wert, Eingaenge und Ausgaenge ohne Kurs unveraendert', () => {
    const paarRaus = uebertragRaus('2026-03-02', WELT, '1', '0');
    const paarRein = uebertragRein('2026-03-03', WELT, '1', '0');
    const mitWert = uebertragRaus('2026-03-02', EUROPA, '2', '300');
    const rein = uebertragRein('2026-04-01', EUROPA, '3', '0');
    const txe = [paarRaus, paarRein, mitWert, rein];
    expect(bewerteAusgaenge(txe, ausgeglicheneUebertraege(txe), () => zuKursE6('125'))).toBe(txe);
    expect(bewerteAusgaenge([uebertragRaus('2026-03-02', WELT, '4', '0')], new Set(), () => null)[0]!.betragCent).toBe(0n);
  });
});
