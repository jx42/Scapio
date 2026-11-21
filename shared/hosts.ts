/**
 * Die Hostnamen, die der Ingest ansprechen darf — `erlaubteHosts` in `konfiguration.ts`
 * leitet seine Vorgabe von hier ab.
 *
 * Als Modul in `shared/` ohne Importe (bis auf einen Typ), weil sowohl `konfiguration.ts` als auch
 * die Anbieter unter `ingest/` sie brauchen: stuenden die Hosts in `ingest/quellen/`,
 * bildete `konfiguration.ts` mit ihnen einen Ringimport (die Quellen lesen ihrerseits
 * `PROJEKTWURZEL` von dort). Exakte Namen, keine Muster. Siehe `docs/SICHERHEIT.md`,
 * Restrisiko 1.
 *
 * Ein neuer Anbieter braucht hier einen Eintrag: der Schluessel ist auf
 * `AutomatischerAnbieter` festgelegt, ein fehlender scheitert am Typcheck.
 */

import type { AutomatischerAnbieter } from '../db/repository/fondsAufloesung.ts';

export const ANBIETER_HOSTS = {
  ishares: ['www.ishares.com'],
  xtrackers: ['etf.deutsche-am.com'],
  amundi: ['www.amundietf.de'],
  invesco: ['dng-api.invesco.com'],
  jpmorgan: ['am.jpmorgan.com'],
  goldmansachs: ['am.gs.com'],
  franklin: ['www.franklintempleton.de'],
} as const satisfies Record<AutomatischerAnbieter, readonly string[]>;

/** Eurostat (Inflation) und EZB (Zins) — keine Anbieter, aber Teil derselben Allowlist. */
const STATISTIK_HOSTS = ['ec.europa.eu', 'data-api.ecb.europa.eu'] as const;

export const vorgabeErlaubteHosts = (): string[] => [...Object.values(ANBIETER_HOSTS).flat(), ...STATISTIK_HOSTS];
