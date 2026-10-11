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

`npm run audit` läuft bewusst **nicht** in `npm run check`: `check` muss ohne Netz grün werden können, und ein neu veröffentlichter Fund in einer Abhängigkeit sagt nichts über den gerade geänderten Code. In der CI ist es ein eigener Job.

## Befehle und Aufbau

Die vollständige Befehlsliste, die Ordner und die zwölf Invarianten stehen in
[AGENTS.md](../AGENTS.md); die Begründung der Schichtentrennung in [ARCHITEKTUR.md](ARCHITEKTUR.md).

`npm run demo` und der Ende-zu-Ende-Test zeigen modellierte Tageskurse aus `test/e2e/kurshistorie-modelliert.json`, keine echten Börsenkurse. Wie sie entstehen, steht in der Datei selbst, wozu sie dienen, im Dateikopf von `test/e2e/daten.ts`.

## Automatische Prüfung

`.github/workflows/pruefung.yml` fährt bei jedem Push und Pull Request `npm run check` auf macOS, Linux und Windows, dazu als eigene Jobs `npm run audit` und `npm run test:tz` unter Linux mit nur den beiden fremden Zonen ([ADR-050](entscheidungen/ADR-050-zeitzonen-in-der-ci-nur-unter-linux.md)). Windows ist dabei, weil das Projekt Pfade, Dateirechte und Unterprozesse anfasst – genau dort sitzen die Unterschiede, die auf dem Rechner des Autors unsichtbar bleiben.

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
   Ansage warten.
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
([ADR-047](entscheidungen/ADR-047-release-kette-und-auslieferung.md)).

1. **Version per PR:** `npm version X.Y.Z --no-git-tag-version`, mergen, sobald die CI grün ist.
   SemVer: Korrekturen erhöhen die dritte Stelle, Neues die zweite.
2. **Auslösen:** Actions → Release → Run workflow auf `main`. Der Lauf bricht ab, wenn
   `vX.Y.Z` schon existiert.
3. **Release-Seite prüfen:** `Scapio.zip`, `SHA256SUMS` und Attestation sind da (die
   Attestation nur bei öffentlichem Repository), die Notizen nach Labels gegliedert (`neu`, `korrektur`, `intern`; `ohne-notiz` fällt heraus).
4. **Rauchtest:** README-Link „ZIP herunterladen“ lädt die neue Version,
   `gh attestation verify Scapio.zip --repo jx42/Scapio` ist grün, die Fußzeile zeigt die
   Version (ADR-046), `Aktualisieren.command`/`.bat` öffnen das neue ZIP.
5. **Demo deployen** ([ADR-048](entscheidungen/ADR-048-demo-als-statischer-abzug.md)), von Hand
   auf dem getaggten Stand:

   ```sh
   git switch --detach vX.Y.Z
   npm ci --ignore-scripts && npm run demo:export
   cd demo-worker && npx wrangler@4.147.0 deploy
   ```

   Einmalig vorher `npx wrangler@4.147.0 login`. Danach die Demo öffnen: Fußzeile zeigt `vX.Y.Z`.

## Weiterführende Dokumentation

- [ARCHITEKTUR.md](ARCHITEKTUR.md) — Datenfluss, Schichten, Sicherheitsarchitektur, Farben
- [DATENMODELL.md](DATENMODELL.md) — jede Tabelle, jedes Feld, mit Beispiel
- [GLOSSAR.md](GLOSSAR.md) — deutsches Fachvokabular, englisches Technikvokabular, Grenzfälle
- [SICHERHEIT.md](SICHERHEIT.md) — Bedrohungsmodell, Befundtabelle, Übergabeprüfliste
- [RUNBOOK.md](RUNBOOK.md) — was tun, wenn etwas nicht stimmt; erster Griff bei Zweifeln an einer Zahl ist `npm run verify`
- [entscheidungen/](entscheidungen/) — Architekturentscheidungen und ihre Gründe
- [CONTRIBUTING.md](../.github/CONTRIBUTING.md) — wie ein Beitrag aussieht
- [SECURITY.md](../.github/SECURITY.md) — Sicherheitsfunde melden
