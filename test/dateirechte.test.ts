/** `shared/dateirechte.ts`: eine Stelle für 0700/0600, Eigentümer und atomares Schreiben. [ADR-056] */

import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { atomarSchreiben, eigeneDatei, FremdeDatei, verzeichnisAnlegen } from '../shared/dateirechte.ts';
import { erwarteRechte, POSIX_RECHTE } from './dateirechte.ts';

const frisch = (): string => mkdtempSync(join(tmpdir(), 'scapio-rechte-'));

describe('verzeichnisAnlegen', () => {
  it('legt mit 0700 an und zieht ein bestehendes Verzeichnis nach', () => {
    const wurzel = frisch();
    const neu = join(wurzel, 'a', 'b');
    verzeichnisAnlegen(neu);
    erwarteRechte(neu, 0o700);

    const alt = join(wurzel, 'alt');
    mkdirSync(alt, { mode: 0o755 });
    verzeichnisAnlegen(alt);
    erwarteRechte(alt, 0o700);
  });
});

describe('eigeneDatei', () => {
  it('false, wenn die Datei fehlt', () => {
    expect(eigeneDatei(join(frisch(), 'fehlt.db'))).toBe(false);
  });

  it('true und 0600 für eine eigene, gewöhnliche Datei', () => {
    const datei = join(frisch(), 'x.db');
    writeFileSync(datei, '');
    chmodSync(datei, 0o644);
    expect(eigeneDatei(datei)).toBe(true);
    erwarteRechte(datei, 0o600);
  });

  // Symlinks brauchen unter Windows Administratorrechte oder den Entwicklermodus.
  it.skipIf(!POSIX_RECHTE)('lehnt eine Verknüpfung ab, auch wenn ihr Ziel fehlt', () => {
    const wurzel = frisch();
    const ziel = join(wurzel, 'ziel.db');
    writeFileSync(ziel, '');
    symlinkSync(ziel, join(wurzel, 'portfolio.db'));
    symlinkSync(join(wurzel, 'nirgends'), join(wurzel, 'token.json'));

    expect(() => eigeneDatei(join(wurzel, 'portfolio.db'))).toThrow(FremdeDatei);
    expect(() => eigeneDatei(join(wurzel, 'token.json'))).toThrow(/Verknüpfung/);
  });

  it('lehnt ein Verzeichnis an der Stelle der Datei ab', () => {
    const wurzel = frisch();
    mkdirSync(join(wurzel, 'portfolio.db'));
    expect(() => eigeneDatei(join(wurzel, 'portfolio.db'))).toThrow(/keine gewöhnliche Datei/);
  });

  it('lehnt eine Datei eines anderen Benutzers ab; ohne uid (Windows) gilt sie', () => {
    const datei = join(frisch(), 'x.db');
    writeFileSync(datei, '');
    expect(() => eigeneDatei(datei, 4_000_000)).toThrow(/anderen Benutzer/);
    expect(eigeneDatei(datei, undefined)).toBe(true);
  });

  it('nennt in der Meldung nur den Dateinamen und den Code, keinen Pfad', () => {
    const wurzel = frisch();
    mkdirSync(join(wurzel, 'portfolio.db'));
    try {
      eigeneDatei(join(wurzel, 'portfolio.db'));
      expect.unreachable();
    } catch (fehler) {
      expect((fehler as FremdeDatei).code).toBe('E_DATEI_FREMD');
      expect((fehler as Error).message).toMatch(/^portfolio\.db /);
      expect((fehler as Error).message).not.toContain(wurzel);
    }
  });
});

describe('atomarSchreiben', () => {
  it('schreibt mit 0600, ersetzt den Inhalt und laesst keine temporaere Datei liegen', () => {
    const wurzel = frisch();
    const datei = join(wurzel, 'x.json');

    atomarSchreiben(datei, '{"a":1}');
    atomarSchreiben(datei, '{"a":2}');

    expect(readFileSync(datei, 'utf8')).toBe('{"a":2}');
    erwarteRechte(datei, 0o600);
    expect(readdirSync(wurzel)).toEqual(['x.json']);
  });

  it('raeumt die temporaere Datei auf, wenn das Umbenennen scheitert', () => {
    const wurzel = frisch();
    const ziel = join(wurzel, 'verzeichnis');
    mkdirSync(ziel);

    expect(() => atomarSchreiben(ziel, 'x')).toThrow();

    expect(readdirSync(wurzel)).toEqual(['verzeichnis']);
  });
});
