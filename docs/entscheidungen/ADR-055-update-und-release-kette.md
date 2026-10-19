# ADR-055: Update- und Release-Kette geschlossen

Nachtrag zu [ADR-013](ADR-013-update-nur-auf-knopfdruck.md),
[ADR-047](ADR-047-release-kette-und-auslieferung.md),
[ADR-048](ADR-048-demo-als-statischer-abzug.md) und
[ADR-051](ADR-051-main-nur-ueber-pull-requests.md); Befund aus dem Audit vom 2026-10-17.

## Kontext

Die Kette vom Merge bis zum Rechner des Nutzers hatte Lücken, die einzeln klein sind, zusammen
aber fremden Code ausführen können:

- `npm run update` zog per `git pull --ff-only` vom Upstream des ausgecheckten Branches, über
  jede URL. Danach führt `Start.*` `npm ci` und Vite aus.
- Das Ruleset für `main` verlangte keinen aktuellen Stand vor dem Merge; der Squash-Commit war
  als Ganzes nie geprüft und erreichte Git-Nutzer sofort.
- Das Ruleset `Release-Tags` sperrte Ändern und Löschen, nicht das Anlegen.
- Die Pflicht-Checks hießen nach wandernden Images (`macos-latest`, `windows-latest`).
- ZIP-Nutzer installierten alle Dev-Pakete, die `npm run audit` nicht prüft.
- Der Demo-Deploy nutzte `wrangler login`, einen kontoweiten OAuth-Token, der dauerhaft auf dem
  Rechner liegt, und `npx wrangler@…` ohne Lockfile für die transitiven Pakete.
- Die Demo verteilte Pakete unter MIT, ISC und OFL ohne deren Lizenztexte.

## Entscheidung

- **Update nur von der eigenen Gegenstelle.** `start/update.ts` prüft vor dem Pull, dass `origin`
  auf `github.com/jx42/Scapio` zeigt (HTTPS oder SSH) und `main` ausgecheckt ist, und zieht dann
  `git pull --ff-only origin main`. Sonst bricht es ab, ohne etwas zu ändern (RUNBOOK „Update
  verweigert“).
- **ZIP-Installationen ohne Dev-Pakete.** `Start.*` installiert ohne `.git` mit `--omit=dev`;
  der Modus steht in der Hash-Marke, ein Wechsel installiert neu. Vite, Tailwind und die
  Plugins sind Laufzeitabhängigkeiten (ADR-047), der Bau läuft also ohne Dev-Pakete — geprüft
  per `git archive` und `npm ci --omit=dev`.
- **Rulesets.** `main` verlangt einen aktuellen Stand (`strict_required_status_checks_policy`).
  `Release-Tags` sperrt weiter nur Ändern und Löschen, nicht `creation`: Unter einem persönlichen
  Konto nimmt GitHub die Actions-Integration nicht als Bypass an (HTTP 422), und der
  Release-Workflow legt den Tag mit `github.token` an. Ein PAT als Secret wäre eine weitere
  Zugangsdate; Tags anlegen kann ohnehin nur, wer Schreibrecht hat.
- **Feste Images, stabile Namen.** Die Matrix nennt `macos-15`, `ubuntu-24.04`, `windows-2025`;
  der Jobname ist `check (macos|linux|windows)`. Ein Image-Wechsel ist ein Commit, kein
  Ruleset-Eingriff.
- **Download prüfen.** Die README erklärt `SHA256SUMS` und `gh attestation verify`. Die
  Attestation belegt die Herkunft; bytegleich nachbauen lässt sich das ZIP nicht.
- **Demo.** `demo-worker/` hat ein eigenes `package.json` mit fest gepinntem `wrangler` und
  Lockfile. Angemeldet wird per API-Token mit nur „Workers Scripts: Edit“, gesetzt für eine
  Shell. Der Bau schreibt `assets/drittlizenzen.txt` (`shared/drittlizenzen.ts`) aus den Modulen,
  die Rollup eingebunden hat, plus der Schrift; der Footer verlinkt die Datei, in der Demo wie lokal.
- **Voller Audit zur Kenntnis.** `pruefung.yml` führt nach dem Pflicht-Audit ein volles
  `npm audit` aus, das nicht blockiert.

## Verworfene Alternativen

- **Update per signiertem Tag statt Branch.** Sicherer gegen einen kompromittierten
  `main`, verlangt aber Schlüsselverwaltung beim Inhaber und eine Prüfung beim Nutzer. Das
  Ruleset und der Merge von Hand sind hier die Grenze.
- **Merge Queue.** Dasselbe Ergebnis wie `strict`, mehr Konfiguration, für einen Inhaber ohne
  parallele PRs ohne Nutzen.
- **Lizenzdatei per Werkzeug (`rollup-plugin-license` u. ä.).** Eine weitere Abhängigkeit im
  Bau-Pfad für rund fünfzig Zeilen.
- **`THIRD-PARTY-LICENSES.txt`.** Der Name passt auf das Muster der inhaltsadressierten Assets
  und bekäme ein Jahr Cache.

## Folgen

- Wer Scapio aus einem Fork oder auf einem anderen Branch betreibt, aktualisiert mit `git pull`
  selbst; `npm run update` verweigert es.
- Ein PR hinter `main` muss vor dem Merge aktualisiert werden und durchläuft die CI erneut.
- Ein neues Runner-Image heißt: Matrix ändern, Jobname bleibt. Nur ein neues System bräuchte
  einen neuen Pflicht-Check.
- `wrangler` hebt man in `demo-worker/package.json`, mit `npm audit` dort vor dem Deploy.
- Ein Paket ohne Lizenzdatei steht trotzdem in `drittlizenzen.txt`, mit seiner Angabe aus
  `package.json`.
