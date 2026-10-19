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
| `src/` | React-Oberfläche, sechs Kacheln auf einer Seite | `src/CLAUDE.md` |
| `test/` | vitest, Fixtures, Invariantentests | — |
| `docs/` | Architektur, Datenmodell, Entwicklung, Glossar, Runbook, Sicherheit, ADRs | — |
| `start/` | Einstiegspunkte hinter den `npm run`-Befehlen unten, plus `werkzeuge.ts` für Unterprozesse ohne Shell | — |
| `shared/` | Module ohne eigene Schicht, siehe unten | — |
| `demo-worker/` | Cloudflare-Worker der öffentlichen Demo, liest nur den Abzug ([ADR-048](docs/entscheidungen/ADR-048-demo-als-statischer-abzug.md)) | — |

`shared/` hält, was mehrere Schichten brauchen und keiner gehört
([ADR-040](docs/entscheidungen/ADR-040-aufgeraeumte-projektwurzel.md)): `konfiguration.ts` (Datenverzeichnis, Ports), `hosts.ts`
(Host-Allowlist), `zeitfenster.ts` (Zeitraum- und Fensterlisten), `benchmarks.ts`
(Vergleichs-ETFs), `browser.ts` (Browser öffnen
unter macOS/Windows), `geistFont.ts` (Schriftpfad fürs Ausliefern und fürs Bauen),
`statusseite.ts` (Hülle der Bau- und der Anmeldeseite außerhalb von Vite),
`hinweise.ts` (Arten der Lauf-Hinweise; den Satz baut die Oberfläche),
`laufFehler.ts` (Fehlercodes eines Laufs, je einer im Runbook),
`dateirechte.ts` (0700/0600, Eigentümer- und Symlinkprüfung, atomares Schreiben, [ADR-056](docs/entscheidungen/ADR-056-datenverzeichnis-und-dateirechte-aus-einer-hand.md)),
`demoAbzug.ts` (Anfragen und Dateipfade des Demo-Abzugs, [ADR-048](docs/entscheidungen/ADR-048-demo-als-statischer-abzug.md)).
`server/vertrag.ts` ist die eine Typquelle für den API-Vertrag — Server und Oberfläche importieren von dort.

Eine neue Kennzahl, ein neues Antwortfeld, eine neue Spalte: welche Dateien in welcher Reihenfolge,
steht in [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md#wo-etwas-angeschlossen-wird).

Datenfluss: **MCP → Ingest (validiert) → SQLite → Rechenkern → API → Oberfläche.** In keiner anderen
Richtung. Die Oberfläche rechnet nicht, der Server rechnet nicht, der Rechenkern liest nichts.

## Befehle

```sh
npm start              # bauen (nur wenn nötig), servieren, Browser öffnen — der normale Weg; nicht für Agenten
npm run build          # typecheck + Vite-Bau nach dist/, ohne zu starten
npm run update         # neue Version per git holen, alten Bau wegräumen — nur auf Knopfdruck
npm run deinstallieren # Datenverzeichnis löschen, nach Rückfrage — Projektordner bleibt (ADR-049)
npm run dev            # Entwicklung mit Neuladen
npm run demo           # Oberfläche mit erfundenen Daten, ohne echtes Depot — mit Neuladen
npm run demo:export    # dieselbe Demo als statischer Abzug nach .demo-export/, für demo-worker/
npm run edgecases      # alle Fehlermeldungen und Randfälle der Oberfläche auf einer Seite
npm run mcp-login      # einmalige, interaktive OAuth/PKCE-Anmeldung am Scalable-MCP
npm run check          # typecheck + lint + tests (die Invarianten laufen darin mit) — muss vor jeder Übergabe grün sein
npm run check:kurz     # dieselbe Prüfung, aber still: drei Zeilen statt tausend, Volltext im Log
npm run test:tz        # dieselbe Suite unter drei Zeitzonen
npm run test:invarianten # nur die zwölf Invariantentests, dazu der Kontrasttest der Farb-Tokens
npm run test:e2e       # der eine Playwright-Durchstich, echter Chromium
npm run test:abdeckung # Testabdeckung, nicht Teil von check
npm run verify         # Historie komplett neu rechnen und mit der gespeicherten vergleichen — mit Beträgen, nicht für Agenten
npm run verify:zaehlung # dasselbe, aber nur Tag und Feld — der Weg für Agenten
npm run ingest         # Ingest einmalig, für die Fehlersuche — nicht für Agenten
npm run vertrag        # zod-Schemata des Ingest gegen den echten MCP prüfen (ruft die Bank, nur lesend)
npm run kontrast       # Kontrasttabelle in docs/BARRIEREFREIHEIT.md aus theme.css neu schreiben
npm run abdruck        # Hash über core/ neu schreiben, nach einer KERN_VERSION-Erhöhung
npm run backup         # Sicherung der Datenbank
npm run leak-pruefung  # Depotwerte, Token, Pfade im Repository suchen — vor jedem Release, nur der Nutzer
npm run audit          # Schwachstellen in den Laufzeitabhängigkeiten — nicht Teil von check, aber Pflicht vor jedem Push
```

Installation immer `npm ci --ignore-scripts`. Node ≥ 24 (wegen `node:sqlite`).
`.github/workflows/pruefung.yml` fährt `check` auf macOS, Linux und Windows, `test:tz` (ohne UTC)
und `audit` als eigene Jobs unter Linux ([ADR-050](docs/entscheidungen/ADR-050-zeitzonen-in-der-ci-nur-unter-linux.md)).

## Push

Auf `main` kommt nichts direkt, auch nicht vom Inhaber: jede Änderung geht über einen Branch und
einen Pull Request, gemergt wird nur von Hand ([ADR-051](docs/entscheidungen/ADR-051-main-nur-ueber-pull-requests.md)).
Ein Push ist eine Übergabe und endet erst, wenn die Prüfung des PR auf allen drei Plattformen grün ist
und die CI keine Anmerkung hat. Der Ablauf wird ohne Rückfrage durchlaufen: vorher `npm run check`,
`npm run test:tz` und `npm run audit`, dann Branch pushen und PR öffnen, den Lauf mit `gh` prüfen und
bei Rot beheben bis grün, dann mit der PR-Nummer melden. Mergen tut der Nutzer. `npm audit fix --force` wird nie erzwungen, sondern gemeldet. Der Ablauf im Einzelnen: [`docs/ENTWICKLUNG.md`](docs/ENTWICKLUNG.md#push).
Ein Release folgt [`docs/ENTWICKLUNG.md`](docs/ENTWICKLUNG.md#release), einschließlich Deploy der Demo.

## Die zwölf Invarianten

Jede hat einen Test in `test/invarianten/`; begründet sind sie in den verlinkten ADRs und in
[`docs/SICHERHEIT.md`](docs/SICHERHEIT.md). **Hier wird nicht abgewogen**:

| # | Regel |
|---|---|
| INV-01 | Der Ingest ruft ausschließlich **lesende** MCP-Tools auf. |
| INV-02 | Kein Geldbetrag als Fließkommazahl. `bigint` in Cent, `parseFloat` verboten. |
| INV-03 | Ein Kalendertag ist `YYYY-MM-DD` in **Europe/Berlin**, immer über `core/kalender.ts`. |
| INV-04 | `core/` ist rein: kein I/O, keine Uhr, kein Zufall. |
| INV-05 | Kein Inline-CSS außer in `<Balken>`, `<ChartRahmen>` und `<Kachel>`. |
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
- **Kein CORS-Header**, keine dritte schreibende Route, keine Bindung an `0.0.0.0`. Die zweite
  ist in [ADR-012](docs/entscheidungen/ADR-012-anmeldeknopf-als-zweite-mutierende-route.md)
  begründet; damit ist die Liste geschlossen.
- **Kein Selbst-Update und keine Versionsprüfung.** Aktualisiert wird nur, wenn jemand
  `npm run update` oder `Aktualisieren.command`/`Aktualisieren.bat` auslöst
  ([ADR-013](docs/entscheidungen/ADR-013-update-nur-auf-knopfdruck.md)). Der Start holt keinen
  Code und fragt keine Gegenstelle, ob es die Anwendung neuer gibt.
- **Keine externe Ressource im Frontend** — keine CDN-Schrift, kein Analytics, kein Icon von fremder
  Adresse.
- **Keine Zugangsdaten im Repository.** Der Ingest meldet sich selbst per OAuth/PKCE am
  Scalable-MCP an ([ADR-010](docs/entscheidungen/ADR-010-direkte-mcp-anmeldung-ohne-claude-code.md)) —
  Token liegen unter `<datenverzeichnis>/mcp/`, außerhalb von Git und iCloud, mit denselben
  Dateirechten (`0700`/`0600`) wie die Datenbank.
- **Keine Daten im Projektordner.** Datenbank und Sicherungen liegen unter
  `~/Library/Application Support/scapio/` bzw. `%LOCALAPPDATA%\scapio\`
  ([ADR-005](docs/entscheidungen/ADR-005-datenbank-ausserhalb-des-projekts.md)).
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
