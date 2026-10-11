import { describe, expect, it } from 'vitest';
import { zuCent } from '../../core/dezimal.ts';
import { VORGABE_SCHWELLEN, drift, driftJePosition } from '../../core/drift.ts';
import type { Cent } from '../../core/dezimal.ts';
import type { Isin } from '../../core/typen.ts';
import { EUROPA, WELT, bestand, depotTag } from '../hilfen.ts';

const positionen = (eintraege: readonly (readonly [Isin, string])[]): Map<Isin, Cent> =>
  new Map(eintraege.map(([isin, betrag]) => [isin, zuCent(betrag)]));

describe('drift', () => {
  it('meldet ok, wenn berechnet und gemeldet uebereinstimmen', () => {
    const e = drift(depotTag('2026-08-26', '10000', { wertpapiereCent: zuCent('9000'), cashCent: zuCent('1000') }), [bestand(WELT, '90', '100')], zuCent('1000'));
    expect(e.stufe).toBe('ok');
    expect(e.abweichung).toBe(0);
    expect(e.cashAbweichung).toBe(0);
    expect(e.grund).toBeNull();
  });

  it('steigt Stufe fuer Stufe', () => {
    const gemeldet = zuCent('10000');
    const faelle: readonly (readonly [string, string])[] = [
      ['10005', 'ok'],
      ['10010', 'hinweis'],
      ['10040', 'hinweis'],
      ['10050', 'banner'],
      ['10190', 'banner'],
      ['10200', 'abbruch'],
      ['12000', 'abbruch'],
    ];
    for (const [berechnet, erwartet] of faelle) {
      const e = drift(depotTag('2026-08-26', berechnet), [bestand(WELT, '100', '100')], 0n);
      expect(e.stufe, `${berechnet} gegen ${gemeldet}`).toBe(erwartet);
    }
  });

  it('nimmt die Schwellen aus der Konfiguration, wenn sie kommen', () => {
    const e = drift(depotTag('2026-08-26', '10100'), [bestand(WELT, '100', '100')], 0n, {
      hinweis: 0.05,
      banner: 0.1,
      abbruch: 0.2,
    });
    expect(e.stufe).toBe('ok');
  });

  it('haelt die Vorgabeschwellen fest', () => {
    expect(VORGABE_SCHWELLEN).toEqual({ hinweis: 0.001, banner: 0.005, abbruch: 0.02 });
  });

  it('misst die Abweichung in beide Richtungen gleich', () => {
    const hoch = drift(depotTag('2026-08-26', '10100'), [bestand(WELT, '100', '100')], 0n);
    const runter = drift(depotTag('2026-08-26', '9900'), [bestand(WELT, '100', '100')], 0n);
    expect(hoch.abweichung).toBeCloseTo(runter.abweichung, 12);
  });

  it('setzt aus, statt zu bestehen, wenn der Bestand fehlt', () => {
    // Ein leerer Bestand heisst nicht "alles stimmt", sondern "nicht geprueft".
    const e = drift(depotTag('2026-08-26', '10000'), [], zuCent('1000'));
    expect(e.stufe).toBe('ausgesetzt');
    expect(e.grund).toMatch(/nicht abgerufen/);
    expect(e.berechnetGesamtCent).toBe(zuCent('10000'));
  });

  it('meldet "leer" statt "ausgesetzt", wenn es noch keine berechnete Reihe gibt', () => {
    // Erststart: nichts zu pruefen ist kein Warnsignal.
    const e = drift(null, [bestand(WELT, '100', '100')], 0n);
    expect(e.stufe).toBe('leer');
    expect(e.grund).toBeNull();
    expect(e.berechnetGesamtCent).toBe(0n);
  });

  it('rechnet den gemeldeten Cash in den Gesamtwert ein', () => {
    const e = drift(depotTag('2026-08-26', '11000', { cashCent: zuCent('1000') }), [bestand(WELT, '100', '100')], zuCent('1000'));
    expect(e.gemeldetGesamtCent).toBe(zuCent('11000'));
    expect(e.stufe).toBe('ok');
  });

  it('weist die Cash-Abweichung getrennt aus', () => {
    const e = drift(
      depotTag('2026-08-26', '10500', { wertpapiereCent: zuCent('10000'), cashCent: zuCent('500') }),
      [bestand(WELT, '100', '100')],
      zuCent('1000'),
    );
    expect(e.cashAbweichung).toBeCloseTo(0.5, 12);
  });

  it('nennt null gegen null nicht als Abweichung', () => {
    const e = drift(depotTag('2026-08-26', '0'), [bestand(WELT, '0', '100')], 0n);
    expect(e.abweichung).toBe(0);
    expect(e.stufe).toBe('ok');
  });

  it('wertet etwas gegen null als volle Abweichung', () => {
    const e = drift(depotTag('2026-08-26', '100'), [bestand(WELT, '0', '100')], 0n);
    expect(e.abweichung).toBe(1);
    expect(e.stufe).toBe('abbruch');
  });

  it('laesst die Positionsliste leer, solange keine Positionswerte vorliegen', () => {
    const e = drift(depotTag('2026-08-26', '10000'), [bestand(WELT, '100', '100')], 0n);
    expect(e.positionen).toEqual([]);
  });

  it('zeigt mit Positionswerten, WELCHE Position auseinanderlaeuft', () => {
    const e = drift(
      depotTag('2026-08-26', '15000'),
      [bestand(WELT, '100', '100'), bestand(EUROPA, '100', '50')],
      0n,
      VORGABE_SCHWELLEN,
      positionen([[WELT, '10000'], [EUROPA, '5000']]),
    );
    expect(e.positionen).toHaveLength(2);
    expect(e.positionen[0]!.abweichung).toBeCloseTo(0, 12);
  });
});

describe('driftJePosition', () => {
  it('stellt die groesste Abweichung nach vorn', () => {
    const details = driftJePosition(positionen([[WELT, '10000'], [EUROPA, '2500']]), [
      bestand(WELT, '100', '100'),
      bestand(EUROPA, '100', '50'),
    ]);
    expect(details[0]!.isin).toBe(EUROPA);
    expect(details[0]!.abweichung).toBeCloseTo(0.5, 12);
    expect(details[1]!.abweichung).toBeCloseTo(0, 12);
  });

  it('meldet eine gemeldete, aber nicht berechnete Position als volle Abweichung', () => {
    const details = driftJePosition(new Map(), [bestand(WELT, '100', '100')]);
    expect(details[0]!.berechnetCent).toBe(0n);
    expect(details[0]!.abweichung).toBe(1);
  });

  it('ergibt ohne Bestand nichts', () => {
    expect(driftJePosition(positionen([[WELT, '10000']]), [])).toEqual([]);
  });
});
