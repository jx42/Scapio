/*
 * Die Tabelle hinter dem Verlaufschart hat die Aufloesung des Fensters, nicht die der Reihe
 * (Barrierefreiheit, siehe docs/BARRIEREFREIHEIT.md). Dazu das Achsenformat nach Spannweite.
 */

import { describe, expect, it } from 'vitest';

import { monatsTicks, rasterSchritt, yAchseImRaster } from '@/features/verlauf/verlaufAchsen';
import { tabelleVermoegen, tabellenAufloesung, tabellenPunkte } from '@/features/verlauf/verlaufTabellen';
import type { Zeitpunkt } from '@/lib/api';
import { achsenDatumFormat } from '@/lib/format';

/** Eine lueckenlose Tagesreihe ab 2025-01-01, wie sie der Server liefert. */
function tagesreihe(anzahl: number): Zeitpunkt[] {
  const start = Date.UTC(2025, 0, 1);
  return Array.from({ length: anzahl }, (_, i) => ({
    tag: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    gesamtCent: 100_000 + i,
    einzahlungKumCent: 100_000,
    gewinnCent: i,
    gewinnProzent: i / 1000,
  }));
}

describe('tabellenAufloesung', () => {
  it.each([
    [1, 'taeglich'],
    [62, 'taeglich'],
    [63, 'woechentlich'],
    [400, 'woechentlich'],
    [401, 'monatlich'],
    [2500, 'monatlich'],
  ] as const)('%i Punkte: %s', (anzahl, erwartet) => {
    expect(tabellenAufloesung(anzahl)).toBe(erwartet);
  });
});

describe('tabellenPunkte', () => {
  it('laesst kurze Fenster taeglich', () => {
    const reihe = tagesreihe(30);
    expect(tabellenPunkte(reihe).punkte).toEqual(reihe);
  });

  it('nimmt woechentlich jeden siebten Punkt von hinten, dazu den ersten', () => {
    const reihe = tagesreihe(365);
    const { punkte, aufloesung } = tabellenPunkte(reihe);
    expect(aufloesung).toBe('woechentlich');
    expect(punkte.at(-1)).toEqual(reihe.at(-1));
    expect(punkte[0]).toEqual(reihe[0]);
    expect(punkte.length).toBeLessThanOrEqual(Math.ceil(365 / 7) + 1);
  });

  it('nimmt monatlich den letzten Punkt je Kalendermonat, dazu den ersten', () => {
    const reihe = tagesreihe(800);
    const { punkte, aufloesung } = tabellenPunkte(reihe);
    expect(aufloesung).toBe('monatlich');
    expect(punkte[0]).toEqual(reihe[0]);
    expect(punkte.at(-1)).toEqual(reihe.at(-1));
    const monate = punkte.slice(1).map((p) => p.tag.slice(0, 7));
    expect(new Set(monate).size).toBe(monate.length);
    expect(punkte.length).toBeLessThan(35);
  });

  it('liefert fuer die leere Reihe eine leere Tabelle', () => {
    expect(tabellenPunkte([]).punkte).toEqual([]);
  });

  it('nennt die Aufloesung im Hinweis der Tabelle', () => {
    expect(tabelleVermoegen(tagesreihe(800), null).hinweis).toBeTruthy();
    expect(tabelleVermoegen(tagesreihe(800), null).zeilen.length).toBeLessThan(35);
  });
});

describe('achsenDatumFormat', () => {
  it('beschriftet kurze Spannweiten mit Tag und Monat', () => {
    expect(achsenDatumFormat('2026-08-01', '2026-08-31')('2026-08-26')).toBe('26.08.');
  });

  it('beschriftet lange Spannweiten mit Monat und Jahr', () => {
    expect(achsenDatumFormat('2025-01-01', '2026-08-31')('2026-08-26')).toBe(
      achsenDatumFormat(undefined, undefined)('2026-08-26'),
    );
    expect(achsenDatumFormat('2025-01-01', '2026-08-31')('2026-08-26')).not.toBe('26.08.');
  });

  it('faellt ohne Daten auf Monat und Jahr zurueck', () => {
    expect(achsenDatumFormat(undefined, undefined)('2026-08-26')).not.toBe('26.08.');
  });
});

describe('Vorgaenge in der Vermoegenstabelle', () => {
  const marken = [
    { tag: '2025-01-03', typ: 'kauf', vorgaenge: [{ betragCent: 5_000, name: 'MSCI World' }] },
    { tag: '2025-01-03', typ: 'ertrag', vorgaenge: [{ betragCent: 120 }] },
  ] as const;

  it('fehlt ohne Marken, wie im Chart bei ausgeblendeten Zufluessen', () => {
    expect(tabelleVermoegen(tagesreihe(10), null).spalten).not.toContain('Vorgänge');
  });

  it('steht in der Zeile ihres Tages', () => {
    const tabelle = tabelleVermoegen(tagesreihe(10), null, marken);
    const spalte = tabelle.spalten.indexOf('Vorgänge');
    expect(spalte).toBeGreaterThan(0);
    const zelle = tabelle.zeilen[2]?.[spalte] ?? '';
    expect(zelle).toContain('Kauf · MSCI World');
    expect(zelle).toContain('Ertrag: ');
    expect(tabelle.zeilen[3]?.[spalte]).toBe('');
  });

  it('landet bei ausgeduennter Tabelle in der naechsten gezeigten Zeile', () => {
    const tabelle = tabelleVermoegen(tagesreihe(365), null, marken);
    const spalte = tabelle.spalten.indexOf('Vorgänge');
    expect(tabelle.zeilen.filter((zeile) => (zeile[spalte] ?? '') !== '')).toHaveLength(1);
  });
});

describe('Y-Achse im 1-2-5-Raster', () => {
  it.each([
    [1, 0.2],
    [7, 2],
    [230_000, 50_000],
    [0.03, 0.01],
  ])('Spanne %d: Schritt %d', (spanne, schritt) => {
    expect(rasterSchritt(spanne)).toBeCloseTo(schritt, 10);
  });

  it('kippt einen positiven Bereich nicht ins Minus', () => {
    const { domain, ticks } = yAchseImRaster([1_000, 250_000]);
    expect(domain[0]).toBe(0);
    expect(ticks?.every((tick) => tick >= 0)).toBe(true);
  });

  it('hat 0 als Tick, wenn der Bereich 0 enthaelt, und runde Zahlen ohne Rundungsrest', () => {
    const { ticks } = yAchseImRaster([-0.07, 0.21]);
    expect(ticks).toContain(0);
    expect(ticks).toContain(0.1);
    expect(ticks?.map(String).every((tick) => tick.length <= 5)).toBe(true);
  });

  it('beginnt am Datenbereich, nicht am naechsten Rasterschritt darunter', () => {
    const { domain, ticks } = yAchseImRaster([1_000_000, 2_450_000]);
    expect(domain[0]).toBeGreaterThan(800_000);
    expect(ticks?.[0]).toBe(1_000_000);
    expect(ticks?.every((tick) => tick >= (domain[0] as number) && tick <= (domain[1] as number))).toBe(true);
  });

  it('bleibt ohne Werte automatisch', () => {
    expect(yAchseImRaster([]).domain).toEqual(['auto', 'auto']);
  });
});

describe('Monatsticks', () => {
  it('fehlen bei Tagesbeschriftung', () => {
    expect(monatsTicks(tagesreihe(30), false)).toBeUndefined();
  });

  it('nehmen je Monat den ersten Punkt', () => {
    expect(monatsTicks(tagesreihe(100), true)).toEqual(['2025-01-01', '2025-02-01', '2025-03-01', '2025-04-01']);
  });

  it('stufen lange Reihen auf ein Raster ab Januar', () => {
    const ticks = monatsTicks(tagesreihe(365 * 5), true) ?? [];
    expect(ticks.length).toBeLessThanOrEqual(12);
    expect(ticks.map((tag) => tag.slice(5, 7))).toEqual(expect.arrayContaining(['01', '07']));
    expect(ticks.every((tag) => ['01', '07'].includes(tag.slice(5, 7)))).toBe(true);
  });
});
