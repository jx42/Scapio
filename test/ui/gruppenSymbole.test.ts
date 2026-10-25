/*
 * Symbol der Ringmitte: Anbieter schreiben Länder und Sektoren englisch (Xtrackers, Amundi) oder
 * deutsch (iShares, mit und ohne Umlaut) — jede Schreibweise muss dasselbe Symbol treffen.
 */
import { Cpu, Earth, Landmark, ShoppingBag, ShoppingBasket } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { landSymbol, sektorSymbol } from '@/features/top25/gruppenSymbole';
import { flagge } from '@/lib/flaggen';

describe('gruppenSymbole', () => {
  it('findet die Flagge unter jeder Schreibweise', () => {
    const usa = flagge('United States');
    expect(usa).toBeDefined();
    for (const name of ['Vereinigte Staaten', 'USA', ' united states ']) expect(landSymbol(name)).toEqual({ flagge: usa });
    expect(landSymbol('Korea (Süd)')).toEqual(landSymbol('Korea (Sued)'));
    expect(landSymbol('Österreich')).toEqual({ flagge: flagge('Austria') });
  });

  it('fällt bei unbekanntem Land auf die Erdkugel, bei „Übrige“ ebenso', () => {
    expect(landSymbol('Atlantis')).toBe(Earth);
    expect(landSymbol(null)).toBe(Earth);
    expect(sektorSymbol(null)).toBe(Earth);
  });

  it('kennt Sektoren englisch, deutsch und in der Anzeigeform', () => {
    for (const name of ['Information Technology', 'Informationstechnologie', 'IT']) expect(sektorSymbol(name)).toBe(Cpu);
    expect(sektorSymbol('Finanzwesen')).toBe(Landmark);
    expect(sektorSymbol('Zyklische Konsumgüter')).toBe(ShoppingBag);
    expect(sektorSymbol('Nichtzyklische Konsumgüter')).toBe(ShoppingBasket);
    expect(sektorSymbol('Unbekannt')).toBe(Earth);
  });
});
