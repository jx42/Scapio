# Mitwirken

Struktur, Datenfluss, Befehle und die zwölf Invarianten stehen in [AGENTS.md](/AGENTS.md) —
das gilt für Menschen genauso wie für Agenten und wird hier nicht wiederholt.

## Kurzfassung

```sh
npm ci --ignore-scripts
npm run check
```

`npm run check` (Typecheck, Lint, Tests samt Invarianten) muss vor jedem Pull Request grün
sein — die CI in [`.github/workflows/pruefung.yml`](/.github/workflows/pruefung.yml)
wiederholt das auf macOS, Linux und Windows.

- Die zwölf Invarianten in [AGENTS.md](/AGENTS.md) werden nicht abgewogen, sondern befolgt.
- Fachvokabular deutsch, technisches Vokabular englisch — Grenzfälle stehen in
  [docs/GLOSSAR.md](/docs/GLOSSAR.md), nicht neu entscheiden, nachschlagen.
- Ändert ein Beitrag `core/`, gehört `KERN_VERSION` erhöht (INV-10).
- Berührt eine Änderung eine der Entscheidungen in
  [docs/entscheidungen/](/docs/entscheidungen/), gehört die Begründung als neue ADR dorthin,
  nicht in einen Kommentar.

## Pull Requests

Klein und begründet — die „Warum"-Zeile im Diff oder in der Beschreibung erspart Rückfragen.
Kein `npm audit fix --force` ohne Ansage: eine erzwungene Aktualisierung ist ein Breaking
Change in einer Abhängigkeit und gehört gemeldet, nicht stillschweigend gemergt.

## Sicherheitsfunde

Nicht als Issue oder Pull Request — der Weg steht in [SECURITY.md](SECURITY.md).
