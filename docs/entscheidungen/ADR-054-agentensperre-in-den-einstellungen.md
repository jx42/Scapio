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

## Nachtrag: die Strom-Fixtures sind entfernt

Kein Test las sie mehr, seit es den `claude`-Kindprozess nicht mehr gibt.

## Nachtrag: die laufende App

Befund vom 2026-11-01: Die Liste sperrte die Datenbank, aber nicht die Seite, die sie anzeigt.
`npm run dev` und `start/start.ts` direkt startet die echte App auf 4732; Browser, Bildschirmfoto,
`curl` und WebFetch auf diesen Port brachten jeden Betrag in den Kontext. Neu unter `deny`:
`npm run dev`, `npm run leak-pruefung`, `*start/start.ts*`, `curl` auf `:4732`, WebFetch auf
`127.0.0.1` und `localhost`. Claude in Chrome und Playwright fängt keine Regel — dafür steht in
AGENTS.md, dass Agenten nur Demo, Edgecases und e2e ansehen. Ein abweichender Port aus
`einstellungen.json` ist nur durch diese Regel gedeckt.

## Nachtrag: Umgehungen geschlossen

Audit vom 2026-11-06: Die Muster fingen nur die wörtliche Form. `npm run -s verify`,
`npm run start`, `node … start/verify.ts`, `./Start.command`, `wget` oder `node -e` auf `:4732`,
`cp`/`cat` auf Datenverzeichnis und `~/Scapio-Sicherung` und `Read` auf die Temp-Kopie von
`verify` gingen durch.

- **Bash:** Datenverzeichnis beider Plattformen und `Scapio-Sicherung` als Teilstring, `:4732` in
  jedem Befehl, `npm run` mit Optionen vor dem Skriptnamen, `node` vor `start/start.ts`,
  `start/verify.ts` und `ingest/lauf.ts`, die `.command`/`.bat`-Einstiege. `*start/start.ts*` ist
  auf `*node*start/start.ts*` verengt, damit `grep` und `sed` auf den Quelltext erlaubt bleiben.
- **Read:** `*.db` und `*.db-wal` überall. `verify` legt seine Kopie im Datenverzeichnis an statt
  unter `tmpdir()` und räumt Reste eines abgebrochenen Laufs beim nächsten ab.
- **Claude in Chrome:** `ClaudeInChromeDomain(127.0.0.1:4732)` und `(localhost:4732)`. Claude Code
  wertet `deny` dafür aus und vergleicht mit und ohne Port (geprüft an 2.1.316); ohne Port wären
  auch Demo und Randfallseite gesperrt. Der Satz „Claude in Chrome … fängt keine Regel“ oben ist
  damit überholt. Playwright bleibt ungesperrt; PR-Bilder entstehen nur über `npm run pr-bild`
  ([ADR-042](ADR-042-agenten-lesen-keine-depotwerte.md), Nachtrag).
- `test/agentensperre.test.ts` prüft die Muster an einem Modell der Regelauswertung gegen eine
  Tabelle von Umgehungen und von Befehlen, die erlaubt bleiben müssen.

Restlücke: ein Interpreter mit zusammengesetztem Pfad oder Port (`python3 -c`, `node -e` mit
Variablen) und ein abweichender Port aus `einstellungen.json`. Dagegen steht nur AGENTS.md.
