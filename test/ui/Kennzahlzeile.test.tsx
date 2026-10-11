// @vitest-environment jsdom
/*
 * Kennzahlzeile ist eine reine Ansicht (kein Query, kein Timer) — hier direkt mit Props
 * gerendert, in einer echten <table>, weil die Zeile selbst nur <tr> liefert.
 *
 * Geprueft wird nur die Verdrahtung von useZahlZaehler an die Wertzelle: kein Zaehlen
 * beim ersten Render, und dass die Zelle nach einer Aenderung beim neuen Wert ankommt.
 * Das Verhalten des Hooks selbst (Interpolation, Vorzeichen, Nachkommastellen) steht in
 * useZahlZaehler.test.ts.
 */

import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { Kennzahlzeile, type KennzahlzeileProps } from '@/components/Kennzahlzeile';
import { Table, TableBody } from '@/components/ui/table';

function rendernZeile(props: KennzahlzeileProps) {
  return render(
    <Table>
      <TableBody>
        <Kennzahlzeile {...props} />
      </TableBody>
    </Table>,
  );
}

describe('Kennzahlzeile — Zaehlen bei Aenderung', () => {
  it('zeigt beim ersten Render den Wert direkt', () => {
    rendernZeile({ bezeichnung: 'Kursgewinn', wert: '100 €' });
    expect(screen.getByText('100 €')).toBeInTheDocument();
  });

  it('zaehlt die Wertzelle zum neuen Wert hoch und kommt dort an', async () => {
    const { rerender } = rendernZeile({ bezeichnung: 'Kursgewinn', wert: '100 €' });

    rerender(
      <Table>
        <TableBody>
          <Kennzahlzeile bezeichnung="Kursgewinn" wert="120 €" />
        </TableBody>
      </Table>,
    );

    await waitFor(() => expect(screen.getByText('120 €')).toBeInTheDocument(), { timeout: 5000 });
  });

  it('bleibt unveraendert, wenn derselbe Wert erneut gerendert wird', () => {
    const { rerender } = rendernZeile({ bezeichnung: 'Kursgewinn', wert: '100 €' });

    rerender(
      <Table>
        <TableBody>
          <Kennzahlzeile bezeichnung="Kursgewinn" wert="100 €" />
        </TableBody>
      </Table>,
    );

    expect(screen.getByText('100 €')).toBeInTheDocument();
  });
});

describe('Kennzahlzeile — inert', () => {
  it('setzt inert auf die Zeile, damit ein Knopf unter der Blende keinen Fokus bekommt', () => {
    rendernZeile({ bezeichnung: 'Kursgewinn', wert: '100 €', inert: true });
    expect(screen.getByText('Kursgewinn').closest('tr')).toHaveAttribute('inert');
  });

  it('laesst inert ohne die Angabe weg', () => {
    rendernZeile({ bezeichnung: 'Kursgewinn', wert: '100 €' });
    expect(screen.getByText('Kursgewinn').closest('tr')).not.toHaveAttribute('inert');
  });
});
