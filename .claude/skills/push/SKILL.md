---
name: push
description: Änderungen dieses Repos übergeben — prüfen, Branch pushen, PR öffnen, CI bis grün begleiten, mit PR-Nummer melden. Nutzen, wenn der Nutzer „push“, „PR“, „übergeben“ oder „hochladen“ sagt.
---

# Push

Ablauf ohne Rückfrage. Begründung: `docs/ENTWICKLUNG.md#push`, ADR-051. Mergen tut der Nutzer —
nie mergen, nie Auto-Merge.

1. **Lokal prüfen**, jede Ausgabe knapp halten:
   - `npm run check:kurz`
   - `npm run test:tz > .start/tz.log 2>&1; tail -5 .start/tz.log`
   - `npm run audit`. Fund → `npm audit fix --omit=dev --ignore-scripts`, dann
     `npm ci --ignore-scripts` und `npm run check:kurz`. Hilft nur `--force`: **nicht** ausführen,
     melden und warten.
   Rot → beheben, von vorn.
2. **Branch:** auf `main` → `git switch -c <thema>`. Sonst den aktuellen Branch nehmen.
3. **Commit:** nur die Dateien der Aufgabe stagen (`git add <pfade>`, kein `-A`). Nachricht
   deutsch, erste Zeile im Stil von `git log --oneline -5`.
4. **Push und PR:** `git push -u origin <branch>`, dann
   `gh pr create --title "…" --body "…" --label <neu|korrektur|intern|ohne-notiz>`. Body: eine
   Warum-Zeile, dann Stichpunkte. Label nach `docs/ENTWICKLUNG.md#release`. Existiert der PR
   schon, nur pushen.
5. **Bildschirmfoto**, nur wenn `git diff --name-only origin/main...HEAD -- src/` etwas nennt.
   Ausschließlich aus der Demo — das Repository ist öffentlich, ein echtes Depot gehört nie
   ins Bild (ADR-042).
   - Demo: Ist Port 4791 belegt, die laufende nehmen. Sonst `npm run demo` im Hintergrund
     starten, bis `curl -s -o /dev/null http://127.0.0.1:4791/` antwortet, danach beenden.
   - Je geänderte Kachel ein Bild, `<id>` aus dem `id` ihres `<Kachel>`:
     ```sh
     node --input-type=module -e "
     import { chromium } from 'playwright';
     const b = await chromium.launch();
     const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
     await p.goto('http://127.0.0.1:4791/');
     const k = p.locator('#<id>'); await k.waitFor(); await p.waitForTimeout(1500);
     await k.screenshot({ path: '.start/pr-<nr>-<id>.png' });
     await b.close();"
     ```
     Das Bild ansehen (Read), bevor es hochgeht.
   - Hochladen als eigener Commit auf den Branch `pr-bilder`, nie auf den PR-Branch. Der
     Commit enthält nur das neue Bild, eingebunden wird es über seinen Hash — so bleibt der
     Branch klein und `pruefung.yml` läuft dort nicht:
     ```sh
     alt=$(git ls-remote origin refs/heads/pr-bilder | cut -f1)
     [ -n "$alt" ] && git fetch -q origin pr-bilder
     blob=$(git hash-object -w .start/pr-<nr>-<id>.png)
     baum=$(printf '100644 blob %s\tpr-<nr>-<id>.png\n' "$blob" | git mktree)
     commit=$(git commit-tree "$baum" ${alt:+-p "$alt"} -m "Bild zu PR #<nr>")
     git push -q origin "$commit:refs/heads/pr-bilder"
     gh pr comment <nr> --body "![<Kachel>](https://raw.githubusercontent.com/jx42/Scapio/$commit/pr-<nr>-<id>.png)"
     ```
6. **CI begleiten:** `gh pr checks <nr> --watch > .start/ci.log 2>&1; tail -15 .start/ci.log`.
   Danach `gh run view <lauf-id>` auf Annotationen prüfen — eine Deprecation-Warnung ist ein
   Befund. Hinweise von GitHub selbst (Runner-Kapazität, Warteschlange) sind keiner und werden
   nicht gemeldet.
7. **Rot oder Annotation:** `gh run view --job <job-id> --log-failed > .start/ci-fehler.log`,
   nur die Fehlerzeilen lesen (`grep -nE "error|FAIL|×" .start/ci-fehler.log | head -40`),
   beheben, lokal `check:kurz`, neuer Commit auf denselben Branch, weiter bei 6.
8. **Melden:** PR-Nummer, Nummer des grünen Laufs, was offen bleibt und warum; das Bildschirmfoto, falls eines hochging.
