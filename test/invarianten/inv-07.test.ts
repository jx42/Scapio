/**
 * INV-07 — Der Server bindet ausschliesslich an `127.0.0.1`.
 *
 * Fastify bindet ohne `host` an alle Schnittstellen. In einem Cafe-WLAN liegt dann das
 * ganze Depot offen. Es gibt keinen Fall, in dem dieses Dashboard von einem anderen
 * Rechner erreichbar sein soll — deshalb steht die Adresse als Konstante und nicht in
 * der Konfiguration: was nicht einstellbar ist, kann nicht falsch eingestellt werden.
 */

import { describe, expect, it } from 'vitest';
import { HOST } from '../../server/server.ts';
import { AUSGELIEFERT, alsListe, dateien, sucheImCode } from './quellen.ts';

const QUELLEN = dateien(AUSGELIEFERT);
const SERVER = dateien(['server', 'start']);

describe('INV-07 — nur die Loopback-Adresse', () => {
  it('haelt den Host als Konstante auf 127.0.0.1', () => {
    expect(HOST).toBe('127.0.0.1');
  });

  it('bindet nirgends an eine andere Adresse', () => {
    // Nur in server/ und start/: `ingest/netz.ts` nennt dieselben Adressen, um sie
    // ABZULEHNEN — eine Sperrliste gegen SSRF ist das Gegenteil einer Bindung.
    const treffer = sucheImCode(SERVER, /['"]0\.0\.0\.0['"]|['"]::['"]|['"]\[::\]['"]/);
    expect(treffer, `Bindung an eine fremde Adresse:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('nennt eine Adresse im Server nur als 127.0.0.1 oder localhost', () => {
    const adressen = new Set<string>();
    for (const q of SERVER) {
      for (const t of q.inhalt.match(/['"](\d{1,3}(?:\.\d{1,3}){3})['"]/g) ?? []) adressen.add(t.slice(1, -1));
    }
    const fremd = [...adressen].filter((a) => a !== '127.0.0.1');
    expect(fremd, `Fremde IP im Server: ${fremd.join(', ')}`).toEqual([]);
  });

  it('ruft `listen` nur mit dem festen Host auf', () => {
    // Ueber allen ausgelieferten Quelltext: ein zweiter Server anderswo waere sonst unsichtbar.
    // Der OAuth-Redirect-Server bindet positional und hat unten einen eigenen Test.
    const rufe = sucheImCode(QUELLEN, /\.listen\s*\(/).filter((r) => r.pfad !== 'ingest/mcpAnmeldung.ts');
    expect(rufe.length, 'Kein listen gefunden — der Test prueft nichts').toBeGreaterThan(0);
    for (const r of rufe) {
      expect(r.text, `${r.pfad}:${r.zeile} bindet ohne HOST`).toMatch(/host\s*:\s*HOST/);
    }
  });

  it('bindet auch den lokalen OAuth-Redirect-Server in ingest/ nur an 127.0.0.1', () => {
    // Eigener Test statt Erweiterung von SERVER: ingest/netz.ts fuehrt dieselben
    // Adressen ('::', '0.0.0.0') als SSRF-Sperrliste — ein Fund dort waere kein
    // Verstoss. Der Redirect-Server bindet zudem positional (`listen(port, host, ...)`),
    // nicht ueber ein `{ host: HOST }`-Objekt wie Fastify, deshalb ein eigenes Muster.
    const INGEST_SERVER = dateien(['ingest']).filter((q) => q.pfad === 'ingest/mcpAnmeldung.ts');
    const rufe = sucheImCode(INGEST_SERVER, /\.listen\s*\(/);
    expect(rufe.length, 'Kein listen im OAuth-Redirect-Server gefunden — der Test prueft nichts').toBeGreaterThan(
      0,
    );
    for (const r of rufe) {
      expect(r.text, `${r.pfad}:${r.zeile} bindet ohne feste Loopback-Adresse`).toMatch(/['"]127\.0\.0\.1['"]/);
    }
  });

  it('macht die Adresse nicht konfigurierbar', () => {
    // Ein `host` in der Konfiguration waere ein Schalter, der die Regel aufhebt.
    const treffer = sucheImCode(dateien(['shared'], ['.ts']).filter((q) => q.pfad === 'shared/konfiguration.ts'), /\bhost\b/);
    expect(treffer, `Host in der Konfiguration:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('setzt keinen CORS-Header', () => {
    const treffer = sucheImCode(QUELLEN, /[Aa]ccess-[Cc]ontrol-[Aa]llow|@fastify\/cors|\bcors\b/);
    expect(treffer, `CORS:\n${alsListe(treffer)}`).toEqual([]);
  });

  it('vertraut keinem Proxy-Header', () => {
    // `trustProxy` liesse einen fremden `X-Forwarded-For` die Herkunftspruefung
    // faelschen. Es darf vorkommen — aber nur als `false`, ausgeschrieben: die
    // Vorgabe von Fastify ist zwar dieselbe, aber eine Vorgabe aendert sich
    // leichter als eine Zeile, die jemand bewusst hingeschrieben hat.
    const gesetzt = sucheImCode(QUELLEN, /trustProxy/);
    for (const t of gesetzt) {
      expect(t.text, `${t.pfad}:${t.zeile} vertraut einem Proxy`).toMatch(/trustProxy\s*:\s*false/);
    }
    const weitergeleitet = sucheImCode(QUELLEN, /x-forwarded-(for|host|proto)/i);
    expect(weitergeleitet, `Proxy-Header gelesen:\n${alsListe(weitergeleitet)}`).toEqual([]);
  });
});
