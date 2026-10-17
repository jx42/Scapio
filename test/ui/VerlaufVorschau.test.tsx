// @vitest-environment jsdom
/*
 * Vorschau des Zeitraumreglers: wo Linien stehen, wohin ihre Beschriftung klappt, und dass
 * sie nur im Fenster gilt, in dem gezogen wurde. Die Lage des Charts kommt hier fest herein —
 * jsdom misst nichts, also zeichnet Recharts dort keine Zeichenflaeche.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, render, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Zeitpunkt } from '@/lib/api';
import { beobachtbar } from '@/lib/beobachtbar';
import {
  VORSCHAU_FILTER_ID,
  VorschauBild,
  VorschauUeberlage,
  type ChartLage,
  type VorschauStand,
} from '@/features/verlauf/VerlaufVorschau';
import { useZeitraumVorschau } from '@/features/verlauf/useZeitraumVorschau';

const TAGE = ['2024-01-01', '2024-01-15', '2025-06-01', '2026-08-26'];
const X: Record<string, number> = { '2024-01-01': 5, '2024-01-15': 100, '2025-06-01': 200, '2026-08-26': 295 };

const LAGE: ChartLage = {
  flaeche: { left: 0, top: 8, width: 300, height: 200 },
  x: (tag) => X[tag] ?? 0,
  daten: TAGE.map((tag) => ({ tag }) as Zeitpunkt),
};

function anker(container: HTMLElement): (string | null)[] {
  return [...container.querySelectorAll('text')].map((t) => t.getAttribute('text-anchor'));
}

describe('VorschauBild', () => {
  it('setzt die Beschriftung aussen an die Linie', () => {
    const { container } = render(<VorschauBild vorschau={{ tage: TAGE, von: 2, bis: 3 }} lage={LAGE} />);
    // Beginn bei x=200: links davon ist Platz.
    expect(anker(container)[0]).toBe('end');
  });

  it('klappt die Beschriftung am Rand der Zeichenflaeche nach innen', () => {
    const { container } = render(<VorschauBild vorschau={{ tage: TAGE, von: 0, bis: 3 }} lage={LAGE} />);

    expect(container.querySelectorAll('line')).toHaveLength(2);
    expect(anker(container)).toEqual(['start', 'end']);
  });

  it('zeichnet fuer einen Griff ausserhalb des Fensters keine Linie, nur die Abdunkelung', () => {
    const tage = ['2023-06-01', ...TAGE, '2027-01-01'];
    const { container } = render(<VorschauBild vorschau={{ tage, von: 0, bis: 3 }} lage={LAGE} />);

    expect(container.querySelectorAll('line')).toHaveLength(1);
    expect(container.querySelector('text')).toHaveTextContent('01.06.2025');
    // Nur rechts vom Ende wird abgedunkelt; links faellt nichts weg.
    expect(container.querySelectorAll('rect')).toHaveLength(1);
  });
});

describe('VorschauUeberlage', () => {
  it('zeigt eine Vorschau nur im Fenster, in dem gezogen wurde', () => {
    const quelle = beobachtbar<VorschauStand>({ fuer: 'a', vorschau: { tage: TAGE, von: 1, bis: 2 } });
    const lage = beobachtbar<ChartLage | null>(LAGE);
    const { container, rerender } = render(<VorschauUeberlage anschluss={{ quelle, fenster: 'a' }} lage={lage} />);
    expect(container.querySelector('svg')).not.toBeNull();

    rerender(<VorschauUeberlage anschluss={{ quelle, fenster: 'b' }} lage={lage} />);

    expect(container.querySelector('svg')).toBeNull();
  });

  it('wartet, bis das Chart seine Lage gemeldet hat', () => {
    const quelle = beobachtbar<VorschauStand>({ fuer: 'a', vorschau: { tage: TAGE, von: 1, bis: 2 } });
    const lage = beobachtbar<ChartLage | null>(null);
    const { container } = render(<VorschauUeberlage anschluss={{ quelle, fenster: 'a' }} lage={lage} />);
    expect(container.querySelector('svg')).toBeNull();

    act(() => {
      lage.setze(LAGE);
    });

    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('nennt den Filter so, wie theme.css ihn anwendet', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/theme.css'), 'utf8');
    expect(css).toContain(`filter: url(#${VORSCHAU_FILTER_ID})`);
  });
});

describe('useZeitraumVorschau', () => {
  const AUSSCHNITT = { von: '2024-01-01', bis: '2026-08-26' };

  it('verwirft die Vorschau bei einer neuen Auswahl, auch wenn dasselbe Fenster zurueckkommt', () => {
    const { result, rerender } = renderHook(({ runde }) => useZeitraumVorschau(AUSSCHNITT, TAGE, runde), {
      initialProps: { runde: 0 },
    });
    act(() => {
      result.current.melde({ von: 1, bis: 3 });
    });
    const vorher = result.current.fenster;
    expect(result.current.anschluss.quelle.lies()?.fuer).toBe(vorher);

    rerender({ runde: 1 });

    expect(result.current.fenster).not.toBe(vorher);
    expect(result.current.anschluss.quelle.lies()).toBeNull();
  });

  it('nimmt die Vorschau zurueck, wenn der Regler wieder am Ausgang steht', () => {
    const { result } = renderHook(() => useZeitraumVorschau(AUSSCHNITT, TAGE, 0));
    act(() => {
      result.current.melde({ von: 1, bis: 3 });
      result.current.melde(null);
    });

    expect(result.current.anschluss.quelle.lies()).toBeNull();
  });
});
