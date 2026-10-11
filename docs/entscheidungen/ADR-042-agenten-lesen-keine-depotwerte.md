# ADR-042: Agenten lesen keine Depotwerte

## Kontext

„Keine Cloud“ gilt für die Anwendung. Eine Agentensitzung (Claude Code und andere) schickt
aber alles, was sie liest, an einen Cloud-Dienst. `AGENTS.md` empfahl, die
Transaktionshistorie seitenweise über den MCP zu holen, `npm run verify` druckt Tag, Feld,
alten und neuen Wert, und die versionierte Allowlist `.claude/settings.json` erlaubte
`npm run ingest`, `npm run verify` und `sqlite3 -readonly` ohne Rückfrage. Damit landeten
echte Beträge im Kontext, ohne dass jemand das entschieden hätte.

## Entscheidung

- **Regel in `AGENTS.md`, Abschnitt „Depotdaten bleiben beim Nutzer“:** Agenten fragen den MCP
  nicht selbst ab und lesen keine Beträge, Mengen, Namen oder Rohantworten aus Datenbank,
  Datenverzeichnis oder `lauf.log`. Gerechnet wird auf Fixtures und synthetischen Depots; wo
  echte Werte nötig sind, schreibt der Agent ein Skript, das nur Befundart, Code, ISIN oder Tag
  ausgibt, und fragt.
- **`npm run verify:zaehlung`** (`start/verify.ts --nur-zaehlung`): dieselbe Neuberechnung,
  ausgegeben werden nur die Zahl der Abweichungen je Feld und Tag plus Feld.
- **Die versionierte Allowlist** enthält `verify:zaehlung`, nicht mehr `ingest`, `verify` oder
  `sqlite3`. Wer sie lokal will, setzt sie in `.claude/settings.local.json`.
- **Die Konsole von `npm run ingest` trägt keinen Fremdtext:** `hinweisKurz` lässt `name` und
  `text` weg, ein gescheiterter Lauf nennt nur den Code; der Wortlaut steht in `lauf.log`.

## Verworfene Alternativen

- **`verify` ohne Beträge für alle.** Der Mensch davor braucht die Differenz in Euro, um
  einen Fehler einzuordnen; die Werte verlassen sein Gerät nicht.
- **Hook, der Befehle blockiert.** Gehört dem Nutzer, nicht dem Repository, und schützt
  nicht vor einer Sitzung ohne diese Konfiguration.

## Folgen

- RUNBOOK und AGENTS nennen für Agenten `verify:zaehlung`.
- `npm run vertrag` bleibt erlaubt; es gibt nur Feldnamen aus (`start/vertrag.ts`).
- Die Regel ist eine Anweisung, keine technische Grenze. Ein Agent mit Shell kann die
  Datenbank lesen; die Allowlist sorgt nur dafür, dass er dafür fragen muss.
