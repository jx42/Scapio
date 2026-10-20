# ADR-040: Aufgeräumte Projektwurzel

## Kontext

Die Wurzel hielt 39 Einträge: zehn Ordner, acht gemeinsame Module, sechs Werkzeug-Konfigurationen,
Vorlagen und die Doppelklick-Einstiege. GitHub zeigt die README erst unter dieser Liste, und wer
das ZIP entpackt, sucht `Start` zwischen `geistFont.ts` und `hosts.ts`.

## Entscheidung

- **Die acht gemeinsamen Module liegen in `shared/`.** Sie gehören weiter keiner Schicht;
  geändert hat sich nur der Ort. `PROJEKTWURZEL` steigt deshalb eine Ebene höher,
  `AUSGELIEFERT` nennt `shared/` ausdrücklich.
- **Die vitest-Konfiguration steht als `test:` in `vite.config.ts`**, die Playwright-Konfiguration
  unter `test/e2e/`.
- **`CLAUDE.md` liegt unter `.claude/`**, das Claude Code dort ebenfalls liest. `AGENTS.md`
  bleibt in der Wurzel, weil andere Agenten sie nur dort suchen.
- **`einstellungen.example.json` liegt unter `docs/`.** Sie ist eine Vorlage und wird zur Laufzeit
  nie gelesen.

In der Wurzel bleibt, was ein Werkzeug dort verlangt (`package.json`, `tsconfig.json`,
`eslint.config.js`, `vite.config.ts`, `index.html`, `components.json`), `config.json`
([ADR-037](ADR-037-eigene-dateien-im-datenverzeichnis.md)) und die Doppelklick-Einstiege.

## Verworfene Alternativen

- **Schichten unter einem gemeinsamen Ordner (`app/core`, `app/db`, …).** Das hätte die Wurzel
  am stärksten gekürzt, jeden Pfad in `docs/` aber umgeschrieben, ohne dass sich etwas an der
  Architektur ändert.
- **`index.html` nach `src/` mit `root: 'src'`.** Ein Eintrag weniger, aber Vite, `dist/` und
  die Bauquellen in `start/start.ts` hätten sich mitbewegt.

## Nachtrag: `routen.ts` und `quellen.ts`

Server, Oberfläche, Demo-Abzug und Randfallseite führten die Routen je als eigene Liste,
Ingest und Oberfläche die Quellenarten ebenso. Beide Listen stehen jetzt in `shared/`, nach
derselben Regel wie die übrigen Module dort: mehrere Schichten brauchen sie, keiner gehören sie.
