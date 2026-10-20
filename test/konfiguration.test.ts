/**
 * `datenverzeichnis` nur ausserhalb von Projektordner und Benutzerverzeichnis [ADR-005];
 * eigene Einstellungen im Datenverzeichnis [ADR-037].
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  konfigurationVergessen,
  ladeKonfiguration,
  pfadAufloesen,
  PROJEKTWURZEL,
  synchronisierteWurzel,
  vorgabeDatenverzeichnis,
} from '../shared/konfiguration.ts';

describe('pfadAufloesen', () => {
  it('loest ~/ auf und nimmt absolute Pfade ausserhalb des Projekts an', () => {
    expect(pfadAufloesen('~/Library/Application Support/scapio')).toBe(
      join(homedir(), 'Library', 'Application Support', 'scapio'),
    );
    expect(pfadAufloesen(join(tmpdir(), 'scapio'))).toBe(resolve(tmpdir(), 'scapio'));
  });

  it.each(['daten', './daten', '~', '~/', join(homedir(), '.')])('lehnt %s ab', (pfad) => {
    expect(() => pfadAufloesen(pfad)).toThrow(/datenverzeichnis/);
  });

  it('lehnt den Projektordner und alles darin ab', () => {
    expect(() => pfadAufloesen(PROJEKTWURZEL)).toThrow(/Projektordner/);
    expect(() => pfadAufloesen(join(PROJEKTWURZEL, 'daten'))).toThrow(/Projektordner/);
  });

  it('nimmt einen Nachbarordner mit gleichem Namensanfang an', () => {
    // Eine erfundene Projektwurzel: die echte kann in ~/Documents liegen, das ADR-056 ablehnt.
    const wurzel = join(tmpdir(), 'scapio-projekt');
    expect(pfadAufloesen(`${wurzel}-daten`, wurzel)).toBe(`${wurzel}-daten`);
  });
});

describe('synchronisierteWurzel [ADR-056]', () => {
  const mac = (pfad: string): string | null => synchronisierteWurzel(pfad, 'darwin', {}, '/Users/nutzer');
  const win = (pfad: string): string | null =>
    synchronisierteWurzel(pfad, 'win32', { OneDrive: 'C:\\Users\\nutzer\\OneDrive', OneDriveCommercial: 'D:\\Firma' }, 'C:\\Users\\nutzer');

  it.each([
    '/Users/nutzer/Documents/scapio',
    '/Users/nutzer/Desktop',
    '/Users/nutzer/documents/Scapio',
    '/Users/nutzer/Library/Mobile Documents/com~apple~CloudDocs/scapio',
    '/Users/nutzer/Library/CloudStorage/Dropbox/scapio',
  ])('macOS: lehnt %s ab', (pfad) => {
    expect(mac(pfad)).not.toBeNull();
  });

  it.each(['/Users/nutzer/Library/Application Support/scapio', '/Users/nutzer/Documents-alt', '/Users/name/Documents/x'])(
    'macOS: nimmt %s an',
    (pfad) => {
      expect(mac(pfad)).toBeNull();
    },
  );

  it('Windows: lehnt die OneDrive-Ordner aus der Umgebung ab, ohne Groß-/Kleinschreibung', () => {
    expect(win('C:\\Users\\nutzer\\onedrive\\scapio')).toBe('C:\\Users\\nutzer\\OneDrive');
    expect(win('d:\\firma\\x')).toBe('D:\\Firma');
    expect(win('C:\\Users\\nutzer\\AppData\\Local\\scapio')).toBeNull();
    expect(win('C:\\Users\\nutzer\\Documents\\scapio')).toBeNull();
    expect(synchronisierteWurzel('C:\\Users\\nutzer\\OneDrive\\x', 'win32', { OneDrive: '' }, 'C:\\Users\\nutzer')).toBeNull();
  });

  it('die Vorgaben liegen nie in einer Sync-Wurzel', () => {
    expect(mac('/Users/nutzer/Library/Application Support/scapio')).toBeNull();
    expect(win(vorgabeDatenverzeichnis('win32', { LOCALAPPDATA: 'C:\\Users\\nutzer\\AppData\\Local' }))).toBeNull();
  });

  // Unter Windows gilt nur die OneDrive-Liste, und deren Variablen setzt die CI nicht.
  it.skipIf(process.platform === 'win32')('pfadAufloesen meldet die Ablehnung mit Runbook-Verweis', () => {
    expect(() => pfadAufloesen('~/Library/Mobile Documents/scapio')).toThrow(/synchronisierten Ordner.*RUNBOOK/);
  });
});

describe('einstellungen.json im Datenverzeichnis [ADR-037]', () => {
  function mitDateien(config: unknown, einstellungen: unknown, pruefe: (c: string, e: string) => void): void {
    const v = mkdtempSync(join(tmpdir(), 'scapio-einst-'));
    try {
      writeFileSync(join(v, 'config.json'), JSON.stringify(config));
      writeFileSync(join(v, 'einstellungen.json'), JSON.stringify(einstellungen));
      konfigurationVergessen();
      pruefe(join(v, 'config.json'), join(v, 'einstellungen.json'));
    } finally {
      konfigurationVergessen();
      rmSync(v, { recursive: true, force: true });
    }
  }

  it('geht vor config.json, fehlende Felder bleiben wie dort', () => {
    mitDateien({ port: 5000, zinsquelle: 'keine' }, { port: 6000 }, (c, e) => {
      const k = ladeKonfiguration(c, e);
      expect(k.port).toBe(6000);
      expect(k.zinsquelle).toBe('keine');
    });
  });

  it('schaltet top25 nur auf Wunsch ein [ADR-038]', () => {
    mitDateien({}, {}, (c, e) => {
      expect(ladeKonfiguration(c, e).top25).toBe(false);
    });
    mitDateien({}, { top25: true }, (c, e) => {
      expect(ladeKonfiguration(c, e).top25).toBe(true);
    });
  });

  it('nimmt die Vorlage einstellungen.example.json an', () => {
    const vorlage: unknown = JSON.parse(readFileSync(join(PROJEKTWURZEL, 'docs', 'einstellungen.example.json'), 'utf8'));
    mitDateien({}, vorlage, (c, e) => {
      expect(ladeKonfiguration(c, e).top25).toBe(true);
      expect(ladeKonfiguration(c, e)).not.toHaveProperty('hinweis');
    });
  });

  it.each([{ erlaubteHosts: ['www.ishares.com'] }, { datenverzeichnis: '/tmp/x' }])(
    'lehnt %o ab — das gehoert nicht dem Nutzer',
    (einstellungen) => {
      mitDateien({}, einstellungen, (c, e) => {
        expect(() => ladeKonfiguration(c, e)).toThrow(/einstellungen\.json ist ungueltig/);
      });
    },
  );
});

describe('keine Nutzerdatei im Projektordner [ADR-041]', () => {
  // Was Ingest, Datenbank und Rechenkern lesen, ist Depot- oder Nutzerdatei und gehoert ins
  // Datenverzeichnis. Die Projektwurzel kennt nur `start/` und der Server (Bau, Version).
  it.each(['ingest', 'db', 'core'])('%s/ verwendet PROJEKTWURZEL nicht', (ordner) => {
    const treffer = readdirSync(join(PROJEKTWURZEL, ordner), { recursive: true, encoding: 'utf8' })
      .filter((d) => d.endsWith('.ts'))
      .filter((d) => readFileSync(join(PROJEKTWURZEL, ordner, d), 'utf8').includes('PROJEKTWURZEL'));
    expect(treffer).toEqual([]);
  });
});
