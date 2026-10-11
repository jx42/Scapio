/**
 * Die beiden Stellen, an denen dieselbe Zeile Code auf macOS etwas anderes tut als unter
 * Windows: wohin die Daten gehoeren und womit der Browser aufgeht.
 *
 * Beide Funktionen nehmen Plattform und Umgebung als Parameter entgegen — nicht aus
 * Geschmack, sondern weil ein Test sonst nur die Plattform pruefen koennte, auf der er
 * gerade laeuft. Die Windows-Faelle waeren dann genau die, die nie jemand ausfuehrt.
 */

import { describe, expect, it } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { oeffnerFuer } from '../shared/browser.ts';
import { vorgabeDatenverzeichnis } from '../shared/konfiguration.ts';

describe('vorgabeDatenverzeichnis [ADR-005]', () => {
  it('legt die Daten unter macOS in Application Support', () => {
    expect(vorgabeDatenverzeichnis('darwin', {})).toBe('~/Library/Application Support/scapio');
  });

  it('nimmt unter Windows LOCALAPPDATA — nicht APPDATA', () => {
    const pfad = vorgabeDatenverzeichnis('win32', {
      LOCALAPPDATA: 'C:\\Users\\Test\\AppData\\Local',
      APPDATA: 'C:\\Users\\Test\\AppData\\Roaming',
    });
    // Der Kern dieses Tests: Roaming wird in einer Windows-Domaene ueber das Netz
    // kopiert. Eine SQLite-Datei dort ist dasselbe Problem wie eine in iCloud.
    // (Getrennt wird mit dem Zeichen der LAUFENDEN Plattform — geprueft wird die Wahl
    // der Umgebungsvariablen, nicht die Schreibweise des Trenners.)
    expect(pfad).toBe(join('C:\\Users\\Test\\AppData\\Local', 'scapio'));
    expect(pfad).not.toContain('Roaming');
  });

  it('faellt unter Windows ohne LOCALAPPDATA auf das Benutzerverzeichnis zurueck', () => {
    // `join` trennt mit dem Zeichen der LAUFENDEN Plattform, nicht der geprueften —
    // deshalb steht hier `join` und kein wortwoertlicher Pfad.
    expect(vorgabeDatenverzeichnis('win32', {})).toBe(join(homedir(), 'scapio'));
  });
});

describe('oeffnerFuer', () => {
  it('nimmt unter macOS /usr/bin/open und glaubt dessen Exit-Code', () => {
    expect(oeffnerFuer('darwin', {})).toEqual({ befehl: '/usr/bin/open', argumente: [], achteAufFehler: true });
  });

  it('nimmt unter Windows rundll32 FileProtocolHandler und glaubt dessen Exit-Code NICHT', () => {
    const oeffner = oeffnerFuer('win32', { SystemRoot: 'C:\\Windows' });
    expect(oeffner?.befehl).toContain('rundll32.exe');
    // `explorer.exe` oeffnet bei einer Adresse mit Query den Dateimanager statt des
    // Browsers — die OAuth-Anmeldung kam so nie an.
    expect(oeffner?.befehl).not.toContain('explorer');
    expect(oeffner?.argumente).toEqual(['url.dll,FileProtocolHandler']);
    expect(oeffner?.achteAufFehler).toBe(false);
  });

  it('faellt unter Windows ohne SystemRoot auf C:\\Windows zurueck', () => {
    expect(oeffnerFuer('win32', {})?.befehl).toContain('Windows');
  });

  it('gibt unter Linux keinen Oeffner zurueck — dort sagt das Programm die Adresse an', () => {
    expect(oeffnerFuer('linux', {})).toBeNull();
  });
});
