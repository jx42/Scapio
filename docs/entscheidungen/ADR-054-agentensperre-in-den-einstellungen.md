# ADR-054: Agentensperre in den Einstellungen, Toolnamen ohne Präfix

Nachtrag zu [ADR-010](ADR-010-direkte-mcp-anmeldung-ohne-claude-code.md) und
[ADR-042](ADR-042-agenten-lesen-keine-depotwerte.md); Befund aus dem Audit vom 2026-10-17.

## Kontext

ADR-042 war eine Anweisung ohne technische Grenze: Die versionierte Allowlist erlaubte die
gefährlichen Befehle nur nicht, verbot sie aber auch nicht. Eine lokale Freigabe in
`settings.local.json` oder ein verbundener Scalable-Connector reichte, damit echte Werte im
Kontext landen. Zugleich stand in `ingest/mcp.ts` jeder Toolname mit dem Claude-Code-Präfix
`mcp__claude_ai_Scalable_Capital__` — ein Rest aus der Zeit des Kindprozesses, den `kurz()`
vor jedem Aufruf wieder abschnitt.

## Entscheidung

- **`deny` in `.claude/settings.json`:** die Scalable-Tools des Connectors
  (`mcp__claude_ai_Scalable_Capital__*`), `Read` auf das Datenverzeichnis beider Plattformen
  und auf `**/lauf.log`, `sqlite3`, `npm start`, `npm run ingest` und `npm run verify` — dieses
  exakt, damit `verify:zaehlung` erlaubt bleibt. `deny` schlägt jede Freigabe, auch die lokale.
  `test/agentensperre.test.ts` hält die Liste fest.
- **AGENTS.md** markiert `npm start`, `npm run ingest` und `npm run verify` als „nicht für
  Agenten“.
- **Toolnamen ohne Präfix.** `LESENDE_TOOLS` führt die Namen, die die Gegenstelle kennt; `kurz()`
  entfällt. Die Allowlist ist inhaltlich gleich, ebenso der JSON-RPC-Aufruf. Der INV-01-Test
  sucht Toolnamen als Literal und verbietet `mcp__` im ausgelieferten Quelltext.

## Verworfene Alternativen

- **Hook im Repository.** Wie in ADR-042: ein Hook führt Code aus, `deny` ist Konfiguration.

## Folgen

- Die Sperre gilt nur für Claude Code und nur für die gelisteten Wege; `cat` über Bash auf die
  Datenbank fängt sie nicht. Die Regel in AGENTS.md bleibt die eigentliche Grenze.
- Wer lokal Freigaben für `ingest`, `verify` oder `sqlite3` in `settings.local.json` hat, räumt
  sie selbst auf; sie greifen ohnehin nicht mehr.
- Die Fixtures `strom.ndjson` und `kaputt/strom-fremdes-tool.ndjson` behalten das Präfix: sie
  zeigen, was der frühere `claude`-Kindprozess lieferte, und werden nicht angepasst
  (`test/fixtures/LIESMICH.md`).
