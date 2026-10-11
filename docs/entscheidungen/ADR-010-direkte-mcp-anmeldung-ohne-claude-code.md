# ADR-010: Direkte OAuth/PKCE-Anmeldung am Scalable-MCP statt Claude-Code-Kindprozess

## Kontext

Der Scalable-MCP hängt am claude.ai-Login, nicht an einem API-Key — weder ein Browser noch
ein eigener Server kann sich dort selbst anmelden. Bisher löste `ingest/claude.ts` das, indem
es pro Tool-Aufruf die `claude`-Binärdatei headless startete (`execFile`, `--allowedTools`
mit genau einem Tool, `--mcp-config ingest/mcp.json`, `--output-format stream-json`) und die
Nutzdaten aus dem `tool_result`-Block des Ereignisstroms zog — nie aus freiem Modelltext
(siehe [ADR-001](ADR-001-stream-json-statt-dateiuebergabe.md)). Das Modell diente dabei nur
als Schlüsselbund: „Die MCP-Anmeldung liegt ausschließlich in der Konfiguration von Claude
Code" (bisheriger Wortlaut in `AGENTS.md`).

Das hat drei Kosten, die mit reinem Bugfixing nicht verschwinden: der Ingest braucht die
`claude`-Binärdatei im `PATH` und eine eigene, gültige Claude-Code-Anmeldung als
Voraussetzung, bevor er überhaupt starten kann; ein Sprachmodell sitzt im Datenpfad, auch
wenn es nach dem einen Tool-Aufruf nichts mehr tut; und jeder Lauf trägt den Overhead und die
Variabilität eines Modellaufrufs (`mcpZeitlimitMs` musste zwischen Modell-Bedenkzeit und
echtem Netzwerk-Zeitlimit vermitteln).

Ein Prototyp aus dieser Sitzung (nicht Teil dieses Repos) hat bestätigt: ein eigener, bei
Scalable per Dynamic Client Registration angemeldeter OAuth-Client kommt über PKCE, echten
Browser-Login und einen `/token`-Tausch an einen funktionsfähigen `access_token`/
`refresh_token` und kann `initialize`/`tools/call` gegen `https://mcp.scalable.capital/mcp`
erfolgreich aufrufen — vollständig unabhängig von Claude Code.

## Entscheidung

`ingest/claude.ts` wird durch zwei Module ersetzt, die dieselbe öffentliche Schnittstelle
weiterführen (`mcpAufrufRoh`, `mcpAufruf`, `mcpAufrufSeiten`, `LESENDE_TOOLS`, `LesendesTool`,
`McpFehler`, `kurz`):

- **`ingest/mcpAnmeldung.ts`** — Client-Registrierung, PKCE-Autorisierungscode-Fluss über
  einen lokalen Redirect-Listener auf `127.0.0.1:8732/callback` (5 Minuten Zeitlimit), und
  der stille Refresh-Token-Tausch, den jeder Ingest-Lauf nutzt.
- **`ingest/mcp.ts`** — der JSON-RPC-Aufruf (`initialize`, `notifications/initialized`,
  `tools/call`) gegen `/mcp`, inklusive der Seitenschleife für
  `list_portfolio_transactions`.

Alle vier Endpunkte (`/register`, `/authorize`, `/token`, `/mcp`) sind feste
Code-Konstanten unter `https://mcp.scalable.capital`, nicht Teil von `erlaubteHosts` —
dieselbe Begründung wie zuvor für `ingest/mcp.json`: ein fest verdrahteter, vertrauter
Server, keine Allowlist für beliebige Gegenstellen.

Einziger interaktiver Einstieg ist **`npm run mcp-login`** (`start/mcpLogin.ts`) — öffnet
den Browser, wartet auf den Redirect, tauscht den Code gegen Tokens und speichert sie unter
`<datenverzeichnis>/mcp/` (`client.json`, `token.json`), Verzeichnis `0700`, Dateien `0600` —
exakt dasselbe Vertrauensmodell, das `db/verbindung.ts` für die Datenbank durchsetzt, und
dieselben Rechte werden nicht nur beim Schreiben, sondern auch vor jedem Lesen erneut
gesetzt. Der normale Ingest-Lauf öffnet nie von selbst einen Browser: `zugriffstoken()`
tauscht bei Bedarf still gegen den Refresh-Token und wirft `McpFehler('E_MCP_ANMELDUNG', …)`,
wenn das fehlschlägt oder kein Token vorhanden ist — der einzige Weg zurück ist dann erneut
`npm run mcp-login`.

Bewusst **nicht** gewählt: der macOS-Schlüsselbund über das `security`-Kommandozeilenwerkzeug.
Eine echte Betriebssystemgrenze wäre stärker als Dateirechte, aber sie hätte einen neuen
Kindprozess mit genau der Angriffsfläche (PATH-Auflösung, Escaping) eingeführt, die dieser
Schritt beim `claude`-Binär gerade abbaut, und eine Plattformbindung, die das Projekt sonst
nirgends hat.

Jeder `fetch` gegen `/token` und `/mcp` läuft mit `redirect: 'manual'` — eine Umleitung ist
dort anomal und wird als Fehler behandelt, nie automatisch verfolgt, damit der
`Authorization`-Kopf nie an eine unbeabsichtigte Gegenstelle geht.

## Folgen

- **Gewonnen:** kein `claude`-Binärpfad/PATH-Risiko mehr, keine installierte und angemeldete
  Claude-Code-Instanz als Voraussetzung für den Ingest, kein Sprachmodell mehr im Datenpfad —
  Nutzdaten kommen jetzt direkt aus dem `content[]`-Block der JSON-RPC-Antwort
  (`extrahiereInhalt` in `mcp.ts`). Kein `mcpZeitlimitMs`-Kompromiss zwischen
  Modell-Bedenkzeit und echtem Netzwerk-Zeitlimit mehr. Schnellerer, deterministischerer
  Ingest ohne LLM-Overhead.
- **Verloren:** die zweite, von der Anwendung unabhängige Durchsetzungsebene für „nur lesende
  Tools" fällt weg. Bisher verhinderten `--allowedTools`/`--disallowedTools` auf
  Prozessebene selbst einen hypothetischen Fehler im Anwendungscode — unabhängig davon,
  welches Tool der zusammengebaute Prompt anforderte. Nach dieser Umstellung ruht INV-01 auf
  genau einer Ebene: dem Typsystem (`LesendesTool`-Union) plus der Laufzeitprüfung
  `LESENDE_TOOLS.includes(tool)` in `mcpAufrufRoh`, die als allererste Anweisung vor jeder
  Konfiguration und jedem Netzwerkzugriff steht. Das ist derselbe Schutz, den jede andere
  Route/Funktion im Projekt auch hat (Code-Review, Tests, kein zweiter Prozess) — aber eine
  Ebene weniger als vorher, und das gehört hier ausdrücklich benannt, nicht stillschweigend
  hingenommen.
- Ein dauerhafter, nicht ablaufender Refresh-Token (`offline_access`) liegt jetzt als Datei
  auf der Platte statt in Claude Codes eigener, dieser Anwendung bisher nie sichtbarer
  Token-Verwaltung. Das ist neue Verantwortung, kein Nachteil im engeren Sinn: Claude Code
  verwaltete zuvor exakt denselben Tokentyp mit denselben Rechten — nur ohne dass diese
  Anwendung ihn je zu Gesicht bekam. Die getroffene Wahl dagegen ist dateibasierte Ablage
  (`0700`/`0600` unter `<datenverzeichnis>/mcp/`, außerhalb `~/Documents`/iCloud wie die
  Datenbank) statt macOS-Schlüsselbund, aus den unter „Entscheidung" genannten Gründen.
- `AGENTS.md`s Satz „Die MCP-Anmeldung liegt ausschließlich in der Konfiguration von Claude
  Code" ist damit falsch geworden und wurde ersetzt — die Kernaussage „keine Zugangsdaten im
  Repository" bleibt wahr, nur der Ort der Wahrheit ändert sich.
- Der stream-json-Extraktionsweg aus [ADR-001](ADR-001-stream-json-statt-dateiuebergabe.md)
  entfällt mit dem Kindprozess, der ihn erzeugte; die dort begründete Grundregel — Nutzdaten
  immer aus der strukturierten Werkzeugantwort, nie aus Modell- oder sonstigem Freitext —
  gilt unverändert weiter, nur dass es jetzt kein Modell mehr gibt, aus dessen Text sie
  fälschlich stammen könnten.

## Nachtrag: die Launcher lösen denselben Einstieg aus

`Start.command`/`.bat` rufen `npm run mcp-login -- --nur-wenn-noetig` vor `npm start`
auf, wenn `<datenverzeichnis>/mcp/token.json` fehlt — derselbe eine Einstieg, nur per
Doppelklick. Scheitert die Anmeldung, startet die Anwendung trotzdem und zeigt den Fehler in
der Aktualisieren-Kachel, statt dass ein Terminalfenster kommentarlos schließt. Warum es die
Launcher zweimal gibt, steht in [ADR-013](ADR-013-update-nur-auf-knopfdruck.md); die
Windows-Eigenheiten stehen im Kopf von `Start.bat` und `shared/browser.ts`.
