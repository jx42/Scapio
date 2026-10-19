/**
 * Baukasten fuer API-Tests: ein `Kontext` ohne echten Port und ohne echte Platte.
 *
 * `fastify.inject` bindet nie an einen Socket — deshalb ist der Port hier eine
 * beliebige Zahl innerhalb der erlaubten Spanne, keine, die wirklich frei sein muss.
 * Die Datenbank ist `:memory:`, das Datenverzeichnis ein Temp-Ordner nur fuer die
 * Sperre, die eine echte Datei verlangt.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { testDatenbank } from '../../db/verbindung.ts';
import { konfigurationFuer, type Konfiguration } from '../../shared/konfiguration.ts';
import { baueServer } from '../../server/server.ts';
import type { Sperre } from '../../server/sperre.ts';

export const PORT = 4732;
export const URSPRUNG = `http://127.0.0.1:${String(PORT)}`;

const verzeichnisse: string[] = [];

export function konfiguration(teil: Partial<Konfiguration> = {}): Konfiguration {
  const datenpfad = mkdtempSync(join(tmpdir(), 'portfolio-api-test-'));
  verzeichnisse.push(datenpfad);
  return konfigurationFuer(datenpfad, { port: PORT, erlaubteHosts: ['www.ishares.com', 'ec.europa.eu', 'data-api.ecb.europa.eu'], ...teil });
}

export function aufraeumen(): void {
  for (const v of verzeichnisse.splice(0)) rmSync(v, { recursive: true, force: true });
}

export type TestServer = {
  readonly app: FastifyInstance;
  readonly token: string;
  readonly sperre: Sperre;
  /** Dieselbe Konfiguration, die der Server bekommen hat — fuer Tests, die an ihre Pfade muessen. */
  readonly konfiguration: Konfiguration;
};

export async function testServer(teil: Partial<Konfiguration> = {}): Promise<TestServer> {
  const db = await testDatenbank();
  const k = konfiguration(teil);
  const { app, token, sperre } = baueServer({ db, konfiguration: k, distPfad: join(tmpdir(), 'portfolio-kein-dist') });
  return { app, token, sperre, konfiguration: k };
}

/** Kopfzeilen einer Anfrage, die die eigene Seite selbst haette schicken koennen. */
export function eigeneHerkunft(zusatz: Record<string, string> = {}): Record<string, string> {
  return { host: `127.0.0.1:${String(PORT)}`, origin: URSPRUNG, ...zusatz };
}

export function eigeneNavigation(zusatz: Record<string, string> = {}): Record<string, string> {
  // So sieht eine same-origin-Anfrage aus, die der Browser OHNE Origin-Kopf schickt:
  // Navigation zur Seite selbst, oder ein GET per fetch von der eigenen Seite aus.
  return { host: `127.0.0.1:${String(PORT)}`, 'sec-fetch-site': 'same-origin', ...zusatz };
}
