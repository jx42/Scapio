# ADR-045: Wöchentliche Sicherung beim Start

## Kontext

Bisher entstand eine Sicherung nur vor einer Migration oder durch `npm run backup`. Wer nie
manuell sichert und lange kein Update mit Schemaänderung bekommt, hat bei
`E_DB_BESCHAEDIGT` nur eine sehr alte Sicherung oder gar keine — und mit der Datei auch die
archivierten Rohantworten, aus denen `verify` und jede Neuberechnung rechnen.

Einen Hintergrundprozess, der nach Zeitplan sichert, gibt es nicht (AGENTS.md). Der Start
ist der einzige Zeitpunkt, an dem die Anwendung von selbst etwas tut.

## Entscheidung

- `npm start` sichert nach dem Öffnen der Datenbank, wenn die jüngste Sicherung **gleich
  welchen Anlasses** älter als sieben Tage ist oder keine existiert
  (`sichereWennFaellig` in `db/verbindung.ts`). Gemessen wird an der `mtime` der Dateien,
  nicht an einem Eintrag in der Datenbank — genau die Datei, die fehlen könnte, soll nicht
  ihre eigene Buchführung sein.
- Eigener Anlass `automatisch`, Dateiname `portfolio-auto-<version>-<zeitstempel>.db`,
  eigene Rotation mit fünf Dateien. Fünf Wochen automatische Sicherungen verdrängen weder
  die manuellen noch die vor einer Migration.
- Eine leere Datenbank wird nicht gesichert. Ein Fehlschlag wird gemeldet, hält den Start
  aber nicht auf.
- Der Zeitstempel im Namen trägt Millisekunden, damit zwei Sicherungen desselben Anlasses
  in derselben Sekunde nicht an `EEXIST` scheitern.

## Folgen

- Bis zu fünfzehn Sicherungen im Datenverzeichnis statt zehn.
- Der erste Start nach einer Woche dauert um die Sicherung länger, bei üblicher Größe unter
  einer Sekunde.
- `docs/RUNBOOK.md`, „Datenbank beschädigt“: die neueste Datei ist meist eine
  `portfolio-auto-…`.
