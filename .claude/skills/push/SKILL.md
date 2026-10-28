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
5. **CI begleiten:** `gh pr checks <nr> --watch > .start/ci.log 2>&1; tail -15 .start/ci.log`.
   Danach `gh run view <lauf-id>` auf Annotationen prüfen — eine Deprecation-Warnung ist ein
   Befund.
6. **Rot oder Annotation:** `gh run view --job <job-id> --log-failed > .start/ci-fehler.log`,
   nur die Fehlerzeilen lesen (`grep -nE "error|FAIL|×" .start/ci-fehler.log | head -40`),
   beheben, lokal `check:kurz`, neuer Commit auf denselben Branch, weiter bei 5.
7. **Melden:** PR-Nummer, Nummer des grünen Laufs, was offen bleibt und warum.
