// @vitest-environment jsdom
/*
 * Zeitraumregler: wann die Vorschau kommt und geht, und dass ein neues Fenster von aussen
 * die Griffe versetzt, ohne den Regler neu zu mounten (sonst gleitet nichts).
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { de } from '@/i18n/de';
import { Zeitraumregler } from '@/features/verlauf/Zeitraumregler';
import { fokussieren } from './hilfen';

const TAGE = ['2024-01-01', '2024-01-15', '2025-06-01', '2026-08-26'];

function regler(von: string, bis: string, onWahl = vi.fn(), onVorschau = vi.fn()) {
  return <Zeitraumregler tage={TAGE} fenster={`${von}|${bis}`} von={von} bis={bis} gesperrt={false} onWahl={onWahl} onVorschau={onVorschau} />;
}

/** jsdom kennt weder PointerEvent noch Pointer-Capture; Radix braucht beides zum Ziehen. */
beforeAll(() => {
  class Zeigerereignis extends MouseEvent {
    readonly pointerId: number;
    constructor(typ: string, init: PointerEventInit = {}) {
      super(typ, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  vi.stubGlobal('PointerEvent', Zeigerereignis);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = () => true;
});

/** Drueckt auf die Spur bei einem Drittel — der Beginn springt auf Stufe 1. */
function ziehe(onWahl = vi.fn(), onVorschau = vi.fn()) {
  const { container } = render(regler('2024-01-01', '2026-08-26', onWahl, onVorschau));
  const wurzel = container.querySelector<HTMLElement>('[data-slot="slider"]')!;
  wurzel.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 300, height: 10 });
  const spur = container.querySelector<HTMLElement>('[data-slot="slider-range"]')!;
  fireEvent.pointerDown(spur, { pointerId: 1, clientX: 100, button: 0 });
  return spur;
}

describe('Zeitraumregler', () => {
  it('waehlt auch, wenn der Capture ohne Loslassen endet', () => {
    const onWahl = vi.fn();
    const spur = ziehe(onWahl);

    fireEvent.lostPointerCapture(spur, { pointerId: 1 });

    expect(onWahl).toHaveBeenCalledWith('2024-01-15', '2026-08-26');
  });

  it('waehlt nach dem Loslassen genau einmal', () => {
    const onWahl = vi.fn();
    const spur = ziehe(onWahl);

    fireEvent.pointerUp(spur, { pointerId: 1, clientX: 100 });
    fireEvent.lostPointerCapture(spur, { pointerId: 1 });

    expect(onWahl).toHaveBeenCalledTimes(1);
  });

  it('meldet die Vorschau sofort und waehlt mit der Tastatur erst nach einer Pause', async () => {
    const onWahl = vi.fn();
    const onVorschau = vi.fn();
    render(regler('2024-01-01', '2026-08-26', onWahl, onVorschau));

    fokussieren(screen.getByRole('slider', { name: de.verlauf.reglerBeginn }));
    await userEvent.keyboard('{ArrowRight}');

    expect(onVorschau).toHaveBeenLastCalledWith({ von: 1, bis: 3 });
    expect(onWahl).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(onWahl).toHaveBeenCalledWith('2024-01-15', '2026-08-26');
    });
  });

  it('fasst schnelle Tastendruecke zu einer Wahl zusammen', async () => {
    const onWahl = vi.fn();
    render(regler('2024-01-01', '2026-08-26', onWahl));

    fokussieren(screen.getByRole('slider', { name: de.verlauf.reglerBeginn }));
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');

    await waitFor(() => {
      expect(onWahl).toHaveBeenCalledWith('2025-06-01', '2026-08-26');
    });
    expect(onWahl).toHaveBeenCalledTimes(1);
  });

  it('nimmt die Vorschau zurueck und waehlt nichts, wenn die Griffe wieder auf dem Fenster stehen', async () => {
    const onWahl = vi.fn();
    const onVorschau = vi.fn();
    render(regler('2024-01-15', '2026-08-26', onWahl, onVorschau));

    fokussieren(screen.getByRole('slider', { name: de.verlauf.reglerBeginn }));
    await userEvent.keyboard('{ArrowRight}{ArrowLeft}');
    await new Promise((fertig) => setTimeout(fertig, 400));

    expect(onVorschau).toHaveBeenLastCalledWith(null);
    expect(onWahl).not.toHaveBeenCalled();
  });

  it('versetzt die Griffe bei neuem Fenster, ohne neu zu mounten', () => {
    const { rerender } = render(regler('2024-01-01', '2026-08-26'));
    const beginn = screen.getByRole('slider', { name: de.verlauf.reglerBeginn });

    rerender(regler('2025-06-01', '2026-08-26'));

    expect(screen.getByRole('slider', { name: de.verlauf.reglerBeginn })).toBe(beginn);
    expect(beginn).toHaveAttribute('aria-valuetext', '01.06.2025');
  });

  it('setzt gezogene Griffe zurueck, wenn das Fenster neu gesetzt wird, auch auf dasselbe', async () => {
    const { rerender } = render(
      <Zeitraumregler tage={TAGE} fenster="a" von="2024-01-01" bis="2026-08-26" gesperrt={false} onWahl={vi.fn()} onVorschau={vi.fn()} />,
    );
    const beginn = screen.getByRole('slider', { name: de.verlauf.reglerBeginn });
    fokussieren(beginn);
    await userEvent.keyboard('{ArrowRight}');
    expect(beginn).toHaveAttribute('aria-valuetext', '15.01.2024');

    rerender(
      <Zeitraumregler tage={TAGE} fenster="b" von="2024-01-01" bis="2026-08-26" gesperrt={false} onWahl={vi.fn()} onVorschau={vi.fn()} />,
    );

    expect(beginn).toHaveAttribute('aria-valuetext', '01.01.2024');
  });
});
