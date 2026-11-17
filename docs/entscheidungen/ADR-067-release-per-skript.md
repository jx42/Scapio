# ADR-067: Release per Skript, Deploy-Token im Schlüsselbund

Nachtrag zu [ADR-047](ADR-047-release-kette-und-auslieferung.md),
[ADR-048](ADR-048-demo-als-statischer-abzug.md) und
[ADR-055](ADR-055-update-und-release-kette.md).

## Kontext

Der Release bestand aus sechs Handschritten. Bei 1.1.0 kosteten sie eine zusätzliche
PR-Runde: Die Leak-Prüfung lief erst nach dem Merge des Versions-PR und fand Fehlalarme
(#17, #19). Der Demo-Deploy wechselte die Arbeitskopie auf einen „detached HEAD“, ohne
dass die Doku den Weg zurück nannte. Konto-ID und Token mussten jedes Mal neu beschafft werden.
Der Rauchtest las die Version aus der Fußzeile, die laut ADR-046 aber nur „X.Y“ zeigt.

## Entscheidung

**Zwei Befehle und ein Merge.** `start/release.ts` führt den Ablauf aus
`docs/ENTWICKLUNG.md#release`:

- `npm run release:vorbereiten`: Die Version folgt aus den Labels seit dem letzten Tag
  (`neu` hebt die zweite Stelle, sonst die dritte; die erste nur per Argument). Erst läuft die
  Leak-Prüfung, dann entsteht der Versions-PR, und das Skript begleitet die CI. Befunde
  halten an, bevor ein PR entsteht.
- `npm run release`: Das Skript prüft, dass `main` sauber ist und gleich `origin/main`, und
  fährt die Leak-Prüfung. Nach einer Rückfrage löst es `release.yml` mit `gh workflow run` aus
  und begleitet den Lauf. Danach prüft es Prüfsumme und Attestation des geladenen ZIPs, baut
  und deployt die Demo und erwartet die neue Version in `/api/health` der Demo.
- Die Demo wird nur gebaut, wenn `HEAD` genau auf dem Tag steht. Nach `npm run release` ist
  das ohnehin so, ohne Wechsel der Arbeitskopie. `--nur-demo` wiederholt diesen Teil.
- Die Konto-ID steht in `demo-worker/wrangler.jsonc`. Sie ist kein Geheimnis (ADR-055).

**Der Deploy-Token liegt im macOS-Schlüsselbund** (`scapio-demo-deploy`). Fehlt er, fragt das
Skript verdeckt danach und legt ihn ab. Er geht über stdin an `security -i`, nie über argv,
und nur an den Kindprozess `wrangler`. Unter Windows wird er bei jedem Deploy eingegeben.
Rechte des Tokens wie in ADR-055: nur „Workers Scripts: Edit“ auf dem einen Konto.

**Nur für den Nutzer.** Die Leak-Prüfung liest die echte Datenbank. `.claude/settings.json`
sperrt `npm run release*` und `start/release.ts` für Agenten (ADR-054).

## Verworfene Alternativen

- **Token jedes Mal eingeben (bisher).** Weil der Token nicht gespeichert wird, muss er bei
  jedem Release neu erzeugt werden. Ein Token mit diesem engen Recht im Schlüsselbund ist
  weniger Risiko als ein Ablauf, den man aus Bequemlichkeit abkürzt.
- **Deploy in der CI mit dem Token als Secret.** Das widerspricht ADR-048 (kein Secret im
  Repository). Im Release liefe außerdem ein npm-Bau mit Zugriff auf ein Secret.
- **Demo in einem eigenen `git worktree`.** Das braucht einen zweiten vollen `npm ci` außerhalb
  des Projekts. Die Prüfung `HEAD == Tag` erreicht dasselbe.
- **Auto-Merge des Versions-PR.** Das schließt ADR-051 aus.

## Folgen

- Ein abgelaufener Token lässt den Deploy scheitern. Das Skript nennt dann
  `security delete-generic-password -s scapio-demo-deploy`, danach `--nur-demo`.
- PRs ohne Label nennt `release:vorbereiten` vor dem Release. Sonst landen sie in den Notizen
  unter „Sonstiges“.
- Von Hand bleiben: der Merge, ein Blick auf die Hinweise der Leak-Prüfung und der Test von
  `Aktualisieren.command`/`.bat` gegen das neue ZIP.
