import { describe, expect, it } from 'vitest';
import { ERTRAGS_TYPEN, EXTERNE_TYPEN, INTERNE_TYPEN, einordnen, istBekannterTyp, zaehlt } from '../../core/typen.ts';
import { kauf, tx } from '../hilfen.ts';

/**
 * Die Einordnung ist die folgenreichste Entscheidung der Anwendung [P-05].
 * Sie bekommt deshalb keine schoenen Beispiele, sondern die Grenzfaelle.
 */
describe('einordnen', () => {
  it('zaehlt echte Ueberweisungen als extern', () => {
    expect(einordnen('CASH_TRANSFER_IN')).toBe('extern');
    expect(einordnen('CASH_TRANSFER_OUT')).toBe('extern');
    expect(einordnen('PAYOUT')).toBe('extern');
  });

  it('zaehlt einen Sparplankauf NICHT als externen Fluss', () => {
    // Er schiebt Geld nur von der Cash- auf die Wertpapierseite desselben Depots.
    expect(einordnen('SAVINGS_PLAN')).toBe('intern');
    expect(einordnen('BUY')).toBe('intern');
    expect(einordnen('SELL')).toBe('intern');
  });

  it('zaehlt echte Ertraege als Ertrag, nicht als Einzahlung', () => {
    // Als Einzahlung gewertet wuerden sie die Rendite kuenstlich druecken.
    expect(einordnen('INTEREST')).toBe('ertrag');
    expect(einordnen('TAX_RETURN')).toBe('ertrag');
  });

  it('zaehlt DEPOSIT als externe Einzahlung, nicht als Ertrag', () => {
    // DEPOSIT ist ueberwiegend echtes eingesetztes Kapital (Ersteinzahlung,
    // Sparplan-Nachschuss); ein einmaliger Wechselbonus ist hier die Ausnahme, nicht
    // die Regel. Als Ertrag gezaehlt wuerde der Regelfall die Rendite verzerren.
    expect(einordnen('DEPOSIT')).toBe('extern');
    expect(einordnen('DEPOSIT_TRANSFER')).toBe('extern');
  });

  it('liest Kleinschreibung wie Grossschreibung', () => {
    expect(einordnen('cash_transfer_in')).toBe('extern');
    expect(einordnen('Interest')).toBe('ertrag');
  });

  it('haelt einen unbekannten Typ fuer intern, nicht fuer extern', () => {
    // Ein unbekannter Typ darf die Renditerechnung nicht heimlich verschieben.
    expect(einordnen('ZUKUNFTSTYP')).toBe('intern');
    expect(einordnen('')).toBe('intern');
  });

  it('meldet, dass ein unbekannter Typ unbekannt ist', () => {
    expect(istBekannterTyp('ZUKUNFTSTYP')).toBe(false);
    expect(istBekannterTyp('BUY')).toBe(true);
    expect(istBekannterTyp('interest')).toBe(true);
  });

  it('ordnet jeden bekannten Typ genau einer Gruppe zu', () => {
    const alle = [...EXTERNE_TYPEN, ...ERTRAGS_TYPEN, ...INTERNE_TYPEN];
    expect(new Set(alle).size).toBe(alle.length);
  });
});

describe('zaehlt', () => {
  it('nimmt nur ausgefuehrte, nicht stornierte Transaktionen', () => {
    expect(zaehlt(kauf('2026-01-05', 'IE00B4L5Y983', '1', '100'))).toBe(true);
    expect(zaehlt(tx({ tag: '2026-01-05', status: 'PENDING' }))).toBe(false);
    expect(zaehlt(tx({ tag: '2026-01-05', status: 'CANCELED' }))).toBe(false);
    expect(zaehlt(tx({ tag: '2026-01-05', storniert: true }))).toBe(false);
  });
});
