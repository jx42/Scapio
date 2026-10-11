/**
 * Nach einem Update am Rechenkern rechnet der START neu, nicht erst der naechste Lauf.
 * [INV-10] [ADR-013]
 *
 * Geprueft wird die Entscheidung, nicht die Rechnung selbst — die steckt in
 * `core/depotreihe.ts` und hat dort eigene Tests. Hier zaehlt nur: eine einzige zu alte
 * Zeile in `depot_tag` genuegt, und eine leere Datenbank loest nichts aus.
 */

import { describe, expect, it } from 'vitest';
import { KERN_VERSION } from '../../core/version.ts';
import { brauchtNeuberechnung } from '../../start/start.ts';

describe('brauchtNeuberechnung [INV-10]', () => {
  it('sagt nein bei leerer Datenbank — der erste Lauf rechnet ohnehin alles', () => {
    expect(brauchtNeuberechnung(null)).toBe(false);
  });

  it('sagt nein, wenn die gespeicherte Historie zum Rechenkern passt', () => {
    expect(brauchtNeuberechnung(KERN_VERSION)).toBe(false);
  });

  it('sagt ja, wenn auch nur eine Zeile aus einer aelteren Kernversion stammt', () => {
    expect(brauchtNeuberechnung(KERN_VERSION - 1)).toBe(true);
    expect(brauchtNeuberechnung(1)).toBe(true);
  });

  it('sagt nein bei einer neueren gespeicherten Version — dann ist der Bau alt, nicht die Daten', () => {
    expect(brauchtNeuberechnung(KERN_VERSION + 1)).toBe(false);
  });
});
