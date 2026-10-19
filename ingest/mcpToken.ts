/**
 * Die Ablage unter `<datenpfad>/mcp/`: `client.json` und `token.json`, Verzeichnis `0700`,
 * Dateien `0600` [ADR-056]. Kein Netzwerk; Registrierung, Anmeldung und Refresh stehen in
 * `mcpAnmeldung.ts`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { Konfiguration } from '../shared/konfiguration.ts';
import { mcpPfad, mcpTokenPfad } from '../shared/konfiguration.ts';
import { atomarSchreiben, eigeneDatei, verzeichnisAnlegen } from '../shared/dateirechte.ts';

// Registrierungsantwort (RFC 7591) bringt weitere Felder mit, `client.json` nur diese. [INV-12]
// `client_name` fehlt in Dateien von vor seiner Einfuehrung — die gelten fuer den Refresh weiter.
export const RegistrierungSchema = z.object({ client_id: z.string().min(1).max(512) });
const ClientDateiSchema = RegistrierungSchema.extend({
  client_name: z.string().min(1).max(200).optional(),
}).strict();
export type Client = z.infer<typeof ClientDateiSchema>;

// Fremde Antwort (Scalables Token-Endpunkt), deshalb zod statt eines blossen Typs. [INV-12]
// Obergrenzen sind grosszuegig, aber real: ein Token ist kein mehrseitiges Dokument, und
// `expires_in` ist eine Lebensdauer in Sekunden, keine Kalenderspanne.
//
// Bewusst NICHT `.strict()`: der angeforderte Scope enthaelt `openid`, also liefert die
// Gegenstelle OIDC-typisch zusaetzliche Felder wie `id_token` oder `scope` mit, die hier
// niemand braucht. `.strict()` liess deswegen jede echte Anmeldung an einem Feld scheitern,
// das kein Test kennt (Tests mocken nur die vier bekannten Felder). Unbekannte Felder werden
// von zod ohne `.strict()` stillschweigend verworfen, nicht durchgereicht — das reicht fuer
// INV-12: die bekannten Felder werden weiterhin geprueft.
const TokenFelder = {
  access_token: z.string().min(1).max(8192),
  refresh_token: z.string().min(1).max(8192).optional(),
  expires_in: z
    .number()
    .int()
    .positive()
    .max(2_592_000) // 30 Tage — ueblich sind Stunden, das ist bereits grosszuegig.
    .optional(),
  token_type: z.string().min(1).max(64).optional(),
};

export const TokenAntwortSchema = z.object(TokenFelder);
const GespeicherterTokenSchema = z.object({ ...TokenFelder, geholtUm: z.number().int().nonnegative() });

export type TokenSatz = z.infer<typeof TokenAntwortSchema>;
export type GespeicherterToken = z.infer<typeof GespeicherterTokenSchema>;

function clientDatei(k: Konfiguration): string {
  return join(mcpPfad(k), 'client.json');
}

export function tokenDatei(k: Konfiguration): string {
  return mcpTokenPfad(k);
}

/**
 * Existiert bereits ein gespeicherter Token? Reine Dateipruefung ohne Netzwerkzugriff —
 * fuer `npm run mcp-login -- --nur-wenn-noetig`, mit dem `Start.command`/`.bat` die
 * Anmeldung vorschalten, ohne selbst den Datenpfad zu kennen (der ist ueber `config.json`
 * konfigurierbar).
 */
export function mcpTokenVorhanden(k: Konfiguration): boolean {
  return existsSync(tokenDatei(k));
}

/** Der abgelegte Client, oder `null`, wenn `client.json` fehlt, kaputt ist oder nicht passt. */
export function gespeicherterClient(k: Konfiguration): Client | null {
  const datei = clientDatei(k);
  if (!eigeneDatei(datei)) return null;
  try {
    const ergebnis = ClientDateiSchema.safeParse(JSON.parse(readFileSync(datei, 'utf8')));
    return ergebnis.success ? ergebnis.data : null;
  } catch {
    return null;
  }
}

export function tokenSchreiben(k: Konfiguration, token: GespeicherterToken): void {
  verzeichnisAnlegen(mcpPfad(k));
  atomarSchreiben(tokenDatei(k), JSON.stringify(token, null, 2));
}

export function clientSchreiben(k: Konfiguration, client: Client): void {
  verzeichnisAnlegen(mcpPfad(k));
  atomarSchreiben(clientDatei(k), JSON.stringify(client, null, 2));
}

/**
 * Der abgelegte Token, oder `null`, wenn `token.json` fehlt oder kaputt ist — etwa durch ein
 * Backup-Werkzeug oder Bearbeiten von Hand; dann gilt sie wie eine fehlende. Eine fremde
 * Datei wirft `E_DATEI_FREMD` statt `null`, weil neu anmelden dort nicht hilft.
 */
export function gespeicherterToken(k: Konfiguration): GespeicherterToken | null {
  const datei = tokenDatei(k);
  if (!eigeneDatei(datei)) return null;
  try {
    const ergebnis = GespeicherterTokenSchema.safeParse(JSON.parse(readFileSync(datei, 'utf8')));
    return ergebnis.success ? ergebnis.data : null;
  } catch {
    return null;
  }
}
