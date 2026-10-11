/** Eigene Dateien wandern einmalig aus dem Projektordner ins Datenverzeichnis [ADR-037]. */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { konfigurationVergessen, ladeKonfiguration, type Konfiguration } from '../../shared/konfiguration.ts';
import { eigeneWerte, uebernimmEigeneDateien } from '../../start/uebernahme.ts';

let wurzel: string;
let projekt: string;
let k: Konfiguration;

beforeEach(() => {
  wurzel = mkdtempSync(join(tmpdir(), 'scapio-uebernahme-'));
  projekt = join(wurzel, 'projekt');
  mkdirSync(join(projekt, 'ingest'), { recursive: true });
  konfigurationVergessen();
  k = { ...ladeKonfiguration(join(projekt, 'config.json')), datenpfad: join(wurzel, 'daten') };
  konfigurationVergessen();
});

afterEach(() => {
  rmSync(wurzel, { recursive: true, force: true });
});

describe('eigeneWerte', () => {
  it('nimmt nur abweichende Felder, die einstellungen.json setzen darf', () => {
    expect(
      eigeneWerte({ port: 4732, zinsquelle: 'keine', erlaubteHosts: ['www.ishares.com'], datenverzeichnis: '/x' }),
    ).toEqual({ zinsquelle: 'keine' });
  });
});

describe('uebernimmEigeneDateien', () => {
  it('verschiebt ingest/funds.json ins Datenverzeichnis', () => {
    writeFileSync(join(projekt, 'ingest', 'funds.json'), '{"fonds":[]}');
    expect(uebernimmEigeneDateien(k, projekt)).toHaveLength(1);
    expect(readFileSync(join(k.datenpfad, 'funds.json'), 'utf8')).toBe('{"fonds":[]}');
    expect(existsSync(join(projekt, 'ingest', 'funds.json'))).toBe(false);
  });

  it('verschiebt ingest/seed.json ins Datenverzeichnis [ADR-041]', () => {
    writeFileSync(join(projekt, 'ingest', 'seed.json'), '{"anfangsbestand":[]}');
    expect(uebernimmEigeneDateien(k, projekt)).toHaveLength(1);
    expect(readFileSync(join(k.datenpfad, 'seed.json'), 'utf8')).toBe('{"anfangsbestand":[]}');
    expect(existsSync(join(projekt, 'ingest', 'seed.json'))).toBe(false);
  });

  it('ueberschreibt eine vorhandene Fondsliste nie', () => {
    mkdirSync(k.datenpfad);
    writeFileSync(join(k.datenpfad, 'funds.json'), 'neu');
    writeFileSync(join(projekt, 'ingest', 'funds.json'), 'alt');
    uebernimmEigeneDateien(k, projekt);
    expect(readFileSync(join(k.datenpfad, 'funds.json'), 'utf8')).toBe('neu');
    expect(existsSync(join(projekt, 'ingest', 'funds.json'))).toBe(true);
  });

  it('schreibt geaenderte Werte aus config.json nach einstellungen.json', () => {
    writeFileSync(join(projekt, 'config.json'), JSON.stringify({ port: 5000, csvGroesstMb: 32 }));
    uebernimmEigeneDateien(k, projekt);
    expect(JSON.parse(readFileSync(join(k.datenpfad, 'einstellungen.json'), 'utf8'))).toEqual({ port: 5000 });
  });

  it('tut nichts bei unveraenderter config.json', () => {
    writeFileSync(join(projekt, 'config.json'), JSON.stringify({ port: 4732 }));
    expect(uebernimmEigeneDateien(k, projekt)).toEqual([]);
    expect(existsSync(k.datenpfad)).toBe(false);
  });
});
