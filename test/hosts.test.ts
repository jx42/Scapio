/**
 * Die Host-Allowlist folgt aus `hosts.ts`: die Vorgabe der Konfiguration ist genau die
 * Vereinigung der Anbieter- und Statistikhosts, und jeder aufgeloeste Anbieter hat einen
 * Eintrag.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { ANBIETER_HOSTS, vorgabeErlaubteHosts } from '../shared/hosts.ts';
import { ANBIETER } from '../ingest/anbieter.ts';
import { konfigurationVergessen, ladeKonfiguration } from '../shared/konfiguration.ts';

describe('Host-Allowlist [ADR-018]', () => {
  it('die Vorgabe der Konfiguration sind genau die fuenf bekannten Hosts', () => {
    konfigurationVergessen();
    const k = ladeKonfiguration(join(tmpdir(), 'scapio-gibt-es-nicht.json'));
    konfigurationVergessen();
    expect([...k.erlaubteHosts].sort()).toEqual(
      ['data-api.ecb.europa.eu', 'ec.europa.eu', 'etf.dws.com', 'www.amundietf.de', 'www.ishares.com'].sort(),
    );
    expect(k.erlaubteHosts).toEqual(vorgabeErlaubteHosts());
  });

  it('jeder Anbieter in ANBIETER hat Hosts', () => {
    for (const a of ANBIETER) {
      expect(Object.keys(ANBIETER_HOSTS)).toContain(a.name);
    }
  });

  it('config.json darf die Liste einschraenken, aber keinen fremden Host hinzufuegen', () => {
    const verzeichnis = mkdtempSync(join(tmpdir(), 'scapio-hosts-'));
    const datei = join(verzeichnis, 'config.json');
    try {
      writeFileSync(datei, JSON.stringify({ erlaubteHosts: ['www.ishares.com'] }));
      konfigurationVergessen();
      expect(ladeKonfiguration(datei).erlaubteHosts).toEqual(['www.ishares.com']);

      writeFileSync(datei, JSON.stringify({ erlaubteHosts: ['www.ishares.com', 'boese.tld'] }));
      konfigurationVergessen();
      expect(() => ladeKonfiguration(datei)).toThrow(/erlaubteHosts\.1/);
    } finally {
      konfigurationVergessen();
      rmSync(verzeichnis, { recursive: true, force: true });
    }
  });
});
