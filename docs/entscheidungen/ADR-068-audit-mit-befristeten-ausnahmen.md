# ADR-068: `npm run audit` mit befristeten Ausnahmen

## Kontext

`npm run audit` sperrt ab `high` jeden Push und jedes Release (CI-Job `audit`,
[ADR-047](ADR-047-release-kette-und-auslieferung.md)). Im November 2026 meldet es
GHSA-fc5q-39xc-vjpf (ReDoS in `picomatch` ≤ 4.0.7). `picomatch` kommt über `vite`, und `vite` steht in
`dependencies`, weil `Start.*` die Oberfläche beim Nutzer baut. Deshalb hilft `--omit=dev` nicht.
Eine korrigierte Version gibt es nicht. Der einzige Fix, den `npm audit fix` kennt, ist ein Rückfall auf
`vite@6`. `npm audit` selbst kann keine einzelne Advisory ausnehmen.

Die Ausnutzbarkeit ist gering: `picomatch` läuft nur im Bau und nur mit Mustern aus dem Projekt.

## Entscheidung

- **`npm run audit` ist `start/audit.ts`.** Das Skript liest `npm audit --json` für das Hauptpaket
  (`--omit=dev`) und für `demo-worker/` und sperrt ab `high`, wie vorher.
- **Ausnahmen stehen in `AUSNAHMEN` in `start/audit.ts`.** Jede nennt Advisory, Paket und ein Ablaufdatum.
  Eine Ausnahme gilt nur für genau diese Advisory in genau diesem Paket. Nach dem Ablaufdatum ist der
  Fund wieder rot. Wer verlängert, begründet das im PR.
- Eine Ausnahme, die keinen Fund mehr trifft, meldet das Skript, damit sie entfernt wird.

## Verworfene Alternativen

- **`--audit-level=critical`.** Damit wäre jeder künftige `high`-Fund unsichtbar, nicht nur dieser.
- **`vite` nach `devDependencies`.** Dann fehlt es im ZIP, und `Start.*` kann nicht bauen.
- **`overrides` auf eine ältere Version.** Es gibt keine unbetroffene 4.x-Version. Gebraucht wird ein
  `overrides`-Eintrag erst, wenn eine korrigierte Version erscheint. Dann fällt die Ausnahme weg.
