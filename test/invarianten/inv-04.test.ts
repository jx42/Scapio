/**
 * INV-04 — `core/` ist rein: kein I/O, keine Uhr, kein Zufall.
 *
 * Der Grund ist nicht Eleganz, sondern Nachrechenbarkeit: `npm run verify` rechnet die
 * gesamte Historie aus den archivierten Rohantworten neu und erwartet dieselben Zahlen.
 * Das kann nur gelten, wenn dieselbe Eingabe immer dieselbe Ausgabe ergibt — heute,
 * morgen, auf einem anderen Rechner. Der heutige Tag ist deshalb ein Parameter.
 */

import { describe, expect, it } from 'vitest';
import { alsListe, dateien, sucheImCode } from './quellen.ts';

const KERN = dateien(['core']);

describe('INV-04 — der Rechenkern ist rein', () => {
  it('findet ueberhaupt Dateien', () => {
    expect(KERN.length).toBeGreaterThan(10);
  });

  it('importiert nichts aus der Laufzeitumgebung', () => {
    const treffer = sucheImCode(KERN, /from\s*['"]node:|require\s*\(\s*['"]node:|from\s*['"](fs|path|os|crypto|child_process|http|https|sqlite)['"]/);
    expect(treffer, `node-Import im Rechenkern:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('liest keine Uhr', () => {
    // `new Date(iso)` mit Argument ist ein Parser und damit rein — `kalender.ts`
    // braucht ihn, um einen mitgelieferten Zeitstempel auf einen Berliner Tag zu
    // legen. Die Uhr ist `new Date()` ohne Argument und `Date.now()`: sie machen aus
    // derselben Eingabe morgen ein anderes Ergebnis. Genau die sind verboten.
    const treffer = sucheImCode(KERN, /new\s+Date\s*\(\s*\)|Date\s*\.\s*now\b|performance\s*\.\s*now|process\s*\.\s*hrtime/);
    expect(treffer, `Uhr im Rechenkern:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('parst einen Zeitstempel nur im Kalender', () => {
    const ausserKalender = KERN.filter((q) => q.pfad !== 'core/kalender.ts');
    const treffer = sucheImCode(ausserKalender, /new\s+Date\b|Date\s*\.\s*(parse|UTC)\b/);
    expect(treffer, `Date ausserhalb des Kalenders:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('wuerfelt nicht', () => {
    const treffer = sucheImCode(KERN, /Math\s*\.\s*random|crypto\s*\.\s*(randomUUID|getRandomValues|randomBytes)/);
    expect(treffer, `Zufall im Rechenkern:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('kennt weder Prozess noch Umgebung', () => {
    const treffer = sucheImCode(KERN, /\bprocess\s*\.|globalThis\s*\.\s*process|import\s*\.\s*meta\s*\.\s*env/);
    expect(treffer, `Prozesszugriff im Rechenkern:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('spricht mit niemandem', () => {
    const treffer = sucheImCode(KERN, /\bfetch\s*\(|XMLHttpRequest|WebSocket|navigator\b|localStorage|document\b|window\b/);
    expect(treffer, `Aussenwelt im Rechenkern:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('schreibt nichts in die Ausgabe', () => {
    const treffer = sucheImCode(KERN, /console\s*\.\s*(log|warn|error|info|debug)/);
    expect(treffer, `Ausgabe im Rechenkern:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('importiert ausschliesslich aus dem eigenen Ordner', () => {
    const treffer = sucheImCode(KERN, /from\s*['"](\.\.\/(?!\.)|@\/|#(db|ingest|server)\/)/);
    expect(treffer, `Import ausserhalb von core/:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('haengt an keinem Paket ausser den eigenen Dateien', () => {
    // Ein `import { z } from 'zod'` waere hier schon ein Bruch: der Kern soll
    // uebersetzbar bleiben, ohne dass irgendetwas installiert ist.
    const treffer = sucheImCode(KERN, /^\s*import\s[^'"]*from\s*['"][^.'"][^'"]*['"]/);
    const ohneTypen = treffer.filter((t) => !/from\s*['"]node:test['"]/.test(t.text));
    expect(ohneTypen, `Fremdpaket im Rechenkern:\n${alsListe(ohneTypen)}`).toEqual([]);
  });

  it('wirft keine Ausnahme als Ergebnis — auch nicht bei "keine Loesung"', () => {
    // Fachliche Fehlschlaege sind Ergebnisobjekte. Geworfen wird nur bei einem
    // Programmierfehler, und der heisst hier `DezimalFehler` oder `KalenderFehler`.
    const treffer = sucheImCode(KERN, /\bthrow\s+new\s+(?!DezimalFehler|KalenderFehler|TypeError|RangeError)/);
    expect(treffer, `Unerwartete Ausnahme im Rechenkern:\n${alsListe(treffer)}`).toEqual([]);
  });
});
