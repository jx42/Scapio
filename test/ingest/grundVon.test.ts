/**
 * Was `lauf.log` zu einem gescheiterten Abruf sagt: genug, um die Stelle zu finden, und
 * nie einen Wert aus der Antwort. [INV-12, ADR-042]
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { grundVon } from '../../ingest/laufZustand.ts';
import { NetzFehler } from '../../ingest/netz.ts';
import { HoldingsAntwort, pruefe } from '../../ingest/schema.ts';
import { FIXTURE, json } from '../fixtures/index.ts';

function fehlerVon(f: () => unknown): unknown {
  try {
    f();
  } catch (fehler) {
    return fehler;
  }
  throw new Error('kein Fehler geworfen');
}

describe('grundVon', () => {
  it('nennt bei E_SCHEMA Pfad und Pruefung', () => {
    const fehler = fehlerVon(() => pruefe('holdings', HoldingsAntwort, json(FIXTURE.holdingsFeld)));
    expect(grundVon(fehler)).toMatch(/^SchemaFehler\/E_SCHEMA \(.*unrecognized_keys \(marketValue\)/);
  });

  it('nennt den Pfad eines null-Werts, aber nicht den Wert daneben', () => {
    const schema = z.object({ name: z.string(), wert: z.number() }).strict();
    const fehler = fehlerVon(() => pruefe('holdings', schema, { name: 'GEHEIMER-NAME', wert: null }));
    const grund = grundVon(fehler);
    expect(grund).toBe('SchemaFehler/E_SCHEMA (wert: invalid_type)');
    expect(grund).not.toContain('GEHEIMER-NAME');
  });

  it('nennt bei E_NETZ den Code der Ursache', () => {
    expect(grundVon(new NetzFehler('E_NETZ', 'x', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'))).toBe(
      'NetzFehler/E_NETZ (UNABLE_TO_GET_ISSUER_CERT_LOCALLY)',
    );
  });

  it('bleibt bei anderen Fehlern beim Code', () => {
    expect(grundVon(Object.assign(new Error('Inhalt der Antwort'), { code: 'E_NETZ' }))).toBe('Error/E_NETZ');
  });
});
