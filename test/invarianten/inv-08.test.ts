/**
 * INV-08 — Genau zwei mutierende Routen, beide ohne Parameter:
 * `POST /api/refresh` und `POST /api/mcp-anmeldung`. [ADR-012]
 *
 * Ohne Parameter heisst: der Aufrufer sagt "aktualisiere" beziehungsweise "melde mich
 * an", nicht "aktualisiere dies mit jenem". Alles, was der Lauf tut, steht im Quelltext,
 * nicht im Request-Body. Damit gibt es keine Eingabe, die den Lauf steuert, und damit
 * nichts, was eine Eingabe verbiegen koennte.
 *
 * Die Liste ist abschliessend und waechst nicht: eine dritte mutierende Route laesst
 * diesen Test rot werden und verlangt eine eigene ADR.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { aufraeumen, testServer } from '../api/hilfen.ts';
import { alsListe, dateien, registrierteRouten, sucheImCode } from './quellen.ts';

const SERVER = dateien(['server']);

describe('INV-08 — genau zwei schreibende Routen', () => {
  const alle = registrierteRouten();

  it('findet ueberhaupt Routen', () => {
    expect(alle.length).toBeGreaterThan(3);
  });

  it('registriert genau die beiden bekannten nicht-lesenden Routen', () => {
    const mutierend = alle.filter((r) => r.methode !== 'get' && r.methode !== 'head');
    const beschriftet = mutierend.map((r) => `${r.methode.toUpperCase()} ${r.pfad}`).sort();
    expect(beschriftet, `Gefunden in:\n${mutierend.map((r) => `  ${r.datei}:${r.zeile}`).join('\n')}`).toEqual([
      'POST /api/mcp-anmeldung',
      'POST /api/refresh',
    ]);
  });

  it('kennt weder PUT noch PATCH noch DELETE', () => {
    const treffer = sucheImCode(SERVER, /\bapp\s*\.\s*(put|patch|delete)\s*\(/);
    expect(treffer, `Verbotene Methode:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('registriert keine Route ueber `route` oder `all`, wo die Methode im Objekt steht', () => {
    const treffer = sucheImCode(SERVER, /\bapp\s*\.\s*(route|all)\s*\(/);
    expect(treffer, `Verdeckte Routenregistrierung:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('liest in keiner mutierenden Route Body, Query oder Parameter', () => {
    const pfade = ['server/routen/refresh.ts', 'server/routen/mcpAnmeldung.ts'];
    const quellen = SERVER.filter((q) => pfade.includes(q.pfad));
    expect(quellen.map((q) => q.pfad).sort(), 'eine mutierende Route fehlt').toEqual([...pfade].sort());
    const treffer = sucheImCode(quellen, /anfrage\s*\.\s*(body|query|params)/);
    expect(treffer, `Der Lauf laesst sich steuern:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('nennt in jeder mutierenden Route die Invariante', () => {
    for (const pfad of ['server/routen/refresh.ts', 'server/routen/mcpAnmeldung.ts']) {
      const quelle = SERVER.find((q) => q.pfad === pfad);
      expect(quelle?.inhalt ?? '', `${pfad} nennt INV-08 nicht`).toContain('INV-08');
    }
  });
});

describe('INV-08 — die Wache greift zur Laufzeit', () => {
  afterEach(aufraeumen);

  it('verweigert eine dritte mutierende Route, auch wenn sie nach dem Aufbau dazukommt', async () => {
    const { app } = await testServer();
    expect(() => {
      app.post('/api/erfunden', () => undefined);
    }).toThrow(/INV-08/);
    await app.close();
  });

  it('laesst die beiden bekannten mutierenden Routen unangetastet', async () => {
    const { app } = await testServer();
    await app.ready();
    await app.close();
  });
});
