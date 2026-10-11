/**
 * `npm run update` — die beiden Stellen, an denen ein Fehler teuer waere. [ADR-013]
 *
 * `geaenderteDateien`, weil eine falsch gelesene Statuszeile bedeutet, dass eine
 * Nutzeraenderung stillschweigend im Stash liegen bleibt. `portBelegt`, weil ein falsches
 * "frei" das Update mitten im Pull auf den Abbruch "Port belegt" laufen laesst.
 *
 * Ohne Netz: die Ausgabe von `git status --porcelain` ist ein festes Format, ein Port ist
 * mit `node:net` in drei Zeilen echt belegt. `holeNeueVersion` laeuft gegen ein temporaeres
 * Repository, dessen `origin` ein Nachbarordner ist — so sind Stash, Pull und ein Konflikt
 * beim Pop echt, ohne diesen Checkout anzufassen.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ersterTreffer,
  geaenderteDateien,
  gitLocator,
  holeNeueVersion,
  schlusssaetze,
  ZIP_ADRESSE,
  zipHinweis,
} from '../../start/update.ts';
import { portBelegt } from '../../start/kinder.ts';

/** Ein wirklich belegter Port: horcht, gibt seine Nummer, laesst sich wieder schliessen. */
async function belegterPort(): Promise<{ port: number; schliesse: () => Promise<void> }> {
  const server = createServer();
  await new Promise<void>((fertig) => {
    server.listen(0, '127.0.0.1', fertig);
  });
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    schliesse: () =>
      new Promise<void>((fertig) => {
        server.close(() => {
          fertig();
        });
      }),
  };
}

describe('geaenderteDateien [ADR-013]', () => {
  it('liest den Pfad hinter den zwei Statuszeichen', () => {
    expect(geaenderteDateien(' M config.json')).toEqual(['config.json']);
    expect(geaenderteDateien('M  config.json\n M src/App.tsx')).toEqual(['config.json', 'src/App.tsx']);
  });

  it('nimmt bei einer Umbenennung den neuen Namen', () => {
    expect(geaenderteDateien('R  alt.ts -> neu.ts')).toEqual(['neu.ts']);
  });

  it('haelt einen Pfad mit Leerzeichen zusammen', () => {
    expect(geaenderteDateien(' M docs/mein Ordner/notiz.md')).toEqual(['docs/mein Ordner/notiz.md']);
  });

  it('meldet nichts bei sauberem Arbeitsbaum', () => {
    expect(geaenderteDateien('')).toEqual([]);
    expect(geaenderteDateien('\n')).toEqual([]);
  });
});

describe('gitLocator', () => {
  it('sucht unter macOS/Linux mit /usr/bin/which', () => {
    expect(gitLocator('darwin', {})).toEqual({ befehl: '/usr/bin/which', argumente: ['git'] });
    expect(gitLocator('linux', {})).toEqual({ befehl: '/usr/bin/which', argumente: ['git'] });
  });

  it('sucht unter Windows mit where.exe unterhalb von SystemRoot', () => {
    expect(gitLocator('win32', { SystemRoot: 'D:\\Windows' })).toEqual({
      befehl: 'D:\\Windows\\System32\\where.exe',
      argumente: ['git'],
    });
  });

  it('faellt unter Windows ohne SystemRoot auf C:\\Windows zurueck', () => {
    expect(gitLocator('win32', {})).toEqual({
      befehl: 'C:\\Windows\\System32\\where.exe',
      argumente: ['git'],
    });
  });
});

describe('ersterTreffer', () => {
  it('nimmt bei mehreren Fundstellen von where.exe die erste — ohne CR', () => {
    expect(ersterTreffer('C:\\Program Files\\Git\\cmd\\git.exe\r\nC:\\Tools\\git.exe\r\n')).toBe(
      'C:\\Program Files\\Git\\cmd\\git.exe',
    );
  });

  it('liest die Ausgabe von which', () => {
    expect(ersterTreffer('/usr/bin/git\n')).toBe('/usr/bin/git');
  });

  it('meldet nichts bei leerer Ausgabe', () => {
    expect(ersterTreffer('')).toBeNull();
    expect(ersterTreffer('\r\n')).toBeNull();
  });
});

describe('zipHinweis', () => {
  it('nennt je Plattform die Doppelklick-Dateien, die es dort gibt', () => {
    expect(zipHinweis('win32')).toContain('Start.bat');
    expect(zipHinweis('win32')).toContain('Aktualisieren.bat');
    expect(zipHinweis('win32')).not.toContain('.command');
    expect(zipHinweis('darwin')).toContain('Start.command');
    expect(zipHinweis('darwin')).not.toContain('.bat');
  });

  it('verlangt kein Kopieren mehr — eigene Dateien liegen im Datenverzeichnis [ADR-037]', () => {
    expect(zipHinweis('win32')).not.toContain('funds.json');
    expect(zipHinweis('win32')).not.toContain('config.json');
    expect(zipHinweis('win32')).toContain(ZIP_ADRESSE);
  });
});

describe('schlusssaetze', () => {
  it('fordert nicht zum Doppelklick auf, wenn Aktualisieren.* gleich selbst neu startet', () => {
    expect(schlusssaetze(true, 'win32').join('\n')).not.toContain('doppelklicken');
    expect(schlusssaetze(true, 'darwin').join('\n')).not.toContain('doppelklicken');
  });

  it('nennt ohne Neustart die Startdatei der Plattform', () => {
    expect(schlusssaetze(false, 'win32')[0]).toContain('Start.bat');
    expect(schlusssaetze(false, 'darwin')[0]).toContain('Start.command');
  });
});

describe('portBelegt [ADR-013]', () => {
  it('erkennt einen Port, auf dem jemand hoert — und merkt, wenn er frei wird', async () => {
    const { port, schliesse } = await belegterPort();
    expect(await portBelegt(port)).toBe(true);
    await schliesse();
    expect(await portBelegt(port)).toBe(false);
  });
});

// Echte git-Aufrufe sind unter Windows langsam.
describe('holeNeueVersion [ADR-013]', { timeout: 30_000 }, () => {
  let ordner: string;
  let quelle: string;
  let klon: string;

  function g(cwd: string, ...argumente: string[]): string {
    return execFileSync('git', argumente, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  }
  function identitaet(cwd: string): void {
    g(cwd, 'config', 'user.name', 'Test');
    g(cwd, 'config', 'user.email', 'test@example.invalid');
    g(cwd, 'config', 'commit.gpgsign', 'false');
  }
  function committe(cwd: string, datei: string, inhalt: string): void {
    writeFileSync(join(cwd, datei), inhalt);
    g(cwd, 'add', datei);
    g(cwd, 'commit', '--quiet', '--message', datei);
  }

  beforeEach(() => {
    ordner = mkdtempSync(join(tmpdir(), 'scapio-update-'));
    quelle = join(ordner, 'quelle');
    klon = join(ordner, 'klon');
    mkdirSync(quelle);
    g(quelle, 'init', '--quiet');
    identitaet(quelle);
    committe(quelle, 'a.txt', 'eins\n');
    // Windows-Runner stehen auf core.autocrlf=true; der Pull schriebe sonst CRLF.
    g(ordner, 'clone', '--quiet', '--config', 'core.autocrlf=false', quelle, klon);
    identitaet(klon);
    mkdirSync(join(klon, 'dist'));
    writeFileSync(join(klon, 'dist', 'index.html'), 'alt');
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    rmSync(ordner, { recursive: true, force: true });
  });

  it('legt eigene Aenderungen weg, zieht und spielt sie zurueck', async () => {
    committe(quelle, 'b.txt', 'neu\n');
    writeFileSync(join(klon, 'a.txt'), 'eins\nmeins\n');

    expect(await holeNeueVersion(klon)).toBe(true);
    expect(readFileSync(join(klon, 'b.txt'), 'utf8')).toBe('neu\n');
    expect(readFileSync(join(klon, 'a.txt'), 'utf8')).toBe('eins\nmeins\n');
    expect(g(klon, 'stash', 'list')).toBe('');
    expect(existsSync(join(klon, 'dist'))).toBe(false);
    expect(process.exitCode).toBeUndefined();
  });

  it('laesst den Bau stehen, wenn nichts Neues kam', async () => {
    expect(await holeNeueVersion(klon)).toBe(true);
    expect(existsSync(join(klon, 'dist', 'index.html'))).toBe(true);
  });

  it('bricht bei einem Konflikt beim Pop ab — die Aenderung bleibt im Stash', async () => {
    committe(quelle, 'a.txt', 'zwei\n');
    writeFileSync(join(klon, 'a.txt'), 'meins\n');

    expect(await holeNeueVersion(klon)).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(g(klon, 'stash', 'list')).toContain('eigene Aenderungen vor dem Pull');
    expect(g(klon, 'log', '-1', '--format=%s')).toBe('a.txt');
    // Die neue Version ist da, also darf der alte Bau nicht bleiben.
    expect(existsSync(join(klon, 'dist'))).toBe(false);
  });

  it('bricht ohne Pull ab, wenn git den Zustand nicht lesen kann', async () => {
    committe(quelle, 'b.txt', 'neu\n');
    const kopf = g(klon, 'rev-parse', 'HEAD');
    writeFileSync(join(klon, '.git', 'index'), 'kein index');

    expect(await holeNeueVersion(klon)).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(g(klon, 'rev-parse', 'HEAD')).toBe(kopf);
    expect(existsSync(join(klon, 'b.txt'))).toBe(false);
    expect(existsSync(join(klon, 'dist', 'index.html'))).toBe(true);
  });
});
