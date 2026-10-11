/**
 * Die Sperre, aus der Sicht der einen Frage, die sie beantworten muss: liegt diese Datei
 * hier nur noch herum, oder haelt sie jemand? [R3]
 *
 * Das Alter wird gegen die `mtime` gemessen, nicht gegen den Zeitstempel IM Inhalt —
 * sonst gilt ein ehrlich langer Lauf nach 15 Minuten als verwaist. Genau das steht hier.
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOECHSTALTER_MS, LEBENSZEICHEN_MS, Sperre, SPERRDATEI } from '../../server/sperre.ts';

const verzeichnisse: string[] = [];

function verzeichnis(): string {
  const v = mkdtempSync(join(tmpdir(), 'portfolio-sperre-test-'));
  verzeichnisse.push(v);
  return v;
}

/** Legt eine Sperrdatei von Hand an — mit frei waehlbarem Alter der Datei. */
function lege(datenpfad: string, halter: { quelle: string; seit: string; pid: number }, alterMs: number): string {
  const pfad = join(datenpfad, SPERRDATEI);
  writeFileSync(pfad, JSON.stringify(halter), { mode: 0o600 });
  const zeit = new Date(Date.now() - alterMs);
  utimesSync(pfad, zeit, zeit);
  return pfad;
}

/** Eine pid, die sicher lebt und sicher nicht diese hier ist. */
const FREMDE_LEBENDE_PID = process.ppid;

afterEach(() => {
  vi.useRealTimers();
  for (const v of verzeichnisse.splice(0)) rmSync(v, { recursive: true, force: true });
});

describe('Sperre: verwaist oder gehalten [R3]', () => {
  it('haelt eine Sperre, deren Zeitstempel alt ist, deren Datei aber frisch angefasst wurde', () => {
    const datenpfad = verzeichnis();
    const zweiStundenAlt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    lege(datenpfad, { quelle: 'ingest', seit: zweiStundenAlt, pid: FREMDE_LEBENDE_PID }, 0);

    const sperre = new Sperre(datenpfad);
    expect(sperre.raeumeVerwaiste()).toBe(false);
    expect(() => sperre.nimm('api')).toThrow(/bereits eine Aktualisierung/);
  });

  it('raeumt eine Sperre, deren Datei laenger als das Hoechstalter nicht angefasst wurde', () => {
    const datenpfad = verzeichnis();
    // Der Zeitstempel im Inhalt ist frisch — die Datei ist es nicht. Die Datei entscheidet.
    lege(
      datenpfad,
      { quelle: 'ingest', seit: new Date().toISOString(), pid: FREMDE_LEBENDE_PID },
      HOECHSTALTER_MS + 60_000,
    );

    const sperre = new Sperre(datenpfad);
    expect(sperre.raeumeVerwaiste()).toBe(true);
    expect(() => sperre.nimm('api')).not.toThrow();
  });

  it('raeumt eine Sperre ohne lebenden Prozess, egal wie frisch die Datei ist', () => {
    const datenpfad = verzeichnis();
    // Eine pid weit jenseits dessen, was das System vergibt: die lebt garantiert nicht.
    lege(datenpfad, { quelle: 'ingest', seit: new Date().toISOString(), pid: 2 ** 30 }, 0);

    expect(new Sperre(datenpfad).raeumeVerwaiste()).toBe(true);
  });
});

describe('Sperre: Lebenszeichen [R3]', () => {
  it('uebernimmt eine verwaiste Sperre ohne Reste und traegt sich selbst ein', () => {
    const datenpfad = verzeichnis();
    lege(datenpfad, { quelle: 'ingest', seit: new Date().toISOString(), pid: 999_999_999 }, 0);

    const sperre = new Sperre(datenpfad);
    sperre.nimm('api');

    expect(readdirSync(datenpfad)).toEqual([SPERRDATEI]);
    expect(JSON.parse(readFileSync(join(datenpfad, SPERRDATEI), 'utf8'))).toMatchObject({ quelle: 'api', pid: process.pid });
    sperre.gibFrei();
  });

  it('fasst die eigene Sperrdatei waehrend des Laufs an', () => {
    vi.useFakeTimers();
    const datenpfad = verzeichnis();
    const sperre = new Sperre(datenpfad);
    sperre.nimm('ingest');

    // So tun, als liefe der Lauf schon laenger als das Hoechstalter.
    const pfad = join(datenpfad, SPERRDATEI);
    const alt = new Date(Date.now() - HOECHSTALTER_MS - 60_000);
    utimesSync(pfad, alt, alt);
    const vorher = statSync(pfad).mtimeMs;

    vi.advanceTimersByTime(LEBENSZEICHEN_MS);

    expect(statSync(pfad).mtimeMs).toBeGreaterThan(vorher);
    expect(new Sperre(datenpfad).raeumeVerwaiste()).toBe(false);
    sperre.gibFrei();
  });

  it('stellt die Lebenszeichen mit der Freigabe ein', () => {
    vi.useFakeTimers();
    const datenpfad = verzeichnis();
    const sperre = new Sperre(datenpfad);

    sperre.nimm('ingest');
    expect(vi.getTimerCount()).toBe(1);

    sperre.gibFrei();
    expect(vi.getTimerCount()).toBe(0);

    // Nach der Freigabe gibt es nichts mehr anzufassen — und nichts, was wirft.
    expect(() => vi.advanceTimersByTime(LEBENSZEICHEN_MS * 3)).not.toThrow();
    expect(() => statSync(join(datenpfad, SPERRDATEI))).toThrow();
  });
});

describe('Sperre: Freigabe', () => {
  it('laesst die Sperre eines fremden, lebenden Prozesses in Ruhe', () => {
    const datenpfad = verzeichnis();
    const pfad = lege(datenpfad, { quelle: 'ingest', seit: new Date().toISOString(), pid: FREMDE_LEBENDE_PID }, 0);

    // Ein Strg+C am Server ruft `gibFrei()`, auch wenn dieser Prozess nie `nimm()` hatte.
    const sperre = new Sperre(datenpfad);
    sperre.gibFrei();
    sperre.gibFrei();

    expect(existsSync(pfad)).toBe(true);
    expect(() => new Sperre(datenpfad).nimm('api')).toThrow(/bereits eine Aktualisierung/);
  });

  it('entfernt die eigene Sperre, und zwar idempotent', () => {
    const datenpfad = verzeichnis();
    const sperre = new Sperre(datenpfad);
    sperre.nimm('ingest');

    sperre.gibFrei();
    expect(existsSync(join(datenpfad, SPERRDATEI))).toBe(false);
    expect(() => sperre.gibFrei()).not.toThrow();
  });
});
