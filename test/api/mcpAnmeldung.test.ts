/**
 * Die zweite mutierende Route: `POST /api/mcp-anmeldung` und ihr lesendes Gegenstueck.
 * [INV-08, ADR-012]
 *
 * `ingest/mcpAnmeldung.ts` ist komplett gemockt — hier geht es um die Route, nicht um
 * PKCE: kein Browser, kein Listener auf 8732, kein Netz. Geprueft wird, dass die Route
 * dieselben Schranken hat wie `/api/refresh` (Token, kein Rumpf, kein Parameter, 409
 * gegen den zweiten Versuch) und dass keine fremde Meldung nach draussen dringt.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Konfiguration } from '../../shared/konfiguration.ts';
import { mcpTokenPfad } from '../../shared/konfiguration.ts';
import { aufraeumen, eigeneHerkunft, testServer } from './hilfen.ts';

vi.mock('../../ingest/mcpAnmeldung.ts', () => ({ anmelden: vi.fn() }));

const { anmelden } = await import('../../ingest/mcpAnmeldung.ts');
const anmeldenMock = vi.mocked(anmelden);

beforeEach(() => {
  anmeldenMock.mockReset();
  anmeldenMock.mockResolvedValue(undefined);
});

afterEach(() => {
  aufraeumen();
});

/** Legt eine Tokendatei an, wie sie eine abgeschlossene Anmeldung hinterlaesst. */
function tokenAblegen(k: Konfiguration): void {
  const pfad = mcpTokenPfad(k);
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, '{}');
}

describe('GET /api/mcp-anmeldung [ADR-012]', () => {
  it('meldet "nicht angemeldet", solange keine Tokendatei liegt', async () => {
    const { app } = await testServer();
    const res = await app.inject({ method: 'GET', url: '/api/mcp-anmeldung', headers: eigeneHerkunft() });
    expect(res.statusCode).toBe(200);
    const koerper = JSON.parse(res.body);
    expect(koerper.angemeldet).toBe(false);
    expect(koerper.laeuft).toBe(false);
    expect(koerper.fehler).toBeNull();
  });

  it('meldet "angemeldet", sobald eine Tokendatei liegt — ohne sie zu lesen', async () => {
    const { app, konfiguration: k } = await testServer();
    tokenAblegen(k);
    const res = await app.inject({ method: 'GET', url: '/api/mcp-anmeldung', headers: eigeneHerkunft() });
    expect(JSON.parse(res.body).angemeldet).toBe(true);
  });

  it('braucht keinen Token, weil es nichts veraendert', async () => {
    const { app } = await testServer();
    const res = await app.inject({ method: 'GET', url: '/api/mcp-anmeldung', headers: eigeneHerkunft() });
    expect(res.statusCode).toBe(200);
  });

  it('lehnt einen Parameter in der Adresse ab', async () => {
    const { app } = await testServer();
    const res = await app.inject({ method: 'GET', url: '/api/mcp-anmeldung?x=1', headers: eigeneHerkunft() });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).fehler.code).toBe('E_PARAMETER');
  });
});

describe('POST /api/mcp-anmeldung: dieselben Schranken wie /api/refresh [INV-08, ADR-012]', () => {
  it('lehnt die Anmeldung ohne Token ab', async () => {
    const { app } = await testServer();
    const res = await app.inject({ method: 'POST', url: '/api/mcp-anmeldung', headers: eigeneHerkunft() });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).fehler.code).toBe('E_TOKEN');
    expect(anmeldenMock).not.toHaveBeenCalled();
  });

  it('lehnt einen fremden Origin ab', async () => {
    const { app, token } = await testServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/mcp-anmeldung',
      headers: { ...eigeneHerkunft({ origin: 'https://boese.tld' }), 'x-portfolio-token': token },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).fehler.code).toBe('E_HERKUNFT');
    expect(anmeldenMock).not.toHaveBeenCalled();
  });

  it('lehnt einen Rumpf ab', async () => {
    const { app, token } = await testServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/mcp-anmeldung',
      headers: { ...eigeneHerkunft(), 'x-portfolio-token': token, 'content-type': 'application/json' },
      payload: '{"anbieter":"boese"}',
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).fehler.code).toBe('E_RUMPF');
    expect(anmeldenMock).not.toHaveBeenCalled();
  });

  it('lehnt einen Parameter in der Adresse ab', async () => {
    const { app, token } = await testServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/mcp-anmeldung?anbieter=boese',
      headers: { ...eigeneHerkunft(), 'x-portfolio-token': token },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).fehler.code).toBe('E_RUMPF');
    expect(anmeldenMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/mcp-anmeldung: Ablauf [ADR-012]', () => {
  it('antwortet sofort mit 202 und startet den Ablauf genau einmal', async () => {
    let freigeben: () => void = () => {};
    const wartet = new Promise<void>((r) => {
      freigeben = r;
    });
    anmeldenMock.mockReturnValue(wartet);

    const { app, token } = await testServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/mcp-anmeldung',
      headers: { ...eigeneHerkunft(), 'x-portfolio-token': token },
    });

    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body).laeuft).toBe(true);
    expect(anmeldenMock).toHaveBeenCalledTimes(1);

    // Waehrend der Ablauf noch offen ist, sagt das lesende Gegenstueck dasselbe.
    const stand = await app.inject({ method: 'GET', url: '/api/mcp-anmeldung', headers: eigeneHerkunft() });
    expect(JSON.parse(stand.body).laeuft).toBe(true);

    // Und ein zweiter Versuch waere ein zweites Browserfenster auf demselben Port.
    const zweiter = await app.inject({
      method: 'POST',
      url: '/api/mcp-anmeldung',
      headers: { ...eigeneHerkunft(), 'x-portfolio-token': token },
    });
    expect(zweiter.statusCode).toBe(409);
    expect(JSON.parse(zweiter.body).fehler.code).toBe('E_SPERRE');
    expect(anmeldenMock).toHaveBeenCalledTimes(1);

    freigeben();
  });

  it('lehnt die Anmeldung waehrend eines Laufs mit 409 ab', async () => {
    const { app, token, sperre } = await testServer();
    sperre.nimm('api');
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/mcp-anmeldung',
        headers: { ...eigeneHerkunft(), 'x-portfolio-token': token },
      });
      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body).fehler.code).toBe('E_SPERRE');
      expect(anmeldenMock).not.toHaveBeenCalled();
    } finally {
      sperre.gibFrei();
    }
  });

  it('meldet nach einer gescheiterten Anmeldung den Code, nie die fremde Meldung', async () => {
    const geheim = 'Bearer eyJhbGciOi.geheim.token';
    anmeldenMock.mockRejectedValue(Object.assign(new Error(geheim), { code: 'E_MCP_ANMELDUNG' }));

    const { app, token } = await testServer();
    app.log.level = 'silent';
    const res = await app.inject({
      method: 'POST',
      url: '/api/mcp-anmeldung',
      headers: { ...eigeneHerkunft(), 'x-portfolio-token': token },
    });
    expect(res.statusCode).toBe(202);

    // Der Ablauf faellt erst in einem spaeteren Tick durch; ein Tick reicht.
    await new Promise((r) => setImmediate(r));

    const stand = await app.inject({ method: 'GET', url: '/api/mcp-anmeldung', headers: eigeneHerkunft() });
    const koerper = JSON.parse(stand.body);
    expect(koerper.laeuft).toBe(false);
    expect(koerper.fehler.code).toBe('E_MCP_ANMELDUNG');
    expect(stand.body).not.toContain('geheim');
  });

  it('gibt einer Anmeldung ohne eigenen Code E_UNBEKANNT', async () => {
    anmeldenMock.mockRejectedValue(new Error('irgendwas'));

    const { app, token } = await testServer();
    app.log.level = 'silent';
    await app.inject({
      method: 'POST',
      url: '/api/mcp-anmeldung',
      headers: { ...eigeneHerkunft(), 'x-portfolio-token': token },
    });
    await new Promise((r) => setImmediate(r));

    const stand = await app.inject({ method: 'GET', url: '/api/mcp-anmeldung', headers: eigeneHerkunft() });
    expect(JSON.parse(stand.body).fehler.code).toBe('E_UNBEKANNT');
  });

  it('haelt den Zustand je Serverinstanz, nicht im Modul', async () => {
    let freigeben: () => void = () => {};
    anmeldenMock.mockReturnValue(
      new Promise<void>((r) => {
        freigeben = r;
      }),
    );

    const erster = await testServer();
    await erster.app.inject({
      method: 'POST',
      url: '/api/mcp-anmeldung',
      headers: { ...eigeneHerkunft(), 'x-portfolio-token': erster.token },
    });

    const zweiter = await testServer();
    const stand = await zweiter.app.inject({
      method: 'GET',
      url: '/api/mcp-anmeldung',
      headers: eigeneHerkunft(),
    });
    expect(JSON.parse(stand.body).laeuft).toBe(false);

    freigeben();
  });
});
