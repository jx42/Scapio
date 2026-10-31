/*
 * Treemap und Sektorring färben denselben Sektor gleich (ADR-060); grau ist, was im Ring keine
 * eigene Farbe hat.
 */

import { describe, expect, it } from 'vitest';

import type { Gruppe } from '@/lib/api';
import { FARBE } from '@/lib/farben';
import { ringFarbe } from '@/components/Ring';
import { gruppenFarbe, gruppenIndex } from '@/features/aufteilung/analyse/GruppenRing';

const SEKTOREN: Gruppe[] = [
  { name: 'Information Technology', exposureCent: 30, anteil: 0.5 },
  { name: 'Financials', exposureCent: 20, anteil: 0.3 },
  { name: null, exposureCent: 10, anteil: 0.2 },
];

describe('gruppenIndex', () => {
  it('findet den Sektor über den Rohnamen, auch mit Leerraum', () => {
    expect(gruppenIndex(SEKTOREN, 'Financials')).toBe(1);
    expect(gruppenIndex(SEKTOREN, ' Information Technology ')).toBe(0);
  });

  it('ordnet Unbekanntes und Fehlendes „Übrige“ zu', () => {
    expect(gruppenIndex(SEKTOREN, 'Raumfahrt')).toBe(2);
    expect(gruppenIndex(SEKTOREN, null)).toBe(2);
    expect(gruppenIndex(SEKTOREN, '  ')).toBe(2);
  });

  it('gibt -1, wenn es auch „Übrige“ nicht gibt', () => {
    expect(gruppenIndex(SEKTOREN.slice(0, 2), 'Raumfahrt')).toBe(-1);
    expect(gruppenIndex([], 'Financials')).toBe(-1);
  });
});

describe('gruppenFarbe', () => {
  it('nimmt die Ringfarbe des Index', () => {
    expect(gruppenFarbe(SEKTOREN, 'Information Technology')).toBe(ringFarbe(0));
    expect(gruppenFarbe(SEKTOREN, 'Financials')).toBe(ringFarbe(1));
  });

  it('färbt „Übrige“, Unbekanntes und Fehlendes grau', () => {
    expect(gruppenFarbe(SEKTOREN, 'Raumfahrt')).toBe(FARBE.rand);
    expect(gruppenFarbe(SEKTOREN, null)).toBe(FARBE.rand);
    expect(gruppenFarbe(SEKTOREN.slice(0, 2), 'Raumfahrt')).toBe(FARBE.rand);
  });
});
