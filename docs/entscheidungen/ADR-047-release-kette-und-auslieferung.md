# ADR-047: Release-Kette und Auslieferung

## Kontext

Bis 1.0 ist `main` die Auslieferung. Das ZIP aus der README und aus `Aktualisieren.*`
([ADR-035](ADR-035-zip-als-standardweg-der-installation.md),
[ADR-037](ADR-037-eigene-dateien-im-datenverzeichnis.md)) ist GitHubs Quellarchiv
`archive/refs/heads/main.zip`, also jeder beliebige Stand von `main`. Der bisherige
`release.yml` setzt die Version, committet auf `main`, taggt und erstellt ein Release ohne
Anhang. Daran hängen vier Fehler:

- `inputs.version` steht unmaskiert in `run:` und erlaubt damit eine Script-Injection.
- Der Push auf `main` kollidiert mit dem Branch-Schutz, den das öffentliche Repository
  bekommt.
- Ein Push mit `GITHUB_TOKEN` startet `pruefung.yml` nicht. Der Release-Commit ist nie auf
  drei Plattformen geprüft.
- `package.json` steht schon auf `1.0.0`. Ein Lauf mit `1.0.0` scheitert deshalb an
  `git commit` mit „nothing to commit“.

Daneben prüft `npm run audit` nur `--omit=dev`. Die Startskripte installieren aber alle
Abhängigkeiten, und `npm start` führt `vite` samt Plugins aus. Die Pakete, die beim Nutzer
tatsächlich laufen, deckt das Audit damit nicht ab.

## Entscheidung

**Ein Release ist ein Tag auf einem geprüften Stand von `main`, mit einem ZIP als Anhang.**

- **Version:** `package.json` auf `main` ist die einzige Quelle. Erhöht wird sie per PR
  (`npm version X.Y.Z --no-git-tag-version`). SemVer, Tag `vX.Y.Z`, erstes öffentliches
  Release `v1.0.0`.
- **Auslöser:** weiterhin `workflow_dispatch` ohne Eingabe. Der Workflow schreibt auf keinen
  Branch, er legt nur Tag und Release an.
- **Job `version`** bricht ab, wenn der Lauf nicht von `main` kommt oder `v<version>` schon
  existiert.
- **Job `pruefung`** ruft `pruefung.yml` als wiederverwendbaren Workflow auf, mit
  `contents: read` und `persist-credentials: false`. Er fährt dieselben Schritte wie jeder
  Push (`check` und `test:tz` auf macOS, Linux und Windows, dazu `audit`), ohne eine Kopie
  davon.
- **Job `release`** (`needs: pruefung`, `contents: write`, `id-token: write`,
  `attestations: write`). Er führt kein npm-Paket aus, nur Git und `gh`:
  - `git archive --prefix=Scapio/ -o Scapio.zip HEAD`
  - `SHA256SUMS`
  - Herkunftsnachweis per `actions/attest-build-provenance`, nur bei öffentlichem Repository:
    GitHub stellt für private Repositories eines Nutzers keine Attestation aus.
  - `gh release create` mit gegliederten Notizen aus `.github/release.yml`
- **ZIP-Weg:** README und `ZIP_ADRESSE` zeigen auf
  `releases/latest/download/Scapio.zip`. Der Ordner darin heißt `Scapio`, nicht mehr
  `Scapio-main`. Startskripte, README und Tests nennen auf beiden Plattformen denselben Namen.
- **Git-Weg:** `npm run update` zieht weiter `main`. Ab dem öffentlichen Repository kommt auf
  `main` nur, was per PR mit grüner Prüfung auf drei Plattformen kommt.
  [ADR-013](ADR-013-update-nur-auf-knopfdruck.md) bleibt unverändert.
- **Inhalt des ZIPs:** Per `export-ignore` bleiben `test/`, `.github/`, `.claude/`,
  `demo-worker/`, `AGENTS.md`, `DESIGN.md`, `PRODUCT.md` und die `CLAUDE.md` der Ordner draußen.
  Das gilt auch für GitHubs eigene Quellarchive. `plans/` ist ohnehin nicht eingecheckt.
- **Fußzeile:** Sie bleibt, wie [ADR-046](ADR-046-footer-link-zur-readme.md) sie
  festlegt: „Version 1.0“, ohne Patch-Stelle und ohne Commit.
- **Audit-Umfang:** Was `npm start` ausführt, wird Laufzeitabhängigkeit. Das sind `vite`,
  `@vitejs/plugin-react`, `@tailwindcss/vite` und `tailwindcss`. `vite.config.ts` holt
  `defineConfig` aus `vite` und die `test`-Typen nur per `/// <reference types="vitest/config" />`.
  Ein Laufzeit-Import aus `vitest/config` zöge `vitest` in den Bau-Pfad. `shadcn` ist keine
  Abhängigkeit mehr und läuft bei Bedarf als `npx shadcn@<fest>`; der Bau braucht nichts
  daraus (ADR-019, Nachtrag). Damit deckt
  `audit --omit=dev` den Bau-Pfad beim Nutzer ab, und eine eigene Audit-ADR ist nicht nötig.

## Verworfene Alternativen

- **Release bei Tag-Push.** Ein Release bleibt eine bewusste Handlung. Ein Tag, der von Hand
  auf einem ungeprüften Commit landet, wäre sonst sofort ausgeliefert.
- **Der Workflow committet die neue Version.** Daraus kommen genau die oben genannten Fehler:
  Injection, Branch-Schutz und eine fehlende Prüfung.
- **`npm run update` zieht den letzten Tag oder einen Branch `stabil`.** Dann stünden beide
  Wege auf demselben Stand. Der Preis wäre ein Klon im „detached HEAD“ bzw. ein Workflow,
  der wieder auf einen Branch schreibt. Mit Branch-Schutz ist `main` grün genug.
- **ZIP weiter aus `main.zip`.** Es gäbe keine Prüfsumme und keinen Herkunftsnachweis, und
  ein ZIP-Nutzer bekäme jeden Zwischenstand.
- **ZIP mit vorgebautem `dist/`.** Das spart beim Nutzer den Bau. Dafür liefe im Release ein
  npm-Bau mit Schreibrechten, und `bauIstAktuell` müsste einem mitgelieferten Bau trauen.

## Folgen

- ZIP-Nutzer bekommen nur freigegebene Stände und können sie mit
  `gh attestation verify Scapio.zip --repo jx42/Scapio` prüfen.
  Der Nachweis belegt die Herkunft, nicht die Reproduzierbarkeit: `git archive` schreibt
  Zeitstempel ins ZIP, ein Nachbau ist also nicht bytegleich. Wie Nutzer prüfen, steht im
  README unter „Download prüfen“. [ADR-055]
- Git-Nutzer können vor dem letzten Release liegen. Die Fußzeile unterscheidet das nicht.
- Im ZIP laufen `npm run check`, `demo` und `edgecases` nicht, denn die beiden letzten
  importieren `test/e2e/seed.ts`. Dafür braucht es den Klon. `npm start` darf weder
  `test/` noch `.github/` brauchen. Das prüft der Probelauf vor dem ersten Release.
- Die Laufzeitabhängigkeiten werden länger. Was sich im Bau-Pfad ändert, geht damit durch
  das Pflicht-Audit vor jedem Push und durch den Job `audit` in `pruefung.yml`.
- Der Ablauf eines Releases steht in `docs/ENTWICKLUNG.md` unter „Release“.
