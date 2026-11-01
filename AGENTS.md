# Scapio

Lokales Dashboard für ein Scalable-Capital-Depot: rekonstruierte Wertentwicklung seit dem ersten
Kauf, XIRR und TWR, inflationsbereinigte Realrendite, Blick durch die ETFs auf die tatsächlich
gehaltenen Unternehmen. Alles läuft auf diesem Rechner, macOS oder Windows. Keine Cloud, keine
Zugangsdaten in der Anwendung, kein Hintergrundprozess.

Struktur, Schema, Verträge und Algorithmen stehen in [`docs/`](docs/) —
[`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md) für Datenfluss und Schichten,
[`docs/DATENMODELL.md`](docs/DATENMODELL.md) für jede Tabelle,
[`docs/entscheidungen/`](docs/entscheidungen/README.md) (Verzeichnis mit Status je ADR) für die Begründung der ungewöhnlichsten
Entscheidungen. Wofür das Produkt da ist und was es nie wird: [`PRODUCT.md`](PRODUCT.md); wie es
aussieht: [`DESIGN.md`](DESIGN.md) — beide in der Wurzel, weil die Design-Skills sie dort suchen. Berührt eine Änderung eine dieser Entscheidungen, gehört die Begründung als
neue ADR dorthin, nicht in einen Kommentar.

## Aufbau

| Ordner | Aufgabe | Eigene Regeln |
|---|---|---|
| `ingest/` | holt Daten aus dem Scalable-MCP, von iShares, Xtrackers, Amundi, Eurostat und der EZB | `ingest/CLAUDE.md` |
| `core/` | reiner Rechenkern: XIRR, TWR, FIFO, Look-Through | `core/CLAUDE.md` |
| `db/` | SQLite über `node:sqlite`, Migrationen, Repositories | `db/CLAUDE.md` |
| `server/` | Fastify auf 127.0.0.1, API und Auslieferung | `server/CLAUDE.md` |
| `src/` | React-Oberfläche, fünf Kacheln auf einer Seite | `src/CLAUDE.md` |
| `test/` | vitest, Fixtures, Invariantentests | — |
| `docs/` | Architektur, Datenmodell, Entwicklung, Glossar, Runbook, Sicherheit, ADRs | — |
| `start/` | Einstiegspunkte hinter den `npm run`-Befehlen unten, plus `werkzeuge.ts` für Unterprozesse ohne Shell | — |
| `shared/` | Module ohne eigene Schicht, siehe unten | — |
| `demo-worker/` | Cloudflare-Worker der öffentlichen Demo, liest nur den Abzug ([ADR-048](docs/entscheidungen/ADR-048-demo-als-statischer-abzug.md)) | — |

Was in `shared/` liegt: [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md#datenfluss), Absatz „`shared/` hält“.
`server/vertrag.ts` ist die eine Typquelle für den API-Vertrag — Server und Oberfläche importieren von dort.

Eine neue Kennzahl, ein neues Antwortfeld, eine neue Spalte: welche Dateien in welcher Reihenfolge,
steht in [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md#wo-etwas-angeschlossen-wird).

Datenfluss: **MCP → Ingest (validiert) → SQLite → Rechenkern → API → Oberfläche.** In keiner anderen
Richtung. Die Oberfläche rechnet nicht, der Server rechnet nicht, der Rechenkern liest nichts.

## Befehle

Die für Agenten; alle übrigen in [`docs/ENTWICKLUNG.md`](docs/ENTWICKLUNG.md#befehle).

```sh
npm run check:geaendert  # Zwischenschritt: tsc ganz, eslint und vitest nur für Geändertes gegenüber origin/main
npm run check:kurz       # typecheck + lint + tests, still — muss vor jeder Übergabe grün sein
npm run test:tz          # dieselbe Suite unter drei Zeitzonen — vor jedem Push
npm run audit            # Schwachstellen der Laufzeitabhängigkeiten — vor jedem Push
npm run test:invarianten # nur die zwölf Invariantentests und der Kontrasttest
npm run test:e2e         # der eine Playwright-Durchstich, echter Chromium
npm run kern:version     # nach einer Änderung in core/: KERN_VERSION + 1 und Abdruck neu [INV-10]
npm run kontrast         # nach einem neuen Farb-Token: Kontrasttabelle neu schreiben
npm run verify:zaehlung  # bei Zweifeln an einer Zahl: nur Tag und Feld, ohne Werte
```

Installation immer `npm ci --ignore-scripts`. Node ≥ 24 (wegen `node:sqlite`).

## Push

Nichts direkt auf `main`; jede Änderung über Branch und PR, gemergt wird nur vom Nutzer
([ADR-051](docs/entscheidungen/ADR-051-main-nur-ueber-pull-requests.md)). Ein Push endet erst,
wenn die CI auf allen drei Plattformen grün und ohne Anmerkung ist — Ablauf im Skill `/push`,
Begründung in [`docs/ENTWICKLUNG.md`](docs/ENTWICKLUNG.md#push). Release:
[`docs/ENTWICKLUNG.md`](docs/ENTWICKLUNG.md#release).

## Die zwölf Invarianten

Jede hat einen Test in `test/invarianten/`; begründet sind sie in den verlinkten ADRs und in
[`docs/SICHERHEIT.md`](docs/SICHERHEIT.md). **Hier wird nicht abgewogen**:

| # | Regel |
|---|---|
| INV-01 | Der Ingest ruft ausschließlich **lesende** MCP-Tools auf. |
| INV-02 | Kein Geldbetrag als Fließkommazahl. `bigint` in Cent, `parseFloat` verboten. |
| INV-03 | Ein Kalendertag ist `YYYY-MM-DD` in **Europe/Berlin**, immer über `core/kalender.ts`. |
| INV-04 | `core/` ist rein: kein I/O, keine Uhr, kein Zufall. |
| INV-05 | Kein Inline-CSS außer in `<Balken>` und `<ChartRahmen>`. |
| INV-06 | Fremdtext wird nie als HTML gerendert und nie in ein `href` gesetzt. |
| INV-07 | Der Server bindet ausschließlich an `127.0.0.1`. |
| INV-08 | Genau **zwei** mutierende Routen: `POST /api/refresh` und `POST /api/mcp-anmeldung`, beide ohne Parameter. |
| INV-09 | Jeder Import ist atomar und idempotent. |
| INV-10 | Änderst du `core/`, erhöhe `KERN_VERSION`. |
| INV-11 | Das Frontend lädt keine externe Ressource. |
| INV-12 | Jede fremde Antwort geht durch zod, bevor sie die Datenbank berührt. |

## Was hier nie hinzukommt

- **Kein handelndes MCP-Tool.** `submit_buy_order`, `submit_sell_order`, `remove_savings_plan` und
  Verwandte existieren für diese Anwendung nicht. Sie ist ein Beobachter, kein Akteur — auch dann
  nicht, wenn es gerade praktisch wäre.
- **Keine Wildcard in der Tool-Allowlist**, keine Aufweichung der Laufzeitprüfung
  `LESENDE_TOOLS.includes(tool)` in `ingest/mcp.ts`, keine weitere MCP-Gegenstelle neben dem
  fest im Code stehenden `mcp.scalable.capital`.
- **Kein CORS-Header.** Dritte schreibende Route und `0.0.0.0`: INV-07, INV-08,
  [ADR-012](docs/entscheidungen/ADR-012-anmeldeknopf-als-zweite-mutierende-route.md).
- **Kein Selbst-Update, keine Versionsprüfung.** Nur `npm run update` bzw.
  `Aktualisieren.command`/`.bat` holt Code ([ADR-013](docs/entscheidungen/ADR-013-update-nur-auf-knopfdruck.md)).
- **Keine Zugangsdaten und keine Daten im Projektordner.** Token unter `<datenverzeichnis>/mcp/`
  ([ADR-010](docs/entscheidungen/ADR-010-direkte-mcp-anmeldung-ohne-claude-code.md)), Datenbank und
  Sicherungen unter `~/Library/Application Support/scapio/` bzw. `%LOCALAPPDATA%\scapio\`, beide
  `0700`/`0600` ([ADR-005](docs/entscheidungen/ADR-005-datenbank-ausserhalb-des-projekts.md)).
- **Beide Plattformen gleich behandeln.** macOS und Windows sind Zielplattform, und alles,
  was der Nutzer anfasst, gibt es zweimal: `Start.command`/`Start.bat`,
  `Aktualisieren.command`/`Aktualisieren.bat`, `Deinstallieren.command`/`Deinstallieren.bat` — gleiche Schritte, gleiche Sätze; erlaubte
  Unterschiede im Kopf der `.bat`-Dateien. Kein Unterprozess über eine Shell, auch nicht für
  `node_modules/.bin/`: `process.execPath` plus JS-Einstieg über `start/werkzeuge.ts`.

## Sprachregel

Fachvokabular deutsch (Bestand, Kurs, Menge, Einstand, Einzahlung, Sparplan, Lauf), technisches
Vokabular englisch (Router, Query, Cache, Hook, Migration). Grenzfälle stehen in
`docs/GLOSSAR.md`. Nicht neu entscheiden — nachschlagen.

## Kurz und bündig

Antworten, Dokumentation und Kommentare kurz und bündig halten — kein unnötiger Fluff, keine
Wiederholung dessen, was aus Code oder Diff schon hervorgeht. Ein Kommentar nur, wenn er ein
WARUM erklärt, das sonst nicht offensichtlich wäre; niemals das WAS.

## Depotdaten bleiben beim Nutzer

Der Kontext einer Agentensitzung liegt bei einem Cloud-Dienst; echte Depotwerte gehören dort nicht
hin ([ADR-042](docs/entscheidungen/ADR-042-agenten-lesen-keine-depotwerte.md)). Deshalb:

- `.claude/settings.json` sperrt das Folgende per `deny` ([ADR-054](docs/entscheidungen/ADR-054-agentensperre-in-den-einstellungen.md)); die Regel gilt auch, wo die Sperre nicht greift.
- Den Scalable-MCP nicht selbst abfragen, auch nicht lesend. `npm run vertrag` ist erlaubt — es
  gibt nur Feldnamen aus.
- Keine Beträge, Mengen, Wertpapiernamen oder Rohantworten aus Datenbank, Datenverzeichnis oder
  `lauf.log` lesen. Kein `npm run ingest`, kein `npm run verify`, kein `sqlite3` auf die echte
  Datenbank. Statt `verify` gibt es `npm run verify:zaehlung` (Tag und Feld, ohne Werte).
- Wo eine Frage nur mit echten Werten zu klären ist: ein Skript schreiben, das lokal zählt oder
  prüft und nur Befundart, Code, ISIN oder Tag ausgibt — und den Nutzer fragen, ob er es laufen
  lässt. Gerechnet und getestet wird auf Fixtures und synthetischen Depots.

## Kontext sparsam halten

- Lange Diagnosen als Sub-Task oder Hintergrundlauf; Ergebnisse in Dateien, zurück nur der Befund
  (Datei, Zeile, Feld).
- Lange Ausgaben in eine Datei umleiten, nur die relevanten Zeilen lesen. Für die Prüfung:
  `npm run check:kurz` (Volltext in `.start/pruefung.log`).
- `docs/` abschnittsweise lesen: `grep -n "^#" docs/DATEI.md`, dann `sed -n 'A,Bp'`.
- Details gehören nach `docs/`, nicht in Agentendateien oder Kommentare — die werden jede
  Sitzung vollständig geladen.

## Wenn etwas nicht stimmt

[`docs/RUNBOOK.md`](docs/RUNBOOK.md); für Agenten bei Zweifeln an einer Zahl nur
`npm run verify:zaehlung`.
