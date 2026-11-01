/** Vertragsprüfung: trennt fehlende, unbekannte und andersartige Felder, ohne Werte zu nennen. */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { leererBefund, sammle } from '../../start/vertrag.ts';

const Schema = z.object({ name: z.string(), kind: z.object({ tiefe: z.number() }).strict() }).strict();

describe('sammle', () => {
  it('meldet ein fehlendes Feld als fehlend, auch verschachtelt', () => {
    const befund = leererBefund();
    expect(sammle(Schema, { kind: {} }, befund)).toBe(false);
    expect([...befund.fehlend].sort()).toEqual(['kind.tiefe', 'name']);
    expect(befund.andersartig.size).toBe(0);
  });

  it('meldet ein vorhandenes Feld mit falschem Typ als andersartig, ohne den Wert', () => {
    const befund = leererBefund();
    sammle(Schema, { name: 4711, kind: { tiefe: null } }, befund);
    expect([...befund.andersartig].sort()).toEqual(['kind.tiefe [invalid_type]', 'name [invalid_type]']);
    expect(befund.fehlend.size).toBe(0);
  });

  it('meldet unbekannte Schlüssel mit Pfad und JSON-Art, ohne den Wert', () => {
    const befund = leererBefund();
    sammle(Schema, { name: 'x', kind: { tiefe: 1, neu: 4711 }, oben: { b: 'geheim', a: null } }, befund);
    expect([...befund.unbekannt].sort()).toEqual(['kind.neu (number)', 'oben (object{a,b})']);
  });

  it('nennt Schlüssel, die keine Feldnamen sind, nur als Anzahl', () => {
    const befund = leererBefund();
    sammle(Schema, { name: 'x', kind: { tiefe: 1 }, depot: { IE00B4L5Y983: 1, 'Beispiel AG': 2 } }, befund);
    expect([...befund.unbekannt]).toEqual(['depot (object{2 Schlüssel})']);
  });
});
