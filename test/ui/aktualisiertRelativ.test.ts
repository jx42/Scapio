import { describe, expect, it } from 'vitest';

import { aktualisiertRelativ } from '@/lib/format';

const ohneNbsp = (text: string | null) => text?.replaceAll(' ', ' ') ?? null;
// Donnerstag, 12.11.2026, 10:00 in Berlin.
const JETZT = new Date('2026-11-12T09:00:00Z');
const text = (iso: string, jetzt = JETZT) => ohneNbsp(aktualisiertRelativ(iso, jetzt));

describe('aktualisiertRelativ [ADR-064]', () => {
  it('sagt „Gerade“ unter einer Minute und bei einem Zeitpunkt in der Zukunft', () => {
    expect(text('2026-11-12T08:59:30Z')).toBe('Gerade aktualisiert');
    expect(text('2026-11-12T09:05:00Z')).toBe('Gerade aktualisiert');
  });

  it('zählt Minuten und Stunden', () => {
    expect(text('2026-11-12T08:59:00Z')).toBe('Vor 1 Minute aktualisiert');
    expect(text('2026-11-12T08:48:00Z')).toBe('Vor 12 Minuten aktualisiert');
    expect(text('2026-11-12T08:00:00Z')).toBe('Vor 1 Stunde aktualisiert');
    expect(text('2026-11-11T09:00:01Z')).toBe('Vor 23 Stunden aktualisiert');
  });

  it('zählt ab einem Tag Berliner Kalendertage, nicht 24-Stunden-Blöcke', () => {
    expect(text('2026-11-11T08:00:00Z')).toBe('Gestern aktualisiert');
    // 00:30 in Berlin am 11.11., in UTC noch der 10.11.
    expect(text('2026-11-10T23:30:00Z')).toBe('Gestern aktualisiert');
    // Freitag 18 Uhr, gelesen Montag 9 Uhr: 63 Stunden, aber drei Tage.
    expect(text('2026-11-06T17:00:00Z', new Date('2026-11-09T08:00:00Z'))).toBe(
      'Vor 3 Tagen aktualisiert',
    );
    expect(text('2026-11-06T09:00:00Z')).toBe('Vor 6 Tagen aktualisiert');
  });

  it('nennt ab sieben Tagen das Datum', () => {
    expect(text('2026-11-05T09:00:00Z')).toBe('Aktualisiert am 05.11.2026');
  });

  it('gibt bei fehlendem oder unlesbarem Zeitpunkt nichts aus', () => {
    expect(aktualisiertRelativ(null, JETZT)).toBeNull();
    expect(aktualisiertRelativ('', JETZT)).toBeNull();
    expect(aktualisiertRelativ('kaputt', JETZT)).toBeNull();
  });
});
