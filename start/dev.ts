/**
 * `npm run dev` — Entwicklung mit Neuladen, ohne Sicherheitsausnahme.
 *
 * Der naheliegende Weg waere der Vite-Entwicklungsserver mit Proxy auf die API. Der
 * liefe aber auf einem ZWEITEN Port, und damit kaemen `Origin` und `Host` als
 * `127.0.0.1:5173` beim Server an — die Origin- und Host-Pruefung muesste eine Ausnahme
 * bekommen, und die Ausnahme ueberlebt erfahrungsgemaess bis in den Betrieb. [§9]
 *
 * Stattdessen: `vite build --watch` schreibt bei jeder Aenderung nach `dist/`, und der
 * Server laeuft unter `node --watch` auf demselben einen Port. Alles bleibt
 * gleichursprunglich, die CSP bleibt unveraendert, der Preis ist ein Neuladen im
 * Browser statt Hot Module Replacement.
 *
 * Den Rahmen mit beiden Kindern teilt es mit `npm run demo`: `start/kinder.ts`.
 */

import { join, resolve } from 'node:path';
import { PROJEKTWURZEL, ladeKonfiguration } from '../shared/konfiguration.ts';
import { starteMitWatch } from './kinder.ts';

export function haupt(): void {
  // `--watch` laedt den Server neu, sobald server/, core/ oder db/ sich aendern.
  // `--ohne-bau`, weil das Bauen schon das andere Kind erledigt; `--ohne-browser`,
  // damit nicht bei jedem Neustart ein Tab aufgeht; `--neuladen` haengt das
  // Neulade-Skript in die Seite, siehe `server/entwicklungReload.ts`.
  starteMitWatch(
    [join(PROJEKTWURZEL, 'start', 'start.ts'), '--ohne-bau', '--ohne-browser', '--neuladen'],
    ladeKonfiguration().port,
  );
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) haupt();
