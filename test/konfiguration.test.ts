/**
 * `datenverzeichnis` nur ausserhalb von Projektordner und Benutzerverzeichnis [ADR-005];
 * eigene Einstellungen im Datenverzeichnis [ADR-037].
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { konfigurationVergessen, ladeKonfiguration, pfadAufloesen, PROJEKTWURZEL } from '../shared/konfiguration.ts';

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
    expect(pfadAufloesen(`${PROJEKTWURZEL}-daten`)).toBe(`${PROJEKTWURZEL}-daten`);
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
