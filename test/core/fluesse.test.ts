import { describe, expect, it } from 'vitest';
import { zuCent } from '../../core/dezimal.ts';
import { LEERE_UEBERSICHT, letzteMonate, monatsFluesse, schnittDerMonate } from '../../core/fluesse.ts';
import { T, fluss } from '../hilfen.ts';

describe('monatsFluesse', () => {
  it('trennt Zu- und Abfluesse und stellt beide positiv dar', () => {
    const u = monatsFluesse([fluss('2026-01-05', '500'), fluss('2026-01-20', '-200')]);
    expect(u.monate).toEqual([{ monat: '2026-01', zu: zuCent('500'), ab: zuCent('200') }]);
  });

  it('laesst keinen Monat aus, auch wenn nichts passiert ist', () => {
    // Ein fehlender Monat im Balkendiagramm saehe aus wie ein kuerzerer Zeitraum,
    // nicht wie eine Pause.
    const u = monatsFluesse([fluss('2025-11-05', '500'), fluss('2026-02-05', '500')]);
    expect(u.monate.map((m) => m.monat)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(u.monate[1]).toEqual({ monat: '2025-12', zu: 0n, ab: 0n });
  });

  it('rechnet den Schnitt ueber alle Monate, nicht nur ueber die mit Bewegung', () => {
    const u = monatsFluesse([fluss('2026-01-05', '400'), fluss('2026-04-05', '400')]);
    expect(u.monate).toHaveLength(4);
    expect(u.schnitt).toBe(zuCent('200'));
  });

  it('nimmt fuer den 12-Monats-Schnitt nur die letzten zwoelf Monate', () => {
    const fluesse = Array.from({ length: 24 }, (_, i) => {
      const monat = String((i % 12) + 1).padStart(2, '0');
      const jahr = 2025 + Math.floor(i / 12);
      return fluss(`${jahr}-${monat}-05`, i < 12 ? '100' : '300');
    });
    const u = monatsFluesse(fluesse);
    expect(u.monate).toHaveLength(24);
    expect(u.schnitt).toBe(zuCent('200'));
    expect(u.schnitt12).toBe(zuCent('300'));
  });

  it('nimmt den Median bei ungerader Anzahl aus der Mitte', () => {
    const u = monatsFluesse([fluss('2026-01-05', '100'), fluss('2026-02-05', '900'), fluss('2026-03-05', '200')]);
    expect(u.median).toBe(zuCent('200'));
  });

  it('mittelt den Median bei gerader Anzahl', () => {
    const u = monatsFluesse([fluss('2026-01-05', '100'), fluss('2026-02-05', '200')]);
    expect(u.median).toBe(zuCent('150'));
  });

  it('ist gegen Ausreisser unempfindlicher als der Schnitt', () => {
    const u = monatsFluesse([
      fluss('2026-01-05', '500'),
      fluss('2026-02-05', '500'),
      fluss('2026-03-05', '50000'),
    ]);
    expect(u.median).toBe(zuCent('500'));
    expect(u.schnitt).toBeGreaterThan(u.median);
  });

  it('ergibt aus nichts die leere Uebersicht', () => {
    expect(monatsFluesse([])).toBe(LEERE_UEBERSICHT);
  });

  it('fuehrt die Monate bis `bis` fort, auch ohne Zahlung', () => {
    // Nach einer Sparpause sinkt der Schnitt — sonst stuende die alte Rate da. [ADR-036]
    const u = monatsFluesse([fluss('2026-01-05', '600')], T('2026-06-30'));
    expect(u.monate).toHaveLength(6);
    expect(u.schnitt).toBe(zuCent('100'));
  });
});

describe('letzteMonate', () => {
  it('gibt das Fenster vom Ende her', () => {
    const u = monatsFluesse([fluss('2026-01-05', '100'), fluss('2026-02-05', '100'), fluss('2026-03-05', '100')]);
    expect(letzteMonate(u, 2).map((m) => m.monat)).toEqual(['2026-02', '2026-03']);
    expect(letzteMonate(u, 99)).toHaveLength(3);
  });
});

describe('schnittDerMonate', () => {
  it('mittelt nur die uebergebenen Monate', () => {
    const u = monatsFluesse([fluss('2026-01-05', '600'), fluss('2026-02-05', '100'), fluss('2026-03-05', '300')]);
    expect(schnittDerMonate(letzteMonate(u, 2))).toBe(zuCent('200'));
    expect(schnittDerMonate(u.monate)).toBe(u.schnitt);
  });

  it('ist bei leerer Liste null', () => {
    expect(schnittDerMonate([])).toBe(0n);
  });
});
