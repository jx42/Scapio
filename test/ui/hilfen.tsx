/*
 * Gemeinsames Werkzeug fuer die Kachel-Tests.
 *
 * Jeder Test bekommt eine frische QueryClientProvider-Huelle und einen fetch-Ersatz,
 * der nur Pfade beantwortet, die er kennt. `retry: false`, sonst muesste ein
 * absichtlich fehlerhafter Test mehrere Anlaeufe abwarten, um rot zu werden.
 */

import type { ReactElement } from 'react';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as axe from 'axe-core';
import { expect } from 'vitest';

import { anteilProzent, euroAusCent, prozent } from '@/lib/format';

export function rendern(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      {ui}
    </QueryClientProvider>,
  );
}

/**
 * Setzt den Fokus so, dass React die Folge mitbekommt.
 *
 * Ein blosses `element.focus()` laeuft ausserhalb von act(): Komponenten, die am Fokus
 * haengen — jede Erklaerungs-Tooltip, jede Radio- und Tab-Gruppe — aktualisieren sich
 * dann hinter Reacts Ruecken, und React meldet das als Warnung. Innerhalb von act()
 * ist der Fokus gesetzt und die Folge verarbeitet, bevor die naechste Zeile prueft.
 */
export function fokussieren(element: HTMLElement): void {
  act(() => {
    element.focus();
  });
}

export type Antwort = { readonly status?: number; readonly body: unknown } | 'haengt';

/**
 * Ersetzt `global.fetch` fuer die Dauer eines Tests. `plan` bekommt den angefragten
 * Pfad (ohne Ursprung) und liefert entweder eine JSON-Antwort oder `'haengt'` — dann
 * loest das Promise nie auf, wie es der Lade-Zustand braucht. Rueckgabe: die
 * Wiederherstellung des echten `fetch`, fuer `afterEach`.
 */
export function fetchErsatz(plan: (pfad: string, methode: string) => Antwort): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (eingabe: RequestInfo | URL, init?: RequestInit) => {
    const pfad = typeof eingabe === 'string' ? eingabe : eingabe.toString();
    const antwort = plan(pfad, (init?.method ?? 'GET').toUpperCase());
    if (antwort === 'haengt') return new Promise<Response>(() => {});
    return new Response(JSON.stringify(antwort.body), {
      status: antwort.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

/*
 * Testing Library normalisiert beim Textvergleich das geschuetzte Leerzeichen, das
 * euroAusCent()/prozent() vor "€"/"%" setzen, zu einem gewoehnlichen — hier ebenso,
 * sonst schlaegt der Vergleich trotz identischem Renderergebnis fehl. Beide Helfer
 * leiten den Erwartungswert aus derselben Formatierungsfunktion ab, die auch die
 * Kachel verwendet, statt ihn als Zeichenkette abzuschreiben. [P-06]
 */
function ohneGeschuetztesLeerzeichen(text: string): string {
  return text.replaceAll(' ', ' ');
}

/** Erwarteter Kacheltext fuer einen Cent-Betrag, wie ihn euroAusCent() rendert. */
export function euro(cent: number, mitVorzeichen = false): string {
  return ohneGeschuetztesLeerzeichen(euroAusCent(cent, mitVorzeichen));
}

/** Erwarteter Kacheltext fuer ein Verhaeltnis, wie es prozent() rendert. */
export function prozentText(anteil: number, mitVorzeichen = false): string {
  return ohneGeschuetztesLeerzeichen(prozent(anteil, mitVorzeichen));
}

/** Dasselbe für eine Anteilsspalte, wie anteilProzent() sie rendert. */
export function anteilText(anteil: number, mitVorzeichen = false): string {
  return ohneGeschuetztesLeerzeichen(anteilProzent(anteil, mitVorzeichen));
}

/**
 * axe-core in jsdom: `color-contrast` bleibt aus, weil jsdom nicht layoutet und daher
 * keine echten Farben aus CSS-Variablen berechnen kann. Der Kontrast wird stattdessen
 * gemessen und in docs/BARRIEREFREIHEIT.md festgehalten — ein anderer Test, ein anderer Weg.
 */
export async function erwarteBarrierefrei(container: Element): Promise<void> {
  const ergebnis = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  const meldung = ergebnis.violations
    .map((v) => `${v.id} (${v.nodes.length}×): ${v.help}`)
    .join('\n');
  expect(ergebnis.violations, meldung).toHaveLength(0);
}
