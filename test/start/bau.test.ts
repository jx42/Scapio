/**
 * `npm start` baut nur noch, wenn es etwas zu bauen gibt. [P2]
 *
 * Der Vergleich geht gegen die `mtime` von `dist/index.html`: Vite schreibt die Datei bei
 * jedem Bau neu, die inhaltsadressierten Dateien daneben behalten ihre Zeit. Geprueft wird
 * hier gegen ein Wegwerf-`dist/` — die echten Quellen unter `PROJEKTWURZEL` bleiben, was
 * sie sind, nur ihr Alter entscheidet.
 */

import { mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bauIstAktuell, benenneUm } from '../../start/start.ts';

const verzeichnisse: string[] = [];

/** Ein `dist/` mit einer `index.html` des gewuenschten Alters. */
function dist(alterMs: number): string {
  const v = mkdtempSync(join(tmpdir(), 'portfolio-bau-test-'));
  verzeichnisse.push(v);
  const index = join(v, 'index.html');
  writeFileSync(index, '<!doctype html><html></html>');
  const zeit = new Date(Date.now() - alterMs);
  utimesSync(index, zeit, zeit);
  return v;
}

afterEach(() => {
  for (const v of verzeichnisse.splice(0)) rmSync(v, { recursive: true, force: true });
});

describe('bauIstAktuell [P2]', () => {
  it('sagt nein, wenn es gar kein dist/ gibt', () => {
    expect(bauIstAktuell(join(tmpdir(), 'portfolio-gibt-es-nicht'))).toBe(false);
  });

  it('sagt nein, wenn der Bau aelter ist als die Quellen', () => {
    // Ein Jahr alt — aelter als jede Datei in diesem Arbeitsverzeichnis.
    expect(bauIstAktuell(dist(365 * 24 * 60 * 60 * 1000))).toBe(false);
  });

  it('sagt ja, wenn der Bau juenger ist als jede Quelle', () => {
    // In der Zukunft: dann ist er garantiert juenger als alles, was auf der Platte liegt.
    expect(bauIstAktuell(dist(-60 * 60 * 1000))).toBe(true);
  });

  it('sagt nein bei Gleichstand — gleiche Zeit heisst nicht gebaut', () => {
    // Der Fall, den ein grob aufloesendes Dateisystem herstellt: ein FAT32- oder
    // exFAT-Datentraeger unter Windows kennt die Aenderungszeit nur auf zwei Sekunden
    // genau, dann tragen eine eben geaenderte Quelle und der Bau danach denselben
    // Zeitstempel. Wer Gleichstand als "aktuell" liest, liefert die alte Oberflaeche aus.
    const v = dist(0);
    const gebaut = statSync(join(v, 'index.html')).mtimeMs;
    expect(bauIstAktuell(v, gebaut)).toBe(false);
  });
});

describe('benenneUm', () => {
  function fehler(code: string): NodeJS.ErrnoException {
    return Object.assign(new Error(code), { code });
  }

  it('wiederholt bei EPERM, bis der Virenscanner loslaesst', async () => {
    let versuche = 0;
    await benenneUm('a', 'b', () => {
      versuche += 1;
      if (versuche < 3) throw fehler('EPERM');
    }, [0, 0, 0]);
    expect(versuche).toBe(3);
  });

  it('gibt nach der letzten Wartezeit auf', async () => {
    let versuche = 0;
    const umbenennen = (): void => {
      versuche += 1;
      throw fehler('EBUSY');
    };
    await expect(benenneUm('a', 'b', umbenennen, [0, 0])).rejects.toThrow('EBUSY');
    expect(versuche).toBe(3);
  });

  it('wiederholt andere Fehler nicht', async () => {
    let versuche = 0;
    const umbenennen = (): void => {
      versuche += 1;
      throw fehler('ENOENT');
    };
    await expect(benenneUm('a', 'b', umbenennen, [0, 0])).rejects.toThrow('ENOENT');
    expect(versuche).toBe(1);
  });
});
