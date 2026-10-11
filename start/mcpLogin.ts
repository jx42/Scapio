/**
 * `npm run mcp-login` — einmalige, manuelle PKCE-Anmeldung am Scalable-MCP.
 *
 * Läuft nie automatisch: der normale Ingest nutzt ausschließlich den stillen
 * Refresh-Token-Tausch in `mcpAnmeldung.ts`s `zugriffstoken()` und bricht mit
 * `E_MCP_ANMELDUNG` ab, wenn der dafür nötige Refresh-Token fehlt oder abgelehnt wird —
 * dieser Befehl ist dann der Weg zurück. Kein `--force`-Schalter nötig: ein erneuter Lauf
 * überschreibt einen vorhandenen, noch gültigen Token einfach — das ist immer sicher.
 *
 * `--nur-wenn-noetig`: überspringt die Anmeldung, wenn bereits ein Token gespeichert ist,
 * statt ihn zu überschreiben. Für `Start.command`/`.bat` — ein Doppelklick soll nicht bei
 * jedem Start erneut einen Browser öffnen, nur beim allerersten Mal oder nach einer
 * abgelaufenen Anmeldung (die dann `zugriffstoken()` selbst als Fehler meldet).
 */

import { resolve } from 'node:path';
import { ladeKonfiguration } from '../shared/konfiguration.ts';
import { anmelden, mcpTokenVorhanden, registrieren } from '../ingest/mcpAnmeldung.ts';
import { McpFehler } from '../ingest/mcp.ts';

async function haupt(): Promise<void> {
  const konfiguration = ladeKonfiguration();
  const nurWennNoetig = process.argv.includes('--nur-wenn-noetig');

  if (nurWennNoetig && mcpTokenVorhanden(konfiguration)) {
    process.stdout.write('✅  Anmeldung bereits vorhanden, ueberspringe.\n');
    return;
  }

  try {
    await registrieren(konfiguration);
    // `--nur-wenn-noetig` kommt nur aus Start.command/.bat — dort startet gleich danach das Dashboard.
    await anmelden(konfiguration, {
      melde: (text) => process.stdout.write(`${text}\n`),
      dashboardFolgt: nurWennNoetig,
    });
  } catch (fehler) {
    if (fehler instanceof McpFehler) {
      process.stderr.write(`❌  Anmeldung fehlgeschlagen (${fehler.code}): ${fehler.message}\n`);
    } else {
      process.stderr.write(`❌  Anmeldung fehlgeschlagen: ${(fehler as Error).message}\n`);
    }
    process.exitCode = 1;
  }
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) await haupt();
