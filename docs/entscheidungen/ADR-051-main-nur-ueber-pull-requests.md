# ADR-051: `main` nur über Pull Requests, ohne Bypass

## Kontext

Das Ruleset für `main` verlangte schon einen PR und die fünf Checks aus `pruefung.yml`, gab der
Rolle „Repository admin“ aber einen Bypass `always`. Der dokumentierte Ablauf nutzte ihn: Push
direkt auf `main`, die Prüfung lief danach.

- Mit dem Admin-Recht pusht nicht nur der Inhaber, sondern alles, was mit seinen Zugangsdaten
  läuft — auch ein Agent, der „ohne Rückfrage“ pushen soll. Ein Fehler oder ein untergeschobener
  Befehl landete ungeprüft auf `main`.
- Ein Git-Klon holt per `npm run update` den Stand von `main`. Ein roter Zwischenstand erreichte
  ihn, bevor die CI ihn gesehen hatte.
- Das Ruleset für `v*`-Tags hatte denselben Bypass. Seit Immutable Releases eingeschaltet sind,
  braucht ihn niemand mehr.

## Entscheidung

- Beide Rulesets ohne Bypass. Auf `main` kommt nur ein PR, dessen fünf Checks grün sind;
  Force-Push und Löschen sind für alle gesperrt.
- Ein Agent pushed einen Branch, öffnet den PR und treibt ihn bis grün. Mergen tut der Nutzer, per
  Squash. Kein Auto-Merge.
- Eine Freigabe durch einen zweiten Menschen wird nicht verlangt (`required_approving_review_count:
  0`), weil es keinen gibt. Der Merge von Hand ist die Durchsicht.

## Folgen

- Jede Änderung, auch ein Tippfehler, braucht einen PR und rund drei Minuten CI.
- Ein Notfall-Fix geht nicht schneller als die Prüfung. Wer das Ruleset ändern will, muss es in den
  Einstellungen tun — sichtbar und bewusst, nicht nebenbei beim Push.
- Dependabot-PRs laufen durch dieselbe Tür.
