// @vitest-environment jsdom
/*
 * zaehlerAnzeige ist die reine Interpolation ohne Timer — hier praezise mit festen
 * Fortschrittswerten geprueft. useZahlZaehler bindet daran nur noch die Framezeit
 * (rAF/performance.now); dafuer genuegt ein schlanker Verdrahtungstest mit echten,
 * kurzen Wartezeiten statt gefakter Timer, die mit rAF unzuverlaessig zusammenspielen.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useStufenZaehler, useZahlZaehler, zaehlerAnzeige } from '@/hooks/useZahlZaehler';

describe('zaehlerAnzeige', () => {
  it('zeigt bei fortschritt 0 den Startbetrag in Vorzeichen und Form des Zielwerts', () => {
    expect(zaehlerAnzeige('100 €', '120 €', 0)).toBe('100 €');
  });

  it('zeigt bei fortschritt 1 exakt den Zielwert, ohne Rundungsabweichung', () => {
    expect(zaehlerAnzeige('100 €', '120 €', 1)).toBe('120 €');
  });

  it('interpoliert dazwischen mit ease-out', () => {
    // easeOutQuad(0.5) = 0.75 → 100 + (120-100) * 0.75 = 115
    expect(zaehlerAnzeige('100 €', '120 €', 0.5)).toBe('115 €');
  });

  it('erhaelt Vorzeichen und Nachkommastellen des Zielwerts, nicht die des Startwerts', () => {
    // easeOutQuad(0.5) = 0.75 → 11,23 + (5,00-11,23) * 0.75 = 6,5575 → "6,56"
    expect(zaehlerAnzeige('−11,23 %', '+5,00 %', 0.5)).toBe('+6,56 %');
  });

  it('bleibt unveraendert, wenn Start- und Zielwert gleich sind', () => {
    expect(zaehlerAnzeige('100 €', '100 €', 0.5)).toBe('100 €');
  });

  it('springt direkt auf das Ziel, wenn der Startwert keine Zahl enthaelt', () => {
    expect(zaehlerAnzeige('nicht berechenbar', '120 €', 0.5)).toBe('120 €');
  });

  it('springt direkt auf das Ziel, wenn der Zielwert keine Zahl enthaelt', () => {
    expect(zaehlerAnzeige('120 €', 'nicht berechenbar', 0.5)).toBe('nicht berechenbar');
  });
});

describe('useZahlZaehler', () => {
  it('zeigt beim ersten Render den Wert direkt — sonst zaehlte jede Zahl schon beim Laden der Seite', () => {
    const { result } = renderHook(() => useZahlZaehler('100 €'));
    expect(result.current).toBe('100 €');
  });

  it('bleibt unveraendert, wenn derselbe Wert erneut gerendert wird', () => {
    const { result, rerender } = renderHook(({ wert }) => useZahlZaehler(wert), {
      initialProps: { wert: '100 €' },
    });

    rerender({ wert: '100 €' });
    expect(result.current).toBe('100 €');
  });

  it('zaehlt zum neuen Wert hoch und kommt dort an, statt sofort umzuspringen', async () => {
    const { result, rerender } = renderHook(({ wert }) => useZahlZaehler(wert), {
      initialProps: { wert: '100 €' },
    });

    rerender({ wert: '120 €' });

    // Ein Frame nach der Aenderung ist das Ziel (700ms Dauer) noch nicht erreicht.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(result.current).not.toBe('120 €');

    await waitFor(() => expect(result.current).toBe('120 €'), { timeout: 5000 });
  });
});

describe('useStufenZaehler', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('zaehlt durch die Stufen, statt zu springen', async () => {
    const { result, rerender } = renderHook(({ ziel }) => useStufenZaehler(ziel), { initialProps: { ziel: 0 } });

    rerender({ ziel: 100 });

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(result.current).toBeLessThan(100);
    await waitFor(() => expect(result.current).toBe(100), { timeout: 5000 });
  });

  it('springt bei reduzierter Bewegung sofort aufs Ziel', () => {
    vi.stubGlobal('matchMedia', (abfrage: string) => ({ matches: abfrage.includes('reduce'), media: abfrage }));
    const { result, rerender } = renderHook(({ ziel }) => useStufenZaehler(ziel), { initialProps: { ziel: 0 } });

    rerender({ ziel: 100 });

    expect(result.current).toBe(100);
  });
});
