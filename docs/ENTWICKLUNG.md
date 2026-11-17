# Entwicklung

Für alle, die an Scapio mitarbeiten oder es über die Kommandozeile betreiben wollen. Installation und Bedienung für Nutzer stehen in der [README](../README.md).

## Voraussetzungen

- **macOS oder Windows.** Beides ist Zielplattform, beides läuft in der CI. Linux ist nicht vorgesehen, funktioniert aber bis auf den Browser-Öffner (dort gibt das Programm die Adresse zum Kopieren aus).
- **Node.js ≥ 24**, wegen `node:sqlite` ([ADR-002](entscheidungen/ADR-002-node-sqlite-statt-better-sqlite3.md)). Die Hauptversion steht in [`.nvmrc`](../.nvmrc).
- **Git**, für `git clone`, `npm run update` und eigene Commits.
- **Ein Scalable-Capital-Depot.** Die Anmeldung läuft per OAuth/PKCE direkt am Scalable-MCP-Server, Claude Code wird dafür nicht gebraucht ([ADR-010](entscheidungen/ADR-010-direkte-mcp-anmeldung-ohne-claude-code.md)).

## Start über die Kommandozeile

```sh
npm ci --ignore-scripts
npm run mcp-login                                # einmalig: Bank-Login im Browser
npm start
```

`npm ci --ignore-scripts` ist Absicht: Die einzige potenziell native Abhängigkeit (SQLite) kommt aus Node selbst, kein Paket hier braucht ein Install-Skript. Entwicklung mit Neuladen: `npm run dev`.

`npm start` baut die Oberfläche nur, wenn `dist/` älter ist als eine der Quellen, und macht keinen Typecheck. Der gehört in `npm run check` und in die CI, wo er auch etwas findet; auf dem Rechner eines Benutzers, der keinen Code angefasst hat, kostet er nur Zeit bis zur ersten Zahl.

`npm run audit` läuft bewusst **nicht** in `npm run check`: `check` muss ohne Netz grün werden können, und ein neu veröffentlichter Fund in einer Abhängigkeit sagt nichts über den gerade geänderten Code. In der CI ist es ein eigener Job. Es prüft auch das Lockfile von `demo-worker/` (wrangler), ohne es zu installieren.

## Befehle

Ordner und die zwölf Invarianten stehen in [AGENTS.md](../AGENTS.md), die Begründung der
Schichtentrennung in [ARCHITEKTUR.md](ARCHITEKTUR.md). „Nicht für Agenten“ sperrt
`.claude/settings.json` zusätzlich ([ADR-054](entscheidungen/ADR-054-agentensperre-in-den-einstellungen.md)).

```sh
npm start              # bauen (nur wenn nötig), servieren, Browser öffnen — der normale Weg; nicht für Agenten
npm run build          # typecheck + Vite-Bau nach dist/, ohne zu starten
npm run update         # neue Version per git holen, alten Bau wegräumen — nur auf Knopfdruck
npm run deinstallieren # Datenverzeichnis löschen, nach Rückfrage — Projektordner bleibt (ADR-049)
npm run dev            # Entwicklung mit Neuladen, echte Datenbank — nicht für Agenten
npm run demo           # Oberfläche mit erfundenen Daten, ohne echtes Depot — mit Neuladen
npm run demo:export    # dieselbe Demo als statischer Abzug nach .demo-export/, für demo-worker/
npm run edgecases      # alle Fehlermeldungen und Randfälle der Oberfläche auf einer Seite
npm run pr-bild -- <nr> <id>… # Kacheln der laufenden Demo fotografieren, für den Skill /push (ADR-042)
npm run mcp-login      # einmalige, interaktive OAuth/PKCE-Anmeldung am Scalable-MCP
npm run check          # typecheck + lint + tests mit Abdeckungsschwellen (die Invarianten laufen darin mit) — muss vor jeder Übergabe grün sein
npm run check:kurz     # dieselbe Prüfung, aber still: drei Zeilen statt tausend, Volltext im Log
npm run check:geaendert # tsc ganz, eslint und vitest für Geändertes gegenüber origin/main, dazu Invarianten und Tests aus der Pfadtabelle in start/pruefung.ts — für Zwischenschritte
npm run test:tz        # dieselbe Suite unter drei Zeitzonen
npm run test:invarianten # nur die zwölf Invariantentests, dazu der Kontrasttest der Farb-Tokens
npm run test:e2e       # der eine Playwright-Durchstich, echter Chromium; belegt 4790 und 4793 (Randfälle)
npm run test:abdeckung # alle Tests mit Abdeckung je Ordner, der Testschritt von check; je Datei: -- --coverage.reporter=text
npm run verify         # Historie komplett neu rechnen und mit der gespeicherten vergleichen — mit Beträgen, nicht für Agenten
npm run verify:zaehlung # dasselbe, aber nur Tag und Feld — der Weg für Agenten
npm run ingest         # Ingest einmalig, für die Fehlersuche — nicht für Agenten
npm run vertrag        # zod-Schemata des Ingest gegen den echten MCP prüfen (ruft die Bank, nur lesend)
npm run kontrast       # Kontrasttabelle in docs/BARRIEREFREIHEIT.md aus theme.css neu schreiben
npm run shadcn:abgleich # abweichende Zeilen je ui/-Baustein gegen new-york-v4 (ADR-024) — geht ins Netz, nur auf Aufruf
npm run abdruck        # Hash über core/ neu schreiben, nach einer KERN_VERSION-Erhöhung
npm run kern:version   # KERN_VERSION einmal je Branch gegenüber origin/main erhöhen und den Abdruck schreiben — beliebig oft aufrufbar
npm run backup         # Sicherung der Datenbank
npm run leak-pruefung  # Depotwerte, Token, Pfade im Repository suchen — vor jedem Release, nur der Nutzer
npm run release:vorbereiten # Leak-Prüfung, Versions-PR, CI begleiten — nur der Nutzer (ADR-067)
npm run release        # Leak-Prüfung, Release auslösen, ZIP prüfen, Demo deployen; -- --nur-demo — nur der Nutzer
npm run audit          # Schwachstellen in den Laufzeitabhängigkeiten und in demo-worker/ — nicht Teil von check, aber Pflicht vor jedem Push
```

`npm run demo` und der Ende-zu-Ende-Test zeigen modellierte Tageskurse aus `test/e2e/kurshistorie-modelliert.json`, keine echten Börsenkurse. Wie sie entstehen, steht in der Datei selbst, wozu sie dienen, im Dateikopf von `test/e2e/daten.ts`.

## Automatische Prüfung

`.github/workflows/pruefung.yml` fährt bei jedem Push und Pull Request `npm run check` auf macOS, Linux und Windows, dazu als eigene Jobs `npm run audit` und `npm run test:tz` unter Linux mit nur den beiden fremden Zonen ([ADR-050](entscheidungen/ADR-050-zeitzonen-in-der-ci-nur-unter-linux.md)). Windows ist dabei, weil das Projekt Pfade, Dateirechte und Unterprozesse anfasst – genau dort sitzen die Unterschiede, die auf dem Rechner des Autors unsichtbar bleiben.

Zwei Schwellen stehen in `vite.config.ts` und greifen in `check`, lokal wie in der CI:

- **Abdeckung je Ordner** (`ABDECKUNG`): Anweisungen, Zweige, Funktionen, Zeilen, knapp unter dem Ist — eine Ratsche. Steigt das Ist, die Zahl im selben PR nachziehen; gesenkt wird nur bewusst, mit Grund in der Commit-Nachricht. Bei `shared/` und `start/` zwei Punkte Luft statt einem, weil dort die Plattformzweige liegen. `check:geaendert` misst nicht — ein Teillauf läge immer darunter. Ein neuer Quellordner braucht einen Eintrag, sonst wird `test/pruefschwellen.test.ts` rot.
- **Bundle-Budget** (`BUNDLE_KB`, 1200 kB je JS-Chunk): statt Code-Splitting, denn die Oberfläche wird lokal ausgeliefert und rendert alle Kacheln sofort. Vite warnt erst darüber; `test/pruefschwellen.test.ts` prüft `dist/`, wenn es gebaut ist — in der CI immer.

`npm run test:tz` setzt `TZ=…` deshalb nicht als POSIX-Präfix (das kennt die Windows-Kommandozeile nicht), sondern als Umgebung des Kindprozesses in `start/zeitzonen.ts`. Das Paket `cross-env` wäre die Alternative gewesen; drei Zeilen eigener Code sind hier billiger. Ohne Argumente laufen alle drei Zonen, mit Argumenten nur die genannten.

## Push

Auf `main` kommt nichts direkt: Das Ruleset verlangt einen Pull Request mit fünf grünen Checks und
kennt keinen Bypass, auch nicht für den Inhaber
([ADR-051](entscheidungen/ADR-051-main-nur-ueber-pull-requests.md)). Ein Push ist eine Übergabe und
endet nicht mit `git push`, sondern erst, wenn die Prüfung des PR auf allen drei Plattformen grün
ist. Der Ablauf wird ohne Rückfrage durchlaufen:

1. **Vorher lokal:** `npm run check` und `npm run test:tz`.
2. **Vorher `npm run audit`.** Meldet es etwas, `npm audit fix --omit=dev --ignore-scripts`,
   danach `npm ci --ignore-scripts` (der Fix räumt die devDependencies aus `node_modules`) und
   `npm run check` erneut — die Abhängigkeiten haben sich geändert. Hilft nur `npm audit fix --force`, wird es
   nicht erzwungen: das ist ein Breaking Change in einer Abhängigkeit, also melden und auf
   Ansage warten. Gibt es keinen Fix, ist eine befristete Ausnahme in `start/audit.ts` möglich
   ([ADR-068](entscheidungen/ADR-068-audit-mit-befristeten-ausnahmen.md)). Ein Fund in `demo-worker/` heißt: `wrangler` in `demo-worker/package.json`
   heben ([ADR-055](entscheidungen/ADR-055-update-und-release-kette.md)).
3. **Branch und PR:** `git switch -c <thema>`, committen, `git push -u origin <thema>`,
   `gh pr create` mit Warum-Zeile und Label (`neu`, `korrektur`, `intern` oder `ohne-notiz`,
   siehe [Release](#release)). Weitere Korrekturen kommen als neue Commits auf denselben Branch.
4. **Danach den Lauf prüfen**, mit `gh` und ohne den Nutzer zu fragen: `gh pr checks <nr> --watch`,
   dann `gh run view <lauf-id>`. Nicht nur der Ausgang zählt, auch die Annotationen — eine
   Deprecation-Warnung an einer Action ist ein Befund, kein Rauschen.
5. **Rot oder angemerkt?** Ursache im Log suchen (`gh run view --job <job-id> --log-failed`,
   Ausgabe immer in eine Datei umleiten und nur die Fehlerzeilen lesen — ein CI-Log ungefiltert
   in den Kontext zu holen ist nie richtig), beheben, lokal `check`, erneut pushen — von vorn,
   bis alles grün und ohne Anmerkung ist.
6. **Erst dann melden**, mit PR-Nummer und Nummer des grünen Laufs. Bleibt etwas offen, sagt die
   Meldung was und warum.
7. **Mergen tut der Nutzer**, per Squash. Ein Agent merged nicht und schaltet kein Auto-Merge ein:
   Der Merge ist die eine Stelle, an der ein Mensch den Diff sieht, bevor er auf `main` landet.

Der Nutzer soll vor dem Merge nicht selbst nachsehen müssen, ob die CI etwas anzumerken hat.
Ein PR, der rot endet und unkommentiert liegen bleibt, ist keine erledigte Aufgabe.

## Release

Ein Release ist ein Tag auf einem geprüften Stand von `main`, mit `Scapio.zip` als Anhang
([ADR-047](entscheidungen/ADR-047-release-kette-und-auslieferung.md)). Ablauf in
`start/release.ts` ([ADR-067](entscheidungen/ADR-067-release-per-skript.md)), nur vom Nutzer:

1. **`npm run release:vorbereiten`** auf einem sauberen `main`. Das Skript schlägt die Version
   aus den Labels seit dem letzten Tag vor: `neu` hebt die zweite Stelle, sonst die dritte.
   Eine andere Version gibt man mit `-- X.Y.Z` an. Dann fährt es die Leak-Prüfung
   ([ADR-042](entscheidungen/ADR-042-agenten-lesen-keine-depotwerte.md)), öffnet den Versions-PR
   und begleitet die CI. Befunde der Leak-Prüfung halten an, bevor ein PR entsteht. Hinweise
   (runde Beträge, Depot-ISINs) ansehen: Eine Benchmark-ISIN ist kein Leak, ein Satz seltener
   ISINs zusammen schon. PRs ohne Label werden genannt; vor dem Release nachtragen.
2. **Mergen** (Squash), dann `git pull --ff-only`.
3. **`npm run release`** auf `main`. Nach Leak-Prüfung und Rückfrage folgen Workflow, ZIP mit
   Prüfsumme und Attestation (nur bei öffentlichem Repository), dann der Demo-Deploy
   ([ADR-048](entscheidungen/ADR-048-demo-als-statischer-abzug.md)). Am Ende muss
   `/api/health` der Demo die neue Version melden. Den Cloudflare-Token (nur „Workers
   Scripts: Edit“ auf dem einen Konto) fragt das Skript beim ersten Mal ab und legt ihn im
   macOS-Schlüsselbund ab, unter Windows bei jedem Deploy.
4. **Von Hand:** `Aktualisieren.command`/`.bat` holt das neue ZIP.

Scheitert nur der Deploy: `git switch --detach vX.Y.Z`, dann `npm run release -- --nur-demo`.
Der Token ist abgelaufen? `security delete-generic-password -s scapio-demo-deploy`.
`wrangler` kommt aus dem Lockfile in `demo-worker/`; gehoben wird es dort, mit `npm audit`
([ADR-055](entscheidungen/ADR-055-update-und-release-kette.md)).

## Weiterführende Dokumentation

- [ARCHITEKTUR.md](ARCHITEKTUR.md) — Datenfluss, Schichten, Sicherheitsarchitektur, Farben
- [DATENMODELL.md](DATENMODELL.md) — jede Tabelle, jedes Feld, mit Beispiel
- [GLOSSAR.md](GLOSSAR.md) — deutsches Fachvokabular, englisches Technikvokabular, Grenzfälle
- [SICHERHEIT.md](SICHERHEIT.md) — Bedrohungsmodell, Befundtabelle, Übergabeprüfliste
- [RUNBOOK.md](RUNBOOK.md) — was tun, wenn etwas nicht stimmt; erster Griff bei Zweifeln an einer Zahl ist `npm run verify`
- [entscheidungen/](entscheidungen/) — Architekturentscheidungen und ihre Gründe
- [CONTRIBUTING.md](../.github/CONTRIBUTING.md) — wie ein Beitrag aussieht
- [SECURITY.md](../.github/SECURITY.md) — Sicherheitsfunde melden
