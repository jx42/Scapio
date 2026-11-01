/**
 * ADR-042 als Konfiguration: die versionierte `deny`-Liste sperrt, was Depotwerte in eine
 * Agentensitzung bringen würde. [ADR-054]
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const einstellungen = JSON.parse(readFileSync('.claude/settings.json', 'utf8')) as {
  permissions: { allow: string[]; deny: string[] };
};
const { allow, deny } = einstellungen.permissions;

describe('Agentensperre [ADR-054]', () => {
  it('sperrt MCP, Datenverzeichnis, lauf.log und die Befehle mit echten Werten', () => {
    expect(deny).toEqual(
      expect.arrayContaining([
        'mcp__claude_ai_Scalable_Capital__*',
        'Read(~/Library/Application Support/scapio/**)',
        'Read(~/AppData/Local/scapio/**)',
        'Read(**/lauf.log)',
        'Bash(sqlite3 *)',
        'Bash(npm start*)',
        'Bash(npm run ingest*)',
        'Bash(npm run verify)',
        'Bash(npm run dev*)',
        'Bash(npm run leak-pruefung*)',
        'Bash(*start/start.ts*)',
        'Bash(curl *:4732*)',
        'WebFetch(domain:127.0.0.1)',
        'WebFetch(domain:localhost)',
      ]),
    );
  });

  it('sperrt verify nur exakt, damit verify:zaehlung erlaubt bleibt', () => {
    expect(deny).not.toContain('Bash(npm run verify*)');
    expect(allow).toContain('Bash(npm run verify:zaehlung)');
  });
});
